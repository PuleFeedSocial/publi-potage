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
    const { desde, hasta, limit } = req.query;
    let where = '';
    const params = [];
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      where += (where ? ' AND ' : ' WHERE ') + "DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') >= ?";
      params.push(desde);
    }
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      where += (where ? ' AND ' : ' WHERE ') + "DATE(created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') <= ?";
      params.push(hasta);
    }
    const max = Math.min(parseInt(limit) || 10000, 50000);
    const logs = await db.all(
      `SELECT id, user_id, email, accion, detalle, ip, created_at FROM logs ${where} ORDER BY created_at DESC LIMIT ${max}`,
      params
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, logAction };
