const { verifyAccessToken } = require('../tokens');
const getDb = require('../database');
const { hasPermission } = require('../permissions');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido.' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const db = await getDb();
    const user = await db.get('SELECT id, name, email, role, token_version FROM users WHERE id = ?', [decoded.id]);
    if (!user || (decoded.ver || 0) !== user.token_version) {
      return res.status(401).json({ error: 'Sesión revocada. Iniciá sesión nuevamente.' });
    }
    req.user = user;
    return next();
  } catch (err) {
    if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
    return res.status(503).json({ error: 'No se pudo verificar la sesión. Reintentá en unos instantes.' });
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
      const permissions = Array.isArray(permission) ? permission : [permission];
      const ok = (await Promise.all(permissions.map(key => hasPermission(db, role, key)))).some(Boolean);
      if (!ok) return res.status(403).json({ error: 'No tenés permiso para realizar esta acción.' });
      next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al verificar permisos.' });
    }
  };
}

module.exports = { authenticate, requireAdmin, requirePermission };
