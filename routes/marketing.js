const express = require('express');
const { sheets, count, sheetError, mutation, revision, validateFields, validateRow } = require('../services/sheets');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
router.use(authenticate, mutation);
router.use(validateFields(["fecha","grupo"], ["fecha","grupo","zona","estatus"], ["fecha"], ["publicaciones","visualizaciones","interacciones","comentarios","mensajes"]));
validateRow(router, 'Metricas', 'J');
const { logAction } = require('./logs');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TARGET_SHEET = 'Metricas';
const GROUPS_SHEET = 'Grupos';

function groupRowIndex(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 2 ? n : null;
}

function groupKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u200b-\u200d\ufeff]/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function readGroups() {
  const s = sheets();
  if (!s) return [];
  try {
    const result = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: GROUPS_SHEET + '!A:E',
      valueRenderOption: 'FORMATTED_VALUE'
    });
    return (result.data.values || []).slice(1).map((row, i) => ({
      rowIndex: i + 2,
      nombre: String(row[0] || '').trim(),
      enlace: String(row[1] || '').trim(),
      zona: String(row[2] || '').trim()
    })).filter(group => group.nombre && group.nombre !== '__DELETED__');
  } catch {
    // Métricas sigue siendo legible aunque el catálogo de grupos no esté disponible.
    return [];
  }
}

// Las publicaciones anteriores a la columna GrupoFila no guardan el ID del grupo.
// Solo se completan cuando hay un único grupo posible con ese nombre y sucursal.
// Si hay grupos homónimos no se adivina: la publicación queda sin ID para que se
// muestre al filtrar por nombre en cualquiera de ellos, en lugar de adjudicarla
// arbitrariamente a uno solo.
function legacyGroupRow(groups, nombre, zona) {
  const name = groupKey(nombre);
  const zone = groupKey(zona);
  if (!name) return null;
  const byName = groups.filter(group => groupKey(group.nombre) === name);
  const candidates = byName.filter(group => !zone || !group.zona || groupKey(group.zona) === zone);
  const matching = [...new Set((candidates.length ? candidates : byName).map(group => group.rowIndex))];
  return matching.length === 1 ? matching[0] : null;
}

let cache = null;
let cacheRevision = -1;
let cacheTime = 0;
const CACHE_TTL = 60000;

function invalidateCache() {
  cache = null;
  cacheTime = 0;
}

async function readMarketingData() {
  const s = sheets();
  if (!s) throw new Error('Google Sheets no configurado.');

  const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [] });
  const sheet = meta.data.sheets.find(sh => sh.properties.title === TARGET_SHEET);
  if (!sheet) throw new Error('Hoja "' + TARGET_SHEET + '" no encontrada.');

  const [result, groups] = await Promise.all([
    s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: TARGET_SHEET + '!A:J',
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
    }),
    readGroups()
  ]);

  const rows = result.data.values || [];
  const headerIdx = rows.findIndex(r => r[0] === 'Fecha');
  if (headerIdx === -1) throw Object.assign(new Error('La hoja Métricas no tiene el formato esperado.'), { status: 409 });

  const data = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    if (!row[0] || row[0] === '__DELETED__') continue;
    const grupo = String(row[1] ?? '').trim();
    const zona = String(row[7] ?? '').trim();
    data.push({
      rowIndex: rowNumber,
      fecha: String(row[0] ?? '').trim(),
      grupo,
      publicaciones: count(row[2]) ?? 0,
      visualizaciones: count(row[3]) ?? 0,
      interacciones: count(row[4]) ?? 0,
      comentarios: count(row[5]) ?? 0,
      mensajes: count(row[6]) ?? 0,
      zona,
      estatus: (row[8] || 'SIN DEFINIR').trim(),
      grupoFila: groupRowIndex(row[9]) || legacyGroupRow(groups, grupo, zona)
    });
  }
  return data;
}

