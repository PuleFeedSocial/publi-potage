const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const columns = require('../assets/js/pages/informes-columns');

function page(values = {}) {
    const elements = Object.fromEntries(['grupo', 'fecha', 'visualizaciones', 'interacciones', 'comentarios'].map(field => ['sync-map-' + field, { value: values[field] || '' }]));
    elements['sync-date-format'] = { value: 'auto' };
    elements['sync-mapping-form'] = {};
    elements['import-sync-result'] = {};
    const button = {};
    const requests = [], alerts = [];
    const context = vm.createContext({
        InformesColumns: columns, API_BASE: '',
        document: { getElementById: id => elements[id], querySelector: () => button, addEventListener() {} },
        bootstrap: { Modal: { getInstance: () => ({ hide() {} }) } },
        alert: message => alerts.push(message),
        authFetch: async (url, request) => {
            requests.push(JSON.parse(request.body));
            return { json: async () => ({ omitida: true, motivo: 'Falta identificar: Fecha de publicación.' }) };
        }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../assets/js/pages/informes'), 'utf8'), context);
    context.loadInformes = () => {};
    return { context, elements, requests, alerts };
}

test('retry does not block page reports with the obsolete mandatory group and date alert', async () => {
    const ui = page();
    ui.context.confirmSync();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.requests.length, 1);
    assert.deepEqual(ui.alerts, []);
    assert.match(ui.elements['import-sync-result'].textContent, /Falta identificar: Fecha de publicación/);
});

test('retry sends profile and automatic date selections and renders automatic options for stored schemas', async () => {
    const ui = page({ grupo: columns.PROFILE, fecha: columns.AUTO, visualizaciones: 'Visualizaciones' });
    ui.context.confirmSync();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.requests[0].columnMapping.grupo, columns.PROFILE);
    assert.equal(ui.requests[0].columnMapping.fecha, columns.AUTO);
    ui.context.renderMapping(['Nombre de la página', 'Fecha', 'Hora de publicación', 'Visualizaciones'], 'sync');
    assert.match(ui.elements['sync-mapping-form'].innerHTML, new RegExp('value="' + columns.AUTO + '" selected'));
    assert.match(ui.elements['sync-mapping-form'].innerHTML, new RegExp('value="' + columns.PROFILE + '" selected'));
});

test('Facebook summary labels do not prevent selecting the publication timestamp in the retry form', () => {
    const ui = page();
    const reports = [{ 'Nombre de la página': 'Potage Srl', Fecha: 'Total', 'Hora de publicación': '10/28/2026 09:39', Visualizaciones: '51' }];
    ui.context.renderMapping(Object.keys(reports[0]), 'sync', reports);
    assert.match(ui.elements['sync-mapping-form'].innerHTML, /value="Hora de publicación" selected/);
    assert.doesNotMatch(ui.elements['sync-mapping-form'].innerHTML, /value="Fecha" selected/);
});
