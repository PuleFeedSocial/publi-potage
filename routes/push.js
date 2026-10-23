const express = require('express');
const router = express.Router();
const getDb = require('../database');
const { authenticate } = require('../middleware/auth');
const { getPublicKey, saveSubscription, removeSubscription, sendToUser, pushPayload } = require('../services/push');

router.use(authenticate);

router.get('/public-key', async (req, res) => {
  try {
    const db = await getDb();
    const publicKey = await getPublicKey(db);
    res.json({ publicKey });
  } catch (err) {
    console.error('Error al obtener clave push:', err.message);
    res.status(500).json({ error: 'No se pudo inicializar el servicio de avisos.' });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const db = await getDb();
    await saveSubscription(db, req.user, req.body.subscription, req.headers['user-agent']);
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Error al guardar suscripción push:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la suscripción.' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const db = await getDb();
    const endpoint = req.body.endpoint || (req.body.subscription && req.body.subscription.endpoint);
    await removeSubscription(db, req.user.id, endpoint);
    res.json({ success: true });
  } catch (err) {
    console.error('Error al quitar suscripción push:', err.message);
    res.status(500).json({ error: 'No se pudo quitar la suscripción.' });
  }
});

router.post('/test', async (req, res) => {
  try {
    const db = await getDb();
    const subscriptions = await db.get(
      'SELECT COUNT(*)::int AS total FROM push_subscriptions WHERE user_id = ?',
      [req.user.id]
    );
    if (!subscriptions || !subscriptions.total) {
      return res.status(400).json({ error: 'No tenés dispositivos con avisos activados.' });
    }
    const delivered = await sendToUser(db, req.user.id, pushPayload({
      title: 'Publi Potage',
      message: 'Aviso de prueba para tus dispositivos registrados.',
      link: 'dashboard.html',
      tag: 'push-test-' + Date.now()
    }));
    if (!delivered) return res.status(502).json({ error: 'El proveedor no aceptó el aviso. Revisá la activación e intentá nuevamente.' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error al enviar push de prueba:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el aviso de prueba.' });
  }
});

module.exports = router;
