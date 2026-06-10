const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Grupos';

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

router.get('/', authenticate, async (req, res) => {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:C', valueRenderOption: 'FORMATTED_VALUE'
    });

    const rows = result.data.values || [];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      data.push({
        rowIndex: i + 1,
        nombre: (row[0] || '').trim(),
        enlace: (row[1] || '').trim(),
        zona: (row[2] || '').trim()
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
    const { nombre, enlace, zona } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre del grupo es obligatorio.' });

    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:C',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      resource: { values: [[nombre, enlace || '', zona || '']] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Creación de grupo', `Grupo: ${nombre || ''}`, req.ip);

    res.status(201).json({ message: 'Grupo agregado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:rowIndex', authenticate, async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    const rowIndex = parseInt(req.params.rowIndex);
    if (isNaN(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });
    const { nombre, enlace, zona } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre del grupo es obligatorio.' });

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + `!A${rowIndex}:C${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[nombre, enlace || '', zona || '']] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Edición de grupo', `Fila #${rowIndex}, Grupo: ${nombre || ''}`, req.ip);

    res.json({ message: 'Grupo actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:rowIndex', authenticate, async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    const rowIndex = parseInt(req.params.rowIndex);
    if (isNaN(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });

    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
    const sheet = meta.data.sheets.find(sh => sh.properties.title === SHEET_NAME);
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

    logAction(req.user.id, req.user.email, 'Eliminación de grupo', `Fila #${rowIndex} eliminada`, req.ip);

    res.json({ message: 'Grupo eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
