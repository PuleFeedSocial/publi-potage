const express = require('express');
const router = express.Router();
const getDb = require('../database');
const { authenticate } = require('../middleware/auth');
const { runCalendarReminders } = require('../services/notifications');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    await runCalendarReminders(db, req.user);
    const rows = await db.all(
      `SELECT id, type, title, message, link, icon, is_read, created_at
       FROM notifications
       WHERE user_id = ? AND is_dismissed = FALSE
       ORDER BY is_read ASC, created_at DESC, id DESC
       LIMIT 50`,
      [req.user.id]
    );
    const count = await db.get(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = ? AND is_dismissed = FALSE AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ data: rows, unread: count ? count.total : 0 });
  } catch (err) {
    console.error('Error de notificaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron actualizar las notificaciones.' });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_dismissed = FALSE AND is_read = FALSE', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error de notificaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron actualizar las notificaciones.' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });
    const db = await getDb();
    const result = await db.run(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Notificación no encontrada.' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error de notificaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron actualizar las notificaciones.' });
  }
});

// Keep dedupe keys so cleared reminders do not reappear at the next check.
router.delete('/', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('UPDATE notifications SET is_dismissed = TRUE, is_read = TRUE WHERE user_id = ? AND is_dismissed = FALSE', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al limpiar notificaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron limpiar las notificaciones.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });
    const db = await getDb();
    const result = await db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Notificación no encontrada.' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error de notificaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron actualizar las notificaciones.' });
  }
});

module.exports = router;
