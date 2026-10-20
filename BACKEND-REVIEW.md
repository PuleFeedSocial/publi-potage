# Revisión del backend

## Cambios realizados

### Servidor y sesiones

- Se reemplazó el filtro de archivos estáticos que Express no utilizaba por una
  lista explícita de archivos públicos. El código del servidor, dependencias,
  configuración y base SQLite ya no se sirven como recursos web.
- Se eliminó el endpoint de inicialización pública y su variante destructiva.
  Una base nueva requiere credenciales de administrador configuradas por
  variables de entorno; no se generan contraseñas ni códigos predecibles.
- `JWT_SECRET` es obligatorio. Las sesiones consultan el usuario y su rol actual:
  borrar un usuario o cambiarle los permisos tiene efecto sin esperar al
  vencimiento del token.
- Cambiar o recuperar una contraseña revoca los tokens anteriores. El cambio
  desde ajustes devuelve una sesión nueva para quien realizó la operación.
- Se agregaron límites de intentos de acceso/registro/recuperación, generación
  criptográfica de claves temporales y códigos, validación de tipos y manejo de
  JSON inválido. Las operaciones de contraseña ya no bloquean el servidor.
- Se corrigió el encabezado JSON que faltaba en solicitudes compartidas del
  frontend, incluyendo el cambio de contraseña.

### Roles y PostgreSQL

- Se agregó el endpoint de permisos actuales que el frontend ya consultaba.
- Los permisos de roles personalizados se insertan o actualizan correctamente;
  los roles personalizados se pueden asignar a usuarios. Los permisos no
  configurados se deniegan.
- Las lecturas verifican permisos. Algunas aceptan varias secciones porque
  publicaciones, grupos y zonas comparten datos para sus estadísticas.
- El registro consume el código de activación dentro de una transacción con
  bloqueo de fila. Las series del calendario se crean dentro de una transacción.
- La conexión se inicializa una sola vez aunque lleguen solicitudes simultáneas.
  Se agregaron límites de conexión/consulta y liberación de conexiones tras fallos.
- Se conserva el historial de auditoría al borrar usuarios, dejando sus
  referencias opcionales en nulo.
- Se validan rangos del calendario y horas derivadas inválidas. El cierre del
  servidor espera las solicitudes en curso antes de cerrar PostgreSQL.

### Google Sheets

- Cliente compartido con tiempo límite de 15 segundos y sin reintentos
  automáticos de escritura que puedan duplicar filas.
- Lecturas de métricas sin formato numérico visual; fechas conservadas como
  cadenas. Validación de cantidades enteras y separadores de miles.
- Escrituras `RAW`: el texto de un CSV o formulario no se interpreta como una
  fórmula. Se conservan ceros y columnas presentes en filas posteriores del CSV.
- La sincronización compara fechas equivalentes, usa el calendario de Buenos
  Aires, evita coincidencias ambiguas y actualiza únicamente las celdas de
  métricas modificadas en un lote.
- Las escrituras invalidan las cachés relacionadas, incluida la sincronización
  desde informes. Una copia antigua solo se ofrece durante cinco minutos y se
  identifica como tal; el dashboard muestra el aviso.
- Se validan índices y existencia de filas antes de editar o borrar.
- Los borrados de publicaciones, grupos, sucursales e informes conservan la
  posición de las filas con un marcador `__DELETED__`. La aplicación las omite,
  evitando desplazar referencias del historial o de pantallas ya abiertas.
- Una hoja ausente nunca provoca un borrado en la hoja de índice cero. Los
  fallos de conexión no se presentan como informes vacíos exitosos.
- La creación simultánea de hojas auxiliares se coordina dentro del proceso.
  Las cabeceras inesperadas de Sucursales se rechazan en lugar de sobrescribirse.

## Pruebas

Ejecutar `npm test`. La suite usa el servidor HTTP real de Express y dobles de
Google Sheets/PostgreSQL. Cubre archivos públicos, sesiones y revocación,
permisos, transacciones, métricas, importaciones, sincronización, borrados,
validación, errores de conexión y límites de intentos.

