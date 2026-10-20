const { google } = require('googleapis');
const { dateKey } = require('./validation');

let client;
const setups = new Map();
function setupSheet(name, work) {
  if (!setups.has(name)) {
    setups.set(name, Promise.resolve().then(work).finally(() => setups.delete(name)));
  }
  return setups.get(name);
}
function sheets() {
  if (client) return client;
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_CREDENTIALS) return null;
  let credentials;
  try { credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS); }
  catch { throw Object.assign(new Error('La configuración de Google Sheets no es válida.'), { status: 503 }); }
  const auth = new google.auth.GoogleAuth({
    credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  // Never retry appends automatically: a timeout may occur after Google wrote the row.
  client = google.sheets({ version: 'v4', auth, timeout: 15000, retry: false });
  return client;
}

function count(value) {
  if (value === '' || value == null) return 0;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  let text = String(value).trim().replace(/[\s\u00a0]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(text)) text = text.replace(/[.,]/g, '');
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

function sheetError(res, err) {
  const code = Number(err.status || err.code || err.response?.status);
  const status = [400, 404, 409].includes(code) ? code : 503;
  const message = code === 429
    ? 'Google Sheets alcanzó su límite temporal. Volvé a intentar en unos instantes.'
    : 'No se pudo completar la operación con Google Sheets. Verificá la conexión y los permisos de la cuenta de servicio.';
  return res.status(status).json({ error: message });
}

// Serialize writes within this server and prevent reads from repopulating a stale cache.
let version = 0;
let queue = Promise.resolve();
function mutation(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const previous = queue;
  let release;
  queue = new Promise(resolve => { release = resolve; });
  previous.then(() => {
    if (res.destroyed) { release(); return; }
    version++;
    let finished = false;
    const done = () => { if (!finished) { finished = true; version++; release(); } };
    res.once('finish', done);
    res.once('close', done);
    next();
  }).catch(next);
}

function validateFields(required, textFields, dateFields = [], metricFields = []) {
  return (req, res, next) => {
    if (!['POST', 'PUT'].includes(req.method)) return next();
    const body = req.body;
    for (const field of textFields) {
      if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > 2000)) {
        return res.status(400).json({ error: 'Campo inválido: ' + field });
      }
    }
    for (const field of required) {
      if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim() === '__DELETED__') return res.status(400).json({ error: 'Campo obligatorio o inválido: ' + field });
    }
    for (const field of dateFields) {
      if (body[field] && !dateKey(body[field])) return res.status(400).json({ error: 'Fecha inválida: ' + field });
    }
    for (const field of metricFields) {
      const value = count(body[field]);
      if (value === null) return res.status(400).json({ error: 'Debe ser un entero no negativo: ' + field });
      body[field] = value;
    }
    next();
  };
}

function validateRow(router, sheet, lastColumn, getClient = sheets) {
  router.param('rowIndex', async (req, res, next, value) => {
    const row = Number(value);
    if (!Number.isSafeInteger(row) || row < 2) return res.status(400).json({ error: 'Índice de fila inválido.' });
    try {
      const s = getClient();
      if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
      const result = await s.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEET_ID, range: `${sheet}!A${row}:${lastColumn}${row}`
      });
      const cells = result.data.values?.[0];
      if (!cells?.some(v => v !== '') || cells[0] === '__DELETED__' || (sheet === 'Metricas' && cells[0] === 'Fecha')) {
        return res.status(404).json({ error: 'La fila ya no existe. Recargá los datos.' });
      }
      req.sheetRow = cells;
      next();
    } catch (err) { sheetError(res, err); }
  });
}

module.exports = { sheets, count, sheetError, mutation, setupSheet, validateFields, validateRow, revision: () => version };
