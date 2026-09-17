const jwt = require('jsonwebtoken');
const getDb = require('../database');
const { hasPermission } = require('../permissions');

const SECRET = process.env.JWT_SECRET || 'Potage_S3cr3t_K3y_2026';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido.' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
}

function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const role = (req.user.role || '').toLowerCase();
      if (role === 'admin') return next();
      const db = await getDb();
      const ok = await hasPermission(db, role, permission);
      if (!ok) return res.status(403).json({ error: 'No tenés permiso para realizar esta acción.' });
      next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al verificar permisos.' });
    }
  };
}

module.exports = { authenticate, requireAdmin, requirePermission };
