from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import secrets
import ssl
import sqlite3
from datetime import datetime, date, timezone, timedelta
from pathlib import Path

try:
    import truststore as _truststore  # type: ignore
except Exception:
    _truststore = None

if _truststore is not None:
    _truststore.inject_into_ssl()

import requests as _requests
import certifi as _certifi
import os as _os
_http = _requests.Session()
try:
    _ssl_context = _truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT) if _truststore is not None else None
except Exception:
    _ssl_context = None

if _ssl_context is None:
    _os.environ.setdefault("REQUESTS_CA_BUNDLE", _certifi.where())
    _http.verify = _certifi.where()
from flask import Flask, Response, jsonify, request, send_from_directory


# ── Turso HTTP adapter (sqlite3-compatible interface) ──────────────────────────

class _TursoRow:
    """Emulates sqlite3.Row: supports dict-style and index access."""
    __slots__ = ("_data", "_keys")
    def __init__(self, keys, values):
        self._keys = [k.lower() for k in keys]
        self._data = dict(zip(self._keys, values))
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self._data.values())[key]
        return self._data[key.lower()]
    def __iter__(self):
        return iter(self._data.values())
    def keys(self):
        return self._keys


class _TursoCursor:
    def __init__(self, conn):
        self._conn = conn
        self.lastrowid = None
        self.rowcount = 0
        self._rows = []
        self._columns = []

    def _exec(self, sql: str, params=()):
        args = []
        for p in params:
            if p is None:
                args.append({"type": "null"})
            elif isinstance(p, bool):
                args.append({"type": "integer", "value": str(int(p))})
            elif isinstance(p, int):
                args.append({"type": "integer", "value": str(p)})
            elif isinstance(p, float):
                args.append({"type": "float", "value": str(p)})
            else:
                args.append({"type": "text", "value": str(p)})

        body = {
            "requests": [
                {"type": "execute", "stmt": {"sql": sql, "args": args}},
                {"type": "close"},
            ]
        }
        resp = _http.post(
            f"{self._conn._url}/v2/pipeline",
            json=body,
            headers={"Authorization": f"Bearer {self._conn._token}"},
            timeout=15,
        )
        resp.raise_for_status()
        result = resp.json()["results"][0]
        if result.get("type") == "error":
            msg = result.get("error", {}).get("message", "Turso error")
            if "UNIQUE constraint" in msg or "SQLITE_CONSTRAINT_UNIQUE" in msg:
                raise sqlite3.IntegrityError(msg)
            raise Exception(msg)

        cols = [c["name"] for c in result.get("response", {}).get("result", {}).get("cols", [])]
        rows_raw = result.get("response", {}).get("result", {}).get("rows", [])
        self._columns = cols
        self._rows = [_TursoRow(cols, [v.get("value") if v.get("type") != "null" else None for v in row]) for row in rows_raw]

        # last insert rowid
        af = result.get("response", {}).get("result", {}).get("affected_row_count", 0)
        self.rowcount = af
        lr = result.get("response", {}).get("result", {}).get("last_insert_rowid")
        if lr is not None:
            self.lastrowid = int(lr)
        return self

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class _TursoConnection:
    def __init__(self, url: str, token: str):
        self._url = url.rstrip("/")
        self._token = token
        self.row_factory = None
        self._pending: list[tuple] = []

    def execute(self, sql: str, params=()):
        cur = _TursoCursor(self)
        self._pending.append((sql, params))
        cur._exec(sql, params)
        return cur

    def executemany(self, sql: str, seq):
        for params in seq:
            self.execute(sql, params)
        return self

    def commit(self):
        self._pending.clear()

    def sync(self):
        pass  # no-op for HTTP API

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.commit()

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public"
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "reporte-celular.db"


def _normalize_turso_url(url: str) -> str:
    raw = str(url or "").strip().rstrip("/")
    if not raw:
        return ""
    if raw.startswith("libsql://"):
        return "https://" + raw[len("libsql://") :]
    return raw


TURSO_URL = _normalize_turso_url(os.environ.get("TURSO_DATABASE_URL", ""))
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")
DEFAULT_PORT = int(os.environ.get("PORT", "8090"))
REQUIRED_FIELDS = ("week", "cellNumber", "sector", "leaderName", "reportDate")
VALID_PERSON_ROLES = ("leader", "assistant", "host", "member", "pastor", "kid", "all")

BACKEND_RCM_WEEKS = [
    {"week": 1, "phase": "GANAR", "verb": "ORAR"},
    {"week": 2, "phase": "GANAR", "verb": "ANOTAR"},
    {"week": 3, "phase": "GANAR", "verb": "CONTACTAR"},
    {"week": 4, "phase": "GANAR", "verb": "CONFIRMAR"},
    {"week": 5, "phase": "GANAR", "verb": "DESATAR"},
    {"week": 6, "phase": "GANAR", "verb": "LLEVAR", "event": "Levántate", "rcmKey": "levantate", "captureMode": "separate", "specialEvents": [{"event": "Levántate", "rcmKey": "levantate", "captureMode": "separate"}]},
    {"week": 7, "phase": "CONSOLIDAR", "verb": "MOTIVAR"},
    {"week": 8, "phase": "CONSOLIDAR", "verb": "INTEGRAR"},
    {"week": 9, "phase": "CONSOLIDAR", "verb": "CONSOLIDAR"},
    {"week": 10, "phase": "CONSOLIDAR", "verb": "PREPARAR"},
    {"week": 11, "phase": "CONSOLIDAR", "verb": "SANTIFICAR", "event": "Restauración", "rcmKey": "restauracion", "captureMode": "separate", "specialEvents": [{"event": "Restauración", "rcmKey": "restauracion", "captureMode": "separate"}]},
    {"week": 12, "phase": "DISCIPULAR", "verb": "MATRICULAR"},
    {"week": 13, "phase": "DISCIPULAR", "verb": "CONSERVAR"},
    {"week": 14, "phase": "DISCIPULAR", "verb": "DOCTRINAR"},
    {"week": 15, "phase": "DISCIPULAR", "verb": "DISCIPULAR"},
    {"week": 16, "phase": "DISCIPULAR", "verb": "BAUTIZAR", "event": "Cielos Abiertos", "rcmKey": "cielosAbiertos", "captureMode": "separate", "specialEvents": [{"event": "Cielos Abiertos", "rcmKey": "cielosAbiertos", "captureMode": "separate"}]},
]

# Master password (soporte): si está definido en el entorno, permite ingresar
# como CUALQUIER usuario sin importar su contraseña personal. Se almacena como
# hash PBKDF2 (mismo formato que las contraseñas normales) para evitar tener
# el plaintext en el server. Genera el hash con:
#   python -c "from server.app import _hash_password; print(_hash_password('TU_PASSWORD'))"
# y guárdalo en la variable de entorno MASTER_PASSWORD_HASH.
MASTER_PASSWORD_HASH = os.environ.get("MASTER_PASSWORD_HASH", "").strip()


# ── Password hashing (PBKDF2-SHA256, 200k iters) ─────────────────────────────
PBKDF2_ITERS = 200_000

def _hash_password(plain: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, PBKDF2_ITERS)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${salt.hex()}${digest.hex()}"

def _verify_password(plain: str, stored: str) -> bool:
    try:
        algo, iters_str, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters_str)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, iters)
        return hmac.compare_digest(expected, actual)
    except Exception:
        return False


# ── Username helpers ─────────────────────────────────────────────────────────
import re
import unicodedata

def _normalize_username(raw: str) -> str:
    """Username canonico: minusculas, ASCII, solo [a-z0-9._-]."""
    if not raw:
        return ""
    s = unicodedata.normalize("NFKD", str(raw)).encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9._-]+", "", s)
    return s


def _normalize_event_name(raw: str) -> str:
    if not raw:
        return ""
    s = unicodedata.normalize("NFKD", str(raw)).encode("ascii", "ignore").decode("ascii")
    return s.lower().strip()


def _derive_rcm_key(raw: str) -> str:
    normalized = _normalize_event_name(raw)
    if not normalized:
        return ""
    parts = [part for part in re.sub(r"[^a-z0-9]+", " ", normalized).split() if part]
    if not parts:
        return ""
    return "".join(part if index == 0 else part[:1].upper() + part[1:] for index, part in enumerate(parts))

