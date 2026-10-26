const express = require('express');
const router = express.Router();
const getDb = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');
const branches = require('../services/product-branches');

// Links are explicit: marketing names remain the historical keys in Sheets.
async function resolveLink(body, current = {}) {
  if (!Object.hasOwn(body, 'sucursal_id')) return [current.sucursal_id || null, current.sucursal_nombre || null];
  const id = body.sucursal_id;
  if (id === null || id === '') return [null, null];
  if (typeof id !== 'string' || !/^SUC-[a-f0-9]{24}$/.test(id)) throw Object.assign(new Error('Sucursal inválida.'), {status:400});
  if (id === current.sucursal_id) return [id, current.sucursal_nombre];
  let directory;
  try { directory = await branches.read(); }
  catch { throw Object.assign(new Error('No se pudo verificar el catálogo de sucursales. Reintentá antes de vincular.'), {status:503}); }
  const matches = directory.filter(b => b.id === id);
  if (matches.length !== 1) throw Object.assign(new Error('La sucursal no existe o está duplicada en el catálogo.'), {status:409});
  const b = matches[0];
  return [id, [b.empresa,b.ubicacion,b.direccion].filter(Boolean).join(' · ')];
}

router.get('/sucursales', authenticate, requirePermission('edit_zonas'), async (req,res) => {
  try { res.json({data:await branches.read()}); }
  catch { res.status(503).json({error:'No se pudo cargar el catálogo. Las asociaciones existentes se conservan.'}); }
});

router.get('/', authenticate, requirePermission(['view_zonas', 'view_dashboard', 'view_grupos', 'view_sucursales']), async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT id, nombre, activo, created_at, sucursal_id, sucursal_nombre FROM zonas ORDER BY nombre ASC');
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requirePermission('edit_zonas'), async (req, res) => {
  try {
    const db = await getDb();
    const { nombre } = req.body;
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120) return res.status(400).json({ error: 'El nombre de la sucursal de redes es obligatorio.' });
    const [branchId,branchName] = await resolveLink(req.body);
    await db.run('INSERT INTO zonas (nombre, sucursal_id, sucursal_nombre) VALUES (?, ?, ?)', [nombre.trim(),branchId,branchName]);
    res.status(201).json({ message: 'Sucursal de redes agregada correctamente.' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese nombre o sucursal ya está registrado en redes.' });
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se pudo crear la sucursal de redes.' });
  }
});

router.delete('/:id', authenticate, requirePermission('edit_zonas'), async (req, res) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });
    await db.run('DELETE FROM zonas WHERE id = ?', [id]);
    res.json({ message: 'Sucursal de redes eliminada.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requirePermission('edit_zonas'), async (req, res) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre || nombre.length > 120) return res.status(400).json({ error: 'El nombre debe tener entre 1 y 120 caracteres.' });
    const current = await db.get('SELECT nombre, sucursal_id, sucursal_nombre FROM zonas WHERE id = ?', [id]);
    if (!current) return res.status(404).json({error:'Registro no encontrado.'});
    if (nombre !== current.nombre) return res.status(409).json({error:'El nombre histórico no puede cambiarse: vincular una sucursal conserva las publicaciones y grupos existentes.'});
    const [branchId,branchName] = await resolveLink(req.body,current);
    const activo = req.body.activo === false || req.body.activo === 'false' ? false : true;
    try {
      await db.run('UPDATE zonas SET activo = ?, sucursal_id = ?, sucursal_nombre = ? WHERE id = ?', [activo, branchId, branchName, id]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Esa sucursal ya está vinculada a otro registro de redes.' });
      throw err;
    }
    res.json({ message: 'Sucursal de redes actualizada correctamente.' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'No se pudo guardar la asociación.' });
  }
});

module.exports = router;
