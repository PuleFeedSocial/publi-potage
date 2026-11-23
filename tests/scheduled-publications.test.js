const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.JWT_SECRET = 'test-only-secret';
process.env.GOOGLE_SHEET_ID = 'test-sheet';

const repo = path.resolve(__dirname, '..');
let rows, appends, queries, failAppend;

function makeRow(overrides = {}) {
  return {
    id: 1,
    estado: 'pendiente',
    programada_para: '2026-11-22 11:00',
    fecha: '2026-11-22',
    hora: '11:00',
    grupo: 'Grupo A',
    zona: 'Zona 1',
    grupo_fila: '2',
    publicaciones: 3,
    visualizaciones: 10,
    interacciones: 4,
    comentarios: 1,
    mensajes: 0,
    estatus: 'PUBLICADA',
    user_id: 1,
    email: 'admin@example.test',
    ip: '127.0.0.1',
    intentos: 0,
    ultimo_error: '',
    ...overrides
  };
}

const db = {
  async all(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('SELECT * FROM publicaciones_programadas')) {
      return rows.filter(row => row.estado === 'pendiente' && row.programada_para <= params[0]);
    }
    return [];
  },
  async run(sql, params) {
    queries.push({ sql, params });
    if (sql.includes("SET estado = 'procesando'")) {
      const row = rows.find(item => item.id === params[0] && item.estado === 'pendiente');
      if (!row) return { rowCount: 0 };
      row.estado = 'procesando';
      return { rowCount: 1 };
    }
    if (sql.includes("SET estado = 'publicada'")) {
      const row = rows.find(item => item.id === params[2] && item.estado === 'procesando');
      if (!row) return { rowCount: 0 };
      row.estado = 'publicada';
      row.fila_origen = params[0];
      row.publicada_en = params[1];
      row.intentos++;
      return { rowCount: 1 };
    }
    if (sql.includes("SET estado = 'pendiente', intentos")) {
      const row = rows.find(item => item.id === params[1] && item.estado === 'procesando');
      if (!row) return { rowCount: 0 };
      row.estado = 'pendiente';
      row.ultimo_error = params[0];
      row.intentos++;
      return { rowCount: 1 };
    }
    return { rowCount: 1 };
  }
};

require.cache[require.resolve(path.join(repo, 'database'))] = { exports: async () => db };
const sheetsService = require(path.join(repo, 'services/sheets'));
sheetsService.sheets = () => ({
  spreadsheets: {
    values: {
      async append(request) {
        appends.push(request);
        if (failAppend) throw new Error('simulated Sheets outage');
        return { data: { updates: { updatedRange: "'Metricas'!A25:J25" } } };
      }
    }
  }
});
const { runScheduledPublications } = require(path.join(repo, 'services/scheduled-publications'));

beforeEach(() => {
  rows = [
    makeRow(),
    makeRow({ id: 2, programada_para: '2026-11-22 13:00', fecha: '2026-11-22', hora: '13:00', grupo: 'Grupo B', grupo_fila: '4' })
  ];
  appends = [];
  queries = [];
  failAppend = false;
});

test('solo publica las programaciones vencidas y registra la fila de Sheets', async () => {
  const result = await runScheduledPublications(new Date('2026-11-22T15:00:00Z'));

  assert.deepEqual(result, { checked: 1, published: 1, failed: 0, now: '2026-11-22 12:00' });
  assert.equal(appends.length, 1);
  assert.deepEqual(appends[0].resource.values[0], [
    '22/11/2026', 'Grupo A', 3, 10, 4, 1, 0, 'Zona 1', 'PUBLICADA', 2
  ]);
  assert.equal(rows[0].estado, 'publicada');
  assert.equal(rows[0].fila_origen, 25);
  assert.equal(rows[1].estado, 'pendiente');
  assert.ok(!queries.some(q => q.params && q.params[0] === 2 && q.sql.includes("SET estado = 'procesando'")));
});

test('un fallo de Sheets deja la programación pendiente y se reintenta en el próximo ciclo', async () => {
  failAppend = true;
  const first = await runScheduledPublications(new Date('2026-11-22T15:00:00Z'));
  assert.equal(first.failed, 1);
  assert.equal(rows[0].estado, 'pendiente');
  assert.equal(rows[0].intentos, 1);
  assert.match(rows[0].ultimo_error, /simulated Sheets outage/);

  failAppend = false;
  const second = await runScheduledPublications(new Date('2026-11-22T15:00:00Z'));
  assert.equal(second.published, 1);
  assert.equal(rows[0].estado, 'publicada');
  assert.equal(rows[0].intentos, 2);
  assert.equal(appends.length, 2);
});
