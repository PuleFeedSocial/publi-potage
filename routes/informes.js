const express = require('express');
const { sheets, count, sheetError, mutation, revision, validateRow } = require('../services/sheets');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
router.use(authenticate, mutation);
validateRow(router, 'Informes', 'ZZ');
const { dateKey } = require('../services/validation');
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

    res.status(201).json({ message: `${values.length} filas importadas correctamente.` });
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
    const { columnMapping } = req.body;
    if (!columnMapping || !columnMapping.grupo || !columnMapping.fecha) {
      return res.status(400).json({ error: 'Mapeo incompleto. Grupo y Fecha son obligatorios.' });
    }

    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    // Read Metricas sheet
    const metricasResult = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Metricas!A:I',
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
    });
    const metricasRows = metricasResult.data.values || [];
    const headerIdx = metricasRows.findIndex(r => r[0] === 'Fecha');
    if (headerIdx === -1) {
      return res.status(400).json({ error: 'La hoja Métricas no tiene el formato esperado.' });
    }

    const norm = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const weekAgo = new Date(today + 'T00:00:00Z');
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
    function isWithinLast7Days(value) {
      const key = dateKey(value);
      return key && key >= weekAgo.toISOString().slice(0, 10) && key <= today;
    }

    // Build lookup keyed by (grupo|fecha) — store under both exact and normalized key
    const metricasMap = Object.create(null);
    const ambiguous = new Set();
    const pending = new Map();
    const metricasKeys = [];
    for (let i = headerIdx + 1; i < metricasRows.length; i++) {
      const row = metricasRows[i];
      if (!row[0] || row[0] === '__DELETED__') continue;
      const grupo = String(row[1] ?? '').trim();
      const fecha = String(row[0] ?? '').trim();
      if (!grupo || !fecha) continue;
      const exact = grupo.toLowerCase() + '|' + dateKey(fecha);
      const normalized = norm(grupo) + '|' + dateKey(fecha);
      const entry = {
        rowIndex: i + 1,
        visualizaciones: count(row[3]) ?? 0,
        interacciones: count(row[4]) ?? 0,
        comentarios: count(row[5]) ?? 0
      };
      if (metricasMap[exact]) ambiguous.add(exact);
      if (metricasMap[normalized]) ambiguous.add(normalized);
      metricasMap[exact] = entry;
      if (normalized !== exact) metricasMap[normalized] = entry;
      metricasKeys.push(exact);
    }

    // Read Informes sheet
    const informesResult = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Informes!A:ZZ',
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
    });
    const rows = informesResult.data.values || [];
    if (rows.length < 2) {
      return res.json({ total: 0, actualizados: 0, sinMatch: 0, mensaje: 'No hay datos en Informes.' });
    }
    const headers = rows[0];

    // Resolve column indices from mapping
    const colIdx = {
      grupo: headers.indexOf(columnMapping.grupo),
      fecha: headers.indexOf(columnMapping.fecha),
      visualizaciones: headers.indexOf(columnMapping.visualizaciones),
      interacciones: headers.indexOf(columnMapping.interacciones),
      comentarios: headers.indexOf(columnMapping.comentarios)
    };
    if (colIdx.grupo === -1 || colIdx.fecha === -1) {
      return res.status(400).json({ error: 'Las columnas mapeadas no existen en Informes.' });
    }

    let actualizados = 0;
    let sinMatch = 0;
    let yaActualizados = 0;
    let fueraRango = 0;
    const detalles = [];
    const sinMatchEjemplos = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row[0] === '__DELETED__' || !row.some(c => c !== '' && c != null)) continue;

      const grupo = String(row[colIdx.grupo] ?? '').trim();
      const fecha = String(row[colIdx.fecha] ?? '').trim();
      if (!grupo || !fecha) { sinMatch++; continue; }

      // Solo procesar filas de los últimos 7 días (si la fecha se puede parsear)
      const enRango = isWithinLast7Days(fecha);
      if (!enRango) { fueraRango++; continue; }

      // Try exact, then normalized
      const exactKey = grupo.toLowerCase() + '|' + dateKey(fecha);
      const normKey = norm(grupo) + '|' + dateKey(fecha);
      let match = ambiguous.has(exactKey) ? null : metricasMap[exactKey];
      if (!match && !ambiguous.has(normKey)) match = metricasMap[normKey];

      if (!match) {
        sinMatch++;
        if (sinMatchEjemplos.length < 10) sinMatchEjemplos.push({ grupo, fecha });
        continue;
      }

      // Compare numeric fields
      const fieldMappings = [
        { col: colIdx.visualizaciones, field: 'visualizaciones', colNum: 3 },
        { col: colIdx.interacciones, field: 'interacciones', colNum: 4 },
        { col: colIdx.comentarios, field: 'comentarios', colNum: 5 }
      ];

      const updates = {};
      fieldMappings.forEach(fm => {
        if (fm.col === -1) return;
        const csvVal = count(row[fm.col]);
        if (csvVal === null) return;
        if (csvVal > match[fm.field]) {
          updates[fm.field] = { value: csvVal, colNum: fm.colNum };
        }
      });

      if (Object.keys(updates).length === 0) {
        let allEqual = true;
        fieldMappings.forEach(fm => {
          if (fm.col === -1) return;
          const csvVal = count(row[fm.col]);
          if (csvVal !== match[fm.field]) allEqual = false;
        });
        if (allEqual) yaActualizados++;
        continue;
      }

      // Update the Metricas row
      const rowIndex = match.rowIndex;
      Object.entries(updates).forEach(([field, update]) => {
        const range = 'Metricas!' + String.fromCharCode(65 + update.colNum) + rowIndex;
        pending.set(range, { range, values: [[update.value]] });
        match[field] = update.value;
      });

      actualizados++;
      detalles.push({ grupo, fecha, ...Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, v.value])) });
    }

    if (pending.size) await s.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID, resource: { valueInputOption: 'RAW', data: [...pending.values()] }
    });

    logAction(req.user.id, req.user.email, 'Sincronización Informes → Métricas', actualizados + ' filas actualizadas, ' + sinMatch + ' sin coincidencia', req.ip);

    res.json({
      total: rows.length - 1,
      actualizados,
      sinMatch,
      yaActualizados,
      fueraRango,
      detalles,
      sinMatchEjemplos,
      metricasKeysMuestra: metricasKeys.slice(0, 10)
    });
  } catch (err) {
    console.error('Sync error:', err);
    sheetError(res, err);
  }
});

module.exports = router;
