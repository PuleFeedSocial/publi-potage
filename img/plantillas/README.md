# Plantillas por empresa

Cada empresa tiene su carpeta. El nombre de la carpeta es el slug que usa la app:

| Empresa (columna `Empresa`) | Carpeta |
| --- | --- |
| Potage SRL | `potage/` |
| Pluma Blanca SRL | `pluma-blanca/` |
| El Triangulo SA | `el-triangulo/` |
| La Sorpresa SRL | `la-sorpresa/` |

## Archivos

Todos son opcionales. La app intenta `.png`, `.jpg`, `.jpeg` y `.webp` en ese orden.

- `fondo.*`: plantilla completa para feed de Facebook, proporción horizontal **2240:1880** (2240 × 1880 px). Debe venir sin precios ni datos variables.
- `logo.*`: logo con fondo transparente (se recomienda PNG).
- `huevos.*`: foto o recorte de huevos para la tabla.
- `pollos.*`: foto o recorte de pollo para la tabla.

Si no existe `fondo.*`, se usa el diseño estándar con el nombre de la empresa.

## Regla de sucursales

- Hasta 3 sedes: nombre, dirección y teléfono.
- Más de 3 sedes: solo nombre de sede y teléfono.
- Más de 6 sedes: se generan páginas de hasta 6 sedes.

## Ajuste fino

Las zonas donde se dibujan precios, sucursales y marca están en `company-templates.js`
(`DEFAULT_ZONES` y, por empresa, `zones`). Cuando llegue una plantilla nueva se ajustan
esas coordenadas sobre el lienzo de 2240 × 1880.
