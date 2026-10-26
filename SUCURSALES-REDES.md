# Sucursales de redes y catálogo general

La tabla `zonas` sigue siendo la configuración de marketing. Sus nombres son las claves históricas de publicaciones y grupos de la planilla; no se renombran ni se migran métricas al vincular una sucursal.

- En **Redes / Marketing → Sucursales de redes**, editar un registro y seleccionar su sucursal del catálogo. Los vínculos no se deducen por similitud de nombre: puede haber locales homónimos de distintas empresas.
- **Añadir desde el catálogo** permite crear un registro de redes usando una sucursal existente. Se puede ajustar el nombre antes de crearlo para distinguir sucursales homónimas. También se conserva el alta tradicional y la sincronización de zonas históricas.
- `activo` en redes conserva exactamente su efecto previo sobre informes y grupos. No modifica `Activo` en la hoja Sucursales ni la configuración de productos por región.
- Una sucursal solo puede vincularse a un registro de redes. Un índice único en PostgreSQL también impide duplicados concurrentes.
- Desvincular o eliminar un registro de redes no borra la sucursal ni sus publicaciones. Para dejar de trabajar una sucursal se recomienda desactivar el registro de redes y conservar el historial.
- La identidad del catálogo usa el identificador existente de Productos (empresa, ubicación y dirección). Si se cambia cualquiera de esos datos o se elimina la sucursal, el modal avisa que hay que renovar el vínculo. No intenta asignarlo a otro local automáticamente. El teléfono puede cambiar sin romper el vínculo.
- Si Sheets no responde, los datos de marketing siguen disponibles y se puede cambiar el estado conservando el vínculo. Las nuevas asociaciones requieren verificar el catálogo.

La migración agrega solamente columnas opcionales `sucursal_id`, `sucursal_nombre` e índice a `zonas`. No modifica la hoja ni los registros históricos. Los endpoints y permisos `view_zonas` / `edit_zonas` se conservan por compatibilidad.