def _is_valid_username(u: str) -> bool:
    return bool(u) and 2 <= len(u) <= 40 and bool(re.fullmatch(r"[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?", u))


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
    initialize_database()

    cors_allowed_origins = {
        origin.strip().rstrip("/")
        for origin in [
            os.environ.get("CORS_ALLOW_ORIGIN", ""),
            "https://reporte-rcm.onrender.com",
            "http://127.0.0.1:8080",
            "http://localhost:8080",
            "http://127.0.0.1:8081",
            "http://localhost:8081",
            "http://127.0.0.1:8091",
            "http://localhost:8091",
            "http://127.0.0.1:8090",
            "http://localhost:8090",
        ]
        if origin and origin.strip()
    }

    def apply_api_cors(response: Response) -> Response:
        origin = str(request.headers.get("Origin") or "").strip().rstrip("/")
        if origin and origin in cors_allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Acting-Person-Id"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    @app.before_request
    def handle_api_preflight() -> Response | None:
        if request.method == "OPTIONS" and request.path.startswith("/api/"):
            return apply_api_cors(Response(status=204))
        return None

    @app.after_request
    def disable_local_static_cache(response: Response) -> Response:
        if request.path.startswith("/api/"):
            return apply_api_cors(response)
        if request.method not in {"GET", "HEAD"}:
            return response

        host = str(request.host or "").lower()
        is_local_host = host.startswith("127.0.0.1") or host.startswith("localhost")
        if not is_local_host:
            return response

        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers.pop("ETag", None)
        return response

    @app.get("/")
    def index() -> Response:
        return send_from_directory(PUBLIC_DIR, "index.html")

    @app.get("/api/health")
    def health() -> Response:
        db_label = TURSO_URL.split("@")[-1] if TURSO_URL else str(DB_PATH)
        return jsonify({"ok": True, "title": "Reporte Celular", "database": db_label})

    # ── AUTH ────────────────────────────────────────────────────────────────
    @app.get("/api/auth/lookup/<string:username>")
    def auth_lookup(username: str) -> Response:
        """Resuelve username -> { personId, name, hasPassword, mustChange }.
        Devuelve 404 si el username no existe.
        """
        u = _normalize_username(username)
        if not u:
            return jsonify({"message": "Usuario inválido"}), 400
        with get_connection() as connection:
            person = connection.execute(
                "SELECT id, name FROM people_catalog WHERE lower(username) = ?",
                (u,),
            ).fetchone()
            if not person:
                return jsonify({"message": "Usuario no encontrado"}), 404
            cred = connection.execute(
                "SELECT password_hash, must_change FROM user_credentials WHERE person_id = ?",
                (person["id"],),
            ).fetchone()
        has_pw = bool(cred and cred["password_hash"])
        return jsonify({
            "personId": person["id"],
            "name": person["name"],
            "hasPassword": has_pw,
            "mustChange": bool(int(cred["must_change"] or 0)) if cred else False,
        })

    @app.get("/api/auth/status/<int:person_id>")
    def auth_status(person_id: int) -> Response:
        """Devuelve si la persona ya tiene password registrado y si debe cambiarla."""
        with get_connection() as connection:
            row = connection.execute(
                "SELECT password_hash, must_change FROM user_credentials WHERE person_id = ?",
                (person_id,),
            ).fetchone()
        if not row or not row["password_hash"]:
            return jsonify({"hasPassword": False, "mustChange": False})
        return jsonify({"hasPassword": True, "mustChange": bool(int(row["must_change"] or 0))})

    @app.post("/api/auth/login")
    def auth_login() -> Response:
        payload = read_payload() or {}
        person_id = normalize_nullable_int(payload.get("personId"))
        username  = _normalize_username(payload.get("username") or "")
        password  = str(payload.get("password") or "")
        with get_connection() as connection:
            person_row = None
            if person_id:
                person_row = connection.execute(
                    "SELECT * FROM people_catalog WHERE id = ?", (person_id,)
                ).fetchone()
            elif username:
                person_row = connection.execute(
                    "SELECT * FROM people_catalog WHERE lower(username) = ?", (username,)
                ).fetchone()
            else:
                return jsonify({"message": "username o personId requerido"}), 400
            if not person_row:
                return jsonify({"message": "Usuario no encontrado"}), 404
            person_id = person_row["id"]

            def _register_visit() -> int:
                connection.execute(
                    "UPDATE people_catalog SET visit_count = COALESCE(visit_count, 0) + 1, updated_at = ? WHERE id = ?",
                    (utc_now_iso(), person_id),
                )
                count_row = connection.execute(
                    "SELECT visit_count FROM people_catalog WHERE id = ?",
                    (person_id,),
                ).fetchone()
                connection.commit()
                return int(count_row["visit_count"] or 0) if count_row else 0

            cred_row = connection.execute(
                "SELECT password_hash, must_change FROM user_credentials WHERE person_id = ?",
                (person_id,),
            ).fetchone()
            # Sin password registrado: login pasa (compatibilidad), pero indicamos al cliente.
            if not cred_row or not cred_row["password_hash"]:
                # Aun sin contraseña personal, validamos el master password si fue
                # enviado. Útil para auditoría: marcamos viaMaster=True.
                via_master = bool(MASTER_PASSWORD_HASH and password and _verify_password(password, MASTER_PASSWORD_HASH))
                visit_count = _register_visit()
                return jsonify({"ok": True, "personId": person_id, "hasPassword": False, "mustChange": False, "viaMaster": via_master, "visitCount": visit_count})
            # Master password de soporte: permite entrar como cualquier usuario
            # sin conocer su contraseña personal. NO altera la contraseña del
            # usuario y NO marca must_change.
            if MASTER_PASSWORD_HASH and _verify_password(password, MASTER_PASSWORD_HASH):
                visit_count = _register_visit()
                return jsonify({
                    "ok": True,
                    "personId": person_id,
                    "hasPassword": True,
                    "mustChange": False,
                    "viaMaster": True,
                    "visitCount": visit_count,
                })
            if not _verify_password(password, cred_row["password_hash"]):
                return jsonify({"message": "Contraseña incorrecta"}), 401
            visit_count = _register_visit()
            return jsonify({
                "ok": True,
                "personId": person_id,
                "hasPassword": True,
                "mustChange": bool(int(cred_row["must_change"] or 0)),
                "viaMaster": False,
                "visitCount": visit_count,
            })

    @app.post("/api/auth/set-password")
    def auth_set_password() -> Response:
        """Crea password por primera vez o cuando must_change=true.
        Requiere personId + newPassword. Si ya tiene password y NO está marcada
        must_change, se debe usar /api/auth/change-password (que pide currentPassword).
        """
        payload = read_payload() or {}
        person_id = normalize_nullable_int(payload.get("personId"))
        new_pw    = str(payload.get("newPassword") or "")
        if not person_id:
            return jsonify({"message": "personId requerido"}), 400
        if len(new_pw) < 6:
            return jsonify({"message": "La contraseña debe tener al menos 6 caracteres"}), 400
        with get_connection() as connection:
            cred = connection.execute(
                "SELECT password_hash, must_change FROM user_credentials WHERE person_id = ?",
                (person_id,),
            ).fetchone()
            if cred and cred["password_hash"] and not int(cred["must_change"] or 0):
                return jsonify({"message": "Ya tienes una contraseña. Usa cambiar contraseña."}), 409
            now = utc_now_iso()
            new_hash = _hash_password(new_pw)
            if cred:
                connection.execute(
                    "UPDATE user_credentials SET password_hash = ?, must_change = 0, updated_at = ? WHERE person_id = ?",
                    (new_hash, now, person_id),
                )
            else:
                connection.execute(
                    "INSERT INTO user_credentials (person_id, password_hash, must_change, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
                    (person_id, new_hash, now, now),
                )
            connection.commit()
        return jsonify({"ok": True})

    @app.post("/api/auth/change-password")
    def auth_change_password() -> Response:
        payload = read_payload() or {}
        person_id    = normalize_nullable_int(payload.get("personId"))
        current_pw   = str(payload.get("currentPassword") or "")
        new_pw       = str(payload.get("newPassword") or "")
        if not person_id:
            return jsonify({"message": "personId requerido"}), 400
        if len(new_pw) < 6:
            return jsonify({"message": "La nueva contraseña debe tener al menos 6 caracteres"}), 400
        with get_connection() as connection:
            cred = connection.execute(
                "SELECT password_hash FROM user_credentials WHERE person_id = ?",
                (person_id,),
            ).fetchone()
            if not cred or not cred["password_hash"]:
                return jsonify({"message": "Aún no tienes contraseña; crea una primero."}), 400
            if not _verify_password(current_pw, cred["password_hash"]):
                return jsonify({"message": "Contraseña actual incorrecta"}), 401
            connection.execute(
                "UPDATE user_credentials SET password_hash = ?, must_change = 0, updated_at = ? WHERE person_id = ?",
                (_hash_password(new_pw), utc_now_iso(), person_id),
            )
            connection.commit()
        return jsonify({"ok": True})

    @app.post("/api/auth/admin-reset/<int:person_id>")
    def auth_admin_reset(person_id: int) -> Response:
        """Cuenta de sistema marca a un usuario para que capture nueva password al entrar.
        Requiere header X-Acting-Person-Id con el id de la cuenta de sistema que ejecuta.
        """
        actor_id = normalize_nullable_int(request.headers.get("X-Acting-Person-Id"))
        if not actor_id:
            return jsonify({"message": "Falta identificación del solicitante"}), 401
        with get_connection() as connection:
            actor = connection.execute(
                "SELECT is_system_account FROM people_catalog WHERE id = ?", (actor_id,)
            ).fetchone()
            if not actor or not int(actor["is_system_account"] or 0):
                return jsonify({"message": "Solo una cuenta de sistema puede resetear contraseñas"}), 403
            target = connection.execute(
                "SELECT id FROM people_catalog WHERE id = ?", (person_id,)
            ).fetchone()
            if not target:
                return jsonify({"message": "Persona no encontrada"}), 404
            cred = connection.execute(
                "SELECT person_id FROM user_credentials WHERE person_id = ?", (person_id,)
            ).fetchone()
            now = utc_now_iso()
            if cred:
                connection.execute(
                    "UPDATE user_credentials SET password_hash = '', must_change = 1, updated_at = ? WHERE person_id = ?",
                    (now, person_id),
                )
            else:
                connection.execute(
                    "INSERT INTO user_credentials (person_id, password_hash, must_change, created_at, updated_at) VALUES (?, '', 1, ?, ?)",
                    (person_id, now, now),
                )
            connection.commit()
        return jsonify({"ok": True})

    def _catalog_actor_is_system_account(actor) -> bool:
        return bool(actor and int(actor["is_system_account"] or 0))

    def _catalog_actor_has_access(actor) -> bool:
        return bool(
            actor
            and (
                int(actor["is_system_account"] or 0)
                or int(actor["is_admin"] or 0)
                or int(actor["is_coordinator"] or 0)
                or str(actor["role"] or "") == "pastor"
            )
        )

    def require_catalog_actor(connection: sqlite3.Connection, require_system_account: bool = False):
        actor_id = normalize_nullable_int(request.headers.get("X-Acting-Person-Id"))
        if not actor_id:
            return None, (jsonify({"message": "No autorizado."}), 401)

        actor = connection.execute(
            "SELECT id, role, is_coordinator, is_admin, is_system_account FROM people_catalog WHERE id = ?",
            (actor_id,),
        ).fetchone()
        if not actor:
            return None, (jsonify({"message": "No autorizado."}), 401)

        if require_system_account:
            if not _catalog_actor_is_system_account(actor):
                return None, (jsonify({"message": "Solo una cuenta de sistema puede ejecutar esta acción."}), 403)
        elif not _catalog_actor_has_access(actor):
            return None, (jsonify({"message": "No autorizado."}), 403)

        return actor, None

    def require_authenticated_actor(connection: sqlite3.Connection):
        actor_id = normalize_nullable_int(request.headers.get("X-Acting-Person-Id"))
        if not actor_id:
            return None, (jsonify({"message": "No autorizado."}), 401)

        actor = connection.execute(
            "SELECT id, role, is_coordinator, is_admin, is_system_account, supervisor_sector FROM people_catalog WHERE id = ?",
            (actor_id,),
        ).fetchone()
        if not actor:
            return None, (jsonify({"message": "No autorizado."}), 401)
        return actor, None

    def _actor_owned_cell_number(connection: sqlite3.Connection, actor_id: int) -> str:
        row = connection.execute(
            """
            SELECT cell_number
            FROM cell_catalog
            WHERE leader_person_id = ? OR assistant_person_id = ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (actor_id, actor_id),
        ).fetchone()
        return str(row["cell_number"] or "").strip() if row else ""

    @app.get("/api/catalogs")
    def get_catalogs() -> Response:
        with get_connection() as connection:
            return jsonify(load_catalogs_payload(connection))

    @app.post("/api/catalogs/people")
    def create_person() -> Response:
        payload = normalize_payload(read_payload())
        with get_connection() as connection:
            actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
        validation_error = validate_person_payload(payload)
        if validation_error:
            return jsonify({"message": validation_error}), 400

        # username es opcional; si viene, se valida y solo cuenta de sistema puede asignarlo
        username_value = None
        if payload.get("username") not in (None, ""):
            if not _catalog_actor_is_system_account(actor):
                return jsonify({"message": "Solo una cuenta de sistema puede asignar username"}), 403
            u = _normalize_username(payload.get("username"))
            if not _is_valid_username(u):
                return jsonify({"message": "Username inválido (usa letras, números, '.', '_' o '-')"}), 400
            username_value = u

        now = utc_now_iso()
        try:
            with get_connection() as connection:
                if payload["role"] == "pastor":
                    existing_pastor = find_existing_pastor(connection)
                    if existing_pastor:
                        return jsonify({"message": f"Ya existe un pastor registrado: {existing_pastor['name']}."}), 409
                cursor = connection.execute(
                    """
                    INSERT INTO people_catalog (name, role, phone, email, guardian_person_id, guardian_name, supervisor_sector, is_coordinator, username, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["name"],
                        payload["role"],
                        payload.get("phone", ""),
                        payload.get("email", ""),
                        normalize_nullable_int(payload.get("guardianPersonId")),
                        payload.get("guardianName", ""),
                        payload.get("supervisorSector", ""),
                        1 if payload.get("isCoordinator") else 0,
                        username_value,
                        now,
                        now,
                    ),
                )
                connection.commit()
        except sqlite3.IntegrityError as e:
            if "username" in str(e).lower():
                return jsonify({"message": "Ese username ya está en uso."}), 409
            return jsonify({"message": "La persona ya existe en el catálogo."}), 409

        return jsonify({"ok": True, "id": cursor.lastrowid}), 201

    @app.put("/api/catalogs/people/<int:person_id>")
    def update_person(person_id: int) -> Response:
        payload = normalize_payload(read_payload())
        with get_connection() as connection:
            actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
        validation_error = validate_person_payload(payload)
        if validation_error:
            return jsonify({"message": validation_error}), 400

        # Si el payload incluye 'username' (incluyendo cadena vacía para borrarlo),
        # solo cuenta de sistema puede modificarlo. Si no viene la clave, no se toca.
        update_username = "username" in payload
        username_value = None
        if update_username:
            if not _catalog_actor_is_system_account(actor):
                return jsonify({"message": "Solo una cuenta de sistema puede asignar username"}), 403
            raw = payload.get("username") or ""
            if raw == "":
                username_value = None
            else:
                u = _normalize_username(raw)
                if not _is_valid_username(u):
                    return jsonify({"message": "Username inválido (usa letras, números, '.', '_' o '-')"}), 400
                username_value = u

        try:
            with get_connection() as connection:
                if payload["role"] == "pastor":
                    existing_pastor = find_existing_pastor(connection, person_id)
                    if existing_pastor:
                        return jsonify({"message": f"Ya existe un pastor registrado: {existing_pastor['name']}."}), 409
                if update_username:
                    cursor = connection.execute(
                        """
                        UPDATE people_catalog
                        SET name = ?, role = ?, phone = ?, email = ?, guardian_person_id = ?, guardian_name = ?, supervisor_sector = ?, is_coordinator = ?, username = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            payload["name"],
                            payload["role"],
                            payload.get("phone", ""),
                            payload.get("email", ""),
                            normalize_nullable_int(payload.get("guardianPersonId")),
                            payload.get("guardianName", ""),
                            payload.get("supervisorSector", ""),
                            1 if payload.get("isCoordinator") else 0,
                            username_value,
                            utc_now_iso(),
                            person_id,
                        ),
                    )
                else:
                    cursor = connection.execute(
                        """
                        UPDATE people_catalog
                        SET name = ?, role = ?, phone = ?, email = ?, guardian_person_id = ?, guardian_name = ?, supervisor_sector = ?, is_coordinator = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            payload["name"],
                            payload["role"],
                            payload.get("phone", ""),
                            payload.get("email", ""),
                            normalize_nullable_int(payload.get("guardianPersonId")),
                            payload.get("guardianName", ""),
                            payload.get("supervisorSector", ""),
                            1 if payload.get("isCoordinator") else 0,
                            utc_now_iso(),
                            person_id,
                        ),
                    )
                connection.commit()
        except sqlite3.IntegrityError as e:
            if "username" in str(e).lower():
                return jsonify({"message": "Ese username ya está en uso."}), 409
            return jsonify({"message": "Ya existe otra persona con ese nombre."}), 409

        if cursor.rowcount == 0:
            return jsonify({"message": "Persona no encontrada."}), 404
        return jsonify({"ok": True})

    @app.patch("/api/catalogs/people/<int:person_id>/admin")
    def patch_person_admin(person_id: int) -> Response:
        """Activa o desactiva el flag is_admin de una persona.
        Solo una cuenta de sistema puede invocarlo.
        """
        actor_id = normalize_nullable_int(request.headers.get("X-Acting-Person-Id"))
        if not actor_id:
            return jsonify({"message": "No autorizado."}), 401
        with get_connection() as connection:
            actor = connection.execute(
                "SELECT is_system_account FROM people_catalog WHERE id = ?", (actor_id,)
            ).fetchone()
            if not actor or not int(actor["is_system_account"] or 0):
                return jsonify({"message": "Solo una cuenta de sistema puede cambiar este flag."}), 403

            payload = read_payload()
            if not isinstance(payload, dict) or "isAdmin" not in payload:
                return jsonify({"message": "Falta isAdmin."}), 400
            new_value = 1 if payload.get("isAdmin") else 0

            cursor = connection.execute(
                "UPDATE people_catalog SET is_admin = ?, updated_at = ? WHERE id = ?",
                (new_value, utc_now_iso(), person_id),
            )
            connection.commit()
        if cursor.rowcount == 0:
            return jsonify({"message": "Persona no encontrada."}), 404
        return jsonify({"ok": True, "isAdmin": bool(new_value)})

    @app.patch("/api/catalogs/people/<int:person_id>/system-account")
    def patch_person_system_account(person_id: int) -> Response:
        """Marca o desmarca a una persona como 'cuenta de sistema'.
        Solo otra cuenta de sistema. Las cuentas de sistema se ocultan del catálogo
        normal de miembros y de los conteos/dashboard/RCM.
        """
        actor_id = normalize_nullable_int(request.headers.get("X-Acting-Person-Id"))
        if not actor_id:
            return jsonify({"message": "No autorizado."}), 401
        with get_connection() as connection:
            actor = connection.execute(
                "SELECT is_system_account FROM people_catalog WHERE id = ?", (actor_id,)
            ).fetchone()
            if not actor or not int(actor["is_system_account"] or 0):
                return jsonify({"message": "Solo una cuenta de sistema puede cambiar este flag."}), 403

            payload = read_payload()
            if not isinstance(payload, dict) or "isSystemAccount" not in payload:
                return jsonify({"message": "Falta isSystemAccount."}), 400
            new_value = 1 if payload.get("isSystemAccount") else 0

            cursor = connection.execute(
                "UPDATE people_catalog SET is_system_account = ?, updated_at = ? WHERE id = ?",
                (new_value, utc_now_iso(), person_id),
            )
            connection.commit()
        if cursor.rowcount == 0:
            return jsonify({"message": "Persona no encontrada."}), 404
        return jsonify({"ok": True, "isSystemAccount": bool(new_value)})

    @app.patch("/api/catalogs/people/<int:person_id>/rcm")
    def patch_person_rcm(person_id: int) -> Response:
        payload = read_payload()
        if not isinstance(payload, dict):
            return jsonify({"message": "Datos inválidos."}), 400

        valid_keys = {
            "levantate", "restauracion", "reencuentro", "cielosAbiertos",
            "e1Maduracion", "e2Integracion", "e3Ubicacion",
            "eventoUnete", "eventoReencuentro", "eventoMinisterios",
            "e1Vision", "e2Caracter", "e3Perfil", "lanzamiento",
            "escFormativa", "escPadresEsp", "escLideres", "escSupervisores",
        }
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            row = connection.execute(
                "SELECT rcm_progress FROM people_catalog WHERE id = ?", (person_id,)
            ).fetchone()
            if row is None:
                return jsonify({"message": "Persona no encontrada."}), 404

            current = parse_json_field(row["rcm_progress"])
            import re as _re
            _valid_value = _re.compile(r'^\d{4}-\d{2}-\d{2}$|^en_curso:\d{4}-\d{2}-\d{2}$')
            for key, value in payload.items():
                if key in valid_keys:
                    if value is None:
                        current[key] = None
                    else:
                        val_str = str(value).strip()
                        if not _valid_value.match(val_str):
                            return jsonify({"message": f"Valor inválido para '{key}'."}), 400
                        current[key] = val_str
            connection.execute(
                "UPDATE people_catalog SET rcm_progress = ?, updated_at = ? WHERE id = ?",
                (json.dumps(current, ensure_ascii=False), utc_now_iso(), person_id),
            )
            connection.commit()
        return jsonify({"ok": True, "rcmProgress": current})

    @app.delete("/api/catalogs/people/<int:person_id>")
    def delete_person(person_id: int) -> Response:
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            existing_person = connection.execute(
                "SELECT name FROM people_catalog WHERE id = ?",
                (person_id,),
            ).fetchone()
            deleted_name = existing_person["name"] if existing_person else ""
            remember_deleted_person_name(connection, deleted_name)
            scrub_promotions_for_deleted_person(connection, deleted_name)
            connection.execute(
                """
                UPDATE people_catalog
                SET guardian_name = CASE
                        WHEN guardian_person_id = ? AND trim(COALESCE(guardian_name, '')) = '' THEN ?
                        ELSE guardian_name
                    END,
                    guardian_person_id = CASE WHEN guardian_person_id = ? THEN NULL ELSE guardian_person_id END,
                    updated_at = CASE WHEN guardian_person_id = ? THEN ? ELSE updated_at END
                WHERE guardian_person_id = ?
                """,
                (person_id, deleted_name, person_id, person_id, utc_now_iso(), person_id),
            )
            connection.execute(
                """
                UPDATE cell_catalog
                SET leader_person_id = CASE WHEN leader_person_id = ? THEN NULL ELSE leader_person_id END,
                    assistant_person_id = CASE WHEN assistant_person_id = ? THEN NULL ELSE assistant_person_id END,
                    host_person_id = CASE WHEN host_person_id = ? THEN NULL ELSE host_person_id END,
                    updated_at = ?
                WHERE leader_person_id = ? OR assistant_person_id = ? OR host_person_id = ?
                """,
                (person_id, person_id, person_id, utc_now_iso(), person_id, person_id, person_id),
            )
            connection.execute("DELETE FROM cell_membership WHERE person_id = ?", (person_id,))
            cursor = connection.execute("DELETE FROM people_catalog WHERE id = ?", (person_id,))
            connection.commit()

        if cursor.rowcount == 0:
            return jsonify({"message": "Persona no encontrada."}), 404
        return Response(status=204)

    @app.post("/api/catalogs/cells")
    def create_cell() -> Response:
        payload = normalize_payload(read_payload())
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
        validation_error = validate_cell_payload(payload)
        if validation_error:
            return jsonify({"message": validation_error}), 400

        try:
            with get_connection() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO cell_catalog (
                        cell_number,
                        network_name,
                        sector,
                        zone_name,
                        district_name,
                        address,
                        leader_person_id,
                        assistant_person_id,
                        host_person_id,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["cellNumber"],
                        payload.get("networkName", ""),
                        payload["sector"],
                        payload.get("zoneName", ""),
                        payload.get("districtName", ""),
                        payload.get("address", ""),
                        normalize_nullable_int(payload.get("leaderPersonId")),
                        normalize_nullable_int(payload.get("assistantPersonId")),
                        normalize_nullable_int(payload.get("hostPersonId")),
                        utc_now_iso(),
                        utc_now_iso(),
                    ),
                )
                connection.commit()
        except sqlite3.IntegrityError:
            return jsonify({"message": "La célula ya existe en el catálogo."}), 409

        return jsonify({"ok": True, "id": cursor.lastrowid}), 201

    @app.put("/api/catalogs/cells/<int:cell_id>")
    def update_cell(cell_id: int) -> Response:
        payload = normalize_payload(read_payload())
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
        validation_error = validate_cell_payload(payload)
        if validation_error:
            return jsonify({"message": validation_error}), 400

        try:
            with get_connection() as connection:
                cursor = connection.execute(
                    """
                    UPDATE cell_catalog
                    SET cell_number = ?,
                        network_name = ?,
                        sector = ?,
                        zone_name = ?,
                        district_name = ?,
                        address = ?,
                        leader_person_id = ?,
                        assistant_person_id = ?,
                        host_person_id = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        payload["cellNumber"],
                        payload.get("networkName", ""),
                        payload["sector"],
                        payload.get("zoneName", ""),
                        payload.get("districtName", ""),
                        payload.get("address", ""),
                        normalize_nullable_int(payload.get("leaderPersonId")),
                        normalize_nullable_int(payload.get("assistantPersonId")),
                        normalize_nullable_int(payload.get("hostPersonId")),
                        utc_now_iso(),
                        cell_id,
                    ),
                )
                connection.commit()
        except sqlite3.IntegrityError:
            return jsonify({"message": "Ya existe otra célula con ese número."}), 409

        if cursor.rowcount == 0:
            return jsonify({"message": "Célula no encontrada."}), 404
        return jsonify({"ok": True})

    @app.delete("/api/catalogs/cells/<int:cell_id>")
    def delete_cell(cell_id: int) -> Response:
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            connection.execute("DELETE FROM cell_membership WHERE cell_id = ?", (cell_id,))
            cursor = connection.execute("DELETE FROM cell_catalog WHERE id = ?", (cell_id,))
            connection.commit()

        if cursor.rowcount == 0:
            return jsonify({"message": "Célula no encontrada."}), 404
        return Response(status=204)

    @app.post("/api/catalogs/cells/renumber")
    def renumber_cells() -> Response:
        """Renumbers all cells sequentially (1, 2, 3…) sorted by their current cell_number."""
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            rows = connection.execute(
                "SELECT id, cell_number FROM cell_catalog ORDER BY CAST(cell_number AS INTEGER), cell_number"
            ).fetchall()
            for index, row in enumerate(rows, start=1):
                connection.execute(
                    "UPDATE cell_catalog SET cell_number = ? WHERE id = ?",
                    (str(index), row["id"]),
                )
            connection.commit()
        return jsonify({"ok": True, "total": len(rows)})

    @app.post("/api/catalogs/cells/<int:cell_id>/members")
    def assign_cell_member(cell_id: int) -> Response:
        payload = normalize_payload(read_payload())
        person_id = normalize_nullable_int(payload.get("personId"))
        if person_id is None:
            return jsonify({"message": "Selecciona una persona válida."}), 400
        attendance_mode = normalize_membership_attendance_mode(payload.get("attendanceMode"))
        attendance_defaults = normalize_membership_attendance_defaults(payload.get("attendanceDefaults"), attendance_mode)

        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            if connection.execute("SELECT 1 FROM cell_catalog WHERE id = ?", (cell_id,)).fetchone() is None:
                return jsonify({"message": "Célula no encontrada."}), 404
            person_row = connection.execute("SELECT id FROM people_catalog WHERE id = ?", (person_id,)).fetchone()
            if person_row is None:
                return jsonify({"message": "Persona no encontrada."}), 404

            assigned_row = connection.execute(
                """
                SELECT membership.cell_id, cell.cell_number
                FROM cell_membership membership
                INNER JOIN cell_catalog cell ON cell.id = membership.cell_id
                WHERE membership.person_id = ?
                """,
                (person_id,),
            ).fetchone()
            if assigned_row is not None:
                if int(assigned_row["cell_id"]) == cell_id:
                    return jsonify({"message": "La persona ya pertenece a esta célula."}), 409
                return jsonify({"message": f"La persona ya está asignada a la célula {assigned_row['cell_number']}. Remuévela antes de reasignarla."}), 409

            try:
                connection.execute(
                    "INSERT INTO cell_membership (cell_id, person_id, attendance_mode, attendance_defaults_json, created_at) VALUES (?, ?, ?, ?, ?)",
                    (cell_id, person_id, attendance_mode, json.dumps(attendance_defaults, ensure_ascii=False), utc_now_iso()),
                )
                connection.commit()
            except sqlite3.IntegrityError:
                return jsonify({"message": "La persona ya pertenece a la célula."}), 409

        return jsonify({"ok": True}), 201

    @app.put("/api/catalogs/cells/<int:cell_id>/members/<int:person_id>")
    def update_cell_member(cell_id: int, person_id: int) -> Response:
        payload = normalize_payload(read_payload())
        attendance_mode = normalize_membership_attendance_mode(payload.get("attendanceMode"))
        attendance_defaults = normalize_membership_attendance_defaults(payload.get("attendanceDefaults"), attendance_mode)

        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            cursor = connection.execute(
                "UPDATE cell_membership SET attendance_mode = ?, attendance_defaults_json = ? WHERE cell_id = ? AND person_id = ?",
                (attendance_mode, json.dumps(attendance_defaults, ensure_ascii=False), cell_id, person_id),
            )
            connection.commit()

        if cursor.rowcount == 0:
            return jsonify({"message": "Miembro no encontrado en la célula."}), 404
        return jsonify({"ok": True})

    @app.delete("/api/catalogs/cells/<int:cell_id>/members/<int:person_id>")
    def remove_cell_member(cell_id: int, person_id: int) -> Response:
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            cursor = connection.execute(
                "DELETE FROM cell_membership WHERE cell_id = ? AND person_id = ?",
                (cell_id, person_id),
            )
            connection.commit()

        if cursor.rowcount == 0:
            return jsonify({"message": "Miembro no encontrado en la célula."}), 404
        return Response(status=204)

    @app.get("/api/reports")
    def list_reports() -> Response:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT id, employee_name, area, device_model, imei, phone_number, status, notes, payload_json, created_at, updated_at
                FROM reports
                ORDER BY id DESC
                """
            ).fetchall()
        return jsonify({"reports": [serialize_report(row) for row in rows]})

    @app.get("/api/reports/<int:report_id>")
    def get_report(report_id: int) -> Response:
        with get_connection() as connection:
            row = connection.execute(
                """
                SELECT id, employee_name, area, device_model, imei, phone_number, status, notes, payload_json, created_at, updated_at
                FROM reports
                WHERE id = ?
                """,
                (report_id,),
            ).fetchone()
        if row is None:
            return jsonify({"message": "Reporte no encontrado."}), 404
        return jsonify({"report": serialize_report(row)})

    @app.post("/api/reports")
    def create_report() -> Response:
        payload = normalize_payload(read_payload())
        normalize_report_rcm_snapshot(payload)
        validation_error = validate_report_payload(payload)
        if validation_error:
            return jsonify({"message": validation_error}), 400

        summary = build_report_summary(payload)
        now = utc_now_iso()
        try:
            with get_connection() as connection:
                existing_report = find_existing_weekly_report(connection, summary)
                if existing_report is None:
                    cursor = connection.execute(
                        """
                        INSERT INTO reports (
                            employee_name,
                            area,
                            device_model,
                            imei,
                            phone_number,
                            status,
                            notes,
                            payload_json,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            summary["leaderName"],
                            summary["assistantName"],
                            summary["cellNumber"],
                            summary["reportDate"],
                            summary["week"],
                            summary["sector"],
                            payload.get("notes", ""),
                            json.dumps(payload, ensure_ascii=False),
                            now,
                            now,
                        ),
                    )
                    report_id = cursor.lastrowid
                    was_updated = False
                else:
                    connection.execute(
                        """
                        UPDATE reports
                        SET employee_name = ?,
                            area = ?,
                            device_model = ?,
                            imei = ?,
                            phone_number = ?,
                            status = ?,
                            notes = ?,
                            payload_json = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            summary["leaderName"],
                            summary["assistantName"],
                            summary["cellNumber"],
                            summary["reportDate"],
                            summary["week"],
                            summary["sector"],
                            payload.get("notes", ""),
                            json.dumps(payload, ensure_ascii=False),
                            now,
                            existing_report["id"],
                        ),
                    )
                    report_id = existing_report["id"]
                    was_updated = True
                promote_baptized_people(connection, payload)
                promote_visitors_to_members(connection, payload)
                rebuild_friend_tracking(connection)
                connection.commit()
        except sqlite3.IntegrityError as error:
            if "idx_reports_unique_period_cell_week" in str(error):
                return jsonify({"message": "Ya existe un reporte para esa célula, semana, año y cuatrimestre."}), 409
            raise

        status_code = 200 if was_updated else 201
        return jsonify({"ok": True, "id": report_id, "updatedExisting": was_updated}), status_code

    @app.put("/api/reports/<int:report_id>")
    def update_report(report_id: int) -> Response:
        payload = normalize_payload(read_payload())
        normalize_report_rcm_snapshot(payload)
        validation_error = validate_report_payload(payload)
        if validation_error:
            return jsonify({"message": validation_error}), 400

        summary = build_report_summary(payload)
        try:
            with get_connection() as connection:
                cursor = connection.execute(
                    """
                    UPDATE reports
                    SET employee_name = ?,
                        area = ?,
                        device_model = ?,
                        imei = ?,
                        phone_number = ?,
                        status = ?,
                        notes = ?,
                        payload_json = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        summary["leaderName"],
                        summary["assistantName"],
                        summary["cellNumber"],
                        summary["reportDate"],
                        summary["week"],
                        summary["sector"],
                        payload.get("notes", ""),
                        json.dumps(payload, ensure_ascii=False),
                        utc_now_iso(),
                        report_id,
                    ),
                )
                promote_baptized_people(connection, payload)
                promote_visitors_to_members(connection, payload)
                rebuild_friend_tracking(connection)
                connection.commit()
        except sqlite3.IntegrityError as error:
            if "idx_reports_unique_period_cell_week" in str(error):
                return jsonify({"message": "Ya existe un reporte para esa célula, semana, año y cuatrimestre."}), 409
            raise

        if cursor.rowcount == 0:
            return jsonify({"message": "Reporte no encontrado."}), 404
        return jsonify({"ok": True})

    @app.delete("/api/reports/<int:report_id>")
    def delete_report(report_id: int) -> Response:
        with get_connection() as connection:
            cursor = connection.execute("DELETE FROM reports WHERE id = ?", (report_id,))
            rebuild_friend_tracking(connection)
            connection.commit()

        if cursor.rowcount == 0:
            return jsonify({"message": "Reporte no encontrado."}), 404
        return Response(status=204)

    @app.get("/api/friend-tracking")
    def get_friend_tracking() -> Response:
        cell_number = str(request.args.get("cellNumber", "")).strip()
        sector = str(request.args.get("sector", "")).strip()
        year = str(request.args.get("year", "")).strip()
        quarter = str(request.args.get("quarter", "")).strip()
        scope = str(request.args.get("scope", "current")).strip().lower()
        if scope == "all":
            year = ""
            quarter = ""
        with get_connection() as connection:
            payload = build_friend_tracking_payload(connection, cell_number=cell_number, sector=sector, year=year, quarter=quarter)
        return jsonify(payload)

    @app.put("/api/friend-tracking/goals")
    def save_friend_tracking_goals() -> Response:
        payload = read_payload() or {}
        cell_number = str(payload.get("cellNumber", "")).strip()
        year = str(payload.get("year", "")).strip()
        quarter = str(payload.get("quarter", "")).strip()
        if not cell_number or not year or not quarter:
            return jsonify({"message": "cellNumber, year y quarter son obligatorios."}), 400
        now = utc_now_iso()
        levantate = int(payload.get("levantateGoal") or 0)
        restauracion = int(payload.get("restauracionGoal") or 0)
        bautismos = int(payload.get("bautismosGoal") or 0)
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            connection.execute(
                """
                INSERT INTO cell_cycle_goals (
                    cell_number, year, quarter,
                    levantate_goal, restauracion_goal, bautismos_goal,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cell_number, year, quarter) DO UPDATE SET
                    levantate_goal = excluded.levantate_goal,
                    restauracion_goal = excluded.restauracion_goal,
                    bautismos_goal = excluded.bautismos_goal,
                    updated_at = excluded.updated_at
                """,
                (cell_number, year, quarter, levantate, restauracion, bautismos, now, now),
            )
            connection.commit()
        return jsonify({"ok": True})

    # ── Weekly approvals (supervisor → coordinator workflow) ──────────────────
    def _serialize_approval(row) -> dict:
        return {
            "id": row["id"],
            "sector": row["sector"] or "",
            "year": row["year"] or "",
            "quarter": row["quarter"] or "",
            "week": row["week"] or "",
            "state": row["state"] or "pendiente",
            "supervisorName": row["supervisor_name"] or "",
            "supervisorAt": row["supervisor_at"] or "",
            "supervisorNotes": row["supervisor_notes"] or "",
            "coordinatorName": row["coordinator_name"] or "",
            "coordinatorAt": row["coordinator_at"] or "",
            "coordinatorNotes": row["coordinator_notes"] or "",
            "updatedAt": row["updated_at"] or "",
        }

    @app.get("/api/approvals")
    def list_approvals() -> Response:
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT * FROM weekly_approvals ORDER BY year DESC, quarter DESC, week DESC, sector"
            ).fetchall()
        return jsonify({"approvals": [_serialize_approval(r) for r in rows]})

    @app.post("/api/approvals")
    def upsert_approval() -> Response:
        payload = read_payload()
        if not isinstance(payload, dict):
            return jsonify({"message": "Payload inválido."}), 400

        sector  = str(payload.get("sector", "")).strip()
        year    = str(payload.get("year", "")).strip()
        quarter = str(payload.get("quarter", "")).strip()
        week    = str(payload.get("week", "")).strip()
        action  = str(payload.get("action", "")).strip()
        actor   = str(payload.get("actor", "")).strip()
        notes   = str(payload.get("notes", "")).strip()

        if not (sector and year and quarter and week and action):
            return jsonify({"message": "Faltan campos requeridos (sector, year, quarter, week, action)."}), 400
        if action not in ("supervisor_review", "coordinator_approve", "return_pending"):
            return jsonify({"message": "Acción inválida."}), 400

        now = utc_now_iso()
        with get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM weekly_approvals WHERE sector=? AND year=? AND quarter=? AND week=?",
                (sector, year, quarter, week),
            ).fetchone()

            current_state = row["state"] if row else "pendiente"

            # Transiciones permitidas
            if action == "supervisor_review":
                if current_state == "aprobado_coordinador":
                    return jsonify({"message": "Ya aprobado por coordinador. Regresa a pendiente primero."}), 409
                new_state = "revisado_supervisor"
            elif action == "coordinator_approve":
                if current_state != "revisado_supervisor":
                    return jsonify({"message": "El supervisor debe revisar antes de aprobar."}), 409
                new_state = "aprobado_coordinador"
            else:  # return_pending
                new_state = "pendiente"

            if row is None:
                connection.execute(
                    """
                    INSERT INTO weekly_approvals
                    (sector, year, quarter, week, state,
                     supervisor_name, supervisor_at, supervisor_notes,
                     coordinator_name, coordinator_at, coordinator_notes, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sector, year, quarter, week, new_state,
                        actor if action == "supervisor_review" else "",
                        now if action == "supervisor_review" else "",
                        notes if action == "supervisor_review" else "",
                        actor if action == "coordinator_approve" else "",
                        now if action == "coordinator_approve" else "",
                        notes if action == "coordinator_approve" else "",
                        now,
                    ),
                )
            else:
                if action == "supervisor_review":
                    connection.execute(
                        """
                        UPDATE weekly_approvals
                        SET state=?, supervisor_name=?, supervisor_at=?, supervisor_notes=?, updated_at=?
                        WHERE id=?
                        """,
                        (new_state, actor, now, notes, now, row["id"]),
                    )
                elif action == "coordinator_approve":
                    connection.execute(
                        """
                        UPDATE weekly_approvals
                        SET state=?, coordinator_name=?, coordinator_at=?, coordinator_notes=?, updated_at=?
                        WHERE id=?
                        """,
                        (new_state, actor, now, notes, now, row["id"]),
                    )
                else:  # return_pending
                    connection.execute(
                        """
                        UPDATE weekly_approvals
                        SET state=?, supervisor_at='', supervisor_notes='',
                            coordinator_name='', coordinator_at='', coordinator_notes='',
                            updated_at=?
                        WHERE id=?
                        """,
                        (new_state, now, row["id"]),
                    )
            connection.commit()

            updated = connection.execute(
                "SELECT * FROM weekly_approvals WHERE sector=? AND year=? AND quarter=? AND week=?",
                (sector, year, quarter, week),
            ).fetchone()

        return jsonify({"ok": True, "approval": _serialize_approval(updated)})

    @app.get("/api/settings")
    def get_settings() -> Response:
        with get_connection() as connection:
            rows = connection.execute("SELECT key, value FROM app_settings").fetchall()
        return jsonify({row["key"]: row["value"] for row in rows})

    @app.post("/api/settings")
    def update_settings() -> Response:
        payload = read_payload()
        if not isinstance(payload, dict):
            return jsonify({"message": "Payload inválido."}), 400
        now = utc_now_iso()
        with get_connection() as connection:
            _actor, error_response = require_catalog_actor(connection)
            if error_response:
                return error_response
            for key, value in payload.items():
                connection.execute(
                    """
                    INSERT INTO app_settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                    """,
                    (str(key), str(value), now),
                )
            connection.commit()
        return jsonify({"ok": True})

    @app.errorhandler(404)
    def not_found(_error) -> Response:
        return send_from_directory(PUBLIC_DIR, "index.html")

    return app


