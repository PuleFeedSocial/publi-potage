const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planSync } = require('../services/informes-sync');
const { detect, PROFILE, AUTO } = require('../assets/js/pages/informes-columns');

const headers = ['Fecha', 'Grupo', 'Publicaciones', 'Visualizaciones', 'Interacciones', 'Comentarios', 'Mensajes', 'Zona', 'Estatus'];
function target(overrides = {}) {
    const row = ['2026-09-29', 'Grupo Á', 1, 100, 10, 2, 5, 'Centro', 'PUBLICADA'];
    Object.entries(overrides).forEach(([index, value]) => { row[index] = value; });
    return [headers, row];
}
const source = extra => ({ Grupo: 'Grupo A', Fecha: '29/09/2026', Visualizaciones: '200', Interacción: '12', Comentarios: '3', ...extra });

test('CSV sync maps equivalent metrics, including singular Interacción, without substituting reach or reactions', () => {
    assert.deepEqual(detect(['Grupo', 'Fecha', 'Visualizaciones', 'Interacción', 'Comentarios', 'Alcance', 'Reacciones']), {
        grupo: 'Grupo', fecha: 'Fecha', visualizaciones: 'Visualizaciones', interacciones: 'Interacción', comentarios: 'Comentarios'
    });
    assert.deepEqual(detect(['Nombre de la página', 'Título', 'Alcance', 'Espectadores', 'Impresiones', 'Reacciones']), { grupo: PROFILE });
    assert.throws(() => planSync(target(), [source({ Alcance: 999 })], { grupo: 'Grupo', fecha: 'Fecha', visualizaciones: 'Alcance' }), /misma información/);
});

const pageReport = extra => ({
    'Identificador de la publicación': '122110462707357558',
    'Identificador de la página': '61590726743329',
    'Nombre de la página': 'Potage Srl',
    'Hora de publicación': '06/22/2026 04:01',
    'Enlace permanente': 'https://www.facebook.com/permalink/122110462707357558',
    Visualizaciones: '200', Interacciones: '15', Comentarios: '3', ...extra
});

test('Facebook page export maps to Perfil Estandar and recognizes the screenshot month/day timestamps', () => {
    const rows = target({ 0: '22/06/2026', 1: 'Perfil Estandar' });
    const { data, summary } = planSync(rows, [pageReport()]);
    assert.equal(summary.columnMapping.grupo, PROFILE);
    assert.equal(summary.perfilEstandar, 1);
    assert.equal(summary.actualizados, 1);
    assert.deepEqual(data.map(cell => cell.values[0][0]), [200, 15, 3]);
    const otherDate = pageReport({ 'Hora de publicación': '06/03/2026 14:04', 'Identificador de la publicación': 'other' });
    rows.push(['03/06/2026', 'Perfil Estándar', 1, 100, 10, 2]);
    assert.equal(planSync(rows, [pageReport(), otherDate]).summary.actualizados, 2);
});

test('mixed and stored report schemas preserve group matches and only map empty Facebook groups to the profile', () => {
    const rows = target({ 0: '22/06/2026' });
    rows.push(['22/06/2026', 'Perfil Estandar', 1, 100, 10, 2]);
    const reports = [pageReport({ Grupo: 'Grupo A' }), pageReport({ Grupo: '', 'Identificador de la publicación': 'profile' })];
    const result = planSync(rows, reports);
    assert.equal(result.summary.actualizados, 2);
    assert.equal(result.summary.perfilEstandar, 1);
    assert.equal(result.summary.columnMapping.grupo, 'Grupo');
    assert.deepEqual(planSync(rows, [source({ Grupo: '', Fecha: '22/06/2026' })]).data, []);
});

test('page names do not match marketing group names and an explicitly omitted identity stays omitted', () => {
    assert.deepEqual(planSync(target({ 0: '22/06/2026', 1: 'Potage Srl' }), [pageReport()]).data, []);
    assert.equal(planSync(target(), [pageReport()], { fecha: 'Hora de publicación', visualizaciones: 'Visualizaciones' }).summary.omitida, true);
    assert.equal(planSync(target({ 0: '22/06/2026', 1: 'Perfil Estandar' }), [{ Fecha: '22/06/2026', Vistas: 900 }], { grupo: PROFILE, fecha: 'Fecha', visualizaciones: 'Vistas' }).summary.actualizados, 1);
    assert.deepEqual(planSync(target({ 0: '22/06/2026', 1: 'Perfil Estandar' }), [pageReport({ 'Nombre de la página': '', 'Identificador de la página': '' })]).data, []);
});

test('profile matches never update multiple branches or different posts on the same day', () => {
    const rows = target({ 0: '22/06/2026', 1: 'Perfil Estandar' });
    rows.push([...rows[1].slice(0, 7), 'Otra sucursal', 'PUBLICADA']);
    assert.deepEqual(planSync(rows, [pageReport()]).data, []);
    rows.pop();
    const second = pageReport({ 'Identificador de la publicación': 'other' });
    assert.deepEqual(planSync(rows, [pageReport(), second]).data, []);
    assert.equal(detect(Object.keys(pageReport())).id, 'Identificador de la publicación');
});

