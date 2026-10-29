const { count } = require('./sheets');
const { dateKey } = require('./validation');
const columns = require('../assets/js/pages/informes-columns');

const fields = ['visualizaciones', 'interacciones', 'comentarios'];
const presentCount = value => value == null || String(value).trim() === '' ? null : count(value);
const exactGroup = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const key = (group, date) => JSON.stringify([group, date]);

function validateMapping(headers, mapping) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('Mapeo inválido.');
    for (const field of ['grupo', 'fecha', ...fields]) {
        if (mapping[field] && (!headers.includes(mapping[field]) || !columns.matches(field, mapping[field]))) {
            throw new Error('La columna de ' + field + ' debe corresponder a esa misma información.');
        }
    }
}

function sourceDates(reports, column, format) {
    if (!['auto', 'dmy', 'mdy'].includes(format)) throw new Error('Formato de fecha inválido.');
    const evidence = new Set();
    reports.forEach(row => {
        const match = /^(\d{1,2})[/. -](\d{1,2})[/. -]\d{4}(?:\s|$)/.exec(String(row[column] ?? '').trim());
        if (match && Number(match[1]) > 12) evidence.add('dmy');
        if (match && Number(match[2]) > 12) evidence.add('mdy');
    });
    const resolved = format === 'auto' ? (evidence.size === 1 ? [...evidence][0] : null) : format;
    return value => {
        const text = String(value ?? '').trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(text)) return dateKey(text);
        const match = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:\s.*)?$/.exec(text);
        if (!match) return null;
        if (!resolved && match[1] !== match[2]) return null;
        return dateKey(resolved === 'mdy' ? `${match[2]}/${match[1]}/${match[3]}` : text);
    };
}

function planSync(targetRows, reports, suppliedMapping, { importedBatch = false, dateFormat = 'auto' } = {}) {
    const headers = [...new Set(reports.flatMap(row => Object.keys(row)))];
    const mapping = suppliedMapping === undefined ? columns.detect(headers) : suppliedMapping;
    validateMapping(headers, mapping);
    const sourceDate = sourceDates(reports, mapping.fecha, dateFormat);
    const result = { total: reports.length, actualizados: 0, celdasActualizadas: 0, sinMatch: 0, yaActualizados: 0, ambiguos: 0, datosInvalidos: 0, sinMatchEjemplos: [], columnMapping: mapping };
    if (!mapping.grupo || !mapping.fecha || !fields.some(field => mapping[field])) {
        return { data: [], summary: { ...result, omitida: true, motivo: 'No se identificaron Grupo, Fecha y al menos una métrica equivalente. Revisá las columnas del CSV.' } };
    }
    const headerIndex = targetRows.findIndex(row => columns.matches('fecha', row[0]));
    if (headerIndex < 0) throw new Error('La hoja Métricas no tiene el formato esperado.');
    const targetHeaders = targetRows[headerIndex];
    const targetColumns = Object.fromEntries(['grupo', 'fecha', ...fields].map(field => {
        const found = targetHeaders.map((name, index) => columns.matches(field, name) ? index : -1).filter(index => index >= 0);
        return [field, found.length === 1 ? found[0] : -1];
    }));
    if (targetColumns.grupo < 0 || targetColumns.fecha < 0) throw new Error('Faltan Grupo o Fecha en Métricas.');
    const pubsColumn = targetHeaders.findIndex(name => columns.normalize(name) === 'publicaciones');
    const exact = new Map(), normalized = new Map();
    function add(map, identity, entry) {
        if (!map.has(identity)) map.set(identity, []);
        map.get(identity).push(entry);
    }
    targetRows.slice(headerIndex + 1).forEach((row, index) => {
        if (row[0] === '__DELETED__') return;
        const date = dateKey(row[targetColumns.fecha]), group = exactGroup(row[targetColumns.grupo]);
        if (!date || !group) return;
        const entry = { row, rowIndex: index + headerIndex + 2 };
        add(exact, key(group, date), entry);
        add(normalized, key(columns.normalize(group), date), entry);
    });
    const sources = new Map();
    reports.forEach(row => {
        const date = sourceDate(row[mapping.fecha]), group = exactGroup(row[mapping.grupo]);
        if (date && group) add(sources, key(columns.normalize(group), date), row);
    });
    const idColumn = columns.detect(headers).id;
    const sourceStats = new Map([...sources].map(([identity, rows]) => [identity, {
        size: rows.length,
        distinct: new Set(rows.map(row => JSON.stringify(fields.map(field => row[mapping[field]] ?? '')))).size,
        ids: new Set(rows.map(row => String(row[idColumn] ?? '').trim()).filter(Boolean)).size,
        missingId: rows.some(row => !String(row[idColumn] ?? '').trim())
    }]));
    const pending = new Map(), changedRows = new Set();
    for (const report of reports) {
        const group = exactGroup(report[mapping.grupo]), date = sourceDate(report[mapping.fecha]);
        const normalizedGroup = columns.normalize(group);
        const candidates = exact.get(key(group, date)) || (normalizedGroup ? normalized.get(key(normalizedGroup, date)) : null) || [];
        const stats = sourceStats.get(key(columns.normalize(group), date));
        // Un lote con varias publicaciones del mismo grupo/día no identifica una publicación única.
        // El historial manual admite distintas capturas del mismo contenido, conservando el máximo.
        const ambiguous = candidates.length > 1 || (stats && (stats.ids > 1 ||
            (stats.size > 1 && stats.ids > 0 && stats.missingId) ||
            (stats.size > 1 && stats.distinct > 1 && (importedBatch || stats.ids !== 1 || stats.missingId))));
        const match = candidates.length === 1 ? candidates[0] : null;
        if (!group || !date || !match || ambiguous || (pubsColumn >= 0 && count(match.row[pubsColumn]) !== 1)) {
            result.sinMatch++;
            if (ambiguous || match) result.ambiguos++;
            if (result.sinMatchEjemplos.length < 10) result.sinMatchEjemplos.push({ grupo: report[mapping.grupo] || '', fecha: report[mapping.fecha] || '', motivo: !date ? 'Fecha inválida o formato ambiguo: indicá día/mes o mes/día' : ambiguous || match ? 'Coincidencia ambigua o fila agrupada' : 'Sin publicación coincidente' });
            continue;
        }
        let changed = false, comparable = false;
        for (const field of fields) {
            const col = targetColumns[field];
            if (!mapping[field] || col < 0) continue;
            const incoming = presentCount(report[mapping[field]]);
            const current = count(match.row[col]);
            if (incoming === null || current === null) { result.datosInvalidos++; continue; }
            comparable = true;
            const range = 'Metricas!' + String.fromCharCode(65 + col) + match.rowIndex;
            const previous = pending.get(range)?.values[0][0] ?? current;
            if (incoming > previous) {
                pending.set(range, { range, values: [[incoming]] });
                changed = true;
                changedRows.add(match.rowIndex);
            }
        }
        if (!changed && comparable) result.yaActualizados++;
    }
    result.actualizados = changedRows.size;
    result.celdasActualizadas = pending.size;
    return { data: [...pending.values()], summary: result };
}

module.exports = { planSync, validateMapping };
