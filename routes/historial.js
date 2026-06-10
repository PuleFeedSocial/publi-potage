const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Historial';

let _auth = null;
function getAuth() {
  if (_auth) return _auth;
  const credsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credsJson) return null;
  try {
    const credentials = JSON.parse(credsJson);
    _auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return _auth;
  } catch { return null; }
}

function sheets() {
  const auth = getAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60000;

function invalidateCache() { cache = null; cacheTime = 0; }

async function ensureSheet() {
  const s = sheets();
  if (!s) throw new Error('Google Sheets no configurado.');
  const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
  const exists = meta.data.sheets.some(sh => sh.properties.title === SHEET_NAME);
  if (exists) return s;
  await s.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: {
      requests: [{
        addSheet: { properties: { title: SHEET_NAME } }
      }]
    }
  });
  await s.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A1:J1',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [['FechaActualizacion', 'FilaOrigen', 'Grupo', 'FechaPublicacion', 'Zona', 'Publicaciones', 'Visualizaciones', 'Interacciones', 'Comentarios', 'Mensajes']]
    }
  });
  return s;
}

router.get('/', authenticate, async (req, res) => {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    await ensureSheet();

    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:J', valueRenderOption: 'FORMATTED_VALUE'
    });

    const rows = result.data.values || [];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      data.push({
        rowIndex: i + 1,
        fechaActualizacion: (row[0] || '').trim(),
        filaOrigen: parseInt(row[1]) || 0,
        grupo: (row[2] || '').trim(),
        fechaPublicacion: (row[3] || '').trim(),
        zona: (row[4] || '').trim(),
        publicaciones: parseInt(row[5]) || 0,
        visualizaciones: parseInt(row[6]) || 0,
        interacciones: parseInt(row[7]) || 0,
        comentarios: parseInt(row[8]) || 0,
        mensajes: parseInt(row[9]) || 0
      });
    }
    cache = data;
    cacheTime = Date.now();
    res.json({ data });
  } catch (err) {
    if (cache) return res.json({ data: cache });
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    await ensureSheet();

    const { fechaActualizacion, filaOrigen, grupo, fechaPublicacion, zona, publicaciones, visualizaciones, interacciones, comentarios, mensajes } = req.body;

    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:J',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[
          fechaActualizacion || '', filaOrigen || 0, grupo || '', fechaPublicacion || '',
          zona || '', publicaciones || 0, visualizaciones || 0, interacciones || 0,
          comentarios || 0, mensajes || 0
        ]]
      }
    });

    invalidateCache();
    res.status(201).json({ message: 'Historial guardado.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
