const { sendToUser, pushPayload } = require('./push');

const TZ = 'America/Argentina/Buenos_Aires';

function clip(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

function todayInTz(offsetDays) {
  const base = new Date(Date.now() + (offsetDays || 0) * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(base);
  const get = type => (parts.find(p => p.type === type) || {}).value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function createNotification(db, payload) {
  if (!db || !payload || !payload.userId) return null;
  try {
    const result = await db.run(
      `INSERT INTO notifications (user_id, type, title, message, link, icon, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        payload.userId,
        clip(payload.type || 'sistema', 50) || 'sistema',
        clip(payload.title, 200),
        clip(payload.message, 500),
        clip(payload.link, 300),
        clip(payload.icon, 60),
        payload.dedupeKey ? clip(payload.dedupeKey, 200) : null
      ]
    );
    const id = result.rows && result.rows[0] ? result.rows[0].id : null;
    if (id) {
      sendToUser(db, payload.userId, pushPayload({
        title: payload.title,
        message: payload.message,
        link: payload.link,
        tag: 'notif-' + id
      })).catch(() => {});
    }
    return id;
  } catch (err) {
    console.error('Error al crear notificación:', err.message);
    return null;
  }
}

async function notifyUsers(db, userIds, payload) {
  const unique = [...new Set((userIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  for (const userId of unique) {
    await createNotification(db, { ...payload, userId });
  }
}

async function adminIds(db, exceptUserId) {
  const rows = await db.all("SELECT id FROM users WHERE LOWER(role) = 'admin'");
  return rows
    .map(r => r.id)
    .filter(id => String(id) !== String(exceptUserId || ''));
}

async function notifyAdmins(db, payload, exceptUserId) {
  try {
    const ids = await adminIds(db, exceptUserId);
    await notifyUsers(db, ids, payload);
  } catch (err) {
    console.error('Error al notificar administradores:', err.message);
  }
}

async function notifyAllUsers(db, payload, exceptUserId) {
  try {
    const rows = await db.all('SELECT id FROM users WHERE id <> ?', [exceptUserId || 0]);
    await notifyUsers(db, rows.map(r => r.id), payload);
  } catch (err) {
    console.error('Error al notificar usuarios:', err.message);
  }
}

const reminderRuns = new Map();

async function runCalendarReminders(db, user) {
  if (!user || !user.id) return;
  const todayKey = todayInTz(0);
  for (const key of reminderRuns.keys()) if (!key.endsWith(':' + todayKey)) reminderRuns.delete(key);
  const runKey = `${user.id}:${todayKey}`;
  const previous = reminderRuns.get(runKey);
  if (previous && (previous.running || Date.now() - previous.time < 5 * 60000)) return;
  reminderRuns.set(runKey, { running: true, time: Date.now() });
  try {
    const today = todayInTz(0);
    const tomorrow = todayInTz(1);
    const isAdmin = String(user.role || '').toLowerCase() === 'admin';
    const params = [today, tomorrow];
    let where = "c.estado <> 'realizada' AND c.fecha >= ? AND c.fecha <= ?";
    if (!isAdmin) {
      where += ' AND (c.responsable_id = ? OR c.responsable_id IS NULL)';
      params.push(user.id);
    }
    const rows = await db.all(
      `SELECT c.id, c.titulo, c.tipo, to_char(c.fecha, 'YYYY-MM-DD') AS fecha, c.hora
       FROM calendario c
       WHERE ${where}
       ORDER BY c.fecha ASC, c.hora ASC
       LIMIT 40`,
      params
    );
    for (const ev of rows) {
      const cuando = ev.fecha === today ? 'Hoy' : 'Mañana';
      const hora = ev.hora ? ` a las ${ev.hora}` : '';
      const tipo = ev.tipo === 'evento' ? 'Evento' : 'Tarea';
      await createNotification(db, {
        userId: user.id,
        type: 'calendario_recordatorio',
        title: `Recordatorio: ${ev.titulo}`,
        message: `${cuando}${hora} · ${tipo}`,
        link: 'calendario.html',
        icon: 'bi-alarm',
        dedupeKey: `reminder:${ev.id}:${user.id}:${today}`
      });
    }
  } catch (err) {
    reminderRuns.delete(runKey);
    console.error('Error al generar recordatorios:', err.message);
  } finally {
    if (reminderRuns.has(runKey)) reminderRuns.set(runKey, { running: false, time: Date.now() });
  }
}

async function runDailyReminders(db) {
  try {
    const users = await db.all('SELECT id, role FROM users');
    for (const user of users) {
      await runCalendarReminders(db, user);
    }
  } catch (err) {
    console.error('Error al programar recordatorios:', err.message);
  }
}

module.exports = {
  createNotification,
  notifyUsers,
  notifyAdmins,
  notifyAllUsers,
  runCalendarReminders,
  runDailyReminders
};
