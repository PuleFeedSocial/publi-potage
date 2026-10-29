const express = require('express');
const { sheets, sheetError, mutation, validateRow } = require('../services/sheets');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
router.use(authenticate, mutation);
validateRow(router, 'Informes', 'ZZ');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Informes';

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
      valueInputOption: 'RAW',
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
      valueInputOption: 'RAW',
      resource: { values: [finalHeaders] }
    });
  }
  return { s, isNew: false, finalHeaders };
}

router.get('/', requirePermission(["view_informes"]), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
    if (!meta.data.sheets.some(sheet => sheet.properties.title === SHEET_NAME)) return res.json({ data: [], columns: [] });
    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:ZZ',
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
    });
    const rows = result.data.values || [];
    if (rows.length < 2) return res.json({ data: [], columns: rows[0] || [] });
    const headers = rows[0];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] === '__DELETED__' || !row.some(c => c !== '' && c != null)) continue;
      const obj = { rowIndex: i + 1 };
      headers.forEach((h, j) => { if (!['__proto__', 'prototype', 'constructor', 'rowIndex'].includes(h)) obj[h] = String(row[j] ?? '').trim(); });
      data.push(obj);
    }
    res.json({ data, columns: headers });
  } catch (err) {
    sheetError(res, err);
  }
});

router.post('/import', requirePermission('edit_informes'), async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data) || !data.length || data.length > 5000 || data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return res.status(400).json({ error: 'No hay datos para importar.' });
    if (data.some(row => Object.values(row).some(value => value != null && (typeof value === 'object' || String(value).length > 50000)))) {
      return res.status(400).json({ error: 'El informe contiene celdas inválidas o demasiado largas.' });
    }
    const headers = [...new Set(data.flatMap(row => Object.keys(row)))];
    if (headers.length > 702 || headers.some(h => !h.trim() || ['__proto__', 'prototype', 'constructor', 'rowIndex'].includes(h))) return res.status(400).json({ error: 'Columnas inválidas.' });
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
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      resource: { values }
    });

    logAction(req.user.id, req.user.email, 'Importación de CSV', `${values.length} filas importadas a Informes`, req.ip);

    res.status(201).json({ message: values.length + ' filas importadas correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

router.delete('/:rowIndex', requirePermission('edit_informes'), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });
    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
    const sheet = meta.data.sheets.find(sh => sh.properties.title === SHEET_NAME);
    if (!sheet) return res.status(404).json({ error: 'Hoja no encontrada.' });
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A' + rowIndex,
      valueInputOption: 'RAW',
      resource: { values: [['__DELETED__', ...Array(Math.max(0, req.sheetRow.length - 1)).fill('')]] }
    });

    logAction(req.user.id, req.user.email, 'Eliminación en Informes', `Fila #${rowIndex} eliminada`, req.ip);

    res.json({ message: 'Fila eliminada correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

module.exports = router;
