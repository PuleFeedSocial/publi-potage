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

Los precios vacíos se muestran como **Sin cargar**; cero se conserva como importe real. Los especiales tienen cantidad de maple explícita y no admiten precio por docena. Solo se muestra la lista GENERAL de huevos; las filas AMARILLA se conservan en Sheets, pero no se muestran ni se ofrecen al crear productos desde la página.

Los filtros permiten elegir región y local, buscar por nombre sin distinguir tildes y ordenar A–Z/Z–A dentro de cada categoría. Un local usa los precios de su región; no existen precios independientes por local en esta planilla. Cambiar de región limpia un local que ya no pertenece a ella. Limpiar filtros mantiene la región elegida y restablece local, búsqueda y orden.

La gestión de regiones, locales y conexión se agrupa en un diálogo. Añadir producto abre un selector entre huevos y carnes. Los códigos se generan automáticamente y los campos técnicos permanecen ocultos en los formularios.

Al eliminar se vacían las celdas del registro, sin desplazar otras filas. Una región con productos o locales no puede eliminarse; puede desactivarse. Los códigos e identidades no cambian al editar para evitar referencias rotas.

Las escrituras usan RAW para no interpretar texto como fórmulas. Antes de modificar se vuelve a leer y se compara la versión de la fila. Hay serialización dentro de una instancia del servidor. Sheets no ofrece una transacción de lectura y escritura: evitar ediciones simultáneas directas en Sheets durante un guardado, especialmente si se despliegan varias instancias. No se reintentan automáticamente las altas ante fallos de red.

## Verificación

### Imágenes para redes

Productos → Generar imagen consulta precios y catálogo de Sucursales actuales antes de preparar un PNG de 1880 px de ancho y altura adaptable. Todas las regiones usan el diseño amarillo de Costa con B1/B2/B3 y C1/C2/C3 como selección inicial. Cada fila es seleccionable y puede quedar vacía (se representa con guiones), pero debe seleccionarse al menos un producto. Solo se admiten huevos estándar de la lista GENERAL de la región seleccionada. Los especiales y las carnes requieren otras plantillas.

La descarga se bloquea si no hay productos seleccionados, hay productos repetidos, precios incompletos o incompatibles con 12 maples por cajón, o si la región/huevos están desactivados. Actualizar precios consulta nuevamente precios y sucursales. El pie original de Alfonsín se reemplaza por el nombre de la región y el nombre, dirección y contacto de todas sus sucursales activas vinculadas, independientemente del filtro por sucursal. No se buscan coincidencias por nombre: si una asociación está desactualizada, faltan datos de contacto o no hay sucursales activas, se indica cómo corregirlo y se bloquea la descarga. Las líneas se ajustan y la altura aumenta para no recortar contactos. Las fotos y el logo originales se conservan. No se publica automáticamente ni se modifica la hoja.

Para huevos GENERAL de categoría Estándar, editar docena, maple o cajón calcula los otros dos precios. Se usan 12, 30 y 360 huevos respectivamente. El último campo editado es la base, y cada resultado se redondea directamente a centavos desde esa base. El servidor recalcula antes de guardar los valores numéricos en Sheets. Vaciar el campo base vacía los tres; cero es un precio válido. Los especiales calculan maple y cajón con 20 y 240 huevos respectivamente; no tienen precio por docena. Pollos y carnes conservan precios independientes por presentación, incluyendo descuentos por cantidad. Al editar una carne se muestran otras presentaciones del mismo producto y región, y se puede añadir otra conservando el nombre y la categoría, con un código nuevo y precio vacío. Las ediciones hechas directamente en Google Sheets no disparan este cálculo; se realiza al guardar desde Productos. La columna histórica cambio_por_docena se conserva en la hoja, pero queda oculta en la tabla y el formulario.

Pruebas automatizadas con Google simulado: encabezados, duplicados, cantidades, importes, referencias, revisiones, eliminación, autenticación y permisos. Verificación de navegador con datos simulados en claro/oscuro a 1440, 390 y 320 px. No se realizaron escrituras en la hoja real durante estas pruebas; la conexión de producción requiere las credenciales y permisos configurados en Render.
## Sucursales y corrección de precios

### Tipos de producto por región

La página Regiones administra nombre, estado, sucursales y tipos disponibles. Modificar abre switches para Huevos, Pollos, Cerdos y Carnes: los cambios se aplican juntos con Guardar cambios, mediante un único batchUpdate atómico de Sheets. Cancelar no escribe nada. El control de versión abarca región, tipos y asociaciones de sucursales. Desactivar no elimina precios; sin configuración explícita los tipos permanecen habilitados. Eliminar una región sin productos limpia su configuración y asociaciones sin eliminar las sucursales del catálogo; si tiene productos, se rechaza el borrado.

La pestaña opcional `Productos por región` se crea automáticamente con encabezados `region_id`, `tipo`, `activo` al primer guardado válido. Solo su ausencia confirmada se trata como configuración vacía; los fallos de permisos o conexión se propagan como errores. Las escrituras verifican versiones y se serializan como el resto del catálogo. Las categorías históricas Pollo/Cerdo y sus variantes siguen visibles, y editar una presentación conserva su categoría original. Productos queda dedicado a precios y filtros por región, sucursal, nombre y tipo; Regiones reutiliza view_productos/edit_productos para lectura y administración.

Productos permite vincular sucursales del catálogo existente (hoja `Sucursales` de `GOOGLE_SHEET_ID`) a una región de precios. En Regiones → Modificar, las asociaciones antiguas deben desmarcarse y seleccionarse las sucursales correspondientes; no se emparejan por nombre automáticamente porque pueden existir nombres repetidos. Cada sucursal pertenece a una sola región. Desvincular no elimina la sucursal del catálogo.

El botón Ver precios de Sucursales abre `productos.html?sucursal=ID` con región y sucursal seleccionadas. Si no existe una asociación disponible, muestra un aviso sin ofrecer precios de otra sucursal. La identidad se deriva de empresa, ubicación y dirección, independientemente de la fila y del teléfono; después de cambiar alguno de esos tres campos, hay que volver a vincularla. Los nombres técnicos de la pestaña `Locales` y sus encabezados se conservan por compatibilidad; la interfaz usa Sucursal.

Las regiones aceptan Sí/No, booleanos, 1/0 y Activa/Inactiva; un estado vacío usa Activa. Un No explícito se conserva. Los valores desconocidos requieren revisión.

Los huevos estándar usan 30 unidades/maple y 12 maples/cajón; especiales, 20 unidades/maple y 12 maples/cajón. Al leer, se reconoce la conversión antigua exacta cajón = maple × 30 y se muestra corregida a × 12. El botón Guardar corrección abre la edición para persistirla en Sheets, conservando la comprobación de versión original. La lectura no modifica la hoja ni sus fórmulas. Pollos y carnes mantienen precios independientes por presentación.
