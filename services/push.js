const webpush = require('web-push');

let setupPromise = null;
let publicKeyCache = '';

function normalizeKeys(source) {
  if (!source) return null;
  const publicKey = source.publicKey || source.public_key;
  const privateKey = source.privateKey || source.private_key;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

async function readStoredKeys(db) {
  const row = await db.get('SELECT value FROM app_settings WHERE key = ?', ['vapid_keys']);
  if (!row || !row.value) return null;
  try {
    return normalizeKeys(JSON.parse(row.value));
  } catch {
    return null;
  }
}

async function configure(db) {
  const envKeys = normalizeKeys({
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  });

  let keys = envKeys;
  if (!keys) {
    keys = await readStoredKeys(db);
    if (!keys) {
      const generated = webpush.generateVAPIDKeys();
      await db.run(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING',
        ['vapid_keys', JSON.stringify(generated)]
      );
      keys = (await readStoredKeys(db)) || generated;
    }
  }

  const subject = process.env.VAPID_SUBJECT || 'mailto:no-reply@publi-potage.app';
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  publicKeyCache = keys.publicKey;
  return keys;
}

function ensureConfigured(db) {
  if (!setupPromise) {
    setupPromise = configure(db).catch(err => {
      setupPromise = null;
      throw err;
    });
  }
  return setupPromise;
}

async function getPublicKey(db) {
  await ensureConfigured(db);
  return publicKeyCache;
}

async function saveSubscription(db, user, subscription, userAgent) {
  const endpoint = subscription && subscription.endpoint;
  const keys = subscription && subscription.keys;
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 1000) {
    const err = new Error('Suscripción inválida.');
    err.status = 400;
    throw err;
  }
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || !keys.p256dh || !keys.auth) {
    const err = new Error('Suscripción inválida.');
    err.status = 400;
    throw err;
  }
  await db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent`,
    [user.id, endpoint, String(keys.p256dh).slice(0, 300), String(keys.auth).slice(0, 300), String(userAgent || '').slice(0, 300)]
  );
}

async function removeSubscription(db, userId, endpoint) {
  if (!endpoint) return;
  await db.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, userId]);
}

async function deliver(db, subscription, body) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      },
      body,
      { TTL: 24 * 60 * 60 }
    );
  } catch (err) {
    const status = err && err.statusCode;
    if (status === 404 || status === 410) {
      await db.run('DELETE FROM push_subscriptions WHERE id = ?', [subscription.id]).catch(() => {});
    } else {
      console.error('Error al enviar push:', status || (err && err.message));
    }
  }
}

async function sendToUser(db, userId, payload) {
  if (!userId) return;
  try {
    const subscriptions = await db.all(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );
    if (!subscriptions.length) return;
    await ensureConfigured(db);
    const body = JSON.stringify(payload || {});
    await Promise.allSettled(subscriptions.map(sub => deliver(db, sub, body)));
  } catch (err) {
    console.error('Error al enviar notificaciones push:', err.message);
  }
}

function pushPayload(notification) {
  return {
    title: notification.title || 'Publi Potage',
    body: notification.message || '',
    url: notification.link || 'dashboard.html',
    tag: notification.tag || 'notif',
    icon: '/img/icon-192.png',
    badge: '/img/icon-192.png'
  };
}

module.exports = {
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendToUser,
  pushPayload
};
