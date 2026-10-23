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
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [req.user.id]
    );
    const count = await db.get(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ data: rows, unread: count ? count.total : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