test('stored report union selects publication dates per row without requiring a manual column choice', () => {
    const rows = target({ 0: '22/06/2026', 1: 'Perfil Estandar' });
    rows.push(['23/06/2026', 'Grupo A', 1, 100, 10, 2]);
    const reports = [pageReport({ Grupo: '', Fecha: '' }), {
        Grupo: 'Grupo A', Fecha: '2026-06-23', 'Hora de publicación': '', Visualizaciones: '300'
    }];
    const { data, summary } = planSync(rows, reports);
    assert.equal(summary.columnMapping.fecha, AUTO);
    assert.equal(summary.actualizados, 2);
    assert.deepEqual(data.filter(cell => cell.range.startsWith('Metricas!D')).map(cell => cell.values[0][0]), [200, 300]);
});

test('automatic identity resolves matching columns but skips contradictory dates or groups', () => {
    const rows = target({ 0: '22/06/2026' });
    let report = source({ Fecha: '2026-06-22', 'Hora de publicación': '2026-06-23', 'Nombre del grupo': 'Grupo A' });
    assert.deepEqual(planSync(rows, [report]).data, []);
    report['Hora de publicación'] = '2026-06-22';
    assert.equal(planSync(rows, [report]).summary.actualizados, 1);
    report['Nombre del grupo'] = 'Otro grupo';
    assert.deepEqual(planSync(rows, [report]).data, []);
});

test('CSV sync updates only greater individual cells, including historical dates and normalized group names', () => {
    const { data, summary } = planSync(target(), [source({ Interacción: 8, Comentarios: 2 })]);
    assert.deepEqual(data, [{ range: 'Metricas!D2', values: [[200]] }]);
    assert.equal(summary.actualizados, 1);
    assert.equal(summary.celdasActualizadas, 1);
});

test('CSV sync preserves absent columns on both sides, blank inputs, invalid inputs and invalid existing counts', () => {
    let result = planSync(target({ 3: 'dato roto' }), [source({ Comentarios: '', Interacción: '--' })]);
    assert.deepEqual(result.data, []);
    const rows = target(); rows[0] = [...headers]; rows[0][5] = 'Otra cosa';
    result = planSync(rows, [{ Grupo: 'Grupo A', Fecha: '29/09/2026', Comentarios: 9 }]);
    assert.deepEqual(result.data, []);
    result = planSync(target(), [source({ Visualizaciones: 0, Interacción: '', Comentarios: 1 })]);
    assert.deepEqual(result.data, []);
});

test('CSV sync does not guess matches for duplicate or aggregated publication rows', () => {
    const duplicate = target(); duplicate.push([...duplicate[1]]);
    assert.deepEqual(planSync(duplicate, [source()]).data, []);
    assert.deepEqual(planSync(target({ 2: 2 }), [source()]).data, []);
    assert.deepEqual(planSync(target(), [source(), source({ Visualizaciones: 300 })], undefined, { importedBatch: true }).data, []);
    assert.deepEqual(planSync(target(), [source(), source({ 'Post ID': 'other' })]).data, []);
});

test('stored snapshots only use maximum values when the CSV identifies the same content', () => {
    const reports = [source({ 'Post ID': '123' }), source({ 'Post ID': '123', Visualizaciones: 250 })];
    const { data, summary } = planSync(target(), reports);
    assert.deepEqual(data[0], { range: 'Metricas!D2', values: [[250]] });
    assert.equal(summary.actualizados, 1);
    assert.deepEqual(planSync(target(), [source(), source({ Visualizaciones: 250 })]).data, []);
    reports[1]['Post ID'] = '456';
    assert.deepEqual(planSync(target(), reports).data, []);
});

test('reimporting a report is idempotent and never lowers the stored values', () => {
    const rows = target({ 3: 200, 4: 12, 5: 3 });
    assert.deepEqual(planSync(rows, [source()]).data, []);
    assert.deepEqual(planSync(rows, [source({ Visualizaciones: '150' })]).data, []);
});

test('US dates are detected from unambiguous dates, and ambiguous dates require a selected format', () => {
    assert.equal(planSync(target(), [source({ Fecha: '09/29/2026 12:00' })]).summary.actualizados, 1);
    const rows = target({ 0: '2026-11-10' });
    assert.equal(planSync(rows, [source({ Fecha: '10/11/2026' })]).summary.actualizados, 0);
    assert.equal(planSync(rows, [source({ Fecha: '10/11/2026' })], undefined, { dateFormat: 'dmy' }).summary.actualizados, 1);
    assert.equal(planSync(target({ 0: '2026-10-11' }), [source({ Fecha: '10/11/2026' })], undefined, { dateFormat: 'mdy' }).summary.actualizados, 1);
});

test('CSV sync handles missing identity, invalid dates and duplicate header aliases without guessing', () => {
    assert.equal(planSync(target(), [{ Fecha: '29/09/2026', Visualizaciones: 999 }]).summary.omitida, true);
    assert.deepEqual(planSync(target(), [source({ Fecha: '31/02/2026' })]).data, []);
    assert.deepEqual(planSync(target(), [{ ...source(), Views: 300 }]).data.map(cell => cell.range), ['Metricas!E2', 'Metricas!F2']);
});
