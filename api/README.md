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

## Comandos Render

- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn server.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 2`

## Endpoint de validacion

- `GET /api/health`