router.get('/', requirePermission(["view_dashboard","view_grupos","view_zonas","view_informes"]), async (req, res) => {
  try {
    const readRevision = revision();
    if (cacheRevision === readRevision && cache && Date.now() - cacheTime < CACHE_TTL && req.query.refresh !== 'true') {
      return res.json({ data: cache });
    }

    const data = await readMarketingData();
    cacheRevision = readRevision;
    cache = data;
    cacheTime = Date.now();
    res.json({ data });
  } catch (err) {
    if (cache && cacheRevision === revision() && Date.now() - cacheTime < 300000) return res.json({ data: cache, stale: true, warning: 'Datos guardados: no se pudo actualizar Google Sheets.' });
    sheetError(res, err);
  }
});

router.get('/refresh', requirePermission('sync_marketing'), async (req, res) => {
  invalidateCache();
  res.json({ message: 'Caché de marketing limpiado.' });
});

router.post('/', requirePermission('edit_marketing'), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const { fecha, grupo, publicaciones, visualizaciones, interacciones, comentarios, mensajes, zona, estatus, grupoFila } = req.body;
    const filaGrupo = grupoFila == null || grupoFila === '' ? '' : groupRowIndex(grupoFila);
    if (filaGrupo === null) return res.status(400).json({ error: 'Grupo inválido: grupoFila' });

    const appendRes = await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: TARGET_SHEET + '!A:J',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [[
          fecha || '', grupo || '', publicaciones || 0, visualizaciones || 0,
          interacciones || 0, comentarios || 0, mensajes || 0, zona || '', estatus || 'SIN DEFINIR', filaGrupo
        ]]
      }
    });

    const updatedRange = appendRes.data.updates?.updatedRange || '';
    const rowMatch = updatedRange.match(/!\$?[A-Z]+\$?(\d+)/i);
    const rowIndex = rowMatch ? Number(rowMatch[1]) : 0;

    invalidateCache();

    logAction(req.user.id, req.user.email, 'Creación de publicación', `Grupo: ${grupo || ''}, Fecha: ${fecha || ''}`, req.ip);

    res.status(201).json({ message: 'Fila agregada correctamente.', rowIndex });
  } catch (err) {
    sheetError(res, err);
  }
});

router.put('/:rowIndex', requirePermission('edit_marketing'), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 2) {
      return res.status(400).json({ error: 'Índice de fila inválido.' });
    }

    const { fecha, grupo, publicaciones, visualizaciones, interacciones, comentarios, mensajes, zona, estatus, grupoFila } = req.body;
    const filaGrupo = grupoFila == null || grupoFila === '' ? '' : groupRowIndex(grupoFila);
    if (filaGrupo === null) return res.status(400).json({ error: 'Grupo inválido: grupoFila' });

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: TARGET_SHEET + '!A' + rowIndex + ':J' + rowIndex,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          fecha || '', grupo || '', publicaciones || 0, visualizaciones || 0,
          interacciones || 0, comentarios || 0, mensajes || 0, zona || '', estatus || 'SIN DEFINIR', filaGrupo
        ]]
      }
    });

    invalidateCache();

    logAction(req.user.id, req.user.email, 'Edición de publicación', `Fila #${rowIndex}, Grupo: ${grupo || ''}`, req.ip);

    res.json({ message: 'Fila actualizada correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

router.delete('/:rowIndex', requirePermission('edit_marketing'), async (req, res) => {
  try {
    const s = sheets();
    if (!s) return res.status(503).json({ error: 'Google Sheets no configurado.' });

    const rowIndex = Number(req.params.rowIndex);
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 2) {
      return res.status(400).json({ error: 'Índice de fila inválido.' });
    }

    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: TARGET_SHEET + '!A' + rowIndex + ':J' + rowIndex,
      valueInputOption: 'RAW',
      resource: { values: [['__DELETED__', '', '', '', '', '', '', '', '', '']] }
    });

    invalidateCache();

    logAction(req.user.id, req.user.email, 'Eliminación de publicación', `Fila #${rowIndex} eliminada`, req.ip);

    res.json({ message: 'Fila eliminada correctamente.' });
  } catch (err) {
    sheetError(res, err);
  }
});

module.exports = router;