def initialize_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_name TEXT NOT NULL,
                area TEXT NOT NULL,
                device_model TEXT NOT NULL,
                imei TEXT NOT NULL,
                phone_number TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'activo',
                notes TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_period_cell_week
            ON reports (
                device_model,
                phone_number,
                substr(imei, 1, 4),
                CASE
                    WHEN CAST(substr(imei, 6, 2) AS INTEGER) <= 4 THEN '1'
                    WHEN CAST(substr(imei, 6, 2) AS INTEGER) <= 8 THEN '2'
                    ELSE '3'
                END
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS people_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                guardian_person_id INTEGER,
                guardian_name TEXT NOT NULL DEFAULT '',
                visit_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS cell_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cell_number TEXT NOT NULL UNIQUE,
                network_name TEXT NOT NULL DEFAULT '',
                sector TEXT NOT NULL,
                zone_name TEXT NOT NULL DEFAULT '',
                district_name TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                leader_person_id INTEGER,
                assistant_person_id INTEGER,
                host_person_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS cell_membership (
                cell_id INTEGER NOT NULL,
                person_id INTEGER NOT NULL,
                attendance_mode TEXT NOT NULL DEFAULT 'normal',
                attendance_defaults_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                PRIMARY KEY (cell_id, person_id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_credentials (
                person_id INTEGER PRIMARY KEY,
                password_hash TEXT NOT NULL DEFAULT '',
                must_change INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS weekly_approvals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sector TEXT NOT NULL,
                year TEXT NOT NULL,
                quarter TEXT NOT NULL,
                week TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pendiente',
                supervisor_name TEXT NOT NULL DEFAULT '',
                supervisor_at TEXT NOT NULL DEFAULT '',
                supervisor_notes TEXT NOT NULL DEFAULT '',
                coordinator_name TEXT NOT NULL DEFAULT '',
                coordinator_at TEXT NOT NULL DEFAULT '',
                coordinator_notes TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL,
                UNIQUE (sector, year, quarter, week)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS deleted_people_catalog (
                normalized_name TEXT PRIMARY KEY,
                original_name TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS friends_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                normalized_name TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                invited_by TEXT NOT NULL DEFAULT '',
                first_report_date TEXT NOT NULL DEFAULT '',
                last_report_date TEXT NOT NULL DEFAULT '',
                current_cell_number TEXT NOT NULL DEFAULT '',
                current_sector TEXT NOT NULL DEFAULT '',
                total_cycles INTEGER NOT NULL DEFAULT 0,
                total_reports INTEGER NOT NULL DEFAULT 0,
                current_status TEXT NOT NULL DEFAULT 'in_process',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS friend_cycles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                friend_id INTEGER NOT NULL,
                year TEXT NOT NULL,
                quarter TEXT NOT NULL,
                cell_number TEXT NOT NULL DEFAULT '',
                sector TEXT NOT NULL DEFAULT '',
                invited_by TEXT NOT NULL DEFAULT '',
                entry_week INTEGER NOT NULL DEFAULT 0,
                entry_report_date TEXT NOT NULL DEFAULT '',
                late_entry INTEGER NOT NULL DEFAULT 0,
                current_week INTEGER NOT NULL DEFAULT 0,
                weeks_seen INTEGER NOT NULL DEFAULT 0,
                total_reach INTEGER NOT NULL DEFAULT 0,
                total_sunday INTEGER NOT NULL DEFAULT 0,
                total_events INTEGER NOT NULL DEFAULT 0,
                converted INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'in_process',
                outcome TEXT NOT NULL DEFAULT '',
                last_report_date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(friend_id, year, quarter)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS friend_cycle_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                friend_cycle_id INTEGER NOT NULL,
                report_id INTEGER NOT NULL,
                week_number INTEGER NOT NULL,
                report_date TEXT NOT NULL DEFAULT '',
                phase TEXT NOT NULL DEFAULT '',
                verb TEXT NOT NULL DEFAULT '',
                reach_attended INTEGER NOT NULL DEFAULT 0,
                sunday_attended INTEGER NOT NULL DEFAULT 0,
                event_attended INTEGER NOT NULL DEFAULT 0,
                converted INTEGER NOT NULL DEFAULT 0,
                late_registration INTEGER NOT NULL DEFAULT 0,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(friend_cycle_id, report_id, week_number)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS cell_cycle_goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cell_number TEXT NOT NULL,
                year TEXT NOT NULL,
                quarter TEXT NOT NULL,
                levantate_goal INTEGER NOT NULL DEFAULT 0,
                restauracion_goal INTEGER NOT NULL DEFAULT 0,
                bautismos_goal INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(cell_number, year, quarter)
            )
            """
        )
        ensure_schema(connection)
        seed_catalogs(connection)
        rebuild_friend_tracking(connection)
        connection.commit()


def ensure_schema(connection) -> None:
    report_columns = get_table_columns(connection, "reports")
    if "payload_json" not in report_columns:
        connection.execute("ALTER TABLE reports ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}' ")

    friend_cycles_columns = get_table_columns(connection, "friend_cycles")
    required_friend_cycles = {
        "friend_id", "year", "quarter", "cell_number", "sector", "invited_by",
        "entry_week", "entry_report_date", "late_entry", "current_week", "weeks_seen",
        "total_reach", "total_sunday", "total_events", "converted", "completed",
        "status", "outcome", "last_report_date",
    }
    friend_steps_columns = get_table_columns(connection, "friend_cycle_steps")
    required_friend_steps = {
        "friend_cycle_id", "report_id", "week_number", "report_date", "phase", "verb",
        "reach_attended", "sunday_attended", "event_attended", "converted", "late_registration", "note",
    }
    friend_catalog_columns = get_table_columns(connection, "friends_catalog")
    required_friend_catalog = {
        "normalized_name", "name", "phone", "invited_by", "first_report_date", "last_report_date",
        "current_cell_number", "current_sector", "total_cycles", "total_reports", "current_status",
    }
    if (friend_cycles_columns and not required_friend_cycles.issubset(friend_cycles_columns)) \
        or (friend_steps_columns and not required_friend_steps.issubset(friend_steps_columns)) \
        or (friend_catalog_columns and not required_friend_catalog.issubset(friend_catalog_columns)):
        recreate_friend_tracking_tables(connection)

    people_columns = get_table_columns(connection, "people_catalog")
    if people_columns:
        if "phone" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
            people_columns = get_table_columns(connection, "people_catalog")
        if "email" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN email TEXT NOT NULL DEFAULT ''")
            people_columns = get_table_columns(connection, "people_catalog")
        if "guardian_person_id" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN guardian_person_id INTEGER")
            people_columns = get_table_columns(connection, "people_catalog")
        if "guardian_name" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN guardian_name TEXT NOT NULL DEFAULT ''")
            people_columns = get_table_columns(connection, "people_catalog")
        if "visit_count" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN visit_count INTEGER NOT NULL DEFAULT 0")
            people_columns = get_table_columns(connection, "people_catalog")
        if "rcm_progress" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN rcm_progress TEXT NOT NULL DEFAULT '{}'")
        if "supervisor_sector" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN supervisor_sector TEXT NOT NULL DEFAULT ''")
        if "is_coordinator" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN is_coordinator INTEGER NOT NULL DEFAULT 0")
            people_columns = get_table_columns(connection, "people_catalog")
        if "is_system_account" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN is_system_account INTEGER NOT NULL DEFAULT 0")
            people_columns = get_table_columns(connection, "people_catalog")
            # Migración inicial: cuentas tipo *.admin (sin ser personas reales) se
            # marcan automáticamente como cuentas de sistema. Cualquier ajuste
            # posterior se hace desde la UI.
            try:
                connection.execute(
                    "UPDATE people_catalog SET is_system_account = 1 "
                    "WHERE username IS NOT NULL AND lower(username) LIKE '%.admin'"
                )
            except Exception:
                pass
            # Compat: si la BD viene de una versión anterior con is_super_admin,
            # heredar ese flag a is_system_account para no perder accesos.
            if "is_super_admin" in people_columns:
                try:
                    connection.execute(
                        "UPDATE people_catalog SET is_system_account = 1 "
                        "WHERE is_super_admin = 1"
                    )
                except Exception:
                    pass
        if "is_admin" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
            people_columns = get_table_columns(connection, "people_catalog")
        if "username" not in people_columns:
            connection.execute("ALTER TABLE people_catalog ADD COLUMN username TEXT")
            try:
                connection.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_people_username "
                    "ON people_catalog(lower(username)) WHERE username IS NOT NULL AND username <> ''"
                )
            except Exception:
                pass

    cell_columns = get_table_columns(connection, "cell_catalog")
    if cell_columns:
        if "address" not in cell_columns:
            connection.execute("ALTER TABLE cell_catalog ADD COLUMN address TEXT NOT NULL DEFAULT ''")
            cell_columns = get_table_columns(connection, "cell_catalog")
        if "leader_person_id" not in cell_columns:
            connection.execute("ALTER TABLE cell_catalog ADD COLUMN leader_person_id INTEGER")
            cell_columns = get_table_columns(connection, "cell_catalog")
        if "assistant_person_id" not in cell_columns:
            connection.execute("ALTER TABLE cell_catalog ADD COLUMN assistant_person_id INTEGER")
            cell_columns = get_table_columns(connection, "cell_catalog")
        if "host_person_id" not in cell_columns:
            connection.execute("ALTER TABLE cell_catalog ADD COLUMN host_person_id INTEGER")

    membership_columns = get_table_columns(connection, "cell_membership")
    if membership_columns and "attendance_mode" not in membership_columns:
        connection.execute("ALTER TABLE cell_membership ADD COLUMN attendance_mode TEXT NOT NULL DEFAULT 'normal'")
        membership_columns = get_table_columns(connection, "cell_membership")
    if membership_columns and "attendance_defaults_json" not in membership_columns:
        connection.execute("ALTER TABLE cell_membership ADD COLUMN attendance_defaults_json TEXT NOT NULL DEFAULT '{}' ")

    ensure_single_cell_membership(connection)


def ensure_single_cell_membership(connection) -> None:
    membership_rows = connection.execute(
        "SELECT rowid, person_id FROM cell_membership ORDER BY person_id ASC, created_at DESC, rowid DESC"
    ).fetchall()
    seen_people: set[int] = set()
    duplicated_rowids: list[tuple[int]] = []
    for row in membership_rows:
        person_id = int(row["person_id"])
        if person_id in seen_people:
            duplicated_rowids.append((int(row["rowid"]),))
            continue
        seen_people.add(person_id)

    if duplicated_rowids:
        connection.executemany("DELETE FROM cell_membership WHERE rowid = ?", duplicated_rowids)

    connection.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_cell_membership_person_unique ON cell_membership (person_id)"
    )


def get_table_columns(connection, table_name: str) -> set[str]:
    return {row[1] for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()}


def normalize_membership_attendance_mode(value: str) -> str:
    mode = str(value or "").strip().lower()
    return "justified_default" if mode == "justified_default" else "normal"


def normalize_membership_attendance_defaults(value, attendance_mode: str) -> dict:
    mode = normalize_membership_attendance_mode(attendance_mode)
    if mode != "justified_default":
        return {}
    raw = value if isinstance(value, dict) else {}
    defaults = {
        "planning": bool(raw.get("planning")),
        "reach": bool(raw.get("reach")),
        "sunday": bool(raw.get("sunday")),
    }
    if not any(defaults.values()):
        return {"planning": True, "reach": True, "sunday": True}
    return defaults


def seed_catalogs(connection) -> None:
    people_count = connection.execute("SELECT COUNT(*) FROM people_catalog").fetchone()[0]
    if people_count == 0:
        now = utc_now_iso()
        connection.executemany(
            """
            INSERT INTO people_catalog (name, role, phone, email, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                ("Eloísa Vargas", "leader", "", "", now, now),
                ("Blanca Vargas", "assistant", "", "", now, now),
                ("Martha López", "host", "", "", now, now),
                ("Samuel Torres", "member", "", "", now, now),
                ("Andrea Ruiz", "member", "", "", now, now),
            ],
        )

    cell_count = connection.execute("SELECT COUNT(*) FROM cell_catalog").fetchone()[0]
    if cell_count == 0:
        now = utc_now_iso()
        people = {
            row["name"]: row["id"]
            for row in connection.execute("SELECT id, name FROM people_catalog").fetchall()
        }
        connection.executemany(
            """
            INSERT INTO cell_catalog (
                cell_number,
                network_name,
                sector,
                zone_name,
                district_name,
                address,
                leader_person_id,
                assistant_person_id,
                host_person_id,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ("1", "Red Principal", "A", "Zona Norte", "Distrito 1", "Calle Primera 120", people.get("Eloísa Vargas"), people.get("Blanca Vargas"), people.get("Martha López"), now, now),
                ("2", "Red Vida", "B", "Zona Centro", "Distrito 2", "Calle Segunda 430", None, None, None, now, now),
            ],
        )

    membership_count = connection.execute("SELECT COUNT(*) FROM cell_membership").fetchone()[0]
    if membership_count == 0:
        cell_map = {
            row["cell_number"]: row["id"]
            for row in connection.execute("SELECT id, cell_number FROM cell_catalog").fetchall()
        }
        person_map = {
            row["name"]: row["id"]
            for row in connection.execute("SELECT id, name FROM people_catalog").fetchall()
        }
        connection.executemany(
            "INSERT OR IGNORE INTO cell_membership (cell_id, person_id, created_at) VALUES (?, ?, ?)",
            [
                (cell_map.get("1"), person_map.get("Samuel Torres"), utc_now_iso()),
                (cell_map.get("1"), person_map.get("Andrea Ruiz"), utc_now_iso()),
            ],
        )


def recreate_friend_tracking_tables(connection) -> None:
    connection.execute("DROP TABLE IF EXISTS friend_cycle_steps")
    connection.execute("DROP TABLE IF EXISTS friend_cycles")
    connection.execute("DROP TABLE IF EXISTS friends_catalog")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS friends_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            normalized_name TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            invited_by TEXT NOT NULL DEFAULT '',
            first_report_date TEXT NOT NULL DEFAULT '',
            last_report_date TEXT NOT NULL DEFAULT '',
            current_cell_number TEXT NOT NULL DEFAULT '',
            current_sector TEXT NOT NULL DEFAULT '',
            total_cycles INTEGER NOT NULL DEFAULT 0,
            total_reports INTEGER NOT NULL DEFAULT 0,
            current_status TEXT NOT NULL DEFAULT 'in_process',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS friend_cycles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            friend_id INTEGER NOT NULL,
            year TEXT NOT NULL,
            quarter TEXT NOT NULL,
            cell_number TEXT NOT NULL DEFAULT '',
            sector TEXT NOT NULL DEFAULT '',
            invited_by TEXT NOT NULL DEFAULT '',
            entry_week INTEGER NOT NULL DEFAULT 0,
            entry_report_date TEXT NOT NULL DEFAULT '',
            late_entry INTEGER NOT NULL DEFAULT 0,
            current_week INTEGER NOT NULL DEFAULT 0,
            weeks_seen INTEGER NOT NULL DEFAULT 0,
            total_reach INTEGER NOT NULL DEFAULT 0,
            total_sunday INTEGER NOT NULL DEFAULT 0,
            total_events INTEGER NOT NULL DEFAULT 0,
            converted INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'in_process',
            outcome TEXT NOT NULL DEFAULT '',
            last_report_date TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(friend_id, year, quarter)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS friend_cycle_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            friend_cycle_id INTEGER NOT NULL,
            report_id INTEGER NOT NULL,
            week_number INTEGER NOT NULL,
            report_date TEXT NOT NULL DEFAULT '',
            phase TEXT NOT NULL DEFAULT '',
            verb TEXT NOT NULL DEFAULT '',
            reach_attended INTEGER NOT NULL DEFAULT 0,
            sunday_attended INTEGER NOT NULL DEFAULT 0,
            event_attended INTEGER NOT NULL DEFAULT 0,
            converted INTEGER NOT NULL DEFAULT 0,
            late_registration INTEGER NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(friend_cycle_id, report_id, week_number)
        )
        """
    )


def get_connection():
    if TURSO_URL and TURSO_TOKEN:
        return _TursoConnection(TURSO_URL, TURSO_TOKEN)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def read_payload() -> dict:
    try:
        payload = request.get_json(force=True, silent=False)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def normalize_payload(payload: dict) -> dict:
    normalized = {}
    for key, value in payload.items():
        if isinstance(value, str):
            normalized[key] = value.strip()
        else:
            normalized[key] = value
    return normalized


def normalize_person_role(value) -> str:
    role = str(value or "").strip().lower()
    return role if role in VALID_PERSON_ROLES else ""


def normalize_nullable_int(value) -> int | None:
    raw_value = str(value or "").strip()
    if not raw_value:
        return None
    try:
        return int(raw_value)
    except ValueError:
        return None


def validate_person_payload(payload: dict) -> str | None:
    if not str(payload.get("name", "")).strip():
        return "El nombre es obligatorio."
    if not normalize_person_role(payload.get("role")):
        return "El perfil no es válido."
    payload["role"] = normalize_person_role(payload.get("role"))
    payload["guardianPersonId"] = normalize_nullable_int(payload.get("guardianPersonId"))
    payload["guardianName"] = str(payload.get("guardianName", "")).strip()
    if payload["role"] == "kid" and payload["guardianPersonId"] is None and not payload["guardianName"]:
        return "Los niños deben tener un responsable o referencia."
    if payload["role"] != "kid":
        payload["guardianPersonId"] = None
        payload["guardianName"] = ""
    return None


def find_existing_pastor(connection, exclude_person_id: int | None = None):
    if exclude_person_id is None:
        return connection.execute(
            "SELECT id, name FROM people_catalog WHERE role = 'pastor' LIMIT 1"
        ).fetchone()
    return connection.execute(
        "SELECT id, name FROM people_catalog WHERE role = 'pastor' AND id <> ? LIMIT 1",
        (exclude_person_id,),
    ).fetchone()


def validate_cell_payload(payload: dict) -> str | None:
    if not str(payload.get("cellNumber", "")).strip():
        return "La célula es obligatoria."
    if not str(payload.get("sector", "")).strip():
        return "El sector es obligatorio."
    return None


def validate_report_payload(payload: dict) -> str | None:
    for field_name in REQUIRED_FIELDS:
        if not str(payload.get(field_name, "")).strip():
            return f"El campo {field_name} es obligatorio."

    # Validate week does not exceed current cycle week
    try:
        with get_connection() as conn:
            row_start = conn.execute(
                "SELECT value FROM app_settings WHERE key = 'cycle_start_date'"
            ).fetchone()
            row_day = conn.execute(
                "SELECT value FROM app_settings WHERE key = 'week_start_day'"
            ).fetchone()
            # Total de semanas del ciclo — derivado de rcm_weeks_config si trae
            # un array completo (con phase+verb por entrada). Si no, default 16.
            row_cfg = conn.execute(
                "SELECT value FROM app_settings WHERE key = 'rcm_weeks_config'"
            ).fetchone()
            cycle_total_weeks = 16
            if row_cfg and row_cfg["value"]:
                try:
                    cfg = json.loads(row_cfg["value"])
                    if isinstance(cfg, list) and cfg:
                        full = all(
                            isinstance(e, dict)
                            and isinstance(e.get("phase"), str)
                            and isinstance(e.get("verb"), str)
                            and isinstance(e.get("week"), int)
                            for e in cfg
                        )
                        if full:
                            cycle_total_weeks = max(1, len(cfg))
                except Exception:
                    pass
        if row_start and row_start["value"]:
            cycle_start = date.fromisoformat(row_start["value"])
            today = date.today()
            diff_days = (today - cycle_start).days
            if diff_days >= 0:
                # week_start_day: 0=Dom..6=Sab (JS getDay convention)
                # Python weekday(): 0=Lun..6=Dom  →  py_dow = (js_dow + 6) % 7
                if row_day and row_day["value"] != "":
                    js_dow = int(row_day["value"])
                    target_py = (js_dow + 6) % 7
                    start_py = cycle_start.weekday()
                    days_to_first = (target_py - start_py) % 7
                    if days_to_first == 0:
                        days_to_first = 7
                    if diff_days < days_to_first:
                        max_week = 1
                    else:
                        max_week = min(cycle_total_weeks, (diff_days - days_to_first) // 7 + 2)
                else:
                    max_week = max(1, min(cycle_total_weeks, math.floor(diff_days / 7) + 1))
                submitted_week = int(str(payload.get("week", "1")).strip())
                if submitted_week > max_week:
                    return (
                        f"No puedes reportar la semana {submitted_week} — "
                        f"actualmente estamos en la semana {max_week}."
                    )
    except Exception:
        pass  # If settings unavailable, skip this validation

    return None


def normalize_baptism_entries(payload: dict) -> list[dict]:
    raw_entries = payload.get("baptisms")
    if not isinstance(raw_entries, list):
        return []

    normalized_entries: list[dict] = []
    for entry in raw_entries:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name", "")).strip()
        if not name:
            continue
        normalized_entries.append(
            {
                "name": name,
                "baptismDate": str(entry.get("baptismDate", "")).strip(),
                "promoteToMember": entry.get("promoteToMember") is not False,
            }
        )
    return normalized_entries


def find_cell_id_by_number(connection, cell_number: str) -> int | None:
    row = connection.execute(
        "SELECT id FROM cell_catalog WHERE cell_number = ?",
        (str(cell_number or "").strip(),),
    ).fetchone()
    return int(row["id"]) if row else None


def find_person_by_name(connection, name: str):
    return connection.execute(
        "SELECT id, role FROM people_catalog WHERE lower(name) = lower(?)",
        (str(name or "").strip(),),
    ).fetchone()


def is_deleted_person_name(connection, name: str) -> bool:
    normalized_name = normalize_friend_name(name)
    if not normalized_name:
        return False
    row = connection.execute(
        "SELECT 1 FROM deleted_people_catalog WHERE normalized_name = ?",
        (normalized_name,),
    ).fetchone()
    return row is not None


def remember_deleted_person_name(connection, person_name: str) -> None:
    normalized_name = normalize_friend_name(person_name)
    if not normalized_name:
        return
    connection.execute(
        """
        INSERT INTO deleted_people_catalog (normalized_name, original_name, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(normalized_name) DO UPDATE SET original_name = excluded.original_name
        """,
        (normalized_name, str(person_name or "").strip(), utc_now_iso()),
    )


def promote_baptized_people(connection, payload: dict) -> None:
    cell_id = find_cell_id_by_number(connection, str(payload.get("cellNumber", "")).strip())
    if cell_id is None:
        return

    now = utc_now_iso()
    seen_names: set[str] = set()
    for baptism in normalize_baptism_entries(payload):
        if not baptism["promoteToMember"]:
            continue
        if is_deleted_person_name(connection, baptism["name"]):
            continue
        normalized_name = baptism["name"].casefold()
        if normalized_name in seen_names:
            continue
        seen_names.add(normalized_name)

        person_row = find_person_by_name(connection, baptism["name"])
        if person_row is None:
            cursor = connection.execute(
                """
                INSERT INTO people_catalog (name, role, phone, email, guardian_person_id, guardian_name, created_at, updated_at)
                VALUES (?, 'member', '', '', NULL, '', ?, ?)
                """,
                (baptism["name"], now, now),
            )
            person_id = int(cursor.lastrowid)
        else:
            person_id = int(person_row["id"])
            if person_row["role"] not in {"leader", "assistant", "host", "member", "pastor"}:
                connection.execute(
                    """
                    UPDATE people_catalog
                    SET role = 'member', guardian_person_id = NULL, guardian_name = '', updated_at = ?
                    WHERE id = ?
                    """,
                    (now, person_id),
                )

        connection.execute(
            "INSERT OR IGNORE INTO cell_membership (cell_id, person_id, created_at) VALUES (?, ?, ?)",
            (cell_id, person_id, now),
        )


def promote_visitors_to_members(connection, payload: dict) -> None:
    """Visitas (kind='visita') ya bautizadas que el usuario marcó para promover
    a miembros de la célula. No crea registro de bautismo."""
    raw_visitors = payload.get("visitors")
    if not isinstance(raw_visitors, list):
        return
    cell_id = find_cell_id_by_number(connection, str(payload.get("cellNumber", "")).strip())
    if cell_id is None:
        return

    now = utc_now_iso()
    seen_names: set[str] = set()
    for visitor in raw_visitors:
        if not isinstance(visitor, dict):
            continue
        kind = str(visitor.get("kind", "")).strip().lower()
        if kind != "visita":
            continue
        if not visitor.get("promoteToMember"):
            continue
        name = str(visitor.get("name", "")).strip()
        if not name:
            continue
        if is_deleted_person_name(connection, name):
            continue
        normalized_name = name.casefold()
        if normalized_name in seen_names:
            continue
        seen_names.add(normalized_name)

        person_row = find_person_by_name(connection, name)
        if person_row is None:
            cursor = connection.execute(
                """
                INSERT INTO people_catalog (name, role, phone, email, guardian_person_id, guardian_name, created_at, updated_at)
                VALUES (?, 'member', ?, '', NULL, '', ?, ?)
                """,
                (name, str(visitor.get("phone", "") or ""), now, now),
            )
            person_id = int(cursor.lastrowid)
        else:
            person_id = int(person_row["id"])
            if person_row["role"] not in {"leader", "assistant", "host", "member", "pastor"}:
                connection.execute(
                    """
                    UPDATE people_catalog
                    SET role = 'member', guardian_person_id = NULL, guardian_name = '', updated_at = ?
                    WHERE id = ?
                    """,
                    (now, person_id),
                )

        connection.execute(
            "INSERT OR IGNORE INTO cell_membership (cell_id, person_id, created_at) VALUES (?, ?, ?)",
            (cell_id, person_id, now),
        )


def reconcile_catalog_members_from_reports(connection) -> None:
    """Materialize historical promotions stored in report payloads.

    Older reports may already contain baptisms or restoration visitors marked
    to become members, but the catalog rows were never created because that
    logic was added later or the UI did not refresh. Replaying the promotion
    helpers is idempotent thanks to INSERT OR IGNORE and role checks.
    """
    report_rows = connection.execute("SELECT payload_json FROM reports").fetchall()
    for row in report_rows:
        payload = parse_payload_json(row["payload_json"])
        if not payload:
            continue
        promote_baptized_people(connection, payload)
        promote_visitors_to_members(connection, payload)


def build_report_summary(payload: dict) -> dict:
    return {
        "week": str(payload.get("week", "")).strip(),
        "cellNumber": str(payload.get("cellNumber", "")).strip(),
        "sector": str(payload.get("sector", "")).strip(),
        "leaderName": str(payload.get("leaderName", "")).strip(),
        "assistantName": str(payload.get("assistantName", "")).strip(),
        "reportDate": str(payload.get("reportDate", "")).strip(),
        "reportYear": extract_report_year(payload),
        "reportQuarter": extract_report_quarter(payload),
    }


def normalize_report_rcm_snapshot(payload: dict) -> dict:
    raw_snapshot = payload.get("rcmSnapshot")
    try:
        week_number = int(str(payload.get("week", "0")).strip() or "0")
    except ValueError:
        week_number = 0

    meta = get_backend_rcm_meta(week_number)
    fallback_events = meta.get("specialEvents") if isinstance(meta.get("specialEvents"), list) else []
    def normalize_special_event(entry: dict | None, fallback: dict | None = None) -> dict:
        event_name = str((entry or {}).get("event", "")).strip() or str((fallback or {}).get("event", "")).strip()
        rcm_key = str((entry or {}).get("rcmKey", "")).strip() or str((fallback or {}).get("rcmKey", "")).strip() or _derive_rcm_key(event_name)
        capture_mode = str((entry or {}).get("captureMode", "")).strip() or str((fallback or {}).get("captureMode", "")).strip() or ("separate" if event_name else "")
        return {
            **(fallback or {}),
            **(entry or {}),
            "event": event_name,
            "rcmKey": rcm_key,
            "captureMode": capture_mode,
        }

    if isinstance(raw_snapshot, dict):
        raw_special_events = raw_snapshot.get("specialEvents") if isinstance(raw_snapshot.get("specialEvents"), list) else fallback_events
        special_events = [normalize_special_event(entry) for entry in raw_special_events if isinstance(entry, dict) and str(entry.get("event", "")).strip()]
        primary_event = special_events[0] if special_events else {
            "event": str(raw_snapshot.get("event", "")).strip() or str(meta.get("event", "")).strip(),
            "rcmKey": str(raw_snapshot.get("rcmKey", "")).strip() or str(meta.get("rcmKey", "")).strip() or _derive_rcm_key(str(raw_snapshot.get("event", "")).strip() or str(meta.get("event", "")).strip()),
            "captureMode": str(raw_snapshot.get("captureMode", "")).strip() or str(meta.get("captureMode", "")).strip(),
        }
        normalized = {
            "week": int(raw_snapshot.get("week") or week_number or 0),
            "phase": str(raw_snapshot.get("phase", "")).strip() or str(meta.get("phase", "")).strip(),
            "phaseLabel": str(raw_snapshot.get("phaseLabel", "")).strip(),
            "verb": str(raw_snapshot.get("verb", "")).strip() or str(meta.get("verb", "")).strip(),
            "specialEvents": special_events,
            "event": str(primary_event.get("event", "")).strip(),
            "rcmKey": str(primary_event.get("rcmKey", "")).strip(),
            "captureMode": str(primary_event.get("captureMode", "")).strip() or ("separate" if str(primary_event.get("event", "")).strip() else ""),
        }
    else:
        special_events = [normalize_special_event(entry) for entry in fallback_events if isinstance(entry, dict) and str(entry.get("event", "")).strip()]
        primary_event = special_events[0] if special_events else normalize_special_event(meta, meta)
        normalized = {
            "week": week_number,
            "phase": str(meta.get("phase", "")).strip(),
            "phaseLabel": "",
            "verb": str(meta.get("verb", "")).strip(),
            "specialEvents": special_events,
            "event": str(primary_event.get("event", "")).strip(),
            "rcmKey": str(primary_event.get("rcmKey", "")).strip(),
            "captureMode": str(primary_event.get("captureMode", "")).strip() or ("separate" if str(primary_event.get("event", "")).strip() else ""),
        }
    normalized["isEventWeek"] = bool(normalized.get("event"))
    payload["rcmSnapshot"] = normalized
    return normalized


def get_report_event_keys(snapshot: dict | None) -> set[str]:
    if not isinstance(snapshot, dict):
        return set()
    keys: set[str] = set()
    special_events = snapshot.get("specialEvents") if isinstance(snapshot.get("specialEvents"), list) else []
    for entry in special_events:
        if not isinstance(entry, dict):
            continue
        event_key = str(entry.get("rcmKey") or "").strip()
        if event_key:
            keys.add(event_key)
    primary_key = str(snapshot.get("rcmKey") or "").strip()
    if primary_key:
        keys.add(primary_key)
    return keys


def get_visitor_attended_event_keys(visitor: dict, snapshot: dict | None) -> set[str]:
    event_progress = visitor.get("eventProgress") if isinstance(visitor.get("eventProgress"), dict) else {}
    attended_keys = {
        str(key or "").strip()
        for key, value in event_progress.items()
        if str(key or "").strip() and bool(value)
    }
    if attended_keys:
        return attended_keys
    if not bool(visitor.get("eventAttended")):
        return set()
    return get_report_event_keys(snapshot)


def extract_report_year(payload: dict) -> str:
    report_date = str(payload.get("reportDate", "")).strip()
    if len(report_date) >= 4:
        return report_date[:4]
    return ""


def extract_report_quarter(payload: dict) -> str:
    report_date = str(payload.get("reportDate", "")).strip()
    if len(report_date) >= 7:
        month = int(report_date[5:7])
        if month <= 4:
            return "1"
        elif month <= 8:
            return "2"
        else:
            return "3"
    return ""


def find_existing_weekly_report(connection, summary: dict):
    report_year = summary.get("reportYear", "")
    report_quarter = summary.get("reportQuarter", "")
    if report_year and report_quarter:
        return connection.execute(
            """
            SELECT id
            FROM reports
            WHERE device_model = ?
              AND phone_number = ?
              AND substr(imei, 1, 4) = ?
              AND json_extract(payload_json, '$.reportDate') IS NOT NULL
              AND (CASE
                WHEN CAST(substr(json_extract(payload_json, '$.reportDate'), 6, 2) AS INTEGER) <= 4 THEN '1'
                WHEN CAST(substr(json_extract(payload_json, '$.reportDate'), 6, 2) AS INTEGER) <= 8 THEN '2'
                ELSE '3'
              END) = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (summary["cellNumber"], summary["week"], report_year, report_quarter),
        ).fetchone()

    if report_year:
        return connection.execute(
            """
            SELECT id
            FROM reports
            WHERE device_model = ?
              AND phone_number = ?
              AND substr(imei, 1, 4) = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (summary["cellNumber"], summary["week"], report_year),
        ).fetchone()

    return connection.execute(
        """
        SELECT id
        FROM reports
        WHERE device_model = ?
          AND phone_number = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (summary["cellNumber"], summary["week"]),
    ).fetchone()


def parse_payload_json(value: str | None) -> dict:
    if not value:
        return {}
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def parse_json_field(value: str | None) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def load_catalogs_payload(connection) -> dict:
    people_rows = connection.execute(
        """
        SELECT
            person.id,
            person.name,
            person.role,
            person.phone,
            person.email,
            person.guardian_person_id,
            person.guardian_name,
            person.rcm_progress,
            person.supervisor_sector,
            person.is_coordinator,
            person.is_admin,
            person.is_system_account,
            person.username,
            guardian.name AS guardian_person_name,
            person.created_at,
            person.updated_at
        FROM people_catalog person
        LEFT JOIN people_catalog guardian ON guardian.id = person.guardian_person_id
        ORDER BY person.name COLLATE NOCASE ASC
        """
    ).fetchall()
    cell_rows = connection.execute(
        """
        SELECT
            cell.id,
            cell.cell_number,
            cell.network_name,
            cell.sector,
            cell.zone_name,
            cell.district_name,
            cell.address,
            cell.leader_person_id,
            cell.assistant_person_id,
            cell.host_person_id,
            leader.name AS leader_name,
            assistant.name AS assistant_name,
            host.name AS host_name,
            cell.created_at,
            cell.updated_at
        FROM cell_catalog cell
        LEFT JOIN people_catalog leader ON leader.id = cell.leader_person_id
        LEFT JOIN people_catalog assistant ON assistant.id = cell.assistant_person_id
        LEFT JOIN people_catalog host ON host.id = cell.host_person_id
        ORDER BY CAST(cell.cell_number AS INTEGER) ASC, cell.cell_number ASC
        """
    ).fetchall()
    membership_rows = connection.execute(
        """
        SELECT membership.cell_id, cell.cell_number, membership.attendance_mode, membership.attendance_defaults_json, person.id AS person_id, person.name, person.role, person.guardian_name, person.rcm_progress, guardian.name AS guardian_person_name
        FROM cell_membership membership
        INNER JOIN cell_catalog cell ON cell.id = membership.cell_id
        INNER JOIN people_catalog person ON person.id = membership.person_id
        LEFT JOIN people_catalog guardian ON guardian.id = person.guardian_person_id
        ORDER BY person.name COLLATE NOCASE ASC
        """
    ).fetchall()

    members_by_cell: dict[int, list[dict]] = {}
    assignments_by_person: dict[int, list[dict]] = {}
    for row in membership_rows:
        members_by_cell.setdefault(row["cell_id"], []).append(
            {
                "id": row["person_id"],
                "name": row["name"],
                "role": row["role"],
                "attendanceMode": normalize_membership_attendance_mode(row["attendance_mode"]),
                "attendanceDefaults": normalize_membership_attendance_defaults(parse_json_field(row["attendance_defaults_json"]), row["attendance_mode"]),
                "guardianName": row["guardian_person_name"] or row["guardian_name"] or "",
                "rcmProgress": parse_json_field(row["rcm_progress"]),
            }
        )
        assignments_by_person.setdefault(row["person_id"], []).append(
            {
                "cellId": row["cell_id"],
                "cellNumber": row["cell_number"],
            }
        )

    return {
        "people": [serialize_person(row, assignments_by_person.get(row["id"], [])) for row in people_rows],
        "cells": [serialize_cell(row, members_by_cell.get(row["id"], [])) for row in cell_rows],
    }


def serialize_person(row: sqlite3.Row, assignments: list[dict] | None = None) -> dict:
    assignments = assignments or []
    primary_assignment = assignments[0] if assignments else None
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "phone": row["phone"],
        "email": row["email"],
        "guardianPersonId": row["guardian_person_id"],
        "guardianName": row["guardian_person_name"] or row["guardian_name"] or "",
        "rcmProgress": parse_json_field(row["rcm_progress"]),
        "supervisorSector": row["supervisor_sector"] or "",
        "isCoordinator": bool(int(row["is_coordinator"] or 0)),
        "isAdmin": bool(int(row["is_admin"] or 0)) if "is_admin" in row.keys() else False,
        "isSystemAccount": bool(int(row["is_system_account"] or 0)) if "is_system_account" in row.keys() else False,
        "username": (row["username"] or "") if "username" in row.keys() else "",
        "visitCount": int(row["visit_count"] or 0) if "visit_count" in row.keys() else 0,
        "assignedCellId": primary_assignment["cellId"] if primary_assignment else None,
        "assignedCellNumber": primary_assignment["cellNumber"] if primary_assignment else "",
        "assignedCellCount": len(assignments),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def serialize_cell(row: sqlite3.Row, members: list[dict]) -> dict:
    return {
        "id": row["id"],
        "cellNumber": row["cell_number"],
        "networkName": row["network_name"],
        "sector": row["sector"],
        "zoneName": row["zone_name"],
        "districtName": row["district_name"],
        "address": row["address"],
        "leaderPersonId": row["leader_person_id"],
        "assistantPersonId": row["assistant_person_id"],
        "hostPersonId": row["host_person_id"],
        "leaderName": row["leader_name"] or "",
        "assistantName": row["assistant_name"] or "",
        "hostName": row["host_name"] or "",
        "members": members,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def serialize_report(row: sqlite3.Row) -> dict:
    payload = parse_payload_json(row["payload_json"])
    summary = build_report_summary(payload)

    if not summary["leaderName"]:
        summary["leaderName"] = row["employee_name"]
    if not summary["assistantName"]:
        summary["assistantName"] = row["area"]
    if not summary["cellNumber"]:
        summary["cellNumber"] = row["device_model"]
    if not summary["reportDate"]:
        summary["reportDate"] = row["imei"]
    if not summary["week"]:
        summary["week"] = row["phone_number"]
    if not summary["sector"]:
        summary["sector"] = row["status"]

    return {
        "id": row["id"],
        "week": summary["week"],
        "cellNumber": summary["cellNumber"],
        "sector": summary["sector"],
        "leaderName": summary["leaderName"],
        "assistantName": summary["assistantName"],
        "reportDate": summary["reportDate"],
        "notes": payload.get("notes", row["notes"]),
        "formData": payload,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def normalize_friend_name(value: str) -> str:
    raw = unicodedata.normalize("NFKD", str(value or ""))
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch))
    raw = re.sub(r"\s+", " ", raw).strip().lower()
    return raw


def normalize_visitor_kind(value: str) -> str:
    return "visita" if str(value or "").strip().lower() == "visita" else "amigo"


def scrub_promotions_for_deleted_person(connection, person_name: str) -> None:
    normalized_target = normalize_friend_name(person_name)
    if not normalized_target:
        return

    report_rows = connection.execute("SELECT id, payload_json FROM reports").fetchall()

    for row in report_rows:
        payload = parse_payload_json(row["payload_json"])
        if not payload:
            continue

        changed = False

        visitors = payload.get("visitors")
        if isinstance(visitors, list):
            for visitor in visitors:
                if not isinstance(visitor, dict):
                    continue
                if normalize_visitor_kind(visitor.get("kind")) != "visita":
                    continue
                if normalize_friend_name(visitor.get("name")) != normalized_target:
                    continue
                if visitor.get("promoteToMember"):
                    visitor["promoteToMember"] = False
                    changed = True

        baptisms = payload.get("baptisms")
        if isinstance(baptisms, list):
            for baptism in baptisms:
                if not isinstance(baptism, dict):
                    continue
                if normalize_friend_name(baptism.get("name")) != normalized_target:
                    continue
                if baptism.get("promoteToMember") is not False:
                    baptism["promoteToMember"] = False
                    changed = True

        if changed:
            connection.execute(
                "UPDATE reports SET payload_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(payload, ensure_ascii=False), utc_now_iso(), row["id"]),
            )


def get_backend_rcm_meta(week_number: int) -> dict:
    for item in BACKEND_RCM_WEEKS:
        if item["week"] == week_number:
            return item
    return {"week": week_number, "phase": "", "verb": "", "event": "", "rcmKey": "", "captureMode": "", "specialEvents": []}


def get_report_rcm_snapshot(payload: dict) -> dict:
    snapshot = payload.get("rcmSnapshot")
    if isinstance(snapshot, dict):
        return snapshot
    return normalize_report_rcm_snapshot(payload)


def get_current_year_quarter() -> tuple[str, str]:
    today = date.today()
    month = today.month
    quarter = "1" if month <= 4 else "2" if month <= 8 else "3"
    return str(today.year), quarter


def derive_cycle_status(cycle: dict, total_weeks: int) -> tuple[str, str]:
    completed = int(cycle.get("current_week") or 0) >= total_weeks
    converted = bool(cycle.get("converted"))
    if completed and converted:
        return "completed", "converted"
    if completed:
        return "completed", "completed_no_decision"
    if converted:
        return "in_process", "converted_in_process"
    return "in_process", "in_process"


def classify_friend_lifecycle(normalized_name: str, friend_cycles: list[dict], member_names: set[str]) -> str:
    if normalized_name in member_names:
        return "member"
    if not friend_cycles:
        return "in_process"

    total_cycles = len(friend_cycles)
    has_won_cycle = any(
        bool(cycle.get("converted"))
        or str(cycle.get("outcome") or "") in {"converted", "converted_in_process", "completed_no_decision"}
        or bool(cycle.get("completed"))
        for cycle in friend_cycles
    )
    latest_cycle = friend_cycles[-1]
    if total_cycles > 1 and str(latest_cycle.get("outcome") or "") == "in_process":
        return "reactivated_won"
    if total_cycles > 1 or has_won_cycle:
        return "won_friend"
    return str(latest_cycle.get("outcome") or "in_process")


def normalize_visitor_process_entry(visitor: dict) -> str:
    if normalize_visitor_kind(visitor.get("kind")) != "amigo":
        return "none"
    raw = str(visitor.get("processEntry", "")).strip().lower()
    if raw in {"none", "noted", "late"}:
        return raw
    if bool(visitor.get("lateRegistration")):
        return "late"
    return "none"


def rebuild_friend_tracking(connection) -> None:
    connection.execute("DELETE FROM friend_cycle_steps")
    connection.execute("DELETE FROM friend_cycles")
    connection.execute("DELETE FROM friends_catalog")

    member_rows = connection.execute(
        "SELECT name FROM people_catalog WHERE role IN ('member', 'leader', 'assistant', 'host')"
    ).fetchall()
    member_names = {normalize_friend_name(row["name"]) for row in member_rows if row["name"]}

    report_rows = connection.execute(
        """
        SELECT id, employee_name, area, device_model, imei, phone_number, status, notes, payload_json, created_at, updated_at
        FROM reports
        ORDER BY id ASC
        """
    ).fetchall()
    reports = [serialize_report(row) for row in report_rows]
    reports.sort(key=lambda rep: ((rep.get("reportDate") or ""), str(rep.get("week") or "").zfill(2), int(rep.get("id") or 0)))

    friend_map: dict[str, dict] = {}
    cycle_map: dict[tuple[str, str, str], dict] = {}
    step_map: dict[tuple[tuple[str, str, str], int, int], dict] = {}
    total_weeks = len(BACKEND_RCM_WEEKS)

    for report in reports:
        payload = report.get("formData") or {}
        summary = build_report_summary(payload)
        report_id = int(report.get("id") or 0)
        report_date = summary.get("reportDate", "")
        year = summary.get("reportYear", "")
        quarter = summary.get("reportQuarter", "")
        cell_number = summary.get("cellNumber", "")
        sector = summary.get("sector", "")
        try:
            week_number = int(str(summary.get("week") or "0"))
        except ValueError:
            week_number = 0

        visitors = payload.get("visitors")
        if not isinstance(visitors, list):
            continue

        for visitor in visitors:
            if not isinstance(visitor, dict):
                continue
            name = str(visitor.get("name", "")).strip()
            if not name:
                continue
            if normalize_visitor_kind(visitor.get("kind")) != "amigo":
                continue

            normalized_name = normalize_friend_name(name)
            if not normalized_name:
                continue

            invited_by = str(visitor.get("invitedBy", "")).strip()
            phone = str(visitor.get("phone", "")).strip()
            process_entry = normalize_visitor_process_entry(visitor)
            first_visit = bool(visitor.get("firstVisit"))
            late_registration = process_entry == "late"
            converted = bool(visitor.get("converted"))
            reach_attended = bool(visitor.get("reachAttended"))
            sunday_attended = bool(visitor.get("sundayAttended"))
            event_attended = bool(visitor.get("eventAttended"))
            note = str(visitor.get("note", "")).strip()

            friend = friend_map.setdefault(normalized_name, {
                "normalized_name": normalized_name,
                "name": name,
                "phone": phone,
                "invited_by": invited_by,
                "first_report_date": report_date,
                "last_report_date": report_date,
                "current_cell_number": cell_number,
                "current_sector": sector,
                "total_reports": 0,
            })
            friend["name"] = friend.get("name") or name
            if phone:
                friend["phone"] = phone
            if invited_by:
                friend["invited_by"] = invited_by
            if report_date and (not friend.get("first_report_date") or report_date < friend["first_report_date"]):
                friend["first_report_date"] = report_date
            if report_date and (not friend.get("last_report_date") or report_date >= friend["last_report_date"]):
                friend["last_report_date"] = report_date
                friend["current_cell_number"] = cell_number
                friend["current_sector"] = sector
            friend["total_reports"] += 1

            cycle_key = (normalized_name, year, quarter)
            existing_cycle = cycle_map.get(cycle_key)
            # El proceso es explícito: "Anotar" o "Anotar tardío". Para
            # reportes viejos sin processEntry se usa una compatibilidad mínima
            # con las banderas anteriores.
            if existing_cycle is None and process_entry not in {"noted", "late"}:
                continue
            cycle = cycle_map.setdefault(cycle_key, {
                "normalized_name": normalized_name,
                "year": year,
                "quarter": quarter,
                "cell_number": cell_number,
                "sector": sector,
                "invited_by": invited_by,
                "entry_week": week_number,
                "entry_report_date": report_date,
                "late_entry": 1 if process_entry == "late" else 0,
                "current_week": week_number,
                "weeks_seen_set": set(),
                "total_reach": 0,
                "total_sunday": 0,
                "total_events": 0,
                "converted": 0,
                "last_report_date": report_date,
            })

            if week_number and (not cycle.get("entry_week") or week_number < cycle["entry_week"]):
                cycle["entry_week"] = week_number
            if report_date and (not cycle.get("entry_report_date") or report_date < cycle["entry_report_date"]):
                cycle["entry_report_date"] = report_date
            if week_number and week_number > int(cycle.get("current_week") or 0):
                cycle["current_week"] = week_number
            if report_date and (not cycle.get("last_report_date") or report_date >= cycle["last_report_date"]):
                cycle["last_report_date"] = report_date
                cycle["cell_number"] = cell_number
                cycle["sector"] = sector
            if invited_by:
                cycle["invited_by"] = invited_by
            cycle["late_entry"] = 1 if cycle.get("late_entry") or process_entry == "late" else 0
            cycle["converted"] = 1 if cycle.get("converted") or converted else 0
            if week_number:
                cycle["weeks_seen_set"].add(week_number)
            if reach_attended:
                cycle["total_reach"] += 1
            if sunday_attended:
                cycle["total_sunday"] += 1
            if event_attended:
                cycle["total_events"] += 1

            step_key = (cycle_key, report_id, week_number)
            meta = get_report_rcm_snapshot(payload)
            step_map[step_key] = {
                "cycle_key": cycle_key,
                "report_id": report_id,
                "week_number": week_number,
                "report_date": report_date,
                "phase": meta.get("phase", ""),
                "verb": meta.get("verb", ""),
                "reach_attended": 1 if reach_attended else 0,
                "sunday_attended": 1 if sunday_attended else 0,
                "event_attended": 1 if event_attended else 0,
                "converted": 1 if converted else 0,
                "late_registration": 1 if late_registration else 0,
                "note": note,
            }

    if not friend_map:
        return

    cycles_by_friend: dict[str, list[dict]] = {}
    for cycle in cycle_map.values():
        cycle["weeks_seen"] = len(cycle.pop("weeks_seen_set", set()))
        cycle["completed"] = 1 if int(cycle.get("current_week") or 0) >= total_weeks else 0
        cycle["status"], cycle["outcome"] = derive_cycle_status(cycle, total_weeks)
        cycles_by_friend.setdefault(cycle["normalized_name"], []).append(cycle)

    friend_ids: dict[str, int] = {}
    now = utc_now_iso()
    for normalized_name, friend in sorted(friend_map.items(), key=lambda item: item[1]["name"].lower()):
        friend_cycles = cycles_by_friend.get(normalized_name, [])
        friend_cycles.sort(key=lambda item: (item.get("year", ""), item.get("quarter", ""), item.get("last_report_date", ""), int(item.get("current_week") or 0)))
        latest_cycle = friend_cycles[-1] if friend_cycles else None
        current_status = classify_friend_lifecycle(normalized_name, friend_cycles, member_names)
        cursor = connection.execute(
            """
            INSERT INTO friends_catalog (
                normalized_name, name, phone, invited_by,
                first_report_date, last_report_date,
                current_cell_number, current_sector,
                total_cycles, total_reports, current_status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                friend["normalized_name"],
                friend["name"],
                friend.get("phone", ""),
                friend.get("invited_by", ""),
                friend.get("first_report_date", ""),
                friend.get("last_report_date", ""),
                friend.get("current_cell_number", ""),
                friend.get("current_sector", ""),
                len(friend_cycles),
                int(friend.get("total_reports") or 0),
                current_status,
                now,
                now,
            ),
        )
        friend_ids[normalized_name] = cursor.lastrowid

    cycle_ids: dict[tuple[str, str, str], int] = {}
    for cycle_key, cycle in sorted(cycle_map.items(), key=lambda item: (item[1].get("year", ""), item[1].get("quarter", ""), item[1].get("entry_report_date", ""), item[1].get("normalized_name", ""))):
        friend_id = friend_ids[cycle["normalized_name"]]
        cursor = connection.execute(
            """
            INSERT INTO friend_cycles (
                friend_id, year, quarter, cell_number, sector, invited_by,
                entry_week, entry_report_date, late_entry,
                current_week, weeks_seen,
                total_reach, total_sunday, total_events,
                converted, completed, status, outcome,
                last_report_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                friend_id,
                cycle.get("year", ""),
                cycle.get("quarter", ""),
                cycle.get("cell_number", ""),
                cycle.get("sector", ""),
                cycle.get("invited_by", ""),
                int(cycle.get("entry_week") or 0),
                cycle.get("entry_report_date", ""),
                int(cycle.get("late_entry") or 0),
                int(cycle.get("current_week") or 0),
                int(cycle.get("weeks_seen") or 0),
                int(cycle.get("total_reach") or 0),
                int(cycle.get("total_sunday") or 0),
                int(cycle.get("total_events") or 0),
                int(cycle.get("converted") or 0),
                int(cycle.get("completed") or 0),
                cycle.get("status", "in_process"),
                cycle.get("outcome", "in_process"),
                cycle.get("last_report_date", ""),
                now,
                now,
            ),
        )
        cycle_ids[cycle_key] = cursor.lastrowid

    for step in sorted(step_map.values(), key=lambda item: (item["report_date"], item["week_number"], item["report_id"])):
        cycle_id = cycle_ids.get(step["cycle_key"])
        if not cycle_id:
            continue
        connection.execute(
            """
            INSERT INTO friend_cycle_steps (
                friend_cycle_id, report_id, week_number, report_date,
                phase, verb,
                reach_attended, sunday_attended, event_attended,
                converted, late_registration, note,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cycle_id,
                int(step.get("report_id") or 0),
                int(step.get("week_number") or 0),
                step.get("report_date", ""),
                step.get("phase", ""),
                step.get("verb", ""),
                int(step.get("reach_attended") or 0),
                int(step.get("sunday_attended") or 0),
                int(step.get("event_attended") or 0),
                int(step.get("converted") or 0),
                int(step.get("late_registration") or 0),
                step.get("note", ""),
                now,
                now,
            ),
        )


def build_friend_tracking_payload(connection, *, cell_number: str = "", sector: str = "", year: str = "", quarter: str = "") -> dict:
    if not year or not quarter:
        current_year, current_quarter = get_current_year_quarter()
        year = year or current_year
        quarter = quarter or current_quarter

    rows = connection.execute(
        """
        SELECT
            fc.id,
            fc.friend_id,
            fc.year,
            fc.quarter,
            fc.cell_number,
            fc.sector,
            fc.invited_by,
            fc.entry_week,
            fc.entry_report_date,
            fc.late_entry,
            fc.current_week,
            fc.weeks_seen,
            fc.total_reach,
            fc.total_sunday,
            fc.total_events,
            fc.converted,
            fc.completed,
            fc.status,
            fc.outcome,
            fc.last_report_date,
            f.name,
            f.phone,
            f.first_report_date,
            f.last_report_date AS friend_last_report_date,
            f.total_cycles,
            f.total_reports,
            f.current_status
        FROM friend_cycles fc
        INNER JOIN friends_catalog f ON f.id = fc.friend_id
        WHERE (? = '' OR fc.cell_number = ?)
                    AND (? = '' OR fc.sector = ?)
          AND (? = '' OR fc.year = ?)
          AND (? = '' OR fc.quarter = ?)
        ORDER BY fc.last_report_date DESC, f.name COLLATE NOCASE ASC
        """,
                (cell_number, cell_number, sector, sector, year, year, quarter, quarter),
    ).fetchall()

    cycle_ids = [int(row["id"] or 0) for row in rows if int(row["id"] or 0) > 0]
    steps_by_cycle_id: dict[int, list[dict]] = {}
    if cycle_ids:
        placeholders = ", ".join(["?"] * len(cycle_ids))
        step_rows = connection.execute(
            f"""
            SELECT
                friend_cycle_id,
                report_id,
                week_number,
                report_date,
                phase,
                verb,
                reach_attended,
                sunday_attended,
                event_attended,
                converted,
                late_registration,
                note
            FROM friend_cycle_steps
            WHERE friend_cycle_id IN ({placeholders})
            ORDER BY report_date ASC, week_number ASC, report_id ASC
            """,
            cycle_ids,
        ).fetchall()
        for step_row in step_rows:
            cycle_id = int(step_row["friend_cycle_id"] or 0)
            if cycle_id <= 0:
                continue
            steps_by_cycle_id.setdefault(cycle_id, []).append({
                "reportId": int(step_row["report_id"] or 0),
                "weekNumber": int(step_row["week_number"] or 0),
                "reportDate": step_row["report_date"] or "",
                "phase": step_row["phase"] or "",
                "verb": step_row["verb"] or "",
                "reachAttended": bool(int(step_row["reach_attended"] or 0)),
                "sundayAttended": bool(int(step_row["sunday_attended"] or 0)),
                "eventAttended": bool(int(step_row["event_attended"] or 0)),
                "converted": bool(int(step_row["converted"] or 0)),
                "lateRegistration": bool(int(step_row["late_registration"] or 0)),
                "note": step_row["note"] or "",
            })

    one_year_ago = (date.today() - timedelta(days=365)).isoformat()
    friends = []
    active_count = 0
    recurrent_count = 0
    won_count = 0
    reactivated_won_count = 0
    long_term_count = 0
    late_count = 0
    reach_count = 0
    sunday_count = 0
    incomplete_count = 0
    key_follow_up = None
    spiritual_parents = set()

    for row in rows:
        process_count = int(row["total_cycles"] or 0)
        total_reports = int(row["total_reports"] or 0)
        late_entry = bool(int(row["late_entry"] or 0))
        total_reach = int(row["total_reach"] or 0)
        total_sunday = int(row["total_sunday"] or 0)
        completed = bool(int(row["completed"] or 0))
        converted = bool(int(row["converted"] or 0))
        first_report_date = row["first_report_date"] or ""
        current_status = str(row["current_status"] or "in_process")
        is_won_friend = current_status in {"won_friend", "reactivated_won", "member"}
        is_reactivated_won = current_status == "reactivated_won"
        if is_won_friend:
            won_count += 1
        if is_reactivated_won:
            reactivated_won_count += 1
        if not is_won_friend:
            active_count += 1
        if process_count >= 2:
            recurrent_count += 1
        if first_report_date and first_report_date <= one_year_ago:
            long_term_count += 1
        if late_entry:
            late_count += 1
        if total_reach > 0:
            reach_count += 1
        if total_sunday > 0:
            sunday_count += 1
        if not is_won_friend and not completed:
            incomplete_count += 1
        invited_by = str(row["invited_by"] or "").strip()
        if invited_by:
            spiritual_parents.add(invited_by)

        item = {
            "friendId": row["friend_id"],
            "cycleId": row["id"],
            "name": row["name"],
            "phone": row["phone"] or "",
            "invitedBy": row["invited_by"] or "",
            "processCount": process_count,
            "totalReports": total_reports,
            "entryWeek": int(row["entry_week"] or 0),
            "entryDate": row["entry_report_date"] or "",
            "currentWeek": int(row["current_week"] or 0),
            "weeksSeen": int(row["weeks_seen"] or 0),
            "lateEntry": late_entry,
            "reachCount": total_reach,
            "sundayCount": total_sunday,
            "eventCount": int(row["total_events"] or 0),
            "converted": converted,
            "completed": completed,
            "status": row["status"] or "in_process",
            "outcome": row["outcome"] or "in_process",
            "currentStatus": current_status,
            "isWonFriend": is_won_friend,
            "isReactivatedWon": is_reactivated_won,
            "cellNumber": row["cell_number"] or "",
            "sector": row["sector"] or "",
            "firstReportDate": first_report_date,
            "lastReportDate": row["last_report_date"] or "",
            "steps": steps_by_cycle_id.get(int(row["id"] or 0), []),
        }
        if not is_won_friend:
            friends.append(item)

        score = (item["weeksSeen"], total_reports, process_count, item["lastReportDate"])
        if not is_won_friend and (key_follow_up is None or score > key_follow_up[0]):
            key_follow_up = (score, item)

    settings_rows = connection.execute(
        "SELECT key, value FROM app_settings WHERE key IN ('rcm_goal_levantate', 'rcm_goal_restauracion', 'rcm_goal_bautismos')"
    ).fetchall()
    settings_map = {row["key"]: row["value"] for row in settings_rows}
    base_goals = {
        "levantateGoal": int(settings_map.get("rcm_goal_levantate") or 4),
        "restauracionGoal": int(settings_map.get("rcm_goal_restauracion") or 3),
        "bautismosGoal": int(settings_map.get("rcm_goal_bautismos") or 2),
    }
    scoped_cell_rows = connection.execute(
        """
        SELECT cell_number
        FROM cell_catalog
        WHERE (? = '' OR cell_number = ?)
          AND (? = '' OR sector = ?)
        ORDER BY CAST(cell_number AS INTEGER) ASC, cell_number ASC
        """,
        (cell_number, cell_number, sector, sector),
    ).fetchall()
    scoped_cell_numbers = [str(row["cell_number"] or "").strip() for row in scoped_cell_rows if str(row["cell_number"] or "").strip()]
    if cell_number and cell_number not in scoped_cell_numbers:
        scoped_cell_numbers.append(cell_number)

    goals = dict(base_goals)
    if scoped_cell_numbers and year and quarter:
        goal_placeholders = ", ".join(["?"] * len(scoped_cell_numbers))
        goal_rows = connection.execute(
            f"""
            SELECT cell_number, levantate_goal, restauracion_goal, bautismos_goal
            FROM cell_cycle_goals
            WHERE year = ? AND quarter = ?
              AND cell_number IN ({goal_placeholders})
            """,
            (year, quarter, *scoped_cell_numbers),
        ).fetchall()
        goal_rows_map = {
            str(row["cell_number"] or "").strip(): row
            for row in goal_rows
            if str(row["cell_number"] or "").strip()
        }
        goals = {
            "levantateGoal": 0,
            "restauracionGoal": 0,
            "bautismosGoal": 0,
        }
        for scoped_cell in scoped_cell_numbers:
            goal_row = goal_rows_map.get(scoped_cell)
            if goal_row:
                goals["levantateGoal"] += int(goal_row["levantate_goal"] or 0)
                goals["restauracionGoal"] += int(goal_row["restauracion_goal"] or 0)
                goals["bautismosGoal"] += int(goal_row["bautismos_goal"] or 0)
            else:
                goals["levantateGoal"] += base_goals["levantateGoal"]
                goals["restauracionGoal"] += base_goals["restauracionGoal"]
                goals["bautismosGoal"] += base_goals["bautismosGoal"]

    elif not scoped_cell_numbers:
        goals = dict(base_goals)

    goal_progress = {
        "levantate": 0,
        "restauracion": 0,
        "bautismos": 0,
    }
    levantate_progress_keys: set[str] = set()
    restauracion_progress_keys: set[str] = set()

    baptism_rows = connection.execute(
        "SELECT payload_json FROM reports"
    ).fetchall()
    for row in baptism_rows:
        payload = parse_payload_json(row["payload_json"])
        summary = build_report_summary(payload)
        report_cell = str(summary.get("cellNumber") or "").strip()
        report_sector = str(summary.get("sector") or "").strip()
        report_year = str(summary.get("reportYear") or "").strip()
        report_quarter = str(summary.get("reportQuarter") or "").strip()
        try:
            report_week = int(str(summary.get("week") or "0"))
        except ValueError:
            report_week = 0

        if cell_number and report_cell != cell_number:
            continue
        if sector and report_sector != sector:
            continue
        if year and report_year != year:
            continue
        if quarter and report_quarter != quarter:
            continue

        visitors = payload.get("visitors")
        if isinstance(visitors, list):
            report_snapshot = get_report_rcm_snapshot(payload)
            for visitor in visitors:
                if not isinstance(visitor, dict):
                    continue
                if normalize_visitor_kind(visitor.get("kind")) != "amigo":
                    continue
                normalized_name = normalize_friend_name(visitor.get("name") or "")
                if not normalized_name:
                    continue
                attended_event_keys = get_visitor_attended_event_keys(visitor, report_snapshot)
                if not attended_event_keys:
                    continue
                progress_key = f"{report_cell}::{normalized_name}"
                if "levantate" in attended_event_keys:
                    levantate_progress_keys.add(progress_key)
                if "restauracion" in attended_event_keys:
                    restauracion_progress_keys.add(progress_key)

        baptisms = payload.get("baptisms")
        if not isinstance(baptisms, list):
            continue
        for entry in baptisms:
            if not isinstance(entry, dict):
                continue
            baptism_date = str(entry.get("baptismDate") or "").strip()
            if len(baptism_date) < 7:
                continue
            baptism_year = baptism_date[:4]
            try:
                baptism_month = int(baptism_date[5:7])
            except ValueError:
                continue
            baptism_quarter = "1" if baptism_month <= 4 else "2" if baptism_month <= 8 else "3"
            if year and baptism_year != year:
                continue
            if quarter and baptism_quarter != quarter:
                continue
            goal_progress["bautismos"] += 1

    goal_progress["levantate"] = len(levantate_progress_keys)
    goal_progress["restauracion"] = len(restauracion_progress_keys)

    return {
        "scope": {
            "cellNumber": cell_number,
            "sector": sector,
            "year": year,
            "quarter": quarter,
        },
        "summary": {
            "activeFriends": active_count,
            "recurrentFriends": recurrent_count,
            "wonFriends": won_count,
            "reactivatedWonFriends": reactivated_won_count,
            "longTermFriends": long_term_count,
            "incompleteFriends": incomplete_count,
            "spiritualParents": len(spiritual_parents),
            "keyFollowUp": key_follow_up[1] if key_follow_up else None,
        },
        "quickSignals": {
            "lateEntry": late_count,
            "withReach": reach_count,
            "withSunday": sunday_count,
            "incomplete": incomplete_count,
            "wonFriends": won_count,
            "reactivatedWon": reactivated_won_count,
        },
        "goals": goals,
        "goalProgress": goal_progress,
        "friends": friends,
    }


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


app = create_app()


if __name__ == "__main__":
    debug = os.environ.get("FLASK_ENV") != "production"
    host = "0.0.0.0" if not debug else "127.0.0.1"
    app.run(host=host, port=DEFAULT_PORT, debug=debug)
