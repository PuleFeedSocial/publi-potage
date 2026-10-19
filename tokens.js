const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'Potage_S3cr3t_K3y_2026';

// Access token de corta vida (se renueva en segundo plano con el refresh token).
// Refresh token de larga vida guardado en el cliente.
// GRACE_MS: margen para aceptar un access token vencido como credencial de
// refresh (sirve a sesiones antiguas que no tienen refresh token).
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '24h';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '30d';
const EXPIRED_ACCESS_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, typ: 'refresh' },
    SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, SECRET);
  if (decoded.typ === 'refresh') throw new Error('Token de refresh usado como access token.');
  return decoded;
}

// Acepta un refresh token válido (exp no vencido), o (fallback de gracia) un
// access token vencido hace menos de GRACE. Lanza si ninguno aplica.
function verifyRefreshCredential(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, SECRET);
  } catch (err) {
    if (err && err.name === 'TokenExpiredError' && err.expiredAt) {
      // Token vencido: solo un access token viejo sirve dentro de la gracia.
      decoded = jwt.verify(token, SECRET, { ignoreExpiration: true });
      if (decoded.typ === 'refresh') throw err; // refresh vencido: no hay gracia
      const expMs = decoded.exp ? decoded.exp * 1000 : 0;
      if (!expMs || Date.now() - expMs > EXPIRED_ACCESS_GRACE_MS) throw err;
      return decoded;
    }
    throw err;
  }
  if (decoded.typ === 'refresh') return decoded;

  // Access token vivo sin typ (sesión vieja): también sirve para refrescar.
  return decoded;
}

function decodeExp(token) {
  try {
    const b64 = String(token).split('.')[1] || '';
    const b64normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(
      Buffer.from(b64normalized, 'base64').toString('utf8')
    );
    return payload && payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

module.exports = {
  SECRET,
  ACCESS_TTL,
  REFRESH_TTL,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshCredential,
  decodeExp
};
