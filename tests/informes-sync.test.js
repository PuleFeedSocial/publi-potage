const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planSync } = require('../services/informes-sync');
const { detect } = require('../assets/js/pages/informes-columns');

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
    assert.deepEqual(detect(['Nombre de la página', 'Título', 'Alcance', 'Espectadores', 'Impresiones', 'Reacciones']), {});
    assert.throws(() => planSync(target(), [source({ Alcance: 999 })], { grupo: 'Grupo', fecha: 'Fecha', visualizaciones: 'Alcance' }), /misma información/);
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
