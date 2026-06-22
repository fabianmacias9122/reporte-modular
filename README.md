# reporte-modular

Frontend paralelo para migrar el monolito de `public/app.js` sin afectar el sistema actual.

## Principios

- No tocar el frontend actual mientras se migra una ventana.
- Mantener mismo diseno y misma funcionalidad.
- Mover bloques completos, no helpers sueltos.
- Cada modulo debe reemplazar una parte real del monolito antes de considerarse migrado.
- `public/app.js` de este proyecto solo debe hacer bootstrap, wiring y mount de modulos.

## Estructura

```text
api/
  server/
  requirements.txt
  Procfile
  render.yaml
public/
  app.js
  i18n.js
  core/
    api/
    auth/
    session/
    rcm/
    dom/
  features/
    reporte/
    seguimiento/
    catalogos/
    configuracion/
```

## Orden sugerido de migracion

1. core/rcm
2. core/api
3. core/auth
4. catalogos
5. configuracion
6. reporte
7. seguimiento

## Regla de oro

Un bloque no cuenta como modularizado hasta que desaparece del archivo original que reemplaza.

## Deploy En Render (Sin Afectar El Server Actual)

Este repo ahora vive como monorepo:

1. `reporte-rcm`: frontend modular en `Static Site`
2. `reporte-rcm-api`: backend API en `Web Service`

### Frontend modular

Para desplegar el frontend como un servicio nuevo e independiente:

1. Crea un nuevo `Static Site` en Render con este repositorio.
2. Configura:
  - `Build Command`: `bash ./scripts/render-build.sh`
  - `Publish Directory`: `public`
3. Agrega variable de entorno en Render:
  - `REPORTE_API_BASE_URL`: URL del backend que quieres consumir (por ejemplo tu server de pruebas).

### Backend API

Para desplegar el backend desde este mismo repo:

1. Crea un nuevo `Web Service` en Render con este repositorio.
2. Configura:
   - `Root Directory`: `api`
   - `Build Command`: `pip install -r requirements.txt`
   - `Start Command`: `gunicorn server.app:app --bind 0.0.0.0:$PORT --workers 1 --threads 2`
3. Agrega variables de entorno:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
  - `MASTER_PASSWORD_HASH` (opcional, pero requerido para login con master password)

Para generar `MASTER_PASSWORD_HASH`:

```bash
cd api
python -c "from server.app import _hash_password; print(_hash_password('TU_MASTER_PASSWORD'))"
```

Notas:

- Este frontend no escribe nada en tu servicio actual por si solo; solo consumira la URL configurada en `REPORTE_API_BASE_URL`.
- Si dejas `REPORTE_API_BASE_URL` vacia, intentara usar el mismo origen (`window.location.origin`).
