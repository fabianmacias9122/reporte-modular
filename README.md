# frontend-next

Frontend paralelo para migrar el monolito de `public/app.js` sin afectar el sistema actual.

## Principios

- No tocar el frontend actual mientras se migra una ventana.
- Mantener mismo diseno y misma funcionalidad.
- Mover bloques completos, no helpers sueltos.
- Cada modulo debe reemplazar una parte real del monolito antes de considerarse migrado.
- `public/app.js` de este proyecto solo debe hacer bootstrap, wiring y mount de modulos.

## Estructura

```text
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
