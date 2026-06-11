const express = require('express');
const getDb = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

async function logAction(userId, email, accion, detalle, ip) {
  try {
    const db = await getDb();
    await db.run(
      'INSERT INTO logs (user_id, email, accion, detalle, ip) VALUES (?, ?, ?, ?, ?)',
      [userId, email, accion, detalle || '', ip || '']
    );
  } catch (err) {
    console.error('Error al registrar log:', err.message);
  }
}

router.post('/visit', authenticate, async (req, res) => {
  await logAction(req.user.id, req.user.email, 'visita', 'Página cargada', req.ip);
  res.json({ success: true });
});

router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const logs = await db.all(
      'SELECT id, user_id, email, accion, detalle, ip, created_at FROM logs ORDER BY created_at DESC LIMIT 500'
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, logAction };
