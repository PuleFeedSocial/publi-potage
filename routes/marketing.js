const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

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

let _sheetMeta = null;
async function getSheetName() {
  if (_sheetMeta) return _sheetMeta;
  const s = sheets();
  if (!s) return 'Sheet1';
  const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
  const name = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';
  _sheetMeta = name;
  return name;
}

async function range(r) {
  const name = await getSheetName();
  return name + '!' + r;
}

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60000;

function invalidateCache() {
  cache = null;
  cacheTime = 0;
  _sheetMeta = null;
}

router.get('/', authenticate, async (req, res) => {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }

    const s = sheets();
    if (!s) {
      if (cache) return res.json({ data: cache });
      return res.status(503).json({ error: 'Google Sheets no configurado.' });
    }

    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: await range('A:H'),
      valueRenderOption: 'FORMATTED_VALUE'
    });

    const rows = result.data.values || [];
    if (rows.length < 2) {
      cache = [];
      cacheTime = Date.now();
      return res.json({ data: [] });
    }

    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      data.push({
        rowIndex: i + 1,
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

    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: await range('A:H'),
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[
          fecha || '', grupo || '', publicaciones || 0, visualizaciones || 0,
          interacciones || 0, comentarios || 0, mensajes || 0, zona || ''
        ]]
      }
    });

    invalidateCache();
    res.status(201).json({ message: 'Fila agregada correctamente.' });
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
      range: await range(`A${rowIndex}:H${rowIndex}`),
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

    const name = await getSheetName();
    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
    const sheet = meta.data.sheets.find(sh => sh.properties.title === name);
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