Resultado de esta revisión: **27 pruebas aprobadas, sin fallos**, más revisión
de sintaxis de 22 archivos JavaScript y del script de ajustes de cuenta.

No se escribieron datos de producción. Las pruebas no sustituyen una migración
de ensayo sobre PostgreSQL real ni una comprobación con la cuenta de servicio.

## Despliegue y verificación pendiente

- Mantener en Render `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_SHEET_ID` y
  `GOOGLE_CREDENTIALS`. La cuenta de servicio debe tener permiso de edición sobre
  la planilla. El proyecto local no tiene estas credenciales configuradas, por
  lo que no se pudo comprobar la conexión real.
- La base existente recibe la columna `users.token_version` y ajustes de claves
  foráneas de logs/códigos. No se borran usuarios, códigos ni logs existentes.
- `ADMIN_EMAIL` y `ADMIN_PASSWORD` solo hacen falta si la base no tiene ningún
  administrador. Las cuentas existentes conservan sus contraseñas.
- Los roles personalizados deben tener permisos explícitamente habilitados.
  Los permisos existentes guardados se conservan; el rol colaborador mantiene
  sus valores predeterminados.
- Comprobar tras el despliegue: inicio de sesión, carga de las hojas, permisos de
  un colaborador y cambio de contraseña. Probar escrituras con datos de ensayo
  en una copia de la planilla.
- No eliminar físicamente ni reordenar filas desde Sheets: las referencias
  históricas todavía usan números de fila. Los borrados hechos desde la app
  mantienen esas posiciones, pero no reparan referencias desordenadas antes
  de esta revisión.
- La coordinación de escrituras, límites de intentos y cachés son locales a
  cada proceso. Varias réplicas necesitarían coordinación compartida. Tampoco
  se bloquean ediciones manuales simultáneas en Google Sheets.
- La recuperación sigue usando el código de activación existente, ahora con
  límite de intentos y revocación de sesiones. Un mecanismo por correo con
  enlaces de un solo uso requiere configurar un proveedor de correo.

## Referencias técnicas

- [Opciones de lectura de valores de Google Sheets](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueRenderOption?hl=es-419).
- [Servicio de archivos estáticos en Express](https://expressjs.com/en/4x/api.html#express.static).

## Refuerzo de seguridad y experiencia — 20/10/2026

- Se escapan nombres, zonas, fechas, direcciones, logs y mensajes de error al construir HTML. Los argumentos de botones codifican también apóstrofos; los nombres con comillas conservan su valor al abrir detalles o eliminar una sucursal.
- Los enlaces importados en informes solo son clicables con HTTP/HTTPS. Los enlaces externos modificados usan noopener/noreferrer.
- Se bloquea el enmarcado del sitio, objetos incrustados y cambios de base externos; se restringen cámara/micrófono y se conserva geolocalización del propio sitio. La CSP es parcial: no restringe scripts todavía porque existen scripts y manejadores inline.
- Se elimina CORS abierto: el frontend utiliza la API del mismo origen. Un cliente web alojado en otro origen necesitaría una lista explícita de orígenes autorizados.
- Una falla de red, respuesta HTML de proxy o error temporal al renovar sesión ya no se interpreta como credenciales revocadas. Los 401/403 siguen invalidándola.
- Se actualizan dependencias dentro de los rangos existentes mediante npm audit fix: de cinco avisos a cero vulnerabilidades conocidas al ejecutar la auditoría. Esto no garantiza ausencia de vulnerabilidades.
- Validación: 34 pruebas automáticas; sintaxis de scripts JS/HTML; Chrome local con HTML malicioso, comillas y URL javascript en grupos, sucursales, logs e informes, verificando que no se ejecutan y que los botones preservan el nombre original.
- Pendientes de arquitectura/configuración: recuperación por email con enlaces de un solo uso y vencimiento (el código original de activación sigue siendo reutilizable); cookies HttpOnly y defensa CSRF para sustituir tokens en localStorage; CSP estricta tras retirar scripts inline; comprobación de backups y restauración en producción. Las pruebas de DB/Sheets siguen usando dobles, no credenciales de producción.
