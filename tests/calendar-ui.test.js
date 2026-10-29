const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../calendario.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../assets/js/pages/calendario.js'), 'utf8');

function calendar(user) {
  const elements = new Map();
  const context = vm.createContext({
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { innerHTML: '' });
        return elements.get(id);
      }
    },
    getCurrentSession: () => user,
    sessionRole: () => user?.role || '',
    hasPermission: () => true,
    escHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    isoToDate: value => value
  });
  vm.runInContext(script, context);
  return { context, elements };
}

for (const [label, user, visible] of [
  ['assigned collaborator', { id: 7, role: 'colaborador' }, true],
  ['string session ID', { id: '7', role: 'colaborador' }, true],
  ['other collaborator', { id: 8, role: 'colaborador' }, false],
  ['administrator', { id: 1, role: 'admin' }, true],
  ['missing session', null, false]
]) {
  test(`calendar cards and details render for ${label}`, () => {
    const { context, elements } = calendar(user);
    vm.runInContext(`calEvents = [normEvent({id: 42, titulo: 'Tarea asignada', fecha: '2026-10-23',
      tipo: 'tarea', estado: 'pendiente', responsable_id: 7, responsable_nombre: 'Responsable de prueba'})];
      calDetailId = 42;`, context);
    const card = vm.runInContext('calItemHtml(calEvents[0], true)', context);
    vm.runInContext('renderDetail()', context);
    assert.equal(card.includes('Responsable de prueba'), visible);
    assert.equal(elements.get('cal-detail-body').innerHTML.includes('Responsable de prueba'), visible);
    assert.ok(card.includes('Tarea asignada'));
  });
}
