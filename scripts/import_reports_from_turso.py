from __future__ import annotations

import argparse
import json
import os
import sqlite3
from pathlib import Path

import certifi
import requests


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "reporte-celular.db"


def normalize_turso_url(url: str) -> str:
    raw = str(url or "").strip().rstrip("/")
    if not raw:
        return ""
    if raw.startswith("libsql://"):
        return "https://" + raw[len("libsql://") :]
    return raw


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import only reports from Turso into the local SQLite database.",
    )
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help="Local SQLite database path. Defaults to data/reporte-celular.db",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional limit for remote rows, useful for testing.",
    )
    parser.add_argument(
        "--cell-number",
        default="",
        help="Optional filter by cell number.",
    )
    parser.add_argument(
        "--year",
        default="",
        help="Optional filter by report year, based on formData.reportDate.",
    )
    parser.add_argument(
        "--quarter",
        choices=("", "1", "2", "3"),
        default="",
        help="Optional filter by quarter.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to the local DB. Without this flag, runs as dry-run.",
    )
    return parser.parse_args()


def parse_payload_json(value: str | None) -> dict:
    if not value:
        return {}
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def extract_report_year(payload: dict) -> str:
    report_date = str(payload.get("reportDate", "")).strip()
    return report_date[:4] if len(report_date) >= 4 else ""


def extract_report_quarter(payload: dict) -> str:
    report_date = str(payload.get("reportDate", "")).strip()
    if len(report_date) < 7:
        return ""
    try:
        month = int(report_date[5:7])
    except ValueError:
        return ""
    if month <= 4:
        return "1"
    if month <= 8:
        return "2"
    return "3"


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


def ensure_local_reports_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_name TEXT NOT NULL,
            area TEXT NOT NULL,
            device_model TEXT NOT NULL,
            imei TEXT NOT NULL,
            phone_number TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
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


def find_existing_weekly_report(connection: sqlite3.Connection, summary: dict):
    report_year = summary.get("reportYear", "")
    report_quarter = summary.get("reportQuarter", "")
    if report_year and report_quarter:
        return connection.execute(
            """
            SELECT id, payload_json, updated_at
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
            SELECT id, payload_json, updated_at
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
        SELECT id, payload_json, updated_at
        FROM reports
        WHERE device_model = ?
          AND phone_number = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (summary["cellNumber"], summary["week"]),
    ).fetchone()


def fetch_remote_reports(url: str, token: str, limit: int = 0) -> list[dict]:
    sql = """
    SELECT id, employee_name, area, device_model, imei, phone_number, status, notes, payload_json, created_at, updated_at
    FROM reports
    ORDER BY updated_at ASC, id ASC
    """
    if limit > 0:
        sql += f" LIMIT {int(limit)}"

    body = {
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": []}},
            {"type": "close"},
        ]
    }
    response = requests.post(
        f"{url}/v2/pipeline",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
        verify=certifi.where(),
    )
    response.raise_for_status()
    result = response.json()["results"][0]
    if result.get("type") == "error":
        message = result.get("error", {}).get("message", "Turso error")
        raise RuntimeError(message)

    columns = [column["name"].lower() for column in result.get("response", {}).get("result", {}).get("cols", [])]
    rows = []
    for raw_row in result.get("response", {}).get("result", {}).get("rows", []):
        values = [item.get("value") if item.get("type") != "null" else None for item in raw_row]
        rows.append(dict(zip(columns, values)))
    return rows


def should_include(summary: dict, args: argparse.Namespace) -> bool:
    if args.cell_number and summary.get("cellNumber") != args.cell_number:
        return False
    if args.year and summary.get("reportYear") != args.year:
        return False
    if args.quarter and summary.get("reportQuarter") != args.quarter:
        return False
    return True


def sync_reports(rows: list[dict], local_db_path: Path, args: argparse.Namespace) -> dict:
    local_db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(local_db_path))
    connection.row_factory = sqlite3.Row

    inserted = 0
    updated = 0
    skipped = 0
    filtered_out = 0

    try:
        ensure_local_reports_schema(connection)
        for row in rows:
            payload = parse_payload_json(row.get("payload_json"))
            summary = build_report_summary(payload)
            if not should_include(summary, args):
                filtered_out += 1
                continue

            existing = find_existing_weekly_report(connection, summary)
            payload_json = row.get("payload_json") or "{}"
            if existing:
                same_payload = str(existing["payload_json"] or "") == str(payload_json)
                same_updated_at = str(existing["updated_at"] or "") == str(row.get("updated_at") or "")
                if same_payload and same_updated_at:
                    skipped += 1
                    continue
                updated += 1
                if args.apply:
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
                            created_at = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            str(row.get("employee_name") or ""),
                            str(row.get("area") or ""),
                            str(row.get("device_model") or ""),
                            str(row.get("imei") or ""),
                            str(row.get("phone_number") or ""),
                            str(row.get("status") or ""),
                            str(row.get("notes") or ""),
                            payload_json,
                            str(row.get("created_at") or ""),
                            str(row.get("updated_at") or ""),
                            int(existing["id"]),
                        ),
                    )
                continue

            inserted += 1
            if args.apply:
                connection.execute(
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
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(row.get("employee_name") or ""),
                        str(row.get("area") or ""),
                        str(row.get("device_model") or ""),
                        str(row.get("imei") or ""),
                        str(row.get("phone_number") or ""),
                        str(row.get("status") or ""),
                        str(row.get("notes") or ""),
                        payload_json,
                        str(row.get("created_at") or ""),
                        str(row.get("updated_at") or ""),
                    ),
                )

        if args.apply:
            connection.commit()
        else:
            connection.rollback()
    finally:
        connection.close()

    return {
        "remote_rows": len(rows),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "filtered_out": filtered_out,
        "applied": bool(args.apply),
        "db_path": str(local_db_path),
    }


def main() -> int:
    args = parse_args()
    turso_url = normalize_turso_url(os.environ.get("TURSO_DATABASE_URL", ""))
    turso_token = os.environ.get("TURSO_AUTH_TOKEN", "")

    if not turso_url or not turso_token:
        raise SystemExit(
            "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Set them in the environment before running this script."
        )

    rows = fetch_remote_reports(turso_url, turso_token, args.limit)
    result = sync_reports(rows, Path(args.db_path), args)

    mode = "APPLY" if result["applied"] else "DRY-RUN"
    print(f"[{mode}] Imported reports from Turso into local SQLite")
    print(f"Local DB: {result['db_path']}")
    print(f"Remote rows read: {result['remote_rows']}")
    print(f"Inserted: {result['inserted']}")
    print(f"Updated: {result['updated']}")
    print(f"Skipped unchanged: {result['skipped']}")
    print(f"Filtered out: {result['filtered_out']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())