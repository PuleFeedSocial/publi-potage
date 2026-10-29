(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.InformesColumns = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const normalize = value => String(value || '').replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const PROFILE = '__PERFIL_ESTANDAR__';
    const AUTO = '__AUTOMATICO_POR_FILA__';
    // Alcance, espectadores, impresiones y reacciones son métricas distintas.
    const aliases = {
        grupo: ['grupo', 'nombre del grupo', 'nombre de grupo', 'group', 'group name'],
        fecha: ['fecha', 'fecha de publicacion', 'fecha de la publicacion', 'hora de publicacion', 'publish time', 'publication date', 'post date', 'date', 'published at'],
        visualizaciones: ['visualizaciones', 'visualizacion', 'views', 'view', 'vistas'],
        interacciones: ['interacciones', 'interaccion', 'interactions', 'interaction', 'engagements'],
        comentarios: ['comentarios', 'comentario', 'comments', 'comment'],
        id: ['identificador de la publicacion', 'id de la publicacion', 'id de publicacion', 'post id', 'content id']
    };
    function pageColumn(columns) {
        const names = ['nombre de la pagina', 'nombre de pagina', 'page name', 'identificador de la pagina', 'id de la pagina', 'page id'];
        return columns.find(column => names.some(name => normalize(name) === normalize(column)));
    }
    function matches(field, column) { return (aliases[field] || []).some(alias => normalize(alias) === normalize(column)); }
    function detect(columns) {
        const mapping = {};
        Object.keys(aliases).forEach(field => {
            const found = columns.filter(column => matches(field, column));
            if (found.length === 1) mapping[field] = found[0];
            else if (found.length > 1 && ['grupo', 'fecha'].includes(field)) mapping[field] = AUTO;
        });
        // Las páginas sin grupo se registran como Perfil Estandar en Publicaciones.
        // El nombre de una página nunca se convierte en el nombre de un grupo.
        if (!columns.some(column => matches('grupo', column)) && pageColumn(columns)) mapping.grupo = PROFILE;
        if (!mapping.id) {
            const urls = columns.filter(column => ['enlacepermanente', 'permalink'].includes(normalize(column)));
            if (urls.length === 1) mapping.id = urls[0];
        }
        return mapping;
    }
    return { normalize, matches, detect, pageColumn, PROFILE, AUTO };
}));
