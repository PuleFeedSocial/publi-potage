const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-calendar-ui';

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
    const chip = vm.runInContext('chipWrapHtml(calEvents[0])', context);
    vm.runInContext('renderDetail()', context);
    assert.equal(card.includes('Responsable de prueba'), visible);
    assert.equal(elements.get('cal-detail-body').innerHTML.includes('Responsable de prueba'), visible);
    assert.ok(card.includes('Tarea asignada'));
    if (label === 'assigned collaborator') {
      assert.ok(chip.includes('is-my-task'));
      assert.ok(card.includes('Asignada a mí'));
      assert.ok(elements.get('cal-detail-body').innerHTML.includes('Asignada a vos'));
    }
    if (label === 'other collaborator') {
      assert.ok(!chip.includes('is-my-task'));
      assert.ok(!card.includes('Asignada a mí'));
    }
  });
}

test('filterForViewer strips responsible from non-admins unless assigned to viewer', () => {
  const { filterForViewer } = require('../routes/calendario');
  const ev = { id: 1, titulo: 'T1', responsable_id: 5, responsable_nombre: 'Carlos', realizado_por: 1, realizado_en: '2026-10-20' };
  const adminView = filterForViewer(ev, true, 99);
  assert.equal(adminView.responsable_id, 5);
  assert.equal(adminView.responsable_nombre, 'Carlos');
  assert.equal(adminView.realizado_por, 1);

  const assignedView = filterForViewer(ev, false, 5);
  assert.equal(assignedView.responsable_id, 5);
  assert.equal(assignedView.responsable_nombre, 'Carlos');
  assert.equal(assignedView.realizado_por, undefined);

  const otherView = filterForViewer(ev, false, 8);
  assert.equal(otherView.responsable_id, undefined);
  assert.equal(otherView.responsable_nombre, undefined);
  assert.equal(otherView.realizado_por, undefined);
});

test('the "mine" filter only matches tasks assigned to the current user', () => {
  const { context } = calendar({ id: 7, role: 'colaborador' });
  vm.runInContext(`calEvents = [
    normEvent({id: 1, titulo: 'Mía', fecha: '2026-10-23', tipo: 'tarea', estado: 'pendiente', responsable_id: 7, responsable_nombre: 'Yo'}),
    normEvent({id: 2, titulo: 'De otro', fecha: '2026-10-23', tipo: 'tarea', estado: 'pendiente', responsable_id: 8, responsable_nombre: 'Otro'}),
    normEvent({id: 3, titulo: 'Sin responsable', fecha: '2026-10-23', tipo: 'tarea', estado: 'pendiente'})
  ];`, context);
  const ids = vm.runInContext(
    "calEvents.filter(ev => calMatch(ev, { resp: 'mine' })).map(ev => ev.id)",
    context
  );
  assert.deepEqual(Array.from(ids), [1]);
});
