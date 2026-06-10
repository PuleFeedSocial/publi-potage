const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TARGET_SHEET = 'Metricas';

let _auth = null;
function getAuth() {
  if (_auth) return _auth;
  const credsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credsJson) return null;
  try {
    const credentials = JSON.parse(credsJson);
    _auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
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

function invalidateCache() {
  cache = null;
  cacheTime = 0;
}

async function readMarketingData() {
  const s = sheets();
  if (!s) throw new Error('Google Sheets no configurado.');

  const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
  const sheet = meta.data.sheets.find(sh => sh.properties.title === TARGET_SHEET);
  if (!sheet) throw new Error('Hoja "' + TARGET_SHEET + '" no encontrada.');

  const result = await s.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: TARGET_SHEET + '!A:H',
    valueRenderOption: 'FORMATTED_VALUE'
  });

  const rows = result.data.values || [];
  const headerIdx = rows.findIndex(r => r[0] === 'Fecha');
  if (headerIdx === -1) return [];

  const data = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    if (!row[0]) continue;
    data.push({
      rowIndex: rowNumber,
      fecha: (row[0] || '').trim(),
      grupo: (row[1] || '').trim(),
      publicaciones: parseInt(row[2]) || 0,
      visualizaciones: parseInt(row[3]) || 0,
      interacciones: parseInt(row[4]) || 0,
      comentarios: parseInt(row[5]) || 0,
      mensajes: parseInt(row[6]) || 0,
      zona: (row[7] || '').trim()
    });
  }
  return data;
}

router.get('/', authenticate, async (req, res) => {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }

    const data = await readMarketingData();
    cache = data;
    cacheTime = Date.now();
    res.json({ data });
  } catch (err) {
    if (cache) return res.json({ data: cache });
    res.status(500).json({ error: err.message });
  }
});

router.get('/refresh', authenticate, async (req, res) => {
  invalidateCache();
  res.json({ message: 'Caché de marketing limpiado.' });
});

router.post('/', authenticate, async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const { fecha, grupo, publicaciones, visualizaciones, interacciones, comentarios, mensajes, zona } = req.body;

    const appendRes = await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: TARGET_SHEET + '!A:H',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[
          fecha || '', grupo || '', publicaciones || 0, visualizaciones || 0,
          interacciones || 0, comentarios || 0, mensajes || 0, zona || ''
        ]]
      }
    });

    const updatedRange = appendRes.data.updates?.updatedRange || '';
    const rowMatch = updatedRange.match(/\d+/);
    const rowIndex = rowMatch ? parseInt(rowMatch[0]) : 0;

    invalidateCache();
    res.status(201).json({ message: 'Fila agregada correctamente.', rowIndex });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:rowIndex', authenticate, async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const rowIndex = parseInt(req.params.rowIndex);
    if (isNaN(rowIndex) || rowIndex < 2) {
      return res.status(400).json({ error: 'Índice de fila inválido.' });
    }

    const { fecha, grupo, publicaciones, visualizaciones, interacciones, comentarios, mensajes, zona } = req.body;

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: TARGET_SHEET + '!A' + rowIndex + ':H' + rowIndex,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[
          fecha || '', grupo || '', publicaciones || 0, visualizaciones || 0,
          interacciones || 0, comentarios || 0, mensajes || 0, zona || ''
        ]]
      }
    });

    invalidateCache();
    res.json({ message: 'Fila actualizada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:rowIndex', authenticate, async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const rowIndex = parseInt(req.params.rowIndex);
    if (isNaN(rowIndex) || rowIndex < 2) {
      return res.status(400).json({ error: 'Índice de fila inválido.' });
    }

    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
    const sheet = meta.data.sheets.find(sh => sh.properties.title === TARGET_SHEET);
    const sheetId = sheet ? sheet.properties.sheetId : 0;

    await s.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex }
          }
        }]
      }
    });

    invalidateCache();
    res.json({ message: 'Fila eliminada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
