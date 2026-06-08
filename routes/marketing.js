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
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
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
  cache = null;
  cacheTime = 0;
  _sheetMeta = null;
  res.json({ message: 'Caché de marketing limpiado.' });
});

module.exports = router;
