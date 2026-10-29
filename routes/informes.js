const express = require('express');
const { sheets, sheetError, mutation, validateRow } = require('../services/sheets');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
router.use(authenticate, mutation);
validateRow(router, 'Informes', 'ZZ');
const { planSync, validateMapping } = require('../services/informes-sync');
const getDb = require('../database');
const { hasPermission } = require('../permissions');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Informes';

async function syncReports(s, reports, mapping, importedBatch, dateFormat) {
  const response = await s.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: 'Metricas!A:I',
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
  });
  const { data, summary } = planSync(response.data.values || [], reports, mapping, { importedBatch, dateFormat });
  if (data.length) await s.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID, resource: { valueInputOption: 'RAW', data }
  });
  return summary;
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
    if (req.body.columnMapping !== undefined) {
      try { validateMapping(headers, req.body.columnMapping); }
      catch (err) { return res.status(400).json({ error: err.message }); }
    }
    if (req.body.dateFormat !== undefined && !['auto', 'dmy', 'mdy'].includes(req.body.dateFormat)) return res.status(400).json({ error: 'Formato de fecha inválido.' });
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

    // Un fallo de sincronización no debe invitar a importar otra vez las mismas filas.
    let sincronizacion;
    try {
      const allowed = req.user.role.toLowerCase() === 'admin' || await hasPermission(await getDb(), req.user.role, 'sync_informes');
      sincronizacion = allowed
        ? await syncReports(s, data, req.body.columnMapping, true, req.body.dateFormat)
        : { omitida: true, motivo: 'El informe se guardó. Tu rol no tiene permiso para actualizar Publicaciones.' };
    } catch (err) {
      console.error('Sincronización del CSV importado:', err);
      sincronizacion = { error: true, motivo: 'El informe se guardó, pero no se pudo actualizar Publicaciones. Usá Reintentar sincronización; no vuelvas a importar el CSV.' };
    }
    logAction(req.user.id, req.user.email, 'CSV → Publicaciones', JSON.stringify(sincronizacion), req.ip);
    res.status(201).json({ message: values.length + ' filas importadas correctamente.', sincronizacion });
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

router.post('/sync', requirePermission('sync_informes'), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    const response = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Informes!A:ZZ',
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
    });
    const rows = response.data.values || [];
    const headers = rows[0] || [];
    const reports = rows.slice(1).filter(row => row[0] !== '__DELETED__' && row.some(cell => cell !== '' && cell != null))
      .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
    const summary = await syncReports(s, reports, req.body.columnMapping, false, req.body.dateFormat);
    logAction(req.user.id, req.user.email, 'Sincronización Informes → Métricas', summary.actualizados + ' publicaciones actualizadas', req.ip);
    return res.json(summary);
  } catch (err) {
    if (/columna de |Formato de fecha inválido|Mapeo inválido|formato esperado|Faltan Grupo/.test(err.message)) return res.status(400).json({ error: err.message });
    sheetError(res, err);
  }
});

module.exports = router;
