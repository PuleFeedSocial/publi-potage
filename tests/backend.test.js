const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
process.env.JWT_SECRET = 'test-only-secret-not-for-production';
process.env.GOOGLE_SHEET_ID = 'test-sheet';

let activationCodes, users, permissions, operations, sheetRows, missingSheets, sheetFailure, calendarFailure;
let nextId = 10;
let syncWriteFailure = false;
const db = {
  async get(sql, params = []) {
    operations.push({ sql, params });
    if (sql.includes('COUNT')) return { c: 1 };
    if (sql.includes('activation_codes')) {
      if (sql.includes('WHERE code = ?')) return activationCodes.find(c => c.code === params[0] && (sql.includes('used = 0') ? c.used === 0 : c.used_by === params[1] && c.used === 1)) || null;
      if (sql.includes('WHERE used_by = ?')) return activationCodes.find(c => c.used_by === params[0] && c.used === 1) || null;
      return null;
    }
    if (sql.includes('FROM users')) {
      return sql.includes('email') && sql.includes('WHERE LOWER(email)')
        ? [...users.values()].find(u => u.email === params[0]) || null
        : users.get(Number(params[0])) || null;
    }
    return null;
  },
  async all(sql, params = []) {
    if (sql.includes('role_permissions')) return [...permissions.entries()]
      .filter(([key]) => key.startsWith(params[0] + ':'))
      .map(([key, enabled]) => ({ permission: key.split(':')[1], enabled }));
    if (sql.includes('FROM roles')) return [{ name: 'colaborador', label: 'Colaborador' }, { name: 'editor', label: 'Editor' }];
    return [];
  },
  async run(sql, params = []) {
    operations.push({ sql, params });
    if (sql.includes('INSERT INTO role_permissions')) {
      const key = params[0] + ':' + params[1];
      if (!permissions.has(key) || sql.includes('DO UPDATE')) permissions.set(key, params[2]);
    }
    if (sql.includes('UPDATE users SET name')) {
      const user = users.get(Number(params[2]));
      user.name = params[0]; user.email = params[1]; user.token_version++;
      return { rows: [{ ...user }] };
    }
    if (sql.includes('UPDATE users SET password')) {
      const user = users.get(Number(params[1]));
      user.password = params[0]; user.token_version++;
      return { rows: [{ ...user }] };
    }
    if (sql.includes('INSERT INTO calendario')) {
      if (calendarFailure) throw new Error('simulated write failure');
      return { rows: [{ id: nextId++ }] };
    }
    if (sql.includes('INSERT INTO users')) {
      const user = { id: nextId++, name: params[0], email: params[1], password: params[2], role: params[3], token_version: 0 };
      users.set(user.id, user);
      return { rows: [{ id: user.id }] };
    }
    return { rows: [], rowCount: 1 };
  },
  async transaction(fn) {
    operations.push({ sql: 'BEGIN' });
    try { const result = await fn(db); operations.push({ sql: 'COMMIT' }); return result; }
    catch (err) { operations.push({ sql: 'ROLLBACK' }); throw err; }
  }
};
require.cache[require.resolve('../database')] = { exports: async () => db };
const sheetService = require('../services/sheets');
const google = {
  spreadsheets: {
    async get() {
      if (sheetFailure) throw Object.assign(new Error('sensitive upstream detail'), { code: 403 });
      return { data: { sheets: ['Metricas','Grupos','Informes','Historial','Sucursales']
        .filter(name => !missingSheets.includes(name)).map((title, sheetId) => ({ properties: { title, sheetId } })) } };
    },
    async batchUpdate(request) { operations.push({ google: 'structure', request }); return { data: {} }; },
    values: {
      async get({ range }) {
        if (sheetFailure) throw Object.assign(new Error('sensitive upstream detail'), { code: 403 });
        const [name, cells] = range.split('!');
        const rows = sheetRows[name] || [];
        const single = /^A(\d+):[A-Z]+\1$/.exec(cells);
        return { data: { values: single ? (rows[Number(single[1]) - 1] ? [rows[Number(single[1]) - 1]] : []) : rows } };
      },
      async append(request) {
        operations.push({ google: 'append', request });
        return { data: { updates: { updatedRange: "'Metricas'!A25:I25" } } };
      },
      async update(request) {
        operations.push({ google: 'update', request });
        const match = /^([^!]+)!A(\d+)(?::[A-Z]+\d+)?$/.exec(request.range);
        if (match) (sheetRows[match[1]] ||= [])[Number(match[2]) - 1] = request.resource.values[0];
        return { data: {} };
      },
      async batchUpdate(request) {
        if (syncWriteFailure) throw new Error('simulated sync write failure');
        operations.push({ google: 'valuesBatch', request });
        return { data: {} };
      }
    }
  }
};
sheetService.sheets = () => google;
const validateRow = sheetService.validateRow;
sheetService.validateRow = (router, sheet, column) => validateRow(router, sheet, column, () => google);
const { app } = require('../server');
const { signAccessToken, signRefreshToken } = require('../tokens');
let server, base;
before(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
  users = new Map([[1, { id: 1, name: 'Admin', email: 'admin@example.test', role: 'admin', token_version: 0, password: bcrypt.hashSync('old-password', 4) }]]);
  activationCodes = [{id:1,code:'123456',used:0,used_by:null}];
  syncWriteFailure = false;
  permissions = new Map(); operations = []; missingSheets = []; sheetFailure = false; calendarFailure = false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  sheetRows = {
    Metricas: [['Fecha','Grupo','Publicaciones','Visualizaciones','Interacciones','Comentarios','Mensajes','Zona','Estatus'],
      [today, 'Grupo Á', 1, 1234, 30, 4, 5, 'Centro', 'PUBLICADA'],
      [today, 'Grupo B', 1, 25, 2, 0, 0, 'Norte', 'PUBLICADA']],
    Grupos: [['Nombre'], ['Grupo Á']],
    Informes: [['Grupo','Fecha','Vistas'], ['Grupo Á', today.split('-').reverse().join('/'), '2.345']],
    Historial: [['FechaActualizacion'], [today, 3, 'Grupo B', today, 'Norte', 1, 25, 2, 0, 0]]
  };
});
async function request(path, { method = 'GET', body, token = signAccessToken(users.get(1)) } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

test('only explicitly public files can be downloaded', async () => {
  for (const path of ['/server.js','/tokens.js','/database.sqlite','/routes/auth.js','/node_modules/express/package.json','/package.json','/.env','/services/sheets.js','/%73erver.js']) {
    assert.equal((await request(path)).status, 404, path);
  }
  for (const path of ['/dashboard.html','/app.js','/theme.js','/style.css','/img/icon-192.png']) assert.equal((await request(path)).status, 200, path);
  assert.equal((await request('/api/seed')).status, 404);
});
test('products protect writes and service account details with server-side permissions', async () => {
  assert.equal((await request('/api/productos', { token: '' })).status, 401);
  const collaborator = { id: 55, name: 'Reader', email: 'reader@example.test', role: 'colaborador', token_version: 0 };
  users.set(55, collaborator);
  const token = signAccessToken(collaborator);
  assert.equal((await request('/api/productos/conexion', { token })).status, 403);
  for (const method of ['POST','PUT','DELETE']) {
    assert.equal((await request('/api/productos/huevos', { token, method, body: {} })).status, 403);
    assert.equal((await request('/api/productos/region-config', { token, method, body: {} })).status, 403);
  }
  const config = await request('/api/productos/conexion');
  assert.equal(config.status, 200);
  assert.deepEqual(Object.keys(config.data).sort(), ['email','spreadsheetId']);
  assert.equal((await request('/services/products.js')).status, 404);
  for (const path of ['/productos.html','/productos.js','/productos.css','/regiones.html','/regiones.js','/price-artwork.js','/price-artwork-ui.js','/img/precios/amba.jpg','/img/precios/costa.jpg']) assert.equal((await request(path)).status, 200);
});

test('authentication rejects absent, removed and revoked sessions', async () => {
  assert.equal((await request('/api/marketing', { token: '' })).status, 401);
  const token = signAccessToken(users.get(1));
  users.get(1).token_version++;
  assert.equal((await request('/api/marketing', { token })).status, 401);
  users.delete(1);
  assert.equal((await request('/api/marketing', { token })).status, 401);
});
test('authorization uses current DB role rather than old JWT role', async () => {
  const token = signAccessToken(users.get(1));
  users.get(1).role = 'editor';
  assert.equal((await request('/api/auth/users', { token })).status, 403);
  assert.equal((await request('/api/marketing', { token })).status, 403);
});
test('custom role permissions persist and current permission endpoint exists', async () => {
  const saved = await request('/api/auth/permissions/editor', { method: 'PUT', body: { permissions: { view_dashboard: true, edit_marketing: false } } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.permissions.view_dashboard, true);
  assert.equal(saved.data.permissions.edit_marketing, false);
  assert.equal((await request('/api/auth/permissions')).data.permissions.edit_marketing, true);
});
test('password changes revoke old access and refresh tokens but return a new session', async () => {
  const old = signAccessToken(users.get(1)), refresh = signRefreshToken(users.get(1));
  const changed = await request('/api/auth/change-password', { method: 'POST', body: { currentPassword: 'old-password', newPassword: 'new-password' } });
  assert.equal(changed.status, 200);
  assert.equal((await request('/api/auth/me', { token: old })).status, 401);
  assert.equal((await request('/api/auth/refresh', { method: 'POST', body: { refreshToken: refresh } })).status, 401);
  assert.equal((await request('/api/auth/me', { token: changed.data.token })).status, 200);
});
test('registration consumes activation code inside a transaction', async () => {
  const result = await request('/api/auth/register', { method: 'POST', body: { name: 'Prueba', email: 'nuevo@example.test', password: 'test-password', activationCode: '123456' } });
  assert.equal(result.status, 201);
  assert.ok(operations.some(o => o.sql?.includes('FOR UPDATE')));
  assert.ok(operations.some(o => o.sql === 'COMMIT'));
});
test('malformed JSON and invalid field types return 400', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(res.status, 400);
  assert.equal((await request('/api/auth/register', { method: 'POST', body: { name: [], email: 'x@example.test' } })).status, 400);
});
test('Sheets reads preserve metric magnitudes and dates', async () => {
  const result = await request('/api/marketing?refresh=true');
  assert.equal(result.status, 200);
  assert.equal(result.data.data[0].visualizaciones, 1234);
  assert.equal(result.data.data[1].rowIndex, 3);
});
test('Sheets writes reject invalid metrics and save formula-like strings literally', async () => {
  const body = { fecha: '20/10/2026', grupo: '=IMPORTXML("https://example.test")', visualizaciones: '1.234' };
  assert.equal((await request('/api/marketing', { method: 'POST', body: { ...body, visualizaciones: -1 } })).status, 400);
  assert.equal((await request('/api/marketing', { method: 'POST', body: { ...body, fecha: '31/02/2026' } })).status, 400);
  const result = await request('/api/marketing', { method: 'POST', body });
  assert.equal(result.status, 201);
  assert.equal(result.data.rowIndex, 25);
  const write = operations.find(o => o.google === 'append').request;
  assert.equal(write.valueInputOption, 'RAW');
  assert.equal(write.resource.values[0][3], 1234);
});
test('invalid and absent rows are never mutated', async () => {
  for (const row of ['1', '-1', '2bad', '2.5']) assert.equal((await request('/api/marketing/' + row, { method: 'DELETE' })).status, 400);
  assert.equal((await request('/api/marketing/999', { method: 'DELETE' })).status, 404);
  assert.equal(operations.filter(o => o.google).length, 0);
});
test('deleting publications preserves row references in history', async () => {
  assert.equal((await request('/api/marketing/2', { method: 'DELETE' })).status, 200);
  assert.equal(operations.filter(o => o.google === 'structure').length, 0);
  const read = await request('/api/marketing?refresh=true');
  assert.deepEqual(read.data.data.map(r => r.rowIndex), [3]);
  assert.equal(sheetRows.Historial[1][1], 3);
});
test('missing Grupos never deletes sheet zero', async () => {
  missingSheets = ['Grupos'];
  assert.equal((await request('/api/grupos/2', { method: 'DELETE' })).status, 404);
  assert.equal(operations.filter(o => o.google === 'structure').length, 0);
});
test('group and report deletions leave later row numbers stable', async () => {
  sheetRows.Grupos.push(['Segundo grupo']);
  assert.equal((await request('/api/grupos/2', { method: 'DELETE' })).status, 200);
  assert.deepEqual((await request('/api/grupos?refresh=true')).data.data.map(r => r.rowIndex), [3]);
  assert.equal((await request('/api/informes/2', { method: 'DELETE' })).status, 200);
  assert.equal((await request('/api/informes')).data.data.length, 0);
  assert.equal(operations.filter(o => o.google === 'structure').length, 0);
});
test('reports retain numeric zeros and imports preserve columns found in later rows', async () => {
  sheetRows.Informes = [['Vistas'], [0]];
  assert.equal((await request('/api/informes')).data.data[0].Vistas, '0');
  missingSheets = ['Informes'];
  const result = await request('/api/informes/import', { method: 'POST', body: { data: [{ Grupo: 'A' }, { Grupo: 'B', Vistas: '0' }] } });
  assert.equal(result.status, 201);
  const write = operations.find(o => o.google === 'append').request;
  assert.deepEqual(write.resource.values, [['A', ''], ['B', '0']]);
  assert.equal(write.valueInputOption, 'RAW');
});
test('CSV import automatically updates only greater equivalent metrics from that batch', async () => {
  const date = sheetRows.Metricas[1][0];
  const res = await request('/api/informes/import', { method: 'POST', body: { data: [{ Grupo: 'Grupo B', Fecha: date, Visualizaciones: 100, Interacción: 1, Comentarios: 2, Alcance: 9999 }] } });
  assert.equal(res.status, 201);
  assert.equal(res.data.sincronizacion.actualizados, 1);
  assert.deepEqual(operations.find(o => o.google === 'valuesBatch').request.resource.data, [
    { range: 'Metricas!D3', values: [[100]] }, { range: 'Metricas!F3', values: [[2]] }
  ]);
  assert.equal(operations.filter(o => o.google === 'append').length, 1);
});

test('Facebook page CSV imports update Perfil Estandar without needing a group column', async () => {
  sheetRows.Metricas[1][0] = '22/06/2026';
  sheetRows.Metricas[1][1] = 'Perfil Estandar';
  const data = [{ 'Identificador de la publicación': '123', 'Nombre de la página': 'Potage Srl', 'Hora de publicación': '06/22/2026 04:01', Visualizaciones: '2000', Interacciones: '5', Comentarios: '6' }];
  const res = await request('/api/informes/import', { method: 'POST', body: { data } });
  assert.equal(res.status, 201);
  assert.equal(res.data.sincronizacion.actualizados, 1);
  assert.equal(res.data.sincronizacion.perfilEstandar, 1);
  assert.deepEqual(operations.find(o => o.google === 'valuesBatch').request.resource.data, [
    { range: 'Metricas!D2', values: [[2000]] }, { range: 'Metricas!F2', values: [[6]] }
  ]);
});

test('retry processes already imported page reports without importing duplicate rows', async () => {
  sheetRows.Metricas[1][0] = '22/06/2026';
  sheetRows.Metricas[1][1] = 'Perfil Estandar';
  sheetRows.Informes = [['Nombre de la página', 'Hora de publicación', 'Visualizaciones'], ['Potage Srl', '06/22/2026 04:01', '2000']];
  const res = await request('/api/informes/sync', { method: 'POST', body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.data.actualizados, 1);
  assert.equal(operations.filter(o => o.google === 'append').length, 0);
  assert.deepEqual(operations.find(o => o.google === 'valuesBatch').request.resource.data, [{ range: 'Metricas!D2', values: [[2000]] }]);
});

test('import permissions do not grant permission to change publication metrics', async () => {
  const user = { id: 55, role: 'colaborador', email: 'editor@example.test', name: 'Editor', token_version: 0 };
  users.set(55, user);
  permissions.set('colaborador:edit_informes', true);
  permissions.set('colaborador:sync_informes', false);
  const res = await request('/api/informes/import', { method: 'POST', token: signAccessToken(user), body: { data: [{ Grupo: 'Grupo B', Fecha: sheetRows.Metricas[1][0], Vistas: 999 }] } });
  assert.equal(res.status, 201);
  assert.equal(res.data.sincronizacion.omitida, true);
  assert.equal(operations.filter(o => o.google === 'valuesBatch').length, 0);
});

test('import reports saved data even when automatic synchronization fails', async () => {
  syncWriteFailure = true;
  const res = await request('/api/informes/import', { method: 'POST', body: { data: [{ Grupo: 'Grupo B', Fecha: sheetRows.Metricas[1][0], Vistas: 999 }] } });
  assert.equal(res.status, 201);
  assert.equal(res.data.sincronizacion.error, true);
  assert.match(res.data.sincronizacion.motivo, /no vuelvas a importar/);
  assert.equal(operations.filter(o => o.google === 'append').length, 1);
});

test('invalid metric mappings are rejected before saving an import', async () => {
  const res = await request('/api/informes/import', { method: 'POST', body: { data: [{ Grupo: 'Grupo B', Fecha: '2026-10-29', Alcance: 999 }], columnMapping: { grupo: 'Grupo', fecha: 'Fecha', visualizaciones: 'Alcance' } } });
  assert.equal(res.status, 400);
  assert.equal(operations.filter(o => o.google).length, 0);
});

test('sync invalidates previously cached marketing data', async () => {
  assert.equal((await request('/api/marketing?refresh=true')).data.data[0].visualizaciones, 1234);
  await request('/api/informes/sync', { method: 'POST', body: { columnMapping: { grupo: 'Grupo', fecha: 'Fecha', visualizaciones: 'Vistas' } } });
  sheetRows.Metricas[1][3] = 2345;
  assert.equal((await request('/api/marketing')).data.data[0].visualizaciones, 2345);
});
test('sync matches equivalent dates and updates only changed cells with maximum values', async () => {
  sheetRows.Informes[0].push('Post ID');
  sheetRows.Informes[1].push('123');
  sheetRows.Informes.push(['Grupo Á', sheetRows.Metricas[1][0], 2000, '123']);
  const res = await request('/api/informes/sync', { method: 'POST', body: { columnMapping: { grupo: 'Grupo', fecha: 'Fecha', visualizaciones: 'Vistas' } } });
  assert.equal(res.status, 200);
  const batch = operations.find(o => o.google === 'valuesBatch').request;
  assert.deepEqual(batch.resource.data, [{ range: 'Metricas!D2', values: [[2345]] }]);
  assert.equal(batch.resource.valueInputOption, 'RAW');
});
test('sync avoids ambiguous duplicate publication matches', async () => {
  sheetRows.Metricas.push([...sheetRows.Metricas[1]]);
  const res = await request('/api/informes/sync', { method: 'POST', body: { columnMapping: { grupo: 'Grupo', fecha: 'Fecha', visualizaciones: 'Vistas' } } });
  assert.equal(res.data.sinMatch, 1);
  assert.equal(operations.filter(o => o.google === 'valuesBatch').length, 0);
});
test('Google failures are not reported as empty successful reports or leaked details', async () => {
  sheetFailure = true;
  const res = await request('/api/informes');
  assert.equal(res.status, 503);
  assert.ok(!res.data.error.includes('sensitive'));
});
test('unexpected branch headers and invalid report cells are rejected without rewriting Sheets', async () => {
  sheetRows.Sucursales = [['Columna ajena', 'No sobrescribir'], ['Dato']];
  assert.equal((await request('/api/sucursales?refresh=true')).status, 409);
  assert.equal((await request('/api/informes/import', { method: 'POST', body: { data: [{ Grupo: { nested: true } }] } })).status, 400);
  assert.equal(operations.filter(o => o.google).length, 0);
});
test('calendar validates ranges and creates recurring series transactionally', async () => {
  assert.equal((await request('/api/calendario?desde=bad&hasta=2026-10-20')).status, 400);
  const body = { titulo: 'Campaña', fecha: '2026-10-20', recurrencia: 'diaria' };
  assert.equal((await request('/api/calendario', { method: 'POST', body })).status, 201);
  assert.equal(operations.filter(o => o.sql?.includes('INSERT INTO calendario')).length, 60);
  assert.ok(operations.some(o => o.sql === 'COMMIT'));
  calendarFailure = true;
  assert.equal((await request('/api/calendario', { method: 'POST', body })).status, 500);
  assert.ok(operations.some(o => o.sql === 'ROLLBACK'));
});
test('calendar rejects default end times that would not follow start times', async () => {
  assert.equal((await request('/api/calendario', { method: 'POST', body: { titulo: 'Tarea', fecha: '2026-10-20', hora: '23:59' } })).status, 400);
});

test('pages prevent framing and restrict unnecessary browser capabilities', async () => {
  const res = await fetch(base + '/index.html', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(res.headers.get('permissions-policy'), /geolocation=\(self\)/);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('legal links download PDFs and HTML pages and sources stay private', async () => {
  for (const slug of ['politicas-privacidad', 'terminos-condiciones']) {
    const pdf = await fetch(base + '/output/pdf/' + slug + '-atlas.pdf');
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    assert.equal(pdf.headers.get('content-disposition'), 'attachment; filename="' + slug + '-atlas.pdf"');
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    assert.equal((await fetch(base + '/' + slug + '.html')).status, 404);
    for (const page of ['/index.html', '/login.html', '/register.html']) {
      const html = await (await fetch(base + page)).text();
      assert.ok(html.includes('href="output/pdf/' + slug + '-atlas.pdf" download'));
    }
  }
  for (const path of ['/scripts/build-legal-pdfs.py', '/scripts/legal-content.json']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});

test('clearing notifications requires authentication and only clears the current account', async () => {
  assert.equal((await request('/api/notificaciones', { method: 'DELETE', token: '' })).status, 401);
  assert.equal((await request('/api/notificaciones', { method: 'DELETE', body: { user_id: 999 } })).status, 200);
  const operation = operations.find(op => op.sql.startsWith('UPDATE notifications SET is_dismissed'));
  assert.deepEqual(operation.params, [1]);
  assert.match(operation.sql, /WHERE user_id = \?/);
  assert.ok(!operations.some(op => op.sql.startsWith('DELETE FROM notifications')));
});


test('profile changes require the account code and cannot change role or another account', async () => {
  activationCodes.push({id:2,code:'654321',used:1,used_by:1},{id:3,code:'111111',used:1,used_by:999});
  const original = signAccessToken(users.get(1));
  for (const activationCode of [undefined, '111111', '123456']) {
    const denied = await request('/api/auth/profile', {method:'PUT',body:{name:'New',email:'new@example.test',activationCode,currentPassword:'old-password'}});
    assert.equal(denied.status,400);
  }
  const result = await request('/api/auth/profile', {method:'PUT',body:{name:'  New Name  ',email:'NEW@example.test',activationCode:'654321',role:'colaborador',id:999}});
  assert.equal(result.status,200);assert.equal(result.data.user.name,'New Name');assert.equal(result.data.user.email,'new@example.test');assert.equal(result.data.user.role,'admin');assert.equal(result.data.user.id,1);
  assert.equal((await request('/api/auth/me',{token:original})).status,401);
  const me=await request('/api/auth/me',{token:result.data.token});assert.equal(me.data.hasActivationCode,true);assert.equal(me.data.activationCode,undefined);assert.equal(me.data.password,undefined);
});

test('account code changes password without the old password, and remains usable for recovery after email change', async () => {
  activationCodes.push({id:2,code:'654321',used:1,used_by:1});
  const changed=await request('/api/auth/change-password',{method:'POST',body:{activationCode:'654321',newPassword:'changed-password'}});
  assert.equal(changed.status,200);
  users.get(1).email='changed@example.test';
  const recovered=await request('/api/auth/forgot-password',{method:'POST',body:{email:'changed@example.test',activationCode:'654321',newPassword:'recovered-password'}});
  assert.equal(recovered.status,200);
  assert.equal((await request('/api/auth/me',{token:changed.data.token})).status,401);
  assert.equal(await bcrypt.compare('recovered-password',users.get(1).password),true);
});

test('profile email collision is rejected and accounts without codes use current password', async () => {
  users.set(2,{id:2,email:'taken@example.test',role:'colaborador'});
  const conflict=await request('/api/auth/profile',{method:'PUT',body:{name:'New',email:'taken@example.test',currentPassword:'old-password'}});
  assert.equal(conflict.status,409);assert.equal(users.get(1).name,'Admin');
  const invalid=await request('/api/auth/profile',{method:'PUT',body:{name:'New',email:'new@example.test',currentPassword:'wrong'}});
  assert.equal(invalid.status,400);
  const success=await request('/api/auth/profile',{method:'PUT',body:{name:'New',email:'new@example.test',currentPassword:'old-password'}});
  assert.equal(success.status,200);
});

test('marketing links preserve historical keys and independent activity, including Sheets outage', async t => {
  const directory=require('../services/product-branches');
  const branch={empresa:'Potage',ubicacion:'Merlo',direccion:'Calle 1',contacto:'123',activo:false};branch.id=directory.branchId(branch);
  let outage=false;
  t.mock.method(directory,'read',async()=>{if(outage)throw Error('offline');return [branch];});
  const originalGet=db.get;
  let existing={nombre:'Merlo histórico',sucursal_id:null,sucursal_nombre:null};
  t.mock.method(db,'get',async(sql,params)=>sql.includes('FROM zonas')?existing:originalGet.call(db,sql,params));
  assert.equal((await request('/api/zonas/sucursales')).status,200);
  let result=await request('/api/zonas/1',{method:'PUT',body:{nombre:existing.nombre,activo:false,sucursal_id:branch.id}});
  assert.equal(result.status,200);
  let write=operations.findLast(o=>o.sql.startsWith('UPDATE zonas'));
  assert.equal(write.params[0],false);assert.equal(write.params[1],branch.id);assert.ok(!/(?:SET|,)\s*nombre\s*=/.test(write.sql));
  assert.equal((await request('/api/zonas/1',{method:'PUT',body:{nombre:'Renombrada',activo:true}})).status,409);
  existing={...existing,sucursal_id:branch.id,sucursal_nombre:write.params[2]};outage=true;
  assert.equal((await request('/api/zonas/1',{method:'PUT',body:{nombre:existing.nombre,activo:true}})).status,200);
  assert.equal(operations.findLast(o=>o.sql.startsWith('UPDATE zonas')).params[1],branch.id);
  assert.equal((await request('/api/zonas',{method:'POST',body:{nombre:'Nueva',sucursal_id:branch.id}})).status,503);
  assert.equal((await request('/api/zonas/1',{method:'PUT',body:{nombre:existing.nombre,activo:true,sucursal_id:null}})).status,200);
  assert.equal(operations.findLast(o=>o.sql.startsWith('UPDATE zonas')).params[1],null);
});

test('marketing branch links reject unknown branches and enforce unique association', async t=>{
  const directory=require('../services/product-branches');
  t.mock.method(directory,'read',async()=>[]);
  assert.equal((await request('/api/zonas',{method:'POST',body:{nombre:'Nueva',sucursal_id:'SUC-'+'a'.repeat(24)}})).status,409);
  const branch={empresa:'Potage',ubicacion:'Centro',direccion:'Calle 1'};branch.id=directory.branchId(branch);
  t.mock.method(directory,'read',async()=>[branch]);
  const run=db.run;t.mock.method(db,'run',async(sql,params)=>{if(sql.includes('INSERT INTO zonas'))throw Object.assign(Error('duplicate'),{code:'23505'});return run.call(db,sql,params);});
  assert.equal((await request('/api/zonas',{method:'POST',body:{nombre:'Otra',sucursal_id:branch.id}})).status,409);
  const reader={id:55,name:'Reader',email:'reader@test',role:'colaborador',token_version:0};users.set(55,reader);
  assert.equal((await request('/api/zonas/sucursales',{token:signAccessToken(reader)})).status,403);
});

test('extracted page assets are public without exposing their server-side manifest', async()=>{
 for(const asset of require('../assets/page-assets.json'))assert.equal((await request('/'+asset)).status,200,asset);
 assert.equal((await request('/assets/page-assets.json')).status,404);
});
