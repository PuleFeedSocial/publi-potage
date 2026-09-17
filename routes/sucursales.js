const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Sucursales';

const EMPRESAS = ['Pluma Blanca SRL', 'Potage SRL', 'El Triángulo S.A', 'La Sorpresa SRL'];
const HEADERS = ['Empresa', 'Ubicacion', 'Direccion', 'Contacto', 'Horario', 'Zona', 'Activo', 'Latitud', 'Longitud'];

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

async function ensureSheet() {
  const s = sheets();
  if (!s) throw new Error('Google Sheets no configurado.');
  const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
  let sheet = meta.data.sheets.find(sh => sh.properties.title === SHEET_NAME);
  if (!sheet) {
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
    });
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [HEADERS] }
    });
  } else {
    const existing = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!1:1'
    });
    const existingHeaders = (existing.data.values && existing.data.values[0]) || [];
    if (existingHeaders[0] !== HEADERS[0] || existingHeaders.length < HEADERS.length) {
      await s.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A1:I1',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [HEADERS] }
      });
    }
  }
  return s;
}

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60000;

function invalidateCache() { cache = null; cacheTime = 0; }

function rowToSucursal(row, i) {
  const activoRaw = (row[6] || '').trim().toUpperCase();
  return {
    rowIndex: i + 1,
    empresa: (row[0] || '').trim(),
    ubicacion: (row[1] || '').trim(),
    direccion: (row[2] || '').trim(),
    contacto: (row[3] || '').trim(),
    horario: (row[4] || '').trim(),
    zona: (row[5] || '').trim(),
    activo: activoRaw === 'FALSE' || activoRaw === '0' || activoRaw === 'INACTIVO' ? false : true,
    lat: (row[7] || '').trim() || null,
    lng: (row[8] || '').trim() || null
  };
}

router.get('/geocode', authenticate, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Falta el parámetro q.' });
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 6, 1), 20);
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=' + limit +
      '&addressdetails=1&accept-language=es&countrycodes=ar&q=' + encodeURIComponent(q);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    let resp;
    try {
      resp = await fetch(url, {
        headers: { 'User-Agent': 'publi-potage-app/1.0 (dashboard Potage; geocode interno)' },
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(t);
    }
    if (!resp.ok) return res.status(resp.status).json({ error: 'Nominatim: HTTP ' + resp.status });
    const data = await resp.json();
    res.json({ data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }
    const s = await ensureSheet();

    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:I', valueRenderOption: 'FORMATTED_VALUE'
    });

    const rows = result.data.values || [];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] && !row[1]) continue;
      data.push(rowToSucursal(row, i));
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
    const s = await ensureSheet();
    const { empresa, ubicacion, direccion, contacto, horario, zona, activo, lat, lng } = req.body;
    if (!empresa) return res.status(400).json({ error: 'La empresa es obligatoria.' });
    if (!ubicacion) return res.status(400).json({ error: 'La ubicación es obligatoria.' });

    const activoValue = activo === false || activo === 'false' ? 'FALSE' : 'TRUE';
    const latV = lat === undefined || lat === null || lat === '' ? '' : String(lat);
    const lngV = lng === undefined || lng === null || lng === '' ? '' : String(lng);

    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:I',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      resource: { values: [[empresa, ubicacion, direccion || '', contacto || '', horario || '', zona || '', activoValue, latV, lngV]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Creación de sucursal', `Sucursal: ${ubicacion || ''} (${empresa || ''})`, req.ip);

    res.status(201).json({ message: 'Sucursal agregada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:rowIndex', authenticate, async (req, res) => {
  try {
    const s = await ensureSheet();
    const rowIndex = parseInt(req.params.rowIndex);
    if (isNaN(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });
    const { empresa, ubicacion, direccion, contacto, horario, zona, activo, lat, lng } = req.body;
    if (!empresa) return res.status(400).json({ error: 'La empresa es obligatoria.' });
    if (!ubicacion) return res.status(400).json({ error: 'La ubicación es obligatoria.' });

    const activoValue = activo === false || activo === 'false' ? 'FALSE' : 'TRUE';
    const latV = lat === undefined || lat === null || lat === '' ? '' : String(lat);
    const lngV = lng === undefined || lng === null || lng === '' ? '' : String(lng);

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + `!A${rowIndex}:I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[empresa, ubicacion, direccion || '', contacto || '', horario || '', zona || '', activoValue, latV, lngV]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Edición de sucursal', `Fila #${rowIndex}, Sucursal: ${ubicacion || ''}`, req.ip);

    res.json({ message: 'Sucursal actualizada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:rowIndex', authenticate, async (req, res) => {
  try {
    const s = await ensureSheet();
    const rowIndex = parseInt(req.params.rowIndex);
    if (isNaN(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });

    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
    const sheet = meta.data.sheets.find(sh => sh.properties.title === SHEET_NAME);
    if (!sheet) return res.status(404).json({ error: 'Hoja no encontrada.' });

    await s.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex }
          }
        }]
      }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Eliminación de sucursal', `Fila #${rowIndex} eliminada`, req.ip);

    res.json({ message: 'Sucursal eliminada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;