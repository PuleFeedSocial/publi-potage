# Revisión del frontend — 20 de octubre de 2026

## Alcance

Se revisaron las 11 páginas: inicio, ingreso, registro, publicaciones, grupos,
informes, sucursales, calendario, logs, ayuda y ajustes de cuenta. También las
vistas de zonas y usuarios del dashboard.

## Mejoras aplicadas

- Contraste del texto secundario, bordes de tarjetas, jerarquía de indicadores
  y espaciado de tablas.
- Filtros adaptados a celular y tablet sin sumar anchos y espacios que excedan
  su contenedor; fechas sin cortes y nombres de grupos con espacio suficiente.
- Columnas fijas únicamente en tablas con acciones, desplazamiento por teclado
  y contenido completo de las descripciones importadas en informes.
- Navegación lateral compartida entre páginas. En móvil, el menú controla el
  foco, bloquea la interacción con el fondo y se cierra con Escape. La
  preferencia de escritorio se conserva sin abrir el menú al entrar desde móvil.
- Tema aplicado antes de mostrar la página, sincronizado con Bootstrap y con
  la preferencia del sistema mientras no haya una elección manual.
- Gráficos actualizados al cambiar de tema, ejes desde cero y etiquetas
  descriptivas. Se respeta la preferencia de movimiento reducido.
- Calendario: contraste de la vista seleccionada, filtros y títulos completos
  en móvil, y acciones debajo del contenido en tarjetas estrechas.
- Indicadores con separadores numéricos argentinos; tendencias que siguen
  actualizándose al cambiar filtros.
- Foco visible, enlace para saltar al contenido, etiquetas de formularios,
  anuncios accesibles de notificaciones y apertura de publicaciones por teclado.
- Caché de la aplicación actualizada para incluir el nuevo archivo de tema.

## Verificación

Pruebas en Chrome local con respuestas de API simuladas, sin modificar datos
reales:

- 11 páginas × 3 anchos (360, 768 y 1440 px) × 2 temas: 66 combinaciones,
  sin errores de JavaScript ni desbordamientos detectados en página o controles.
- Comprobaciones adicionales con datos en publicaciones, informes, sucursales,
  logs y calendario a 320 y 1024 px.
- Apertura y cierre del menú, Escape, ciclo de foco con teclado, conservación
  de la preferencia de escritorio y cambio a tamaño móvil.
- Cambio de colores de gráficos, filtros y actualización de tendencias,
  detalle de publicaciones por teclado, modales de publicación y calendario,
  vistas de zonas y usuarios y las cuatro vistas del calendario.
- Preferencia de tema del sistema y movimiento reducido.
- Revisión de capturas de escritorio y móvil; sintaxis de los 11 scripts
  de página y de `app.js`, `theme.js` y `sw.js`.

## Límites

Esta revisión cubre el frontend. No valida escrituras contra Google Sheets,
permisos reales, autenticación del servidor ni base de datos. Esas comprobaciones
corresponden a la revisión posterior del backend. Las pruebas visuales se
realizaron en Chrome; no se ejecutaron en dispositivos físicos con Safari.

## Notificaciones — 23/10/2026

- Panel fuera del contenedor animado de navegación, con posición limitada a la pantalla, altura máxima y lista desplazable sin comprimir avisos; estilos claros/oscuros y pantallas estrechas/horizontales.
- Cierre explícito, Escape y devolución del foco; etiquetas accesibles; estado de carga, error y reintento. Se conserva el desplazamiento al actualizar.
- Marcar leído espera confirmación; las fallas conservan el estado anterior. Se evitan acciones simultáneas y respuestas antiguas que sobrescriban cambios. Links de avisos y service worker limitados al mismo origen.
- Se priorizan avisos no leídos dentro del límite de 50. Los recordatorios vuelven a comprobarse después de cinco minutos (o en la siguiente ejecución del programador) y se descarta la memoria de días anteriores; la deduplicación persistente se mantiene.
- Push valida HTTPS, proveedores admitidos y formato de claves, limita el tiempo y la concurrencia de envío y elimina suscripciones expiradas. La prueba solo confirma éxito si el proveedor acepta al menos un envío; puede llegar a cualquiera de los dispositivos asociados. Cerrar sesión cancela también la suscripción del navegador.
- Validación local: pruebas automatizadas de destinos, claves, entregas fallidas/expiradas, enlaces seguros y recordatorios; Chrome en 1440, 390, 320 y 844 px horizontal, claro/oscuro, errores simulados, lista vacía, scroll y teclado. No se enviaron avisos reales a dispositivos ni se usó la base de producción.

## Perfil y verificación con código — 23/10/2026

- Ajustes de cuenta rediseñados con resumen del perfil, edición de nombre/correo, cambio de contraseña, botones para mostrar/ocultar credenciales, confirmación de contraseña, carga y reintento. Los formularios permanecen bloqueados si no se pudo cargar la cuenta.
- PUT /api/auth/profile y POST /api/auth/change-password validan el mismo código de 6 dígitos vinculado al usuario durante su registro. No aceptan códigos sin usar ni códigos de otras cuentas. Las cuentas creadas sin código conservan la verificación con contraseña actual.
- Los cambios usan una transacción, bloquean la fila del usuario, comprueban la versión de sesión, evitan correos duplicados y solo actualizan los campos permitidos. Se emiten tokens nuevos para la sesión actual y se invalidan los anteriores. El código queda asociado al ID del usuario aunque cambie el correo.
- Límites de intentos por cuenta para cambios autenticados y por correo para recuperación, además del límite por IP existente. Estos límites son por proceso; varias réplicas requieren un almacenamiento compartido.
- Se mantiene por decisión de producto el código original reutilizable para recuperación. No se presenta como MFA ni como un enlace de recuperación de un solo uso. No se envía el código desde /me ni se guarda en el navegador al editar el perfil.
- Registro con bloqueo de envíos repetidos y mensajes en el formulario. Ayuda del registro y recuperación alineada al uso del mismo código.
- Verificación: pruebas automáticas para código propio/ajeno/sin usar, colisión de correo, conservación de rol, revocación de sesiones y alternativa sin código; Chrome en 1440/390/320 px, claro/oscuro, guardado, errores, reintento y actualización del perfil. Servicios externos y base de producción no utilizados en las pruebas.
