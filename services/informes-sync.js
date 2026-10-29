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
        if (field === 'grupo' && mapping[field] === columns.PROFILE) continue;
        if (['grupo', 'fecha'].includes(field) && mapping[field] === columns.AUTO && headers.some(header => columns.matches(field, header))) continue;
        if (mapping[field] && (!headers.includes(mapping[field]) || !columns.matches(field, mapping[field]))) {
            throw new Error('La columna de ' + field + ' debe corresponder a esa misma información.');
        }
    }
}

function sourceDates(reports, column, format) {
    if (!['auto', 'dmy', 'mdy'].includes(format)) throw new Error('Formato de fecha inválido.');
    const evidence = new Set();
    reports.forEach(row => (Array.isArray(column) ? column : [column]).forEach(header => {
        const match = /^(\d{1,2})[/. -](\d{1,2})[/. -]\d{4}(?:\s|$)/.exec(String(row[header] ?? '').trim());
        if (match && Number(match[1]) > 12) evidence.add('dmy');
        if (match && Number(match[2]) > 12) evidence.add('mdy');
    }));
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
    const mappedColumns = field => mapping[field] === columns.AUTO ? headers.filter(header => columns.matches(field, header)) : [mapping[field]];
    const sourceValues = (row, field) => mappedColumns(field).map(header => String(row[header] ?? '').trim()).filter(Boolean);
    const sourceDate = sourceDates(reports, mappedColumns('fecha'), dateFormat);
    function reportDate(row) {
        const dates = sourceValues(row, 'fecha').map(sourceDate);
        return dates.length && dates.every(Boolean) && new Set(dates).size === 1 ? dates[0] : null;
    }
    const pageColumns = headers.filter(header => columns.pageColumn([header]));
    const hasPage = row => pageColumns.some(header => String(row[header] ?? '').trim());
    function sourceGroup(row) {
        if (mapping.grupo === columns.PROFILE) return pageColumns.length && !hasPage(row) ? '' : 'perfil estandar';
        const groups = [...new Set(sourceValues(row, 'grupo').map(exactGroup))];
        if (groups.length > 1) return '';
        const group = groups[0] || '';
        // Solo inferir ausencia de grupo en filas con metadatos reales de página.
        if (mapping.grupo && ['', '-', '--', '—', 'sin grupo', 'no group'].includes(group) && hasPage(row)) return 'perfil estandar';
        return group;
    }
    const result = { total: reports.length, actualizados: 0, celdasActualizadas: 0, sinMatch: 0, yaActualizados: 0, ambiguos: 0, datosInvalidos: 0, perfilEstandar: 0, sinMatchEjemplos: [], columnMapping: mapping };
    if (!mapping.grupo || !mapping.fecha || !fields.some(field => mapping[field])) {
        const missing = [!mapping.grupo && 'Grupo o la opción Perfil estándar', !mapping.fecha && 'Fecha de publicación', !fields.some(field => mapping[field]) && 'al menos una métrica equivalente'].filter(Boolean);
        return { data: [], summary: { ...result, omitida: true, motivo: 'Falta identificar: ' + missing.join(', ') + '. Revisá la asignación de columnas en Reintentar sincronización.' } };
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
        const date = reportDate(row), group = sourceGroup(row);
        if (date && group) add(sources, key(columns.normalize(group), date), row);
    });
    const idColumn = columns.detect(headers).id;
    const reportId = row => idColumn ? String(row[idColumn] ?? '').trim() : '';
    const sourceStats = new Map([...sources].map(([identity, rows]) => [identity, {
        size: rows.length,
        distinct: new Set(rows.map(row => JSON.stringify(fields.map(field => row[mapping[field]] ?? '')))).size,
        ids: new Set(rows.map(reportId).filter(Boolean)).size,
        missingId: rows.some(row => !reportId(row))
    }]));
    const pending = new Map(), changedRows = new Set();
    for (const report of reports) {
        const group = sourceGroup(report), date = reportDate(report);
        if (columns.normalize(group) === 'perfilestandar') result.perfilEstandar++;
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
            if (result.sinMatchEjemplos.length < 10) result.sinMatchEjemplos.push({ grupo: group === 'perfil estandar' ? 'Perfil estándar' : sourceValues(report, 'grupo').join(' / '), fecha: sourceValues(report, 'fecha').join(' / '), motivo: !date ? 'Fecha ausente, inválida o contradictoria: revisá la columna y el formato día/mes o mes/día' : !group ? 'Grupo ausente o columnas de grupo contradictorias' : ambiguous || match ? 'Coincidencia ambigua o fila agrupada' : 'Sin publicación coincidente' });
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
