# Organización del frontend

- `pages/` contiene todos los archivos `.html` con la estructura y las referencias a sus recursos.
- `styles/` contiene todas las hojas CSS: `style.css` (compartida) y una hoja por página o módulo.
- `scripts/` contiene todos los JS del frontend: módulos compartidos (`app.js`, `theme.js`, `account.js`, etc.), funciones (`productos.js`, `regiones.js`, generadores y cálculos), controladores de página y sus archivos `*-events.js`.
- Los archivos `*-events.js` conectan botones, formularios y filtros con sus funciones. Se cargan al final del documento, después de sus controles y dependencias.
- `routes/`, `services/`, `middleware/`, `server.js`, `database.js`, `tokens.js` y `permissions.js` son código del servidor y no se sirven como recursos públicos.
- `tools/` guarda utilidades de build que no forman parte del frontend.

## Carga y mantenimiento

Todas las referencias de las páginas son absolutas desde la raíz (`/pages/...`, `/scripts/...`, `/styles/...`), por lo que funcionan sin importar desde qué ruta se navegue. Las hojas de cada página se enlazan en `<head>`. Los scripts conservan el orden de sus dependencias y su ejecución original. Los eventos del HTML se asignan desde JS, manteniendo el contexto `this`, el argumento `event` y la cancelación de formularios o enlaces cuando corresponde.

Las posiciones y estados calculados en tiempo de ejecución (por ejemplo, la posición actual en el calendario o el estado de un modal) siguen controlándose desde JavaScript. Las plantillas de contenido generadas dinámicamente también pertenecen a sus módulos JS.

`config/page-assets.json` enumera únicamente los archivos CSS/JS específicos de página permitidos por el servidor. Si agregás un recurso nuevo, incluilo allí (o en la lista pública de `server.js` si es compartido) y en el precache de `scripts/sw.js`; incrementá la versión de caché. No abras acceso general a las carpetas del proyecto.

## Verificación

`tests/html-structure.test.js` evita reintroducir bloques de código, estilos o eventos incrustados en el HTML y valida referencias y sintaxis de los recursos extraídos. Las pruebas del servidor confirman que esos recursos sean públicos sin exponer el manifiesto interno ni archivos del backend. Las pruebas de calendario leen su controlador externo.
