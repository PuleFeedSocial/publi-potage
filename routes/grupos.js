const express = require('express');
const { sheets, count, sheetError, mutation, revision, validateFields, validateRow } = require('../services/sheets');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
router.use(authenticate, mutation);
router.use(validateFields(["nombre"], ["nombre","enlace","zona","fechaIngreso"], ["fechaIngreso"], []));
validateRow(router, 'Grupos', 'E');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Grupos';



let cache = null;
let cacheRevision = -1;
let cacheTime = 0;
const CACHE_TTL = 60000;

function invalidateCache() { cache = null; cacheTime = 0; }

router.get('/', requirePermission(["view_grupos","view_dashboard","view_zonas"]), async (req, res) => {
  try {
    const readRevision = revision();
    if (cacheRevision === readRevision && cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:E', valueRenderOption: 'FORMATTED_VALUE'
    });

    const rows = result.data.values || [];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || row[0] === '__DELETED__') continue;
      const activoRaw = (row[4] || '').trim().toUpperCase();
      data.push({
        rowIndex: i + 1,
        nombre: (row[0] || '').trim(),
        enlace: (row[1] || '').trim(),
        zona: (row[2] || '').trim(),
        fechaIngreso: (row[3] || '').trim(),
        activo: activoRaw === 'FALSE' || activoRaw === '0' || activoRaw === 'INACTIVO' ? false : true
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

router.post('/', requirePermission('edit_grupos'), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    const { nombre, enlace, zona, fechaIngreso, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre del grupo es obligatorio.' });

    const activoValue = activo === false || activo === 'false' ? 'FALSE' : 'TRUE';

    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A:E',
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      resource: { values: [[nombre, enlace || '', zona || '', fechaIngreso || '', activoValue]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Creación de grupo', `Grupo: ${nombre || ''}`, req.ip);

    res.status(201).json({ message: 'Grupo agregado correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

router.put('/:rowIndex', requirePermission('edit_grupos'), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });
    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });
    const { nombre, enlace, zona, fechaIngreso, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre del grupo es obligatorio.' });

    const activoValue = activo === false || activo === 'false' ? 'FALSE' : 'TRUE';

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + `!A${rowIndex}:E${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[nombre, enlace || '', zona || '', fechaIngreso || '', activoValue]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Edición de grupo', `Fila #${rowIndex}, Grupo: ${nombre || ''}`, req.ip);

    res.json({ message: 'Grupo actualizado correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

router.delete('/:rowIndex', requirePermission('edit_grupos'), async (req, res) => {
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
      resource: { values: [['__DELETED__', ...Array(5 - 1).fill('')]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Eliminación de grupo', `Fila #${rowIndex} eliminada`, req.ip);

    res.json({ message: 'Grupo eliminado correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

module.exports = router;
