const express = require('express');
const { sheets, count, sheetError, mutation, setupSheet, revision, validateFields, validateRow } = require('../services/sheets');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
router.use(authenticate, mutation);
router.use(validateFields(["fechaActualizacion","grupo","fechaPublicacion"], ["fechaActualizacion","grupo","fechaPublicacion","zona"], ["fechaActualizacion","fechaPublicacion"], ["publicaciones","visualizaciones","interacciones","comentarios","mensajes"]));
validateRow(router, 'Historial', 'J');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Historial';



let cache = null;
let cacheRevision = -1;
let cacheTime = 0;
const CACHE_TTL = 60000;

function invalidateCache() { cache = null; cacheTime = 0; }

function ensureSheet() { return setupSheet(SHEET_NAME, initializeSheet); }

async function initializeSheet() {
  const s = sheets();
  if (!s) throw new Error('Google Sheets no configurado.');
  const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
  const exists = meta.data.sheets.some(sh => sh.properties.title === SHEET_NAME);
  if (exists) return s;
  await s.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: {
      requests: [{
        addSheet: { properties: { title: SHEET_NAME } }
      }]
    }
  });
  await s.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A1:J1',
    valueInputOption: 'RAW',
    resource: {
      values: [['FechaActualizacion', 'FilaOrigen', 'Grupo', 'FechaPublicacion', 'Zona', 'Publicaciones', 'Visualizaciones', 'Interacciones', 'Comentarios', 'Mensajes']]
    }
  });
  return s;
}

router.get('/', requirePermission(["view_dashboard","view_zonas","view_grupos"]), async (req, res) => {
  try {
    const readRevision = revision();
    if (cacheRevision === readRevision && cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    await ensureSheet();

    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:J', valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
    });

    const rows = result.data.values || [];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      data.push({
        rowIndex: i + 1,
        fechaActualizacion: String(row[0] ?? '').trim(),
        filaOrigen: count(row[1]) ?? 0,
        grupo: String(row[2] ?? '').trim(),
        fechaPublicacion: String(row[3] ?? '').trim(),
        zona: String(row[4] ?? '').trim(),
        publicaciones: count(row[5]) ?? 0,
        visualizaciones: count(row[6]) ?? 0,
        interacciones: count(row[7]) ?? 0,
        comentarios: count(row[8]) ?? 0,
        mensajes: count(row[9]) ?? 0
      });
    }
    cacheRevision = readRevision;
    cache = data;
    cacheTime = Date.now();
    res.json({ data });
  } catch (err) {
    if (cache && cacheRevision === revision() && Date.now() - cacheTime < 300000) return res.json({ data: cache, stale: true, warning: 'Datos guardados: no se pudo actualizar Google Sheets.' });
    sheetError(res, err);
  }
});

router.post('/', requirePermission('edit_marketing'), async (req, res) => {
  try {
    if (!Number.isSafeInteger(Number(req.body.filaOrigen)) || Number(req.body.filaOrigen) < 2) {
      return res.status(400).json({ error: 'Fila de origen inválida.' });
    }
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    await ensureSheet();

    const { fechaActualizacion, filaOrigen, grupo, fechaPublicacion, zona, publicaciones, visualizaciones, interacciones, comentarios, mensajes } = req.body;

    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:J',
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[
          fechaActualizacion || '', filaOrigen || 0, grupo || '', fechaPublicacion || '',
          zona || '', publicaciones || 0, visualizaciones || 0, interacciones || 0,
          comentarios || 0, mensajes || 0
        ]]
      }
    });

    invalidateCache();
    res.status(201).json({ message: 'Historial guardado.' });
  } catch (err) {
    sheetError(res, err);
  }
});

module.exports = router;
