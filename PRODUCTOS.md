# Productos por región

La página `productos.html` consulta y modifica las cuatro pestañas del archivo de precios. No utiliza la hoja de métricas de publicaciones.

## Configuración en Render

- Usa la cuenta de servicio de `GOOGLE_CREDENTIALS`, ya utilizada por las integraciones existentes.
- `PRODUCTS_SHEET_ID` permite elegir otra planilla. Por defecto apunta a `1hFGIgLe4YgF2Iz5V7wJQcE0tS3tXlKvDtEwKduSEUtg`.
- Compartir esa planilla con el `client_email` de la cuenta, como **Editor**. No hacer pública la hoja ni compartir claves privadas.
- Un administrador puede consultar el correo desde **Productos → Conexión con Google Sheets**, incluso si todavía no tiene acceso a la planilla. Ese endpoint nunca devuelve claves privadas.

## Datos y permisos

Se conservan los encabezados de la plantilla `Regiones`, `Locales`, `Precios huevos` y `Precios pollos y carnes`. Los códigos vinculan precios y locales con las regiones. Los textos de instrucciones debajo de Regiones no se interpretan como registros.

Los colaboradores tienen consulta por defecto. `edit_productos` habilita altas, cambios y eliminaciones mediante los permisos de rol existentes. Las comprobaciones se realizan también en el servidor. Las regiones inactivas solo se muestran en la interfaz a quienes pueden editar.

Los precios vacíos se muestran como **Sin cargar**; cero se conserva como importe real. Los especiales tienen cantidad de maple explícita y no admiten precio por docena. Las listas GENERAL y AMARILLA se mantienen diferenciadas.

Al eliminar se vacían las celdas del registro, sin desplazar otras filas. Una región con productos o locales no puede eliminarse; puede desactivarse. Los códigos e identidades no cambian al editar para evitar referencias rotas.

Las escrituras usan RAW para no interpretar texto como fórmulas. Antes de modificar se vuelve a leer y se compara la versión de la fila. Hay serialización dentro de una instancia del servidor. Sheets no ofrece una transacción de lectura y escritura: evitar ediciones simultáneas directas en Sheets durante un guardado, especialmente si se despliegan varias instancias. No se reintentan automáticamente las altas ante fallos de red.

## Verificación

Pruebas automatizadas con Google simulado: encabezados, duplicados, cantidades, importes, referencias, revisiones, eliminación, autenticación y permisos. Verificación de navegador con datos simulados en claro/oscuro a 1440, 390 y 320 px. No se realizaron escrituras en la hoja real: falta compartirla con la cuenta de servicio para validar la conexión en producción.
