const express = require('express');
const router = express.Router();
const getDb = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const row = await db.get('SELECT title, message FROM announcements ORDER BY id DESC LIMIT 1');
    if (!row) return res.json({ title: '', message: '' });
    res.json({ title: row.title || '', message: row.message || '' });
  } catch (err) {
    console.error('GET /api/announcement error:', err);
    res.status(500).json({ error: 'Error al obtener anuncio.' });
  }
});

router.put('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, message } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM announcements LIMIT 1');
    if (existing) {
      await db.run('UPDATE announcements SET title = ?, message = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?', [title || '', message || '', req.user.id, existing.id]);
    } else {
      await db.run('INSERT INTO announcements (title, message, updated_by) VALUES (?, ?, ?)', [title || '', message || '', req.user.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/announcement error:', err);
    res.status(500).json({ error: 'Error al guardar anuncio.' });
  }
});

router.delete('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM announcements');
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/announcement error:', err);
    res.status(500).json({ error: 'Error al eliminar anuncio.' });
  }
});

module.exports = router;
