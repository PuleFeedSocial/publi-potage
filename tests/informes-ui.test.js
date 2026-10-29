const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function page(response) {
    const elements = { previewModal: {}, 'import-result': { hidden: true } };
    const button = {};
    const requests = [], alerts = [];
    let closed = false, reloads = 0;
    const context = vm.createContext({
        API_BASE: '',
        document: { getElementById: id => elements[id], querySelector: () => button, addEventListener() {} },
        bootstrap: { Modal: { getInstance: () => ({ hide() { closed = true; } }) } },
        alert: message => alerts.push(message),
        authFetch: async (url, request) => {
            requests.push({ url, body: JSON.parse(request.body) });
            return { json: async () => response };
        }
    });
    vm.runInContext(fs.readFileSync(require.resolve('../assets/js/pages/informes'), 'utf8'), context);
    vm.runInContext('pendingImport = [{ "Hora de publicación": "10/28/2026 09:39", Fecha: "Total", Visualizaciones: 0 }];', context);
    context.loadInformes = () => { reloads++; };
    return { context, elements, button, requests, alerts, closed: () => closed, reloads: () => reloads };
}

test('CSV confirmation sends only raw data, including Total labels and zero values, and displays import success', async () => {
    const ui = page({ message: '1 filas importadas correctamente.' });
    ui.context.confirmImport();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(ui.requests, [{ url: '/api/informes/import', body: {
        data: [{ 'Hora de publicación': '10/28/2026 09:39', Fecha: 'Total', Visualizaciones: 0 }]
    } }]);
    assert.equal(ui.elements['import-result'].textContent, '1 filas importadas correctamente.');
    assert.equal(ui.elements['import-result'].hidden, false);
    assert.equal(ui.closed(), true);
    assert.equal(ui.reloads(), 1);
    assert.equal(vm.runInContext('pendingImport', ui.context), null);
    assert.deepEqual(ui.alerts, []);
});

test('failed CSV imports keep the preview and pending data available for retry', async () => {
    const ui = page({ error: 'No se pudo guardar el informe.' });
    ui.context.confirmImport();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(ui.alerts, ['No se pudo guardar el informe.']);
    assert.equal(ui.closed(), false);
    assert.equal(ui.reloads(), 0);
    assert.equal(vm.runInContext('pendingImport.length', ui.context), 1);
    assert.equal(ui.button.disabled, false);
});
