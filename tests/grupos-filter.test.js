const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages', 'grupos.html'), 'utf8');
const eventsSource = fs.readFileSync(path.join(root, 'scripts', 'grupos-events.js'), 'utf8');
const gruposSource = fs.readFileSync(path.join(root, 'scripts', 'grupos.js'), 'utf8');

test('the group status filter has its own event and uses the activo field values', () => {
  const events = [...html.matchAll(/data-page-event="(grupos-\d+)"/g)].map(m => m[1]);
  assert.equal(new Set(events).size, events.length, 'cada control debe tener un evento único');
  assert.match(html, /data-page-event="grupos-14"[^>]*id="grupos-filter-status"/);
  assert.match(html, /data-page-event="grupos-11"[^>]*id="grupos-solo-problemas"/);
  const select = html.match(/<select[^>]*id="grupos-filter-status"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(select, 'existe el selector de estatus');
  const values = [...select[1].matchAll(/<option value="([^"]*)">/g)].map(m => m[1]);
  assert.deepEqual(values, ['', 'true', 'false']);
});

test('the status select and the solo problemas checkbox keep independent handlers', () => {
  const elements = {};
  const calls = [];
  const sandbox = {
    document: {
      querySelector(selector) {
        const key = selector.match(/grupos-\d+/)[0];
        return elements[key] || (elements[key] = {});
      }
    },
    toggleSidebar() {}, toggleTheme() {}, logout() {}, loadGruposPage() {}, openAddGrupo() {},
    saveGruposFilters() { calls.push('save'); },
    renderGruposPage() { calls.push('render'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(eventsSource, sandbox);

  assert.equal(typeof elements['grupos-14'].onchange, 'function');
  assert.equal(typeof elements['grupos-11'].onchange, 'function');
  elements['grupos-14'].onchange({});
  assert.deepEqual(calls, ['save', 'render']);
  calls.length = 0;
  elements['grupos-11'].onchange({});
  assert.deepEqual(calls, ['save', 'render']);
});

function makeEl() {
  const el = {
    children: [], style: {}, dataset: {}, value: '', checked: false,
    innerText: '', textContent: '', hidden: false, _html: '',
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    insertAdjacentElement() {}, addEventListener() {}, closest() { return this; },
    querySelector() { return makeEl(); }
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = v; el.children = []; } });
  return el;
}

function page() {
  const elements = {};
  const byId = id => elements[id] || (elements[id] = makeEl());
  const storage = new Map();
  let paginator = null;
  const sandbox = {
    document: { getElementById: byId, createElement: () => makeEl(), addEventListener() {} },
    window: {},
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    API_BASE: 'http://test',
    authFetch: async () => {},
    escHtml: value => String(value == null ? '' : value),
    normFilterVal: value => String(value == null ? '' : value).trim().toLowerCase(),
    isEstatusActivo: value => String(value || '').toUpperCase() === 'PUBLICADA',
    MarketingAnalysis: { norm: value => String(value == null ? '' : value).trim().toLowerCase(), number: value => Number(value) || 0 },
    createTablePaginator(tbodyId, options) {
      paginator = {
        filterIds: options.filterIds,
        render(data, rowRenderer) {
          this.lastData = data;
          const tbody = byId(tbodyId);
          tbody.children = [];
          data.forEach((row, index) => tbody.appendChild(rowRenderer(row, index)));
        }
      };
      return paginator;
    },
    makeTableRowInteractive() {},
    showToast() {}, alert() {}, confirm: () => true, hasPermission: () => true,
    bootstrap: { Modal: { getInstance: () => ({ hide() {} }), getOrCreateInstance: () => ({ show() {}, hide() {} }) } },
    getCurrentSession: () => ({ name: 'Admin User', role: 'admin' }),
    guardPage() {},
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(gruposSource + `
    ;globalThis.__gruposUi = {
      setData(value) { gruposPageData = value; },
      render: renderGruposPage,
      save: saveGruposFilters,
      restore: restoreGruposFilters
    };`, sandbox);
  sandbox.window._gruposEstatus = {};
  sandbox.window._gruposPubs = {};
  return { sandbox, byId, storage, get paginator() { return paginator; }, api: sandbox.__gruposUi };
}

const rows = [
  { nombre: 'Alfa', zona: 'Centro', activo: true, rowIndex: 1 },
  { nombre: 'Beta', zona: 'Centro', activo: false, rowIndex: 2 },
  { nombre: 'Gamma', zona: 'Oeste', rowIndex: 3 }
];

test('the status filter shows all, only active or only inactive groups', () => {
  const ui = page();
  ui.api.setData(rows);
  ui.api.render();
  assert.equal(ui.paginator.filterIds.includes('grupos-filter-status'), true);
  assert.deepEqual(ui.paginator.lastData.map(g => g.nombre), ['Alfa', 'Beta', 'Gamma']);

  ui.byId('grupos-filter-status').value = 'true';
  ui.api.render();
  assert.deepEqual(ui.paginator.lastData.map(g => g.nombre), ['Alfa', 'Gamma']);
  assert.equal(ui.byId('grupos-count').innerText, '2 de 3');

  ui.byId('grupos-filter-status').value = 'false';
  ui.api.render();
  assert.deepEqual(ui.paginator.lastData.map(g => g.nombre), ['Beta']);

  ui.byId('grupos-filter-status').value = '';
  ui.api.render();
  assert.deepEqual(ui.paginator.lastData.map(g => g.nombre), ['Alfa', 'Beta', 'Gamma']);
});

test('the status filter is persisted and restored together with the other filters', () => {
  const ui = page();
  ui.byId('grupos-filter-status').value = 'false';
  ui.api.save();
  assert.equal(ui.storage.get('gruposFilterStatus'), 'false');

  ui.byId('grupos-filter-status').value = '';
  ui.api.restore();
  assert.equal(ui.byId('grupos-filter-status').value, 'false');

  ui.storage.set('gruposFilterStatus', '');
  ui.byId('grupos-filter-status').value = 'true';
  ui.api.restore();
  assert.equal(ui.byId('grupos-filter-status').value, '');
});
