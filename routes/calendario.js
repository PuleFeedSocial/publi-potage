const express = require('express');
const router = express.Router();
const getDb = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logAction } = require('./logs');

const TIPOS = ['evento', 'tarea'];
const ESTADOS = ['pendiente', 'completada'];

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

function validate(body, partial) {
  const errors = [];
  if (!partial || body.titulo !== undefined) {
    if (!body.titulo || !String(body.titulo).trim()) errors.push('El título es obligatorio.');
    else if (String(body.titulo).trim().length > 120) errors.push('El título no puede superar 120 caracteres.');
  }
  if (!partial || body.fecha !== undefined) {
    if (!isValidFecha(body.fecha)) errors.push('La fecha debe tener formato YYYY-MM-DD y ser válida.');
  }
  if (body.hora !== undefined && !isValidHora(body.hora)) errors.push('La hora debe tener formato HH:MM.');
  if (body.tipo !== undefined && !TIPOS.includes(body.tipo)) errors.push('Tipo inválido.');
  if (body.estado !== undefined && !ESTADOS.includes(body.estado)) errors.push('Estado inválido.');
  if (body.descripcion && String(body.descripcion).length > 500) errors.push('La descripción no puede superar 500 caracteres.');
  return errors;
}

const SELECT_EVENTO = `
  SELECT c.id, c.titulo, c.descripcion,
         to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
         c.hora, c.tipo, c.estado, c.user_id, c.created_at,
         u.name AS creado_por
  FROM calendario c
  LEFT JOIN users u ON u.id = c.user_id
`;

router.get('/', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all(SELECT_EVENTO + ' ORDER BY c.fecha ASC, c.hora ASC NULLS FIRST, c.id ASC');
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const errors = validate(req.body, false);
    if (errors.length) return res.status(400).json({ error: errors[0] });

    const db = await getDb();
    const titulo = String(req.body.titulo).trim();
    const descripcion = String(req.body.descripcion || '').trim();
    const fecha = req.body.fecha;
    const hora = req.body.hora || '';
    const tipo = req.body.tipo || 'tarea';
    const estado = req.body.estado || 'pendiente';

    const result = await db.run(
      'INSERT INTO calendario (titulo, descripcion, fecha, hora, tipo, estado, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [titulo, descripcion, fecha, hora, tipo, estado, req.user.id]
    );

    const id = result.rows && result.rows[0] ? result.rows[0].id : 0;

    logAction(req.user.id, req.user.email, 'Creación en calendario', `${tipo}: ${titulo} (${fecha})`, req.ip);

    res.status(201).json({ message: 'Elemento agregado al calendario.', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const errors = validate(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors[0] });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const db = await getDb();
    const existing = await db.get('SELECT id, titulo, fecha FROM calendario WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Elemento no encontrado.' });

    const titulo = req.body.titulo !== undefined ? String(req.body.titulo).trim() : existing.titulo;
    const fecha = req.body.fecha !== undefined ? req.body.fecha : undefined;
    if (fecha === undefined) return res.status(400).json({ error: 'La fecha es obligatoria.' });
    const descripcion = req.body.descripcion !== undefined ? String(req.body.descripcion).trim() : undefined;
    const hora = req.body.hora !== undefined ? req.body.hora : undefined;
    const tipo = req.body.tipo !== undefined ? req.body.tipo : undefined;
    const estado = req.body.estado !== undefined ? req.body.estado : undefined;

    const sets = [];
    const params = [];
    const col = (name, value) => { sets.push(`${name} = ?`); params.push(value); };

    if (req.body.titulo !== undefined) col('titulo', titulo);
    if (descripcion !== undefined) col('descripcion', descripcion);
    col('fecha', fecha);
    if (hora !== undefined) col('hora', hora);
    if (tipo !== undefined) col('tipo', tipo);
    if (estado !== undefined) col('estado', estado);
    params.push(id);

    await db.run('UPDATE calendario SET ' + sets.join(', ') + ' WHERE id = ?', params);

    logAction(req.user.id, req.user.email, 'Edición en calendario', `#${id}: ${titulo} (${fecha})`, req.ip);

    res.json({ message: 'Elemento actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const db = await getDb();
    const existing = await db.get('SELECT id, titulo, tipo FROM calendario WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Elemento no encontrado.' });

    await db.run('DELETE FROM calendario WHERE id = ?', [id]);

    logAction(req.user.id, req.user.email, 'Eliminación en calendario', `#${id}: ${existing.titulo}`, req.ip);

    res.json({ message: 'Elemento eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
