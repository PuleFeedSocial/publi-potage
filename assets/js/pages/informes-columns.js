(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.InformesColumns = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const normalize = value => String(value || '').replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    // Alcance, espectadores, impresiones y reacciones son métricas distintas.
    const aliases = {
        grupo: ['grupo', 'nombre del grupo', 'nombre de grupo', 'group', 'group name'],
        fecha: ['fecha', 'fecha de publicacion', 'fecha de la publicacion', 'hora de publicacion', 'publish time', 'publication date', 'post date', 'date', 'published at'],
        visualizaciones: ['visualizaciones', 'visualizacion', 'views', 'view', 'vistas'],
        interacciones: ['interacciones', 'interaccion', 'interactions', 'interaction', 'engagements'],
        comentarios: ['comentarios', 'comentario', 'comments', 'comment'],
        id: ['identificador de la publicacion', 'id de la publicacion', 'id de publicacion', 'post id', 'content id', 'enlace permanente', 'permalink']
    };
    function matches(field, column) { return (aliases[field] || []).some(alias => normalize(alias) === normalize(column)); }
    function detect(columns) {
        const mapping = {};
        Object.keys(aliases).forEach(field => {
            const found = columns.filter(column => matches(field, column));
            if (found.length === 1) mapping[field] = found[0];
        });
        return mapping;
    }
    return { normalize, matches, detect };
}));
