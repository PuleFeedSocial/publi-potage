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

router.post('/sync', authenticate, async (req, res) => {
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
      valueRenderOption: 'FORMATTED_VALUE'
    });
    const metricasRows = metricasResult.data.values || [];
    const headerIdx = metricasRows.findIndex(r => r[0] === 'Fecha');
    if (headerIdx === -1) {
      return res.status(400).json({ error: 'La hoja Métricas no tiene el formato esperado.' });
    }

    // Normalize a string for loose comparison (remove spaces, separators, case)
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Parse date from various formats, returns Date or null
    function parseFecha(str) {
      if (!str) return null;
      const s = str.trim();
      // ISO: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
      const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
      if (iso) {
        const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
        if (!isNaN(d.getTime())) return d;
      }
      // DD/MM/YYYY or MM/DD/YYYY
      const parts = s.split(/[/\-.]/);
      if (parts.length === 3) {
        const nums = parts.map(p => parseInt(p));
        if (nums[2] > 1900) {
          let d = new Date(nums[2], nums[1] - 1, nums[0]);
          if (!isNaN(d.getTime())) return d;
          d = new Date(nums[2], nums[0] - 1, nums[1]);
          if (!isNaN(d.getTime())) return d;
        }
      }
      // fallback
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }

    // Check if a date string falls within the last 7 days (inclusive)
    function isWithinLast7Days(dateStr) {
      const d = parseFecha(dateStr);
      if (!d) return false;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return d >= weekAgo && d <= today;
    }

    // Build lookup keyed by (grupo|fecha) — store under both exact and normalized key
    const metricasMap = {};
    const metricasKeys = [];
    for (let i = headerIdx + 1; i < metricasRows.length; i++) {
      const row = metricasRows[i];
      if (!row[0]) continue;
      const grupo = (row[1] || '').trim();
      const fecha = (row[0] || '').trim();
      if (!grupo || !fecha) continue;
      const exact = grupo.toLowerCase() + '|' + fecha.toLowerCase();
      const normalized = norm(grupo) + '|' + norm(fecha);
      const entry = {
        rowIndex: i + 1,
        visualizaciones: parseInt(row[3]) || 0,
        interacciones: parseInt(row[4]) || 0,
        comentarios: parseInt(row[5]) || 0
      };
      metricasMap[exact] = entry;
      if (normalized !== exact) metricasMap[normalized] = entry;
      metricasKeys.push(exact);
    }

    // Read Informes sheet
    const informesResult = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Informes!A:ZZ',
      valueRenderOption: 'FORMATTED_VALUE'
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
      if (!row || !row.some(c => c)) continue;

      const grupo = (row[colIdx.grupo] || '').trim();
      const fecha = (row[colIdx.fecha] || '').trim();
      if (!grupo || !fecha) { sinMatch++; continue; }

      // Solo procesar filas de los últimos 7 días
      if (!isWithinLast7Days(fecha)) { fueraRango++; continue; }

      // Try exact, then normalized
      const exactKey = grupo.toLowerCase() + '|' + fecha.toLowerCase();
      const normKey = norm(grupo) + '|' + norm(fecha);
      let match = metricasMap[exactKey] || metricasMap[normKey];

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
        const raw = (row[fm.col] || '').toString().replace(/[^0-9.,-]/g, '').replace(',', '.');
        const csvVal = parseFloat(raw) || 0;
        if (csvVal > match[fm.field]) {
          updates[fm.field] = { value: csvVal, colNum: fm.colNum };
        }
      });

      if (Object.keys(updates).length === 0) {
        let allEqual = true;
        fieldMappings.forEach(fm => {
          if (fm.col === -1) return;
          const raw = (row[fm.col] || '').toString().replace(/[^0-9]/g, '');
          const csvVal = parseInt(raw) || 0;
          if (csvVal !== match[fm.field]) allEqual = false;
        });
        if (allEqual) yaActualizados++;
        continue;
      }

      // Update the Metricas row
      const rowIndex = match.rowIndex;
      const currentRow = metricasRows[rowIndex - 1];
      const updatedRow = [...currentRow];
      while (updatedRow.length < 9) updatedRow.push('');

      Object.values(updates).forEach(u => {
        updatedRow[u.colNum] = String(u.value);
      });

      await s.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'Metricas!A' + rowIndex + ':I' + rowIndex,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [updatedRow] }
      });

      actualizados++;
      detalles.push({ grupo, fecha, ...Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, v.value])) });
    }

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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
