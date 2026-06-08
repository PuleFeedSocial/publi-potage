const jwt = require('jsonwebtoken');

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

module.exports = { authenticate, requireAdmin };
