const express = require('express');
const getDb = require('../database');
const { count } = require('../services/sheets');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logAction } = require('./logs');

const router = express.Router();
router.use(authenticate, requirePermission('edit_marketing'));

const ESTATUS = new Set(['SIN DEFINIR', 'PUBLICADA', 'ELIMINADA', 'SUPRIMIDA', 'EN REVISION']);
const METRICS = ['publicaciones', 'visualizaciones', 'interacciones', 'comentarios', 'mensajes'];
const TZ = 'America/Argentina/Buenos_Aires';

function argentinaStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function parseWhen(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day || hour > 23 || minute > 59) return null;
  const pad = n => String(n).padStart(2, '0');
  return {
    stamp: `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`,
    fecha: `${year}-${pad(month)}-${pad(day)}`,
    hora: `${pad(hour)}:${pad(minute)}`
  };
}

function text(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const when = parseWhen(body.fechaHora);
    if (!when) return res.status(400).json({ error: 'Indicá una fecha y hora válidas.' });
    if (when.stamp <= argentinaStamp()) return res.status(400).json({ error: 'La fecha y hora deben ser futuras.' });

    const zona = text(body.zona);
    const estatus = ESTATUS.has(body.estatus) ? body.estatus : null;
    const grupos = Array.isArray(body.grupos) ? body.grupos.slice(0, 300) : [];
    if (!zona) return res.status(400).json({ error: 'Seleccioná una sucursal.' });
    if (!estatus) return res.status(400).json({ error: 'Estatus inválido.' });
    if (!grupos.length) return res.status(400).json({ error: 'Seleccioná al menos un grupo.' });

    const metrics = {};
    for (const field of METRICS) {
      const value = count(body[field]);
      if (value === null) return res.status(400).json({ error: 'Debe ser un entero no negativo: ' + field });
      metrics[field] = value;
    }

    const cleaned = [];
    for (const item of grupos) {
      const nombre = text(item && item.nombre);
      if (!nombre) continue;
      const grupoZona = text(item && item.zona) || zona;
      let grupoFila = '';
      if (item && item.grupoFila !== '' && item.grupoFila != null) {
        const n = Number(item.grupoFila);
        if (!Number.isSafeInteger(n) || n < 2) return res.status(400).json({ error: 'Grupo inválido: grupoFila' });
        grupoFila = String(n);
      }
      cleaned.push({ nombre, zona: grupoZona, grupoFila });
    }
    if (!cleaned.length) return res.status(400).json({ error: 'Seleccioná al menos un grupo.' });

    const db = await getDb();
    const items = await db.transaction(async tx => {
      const created = [];
      for (const grupo of cleaned) {
        const result = await tx.run(
          `INSERT INTO publicaciones_programadas
            (user_id, email, ip, programada_para, fecha, hora, grupo, zona, grupo_fila,
             publicaciones, visualizaciones, interacciones, comentarios, mensajes, estatus)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [req.user?.id || null, text(req.user?.email, 200), text(req.ip, 100), when.stamp, when.fecha, when.hora,
           grupo.nombre, grupo.zona, grupo.grupoFila, metrics.publicaciones, metrics.visualizaciones,
           metrics.interacciones, metrics.comentarios, metrics.mensajes, estatus]
        );
        created.push({ id: result.rows?.[0]?.id || 0, grupo: grupo.nombre, zona: grupo.zona });
      }
      return created;
    });

    await logAction(req.user?.id || null, text(req.user?.email, 200), 'Programación de publicaciones',
      `${items.length} grupo(s) para el ${when.stamp} AR`, text(req.ip, 100));
    res.status(201).json({ count: items.length, items, programadaPara: when.stamp });
  } catch (err) {
    console.error('Error al programar publicaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron guardar las programaciones.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const data = await db.all(
      `SELECT id, programada_para, fecha, hora, grupo, zona, publicaciones, estado, intentos, ultimo_error, created_at
       FROM publicaciones_programadas
       WHERE estado IN ('pendiente', 'procesando', 'publicada', 'error')
       ORDER BY programada_para DESC, id DESC LIMIT 100`
    );
    res.json({ data });
  } catch (err) {
    console.error('Error al listar programaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las programaciones.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Identificador inválido.' });
    const db = await getDb();
    const result = await db.run(`UPDATE publicaciones_programadas SET estado = 'cancelada' WHERE id = ? AND estado = 'pendiente'`, [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'La programación ya no está pendiente.' });
    await logAction(req.user?.id || null, text(req.user?.email, 200), 'Cancelación de publicación programada', `Programación #${id}`, text(req.ip, 100));
    res.json({ message: 'Programación cancelada.' });
  } catch (err) {
    console.error('Error al cancelar programación:', err.message);
    res.status(500).json({ error: 'No se pudo cancelar la programación.' });
  }
});

module.exports = router;
