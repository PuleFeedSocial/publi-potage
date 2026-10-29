# Organización del frontend

- Los archivos `.html` de la raíz contienen la estructura y las referencias a sus recursos.
- `assets/css/pages/` contiene estilos específicos de cada página, extraídos de bloques y atributos HTML.
- `assets/js/pages/` contiene controladores de las páginas que antes estaban incrustados en el HTML.
- Los archivos `*-events.js` de esa carpeta conectan botones, formularios y filtros con sus funciones. Se cargan al final del documento, después de sus controles y dependencias.
- Los módulos compartidos existentes (`app.js`, `theme.js`, `account.js`, etc.) y módulos de funciones (`productos.js`, `regiones.js`, generadores y cálculos) conservan sus rutas para mantener la compatibilidad.
- `style.css` y las hojas de funciones existentes mantienen los estilos compartidos.
- `routes/`, `services/`, `middleware/` y `database.js` son código del servidor y no se sirven como recursos públicos.

## Carga y mantenimiento

Las hojas de cada página se enlazan en `<head>`. Los scripts conservan el orden de sus dependencias y su ejecución original. Los eventos del HTML se asignan desde JS, manteniendo el contexto `this`, el argumento `event` y la cancelación de formularios o enlaces cuando corresponde.

Las posiciones y estados calculados en tiempo de ejecución (por ejemplo, la posición actual en el calendario o el estado de un modal) siguen controlándose desde JavaScript. Las plantillas de contenido generadas dinámicamente también pertenecen a sus módulos JS.

`assets/page-assets.json` enumera únicamente los archivos CSS/JS de páginas permitidos por el servidor. Si agregás un recurso nuevo, incluilo allí y en el precache de `sw.js`; incrementá la versión de caché. No abras acceso general a las carpetas del proyecto.

## Verificación

`tests/html-structure.test.js` evita reintroducir bloques de código, estilos o eventos incrustados en el HTML y valida referencias y sintaxis de los recursos extraídos. Las pruebas del servidor confirman que esos recursos sean públicos sin exponer el manifiesto interno ni archivos del backend. Las pruebas de calendario leen su controlador externo.
