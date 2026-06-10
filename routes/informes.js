const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Informes';

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

async function ensureSheet(headers) {
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
      resource: { values: [headers] }
    });
    return { s, isNew: true, finalHeaders: headers };
  }
  const existing = await s.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: SHEET_NAME + '!1:1'
  });
  const existingHeaders = (existing.data.values && existing.data.values[0]) || [];
  const newCols = headers.filter(h => !existingHeaders.includes(h));
  let finalHeaders = existingHeaders;
  if (newCols.length > 0) {
    finalHeaders = [...existingHeaders, ...newCols];
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!1:1',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [finalHeaders] }
    });
  }
  return { s, isNew: false, finalHeaders };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    try {
      await s.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A1',
        valueRenderOption: 'FORMATTED_VALUE'
      });
    } catch {
      return res.json({ data: [], columns: [] });
    }
    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:ZZ',
      valueRenderOption: 'FORMATTED_VALUE'
    });
    const rows = result.data.values || [];
    if (rows.length < 2) return res.json({ data: [], columns: rows[0] || [] });
    const headers = rows[0];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row.some(c => c)) continue;
      const obj = { rowIndex: i + 1 };
      headers.forEach((h, j) => { obj[h] = (row[j] || '').toString().trim(); });
      data.push(obj);
    }
    res.json({ data, columns: headers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', authenticate, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.length) return res.status(400).json({ error: 'No hay datos para importar.' });
    const headers = Object.keys(data[0]);
    const { s, finalHeaders } = await ensureSheet(headers);
    const values = data.map(row =>
      finalHeaders.map(h => {
        const v = row[h];
        if (v === undefined || v === null || v === '') return '';
        return String(v).trim();
      })
    );
    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A1',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      resource: { values }
    });

    logAction(req.user.id, req.user.email, 'Importación de CSV', `${values.length} filas importadas a Informes`, req.ip);

    res.status(201).json({ message: `${values.length} filas importadas correctamente.` });
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

    logAction(req.user.id, req.user.email, 'Eliminación en Informes', `Fila #${rowIndex} eliminada`, req.ip);

    res.json({ message: 'Fila eliminada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
