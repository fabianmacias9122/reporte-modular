# reporte-api-modular

Backend API aislado para Render Web Service.

## Archivos incluidos

- `server/app.py`
- `requirements.txt`
- `Procfile`
- `render.yaml`

## Variables de entorno requeridas

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `MASTER_PASSWORD_HASH` (opcional; necesario para login con master password)

Generar hash del master password:

```bash
python -c "from server.app import _hash_password; print(_hash_password('TU_MASTER_PASSWORD'))"
```

## Comandos Render
- Start Command: `gunicorn server.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 2`

## Endpoint de validacion

- `GET /api/health`
