const express = require('express');
const { sheets, count, sheetError, mutation, setupSheet, revision, validateFields, validateRow } = require('../services/sheets');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
router.use(authenticate, mutation);
router.use(validateFields(["empresa","ubicacion"], ["empresa","ubicacion","direccion","contacto","horario","zona"], [], []));
validateRow(router, 'Sucursales', 'I');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Sucursales';

const EMPRESAS = ['Pluma Blanca SRL', 'Potage SRL', 'El Triángulo S.A', 'La Sorpresa SRL'];
const HEADERS = ['Empresa', 'Ubicacion', 'Direccion', 'Contacto', 'Horario', 'Zona', 'Activo', 'Latitud', 'Longitud'];



function ensureSheet() { return setupSheet(SHEET_NAME, initializeSheet); }

async function initializeSheet() {
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
      resource: { values: [HEADERS] }
    });
  } else {
    const existing = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!1:1'
    });
    const existingHeaders = (existing.data.values && existing.data.values[0]) || [];
    if (existingHeaders.some((header, index) => index < HEADERS.length && header !== HEADERS[index])) {
      throw Object.assign(new Error('Las columnas de Sucursales no tienen el formato esperado.'), { status: 409 });
    }
    if (existingHeaders.length < HEADERS.length) {
      await s.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A1:I1',
        valueInputOption: 'RAW',
        resource: { values: [HEADERS] }
      });
    }
  }
  return s;
}

let cache = null;
let cacheRevision = -1;
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

router.get('/', requirePermission(["view_sucursales"]), async (req, res) => {
  try {
    const readRevision = revision();
    if (cacheRevision === readRevision && cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
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
      if ((!row[0] && !row[1]) || row[0] === '__DELETED__') continue;
      data.push(rowToSucursal(row, i));
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

router.post('/', requirePermission('edit_sucursales'), async (req, res) => {
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
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      resource: { values: [[empresa, ubicacion, direccion || '', contacto || '', horario || '', zona || '', activoValue, latV, lngV]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Creación de sucursal', `Sucursal: ${ubicacion || ''} (${empresa || ''})`, req.ip);

    res.status(201).json({ message: 'Sucursal agregada correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

router.put('/:rowIndex', requirePermission('edit_sucursales'), async (req, res) => {
  try {
    const s = await ensureSheet();
    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });
    const { empresa, ubicacion, direccion, contacto, horario, zona, activo, lat, lng } = req.body;
    if (!empresa) return res.status(400).json({ error: 'La empresa es obligatoria.' });
    if (!ubicacion) return res.status(400).json({ error: 'La ubicación es obligatoria.' });

    const activoValue = activo === false || activo === 'false' ? 'FALSE' : 'TRUE';
    const latV = lat === undefined || lat === null || lat === '' ? '' : String(lat);
    const lngV = lng === undefined || lng === null || lng === '' ? '' : String(lng);

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + `!A${rowIndex}:I${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[empresa, ubicacion, direccion || '', contacto || '', horario || '', zona || '', activoValue, latV, lngV]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Edición de sucursal', `Fila #${rowIndex}, Sucursal: ${ubicacion || ''}`, req.ip);

    res.json({ message: 'Sucursal actualizada correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

router.delete('/:rowIndex', requirePermission('edit_sucursales'), async (req, res) => {
  try {
    const s = await ensureSheet();
    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 2) return res.status(400).json({ error: 'Índice inválido.' });

    const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
    const sheet = meta.data.sheets.find(sh => sh.properties.title === SHEET_NAME);
    if (!sheet) return res.status(404).json({ error: 'Hoja no encontrada.' });

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: SHEET_NAME + '!A' + rowIndex,
      valueInputOption: 'RAW',
      resource: { values: [['__DELETED__', ...Array(9 - 1).fill('')]] }
    });
    invalidateCache();

    logAction(req.user.id, req.user.email, 'Eliminación de sucursal', `Fila #${rowIndex} eliminada`, req.ip);

    res.json({ message: 'Sucursal eliminada correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

module.exports = router;
