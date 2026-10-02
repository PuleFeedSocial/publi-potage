const express = require('express');
const router = express.Router();
const getDb = require('../database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT id, nombre, activo, created_at FROM zonas ORDER BY nombre ASC');
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requirePermission('edit_zonas'), async (req, res) => {
  try {
    const db = await getDb();
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre de la zona es obligatorio.' });
    await db.run('INSERT INTO zonas (nombre) VALUES (?)', [nombre.trim()]);
    res.status(201).json({ message: 'Zona agregada correctamente.' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esa zona ya existe.' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requirePermission('edit_zonas'), async (req, res) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.run('DELETE FROM zonas WHERE id = ?', [id]);
    res.json({ message: 'Zona eliminada.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requirePermission('edit_zonas'), async (req, res) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre de la zona es obligatorio.' });
    const activo = req.body.activo === false || req.body.activo === 'false' ? false : true;
    try {
      await db.run('UPDATE zonas SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo, id]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Esa zona ya existe.' });
      throw err;
    }
    res.json({ message: 'Zona actualizada correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
