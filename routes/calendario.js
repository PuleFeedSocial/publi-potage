const express = require('express');
const router = express.Router();
const getDb = require('../database');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');
const { logAction } = require('./logs');
const { notifyUsers, notifyAdmins, notifyAllUsers } = require('../services/notifications');

const TIPOS = ['evento', 'tarea'];
const ESTADOS = ['pendiente', 'realizada', 'completada'];
const RECURRENCIAS = { diaria: 60, semanal: 52, mensual: 24 };

function isValidFecha(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidHora(hora) {
  if (!hora) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

function normEstado(e) {
  return e === 'completada' ? 'realizada' : e;
}

function normRole(user) {
  return ((user && user.role) || '').toLowerCase();
}

function addMinutes(hora, mins) {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function parseFecha(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtFecha(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function addDays(fecha, n) {
  const dt = parseFecha(fecha);
  dt.setDate(dt.getDate() + n);
  return fmtFecha(dt);
}

function diffDays(a, b) {
  return Math.round((parseFecha(a) - parseFecha(b)) / 86400000);
}

function addMonthsClamped(fecha, n) {
  const dt = parseFecha(fecha);
  const y = dt.getFullYear();
  const m = dt.getMonth() + n;
  const d = dt.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  return fmtFecha(new Date(y, m, Math.min(d, last)));
}

function serieDates(fecha, recurrencia, total) {
  const out = [];
  for (let i = 1; i < total; i++) {
    if (recurrencia === 'diaria') out.push(addDays(fecha, i));
    else if (recurrencia === 'semanal') out.push(addDays(fecha, i * 7));
    else out.push(addMonthsClamped(fecha, i));
  }
  return out;
}

function validate(body, partial) {
  const errors = [];
  if (!partial || body.titulo !== undefined) {
    if (!body.titulo || !String(body.titulo).trim()) errors.push('El título es obligatorio.');
    else if (String(body.titulo).trim().length > 120) errors.push('El título no puede superar 120 caracteres.');
  }
  if (!partial || body.fecha !== undefined) {
    if (!isValidFecha(body.fecha)) errors.push('La fecha debe tener formato YYYY-MM-DD y ser válida.');
  }
  if (body.fecha_fin !== undefined && body.fecha_fin !== null && body.fecha_fin !== '' && !isValidFecha(body.fecha_fin)) {
    errors.push('La fecha de fin debe tener formato YYYY-MM-DD y ser válida.');
  }
  if (isValidFecha(body.fecha) && isValidFecha(body.fecha_fin) && body.fecha_fin < body.fecha) {
    errors.push('La fecha de fin no puede ser anterior a la fecha de inicio.');
  }
  if (body.hora !== undefined && !isValidHora(body.hora)) errors.push('La hora debe tener formato HH:MM.');
  if (body.hora_fin !== undefined && body.hora_fin !== null && body.hora_fin !== '' && !isValidHora(body.hora_fin)) {
    errors.push('La hora de fin debe tener formato HH:MM.');
  }
  if (body.hora_fin && !body.hora) errors.push('La hora de fin requiere una hora de inicio.');
  const mismoDia = isValidFecha(body.fecha)
    && (!isValidFecha(body.fecha_fin) || body.fecha_fin === body.fecha);
  if (mismoDia && body.hora && body.hora_fin && body.hora_fin <= body.hora) {
    errors.push('La hora de fin debe ser posterior a la hora de inicio.');
  }
  if (body.tipo !== undefined && !TIPOS.includes(body.tipo)) errors.push('Tipo inválido.');
  if (body.estado !== undefined && !ESTADOS.includes(body.estado)) errors.push('Estado inválido.');
  if (body.descripcion && String(body.descripcion).length > 500) errors.push('La descripción no puede superar 500 caracteres.');
  if (body.recurrencia !== undefined && body.recurrencia !== null && body.recurrencia !== ''
    && body.recurrencia !== 'none' && !RECURRENCIAS[body.recurrencia]) {
    errors.push('Frecuencia de repetición inválida.');
  }
  if (body.responsable_id !== undefined && body.responsable_id !== null && body.responsable_id !== '') {
    if (isNaN(parseInt(body.responsable_id))) errors.push('Responsable inválido.');
  }
  return errors;
}

const SELECT_EVENTO = `
  SELECT c.id, c.titulo, c.descripcion,
         to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
         c.hora,
         to_char(c.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
         c.hora_fin, c.tipo, c.estado, c.user_id, c.created_at,
         c.recurrencia, c.serie_id, c.serie_pos,
         c.responsable_id,
         c.realizado_por,
         to_char(c.realizado_en, 'YYYY-MM-DD"T"HH24:MI:SS') AS realizado_en,
         u.name AS creado_por,
         ru.name AS responsable_nombre,
         du.name AS realizado_por_nombre
  FROM calendario c
  LEFT JOIN users u ON u.id = c.user_id
  LEFT JOIN users ru ON ru.id = c.responsable_id
  LEFT JOIN users du ON du.id = c.realizado_por
`;

const ORDER = ' ORDER BY c.fecha ASC, c.hora ASC, c.serie_pos ASC, c.id ASC';

// Los metadatos de autoría de realización se envían solo a administradores.
// El responsable solo es visible para el propio responsable o para administradores.
function stripAudit(ev, isAdmin) {
  if (isAdmin) return ev;
  const { realizado_por, realizado_en, realizado_por_nombre, ...rest } = ev;
  return rest;
}

async function notifyAssignChange(db, actor, oldResp, newResp, titulo, tipo, fecha) {
  const oldId = oldResp ? String(oldResp) : null;
  const newId = newResp ? String(parseInt(newResp)) : null;
  if (!newId || newId === oldId || newId === String(actor.id)) return;
  try {
    await notifyUsers(db, [Number(newId)], {
      type: 'calendario_asignacion',
      title: 'Nuevo elemento asignado',
      message: `${tipo === 'evento' ? 'Evento' : 'Tarea'}: ${titulo} · ${fecha}`,
      link: 'calendario.html',
      icon: 'bi-calendar-check'
    });
  } catch (err) {
    console.error('Error al notificar asignación:', err.message);
  }
}

function filterForViewer(ev, isAdmin, viewerId) {
  let out = stripAudit(ev, isAdmin);
  if (isAdmin) return out;
  if (out.responsable_id && String(out.responsable_id) === String(viewerId)) {
    return out;
  }
  const { responsable_id, responsable_nombre, ...rest } = out;
  return rest;
}

async function getEvento(db, id) {
  return await db.get(SELECT_EVENTO + ' WHERE c.id = ?', [id]);
}

router.get('/', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    let where = '';
    const params = [];
    const { desde, hasta } = req.query;
    if ((desde || hasta) && !(isValidFecha(desde) && isValidFecha(hasta) && desde <= hasta)) return res.status(400).json({ error: 'Rango de fechas inválido.' });
    if (desde && hasta && isValidFecha(desde) && isValidFecha(hasta) && desde <= hasta) {
      where = 'WHERE c.fecha <= ? AND coalesce(c.fecha_fin, c.fecha) >= ?';
      params.push(hasta, desde);
    }
    const rows = await db.all(SELECT_EVENTO + where + ORDER, params);
    const isAdmin = normRole(req.user) === 'admin';
    res.json({ data: rows.map(r => filterForViewer(r, isAdmin, req.user.id)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    if (req.body.hora && !req.body.hora_fin && isValidHora(req.body.hora)) req.body.hora_fin = addMinutes(req.body.hora, 60);
    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors[0] });

    const db = await getDb();
    const titulo = String(req.body.titulo).trim();
    const descripcion = String(req.body.descripcion || '').trim();
    const fecha = req.body.fecha;
    const fecha_fin = (req.body.fecha_fin && req.body.fecha_fin !== fecha) ? req.body.fecha_fin : null;
    let hora = req.body.hora || '';
    let hora_fin = req.body.hora_fin || '';
    if (hora && !hora_fin) hora_fin = addMinutes(hora, 60);
    if (!hora) hora_fin = '';
    const tipo = req.body.tipo || 'tarea';
    const estado = normEstado(req.body.estado || 'pendiente');
    const recurrencia = (req.body.recurrencia && RECURRENCIAS[req.body.recurrencia]) ? req.body.recurrencia : 'none';
    const responsableId = req.body.responsable_id ? parseInt(req.body.responsable_id) : null;

    if (responsableId) {
      const resp = await db.get('SELECT id FROM users WHERE id = ?', [responsableId]);
      if (!resp) return res.status(400).json({ error: 'El responsable indicado no existe.' });
    }

    const serieTotal = recurrencia !== 'none' ? RECURRENCIAS[recurrencia] : 1;
    const occFechas = [fecha].concat(serieTotal > 1 ? serieDates(fecha, recurrencia, serieTotal) : []);
    const created = [];
    await db.transaction(async tx => {
      for (let i = 0; i < serieTotal; i++) {
        const occFecha = occFechas[i];
        const occFechaFin = fecha_fin ? addDays(occFecha, diffDays(fecha_fin, fecha)) : null;
        const result = await tx.run(
          `INSERT INTO calendario (titulo, descripcion, fecha, hora, hora_fin, fecha_fin, tipo, estado, user_id,
                                   responsable_id, recurrencia, serie_id, serie_pos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [titulo, descripcion, occFecha, hora, hora_fin, occFechaFin, tipo, estado, req.user.id,
            responsableId, recurrencia, null, i]
        );
        const id = result.rows && result.rows[0] ? result.rows[0].id : 0;
        created.push(id);
      }
      if (created.length) {
        await tx.run('UPDATE calendario SET serie_id = ? WHERE id = ANY(?)', [created[0], created]);
      }
    });

    logAction(req.user.id, req.user.email, 'Creación en calendario',
      `${tipo}: ${titulo} (${fecha}${serieTotal > 1 ? `, ${serieTotal} repeticiones` : ''})`, req.ip);

    try {
      const serieTxt = serieTotal > 1 ? ` (${serieTotal} repeticiones)` : '';
      if (responsableId) {
        await notifyAssignChange(db, req.user, null, responsableId, titulo, tipo, fecha);
      } else {
        await notifyAllUsers(db, {
          type: 'calendario_general',
          title: tipo === 'evento' ? 'Nuevo evento en el calendario' : 'Nueva tarea en el calendario',
          message: `${titulo} · ${fecha}${serieTxt}`,
          link: 'calendario.html',
          icon: 'bi-calendar-plus'
        }, req.user.id);
      }
    } catch (notifErr) {
      console.error('Error al notificar creación de calendario:', notifErr.message);
    }

    res.status(201).json({
      message: serieTotal > 1
        ? `Elemento creado con ${serieTotal} repeticiones.`
        : 'Elemento agregado al calendario.',
      id: created[0],
      creados: created.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });

    const db = await getDb();
    const existing = await db.get(
      `SELECT *, to_char(fecha, 'YYYY-MM-DD') AS fecha_iso, to_char(fecha_fin, 'YYYY-MM-DD') AS fecha_fin_iso
       FROM calendario WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Elemento no encontrado.' });

    // Validación completa sobre el estado resultante (body + datos existentes)
    const merged = {
      titulo: req.body.titulo !== undefined ? req.body.titulo : existing.titulo,
      fecha: req.body.fecha !== undefined ? req.body.fecha : existing.fecha_iso,
      fecha_fin: req.body.fecha_fin !== undefined ? req.body.fecha_fin : existing.fecha_fin_iso,
      hora: req.body.hora !== undefined ? (req.body.hora || '') : (existing.hora || ''),
      hora_fin: req.body.hora_fin !== undefined ? (req.body.hora_fin || '') : (existing.hora_fin || ''),
      tipo: req.body.tipo !== undefined ? req.body.tipo : existing.tipo,
      estado: req.body.estado !== undefined ? req.body.estado : existing.estado,
      descripcion: req.body.descripcion !== undefined ? req.body.descripcion : existing.descripcion
    };
    if (req.body.responsable_id !== undefined) merged.responsable_id = req.body.responsable_id;
    if (!merged.hora) merged.hora_fin = '';
    // Si llega hora sin hora_fin, se deriva antes de validar (mismo criterio que en el UPDATE).
    if (req.body.hora !== undefined && req.body.hora_fin === undefined && merged.hora) {
      merged.hora_fin = (existing.hora_fin && existing.hora_fin > merged.hora)
        ? existing.hora_fin
        : addMinutes(merged.hora, 60);
    }
    const errors = validate(merged, false);
    if (errors.length) return res.status(400).json({ error: errors[0] });
    if (merged.responsable_id) {
      const resp = await db.get('SELECT id FROM users WHERE id = ?', [parseInt(merged.responsable_id)]);
      if (!resp) return res.status(400).json({ error: 'El responsable indicado no existe.' });
    }

    const sets = [];
    const params = [];
    const col = (name, value) => { sets.push(`${name} = ?`); params.push(value); };

    const scopeSerie = req.query.scope === 'serie' && existing.serie_id;

    if (scopeSerie) {
      // Edición de la serie completa: campos comunes, cada ocurrencia conserva su fecha.
      if (req.body.titulo !== undefined) col('titulo', String(req.body.titulo).trim());
      if (req.body.descripcion !== undefined) col('descripcion', String(req.body.descripcion).trim());
      if (req.body.tipo !== undefined) col('tipo', req.body.tipo);
      if (req.body.estado !== undefined) col('estado', normEstado(req.body.estado));
      if (req.body.hora !== undefined) {
        const h = req.body.hora || '';
        col('hora', h);
        if (req.body.hora_fin === undefined) {
          col('hora_fin', h ? ((existing.hora_fin && existing.hora_fin > h) ? existing.hora_fin : addMinutes(h, 60)) : '');
        }
      }
      if (req.body.hora_fin !== undefined) col('hora_fin', req.body.hora_fin || '');
      if (req.body.responsable_id !== undefined) col('responsable_id', req.body.responsable_id ? parseInt(req.body.responsable_id) : null);
      if (!sets.length) return res.status(400).json({ error: 'No hay cambios para aplicar.' });
      params.push(existing.serie_id);
      await db.run('UPDATE calendario SET ' + sets.join(', ') + ' WHERE serie_id = ?', params);
      logAction(req.user.id, req.user.email, 'Edición en calendario (serie)',
        `serie #${existing.serie_id}: ${req.body.titulo !== undefined ? String(req.body.titulo).trim() : existing.titulo}`, req.ip);
      if (req.body.responsable_id !== undefined) {
        await notifyAssignChange(db, req.user, existing.responsable_id, req.body.responsable_id,
          req.body.titulo !== undefined ? String(req.body.titulo).trim() : existing.titulo,
          req.body.tipo !== undefined ? req.body.tipo : existing.tipo,
          existing.fecha_iso);
      }
      const rows = await db.all(SELECT_EVENTO + ' WHERE c.serie_id = ?' + ORDER, [existing.serie_id]);
      const isAdmin = normRole(req.user) === 'admin';
      return res.json({ message: 'Serie actualizada correctamente.', data: rows.map(r => filterForViewer(r, isAdmin, req.user.id)) });
    }

    if (req.body.titulo !== undefined) col('titulo', String(req.body.titulo).trim());
    if (req.body.descripcion !== undefined) col('descripcion', String(req.body.descripcion).trim());
    if (req.body.fecha !== undefined) col('fecha', req.body.fecha);
    if (req.body.fecha_fin !== undefined) {
      const ff = (req.body.fecha_fin && req.body.fecha_fin !== merged.fecha) ? req.body.fecha_fin : null;
      col('fecha_fin', ff);
    }
    if (req.body.hora !== undefined) {
      const h = req.body.hora || '';
      col('hora', h);
      if (req.body.hora_fin === undefined) {
        col('hora_fin', h ? ((existing.hora_fin && existing.hora_fin > h) ? existing.hora_fin : addMinutes(h, 60)) : '');
      }
    }
    if (req.body.hora_fin !== undefined) col('hora_fin', req.body.hora_fin || '');
    if (req.body.tipo !== undefined) col('tipo', req.body.tipo);
    if (req.body.responsable_id !== undefined) col('responsable_id', req.body.responsable_id ? parseInt(req.body.responsable_id) : null);

    let estadoChanged = false;
    if (req.body.estado !== undefined) {
      const nuevoEstado = normEstado(req.body.estado);
      estadoChanged = nuevoEstado !== normEstado(existing.estado);
      col('estado', nuevoEstado);
      if (estadoChanged && nuevoEstado === 'realizada') {
        col('realizado_por', req.user.id);
        col('realizado_en', new Date());
      } else if (estadoChanged && nuevoEstado === 'pendiente') {
        col('realizado_por', null);
        col('realizado_en', null);
      }
    }

    if (!sets.length) return res.status(400).json({ error: 'No hay cambios para aplicar.' });
    params.push(id);
    await db.run('UPDATE calendario SET ' + sets.join(', ') + ' WHERE id = ?', params);

    const nuevoTitulo = req.body.titulo !== undefined ? String(req.body.titulo).trim() : existing.titulo;
    logAction(req.user.id, req.user.email, 'Edición en calendario',
      `#${id}: ${nuevoTitulo} (${merged.fecha})`, req.ip);

    if (req.body.responsable_id !== undefined) {
      await notifyAssignChange(db, req.user, existing.responsable_id, req.body.responsable_id,
        nuevoTitulo,
        req.body.tipo !== undefined ? req.body.tipo : existing.tipo,
        merged.fecha);
    }

    const item = await getEvento(db, id);
    res.json({ message: 'Elemento actualizado correctamente.', item: filterForViewer(item, normRole(req.user) === 'admin', req.user.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/estado', authenticate, requirePermission('complete_calendario'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });
    if (!req.body.estado || !ESTADOS.includes(req.body.estado)) {
      return res.status(400).json({ error: 'Estado inválido. Debe ser "realizada" o "pendiente".' });
    }
    const nuevoEstado = normEstado(req.body.estado);

    const db = await getDb();
    const existing = await db.get('SELECT id, titulo, estado FROM calendario WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Elemento no encontrado.' });

    if (nuevoEstado === 'realizada') {
      await db.run(
        'UPDATE calendario SET estado = ?, realizado_por = ?, realizado_en = CURRENT_TIMESTAMP WHERE id = ?',
        ['realizada', req.user.id, id]
      );
    } else {
      await db.run(
        'UPDATE calendario SET estado = ?, realizado_por = NULL, realizado_en = NULL WHERE id = ?',
        ['pendiente', id]
      );
    }

    logAction(req.user.id, req.user.email, 'Cambio de estado en calendario',
      `#${id}: ${existing.titulo} -> ${nuevoEstado === 'realizada' ? 'Realizada' : 'Pendiente'} (por ${req.user.email})`, req.ip);

    if (nuevoEstado === 'realizada' && normEstado(existing.estado) !== 'realizada') {
      await notifyAdmins(db, {
        type: 'calendario_realizada',
        title: 'Tarea completada',
        message: `${req.user.name || req.user.email} marcó como realizada: ${existing.titulo}`,
        link: 'calendario.html',
        icon: 'bi-check2-circle'
      }, req.user.id);
    }

    const item = await getEvento(db, id);
    res.json({
      message: nuevoEstado === 'realizada' ? 'Marcado como realizado.' : 'Marcado como pendiente.',
      item: filterForViewer(item, normRole(req.user) === 'admin', req.user.id)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });

    const db = await getDb();
    const existing = await db.get('SELECT id, titulo, tipo, serie_id FROM calendario WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Elemento no encontrado.' });

    if (req.query.scope === 'serie' && existing.serie_id) {
      await db.run('DELETE FROM calendario WHERE serie_id = ?', [existing.serie_id]);
      logAction(req.user.id, req.user.email, 'Eliminación en calendario (serie)',
        `serie #${existing.serie_id}: ${existing.titulo}`, req.ip);
      return res.json({ message: 'Serie eliminada correctamente.' });
    }

    await db.run('DELETE FROM calendario WHERE id = ?', [id]);
    logAction(req.user.id, req.user.email, 'Eliminación en calendario', `#${id}: ${existing.titulo}`, req.ip);
    res.json({ message: 'Elemento eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
