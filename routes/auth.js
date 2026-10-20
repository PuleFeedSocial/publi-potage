const express = require('express');
const bcrypt = require('bcryptjs');
const getDb = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { signAccessToken, signRefreshToken, verifyRefreshCredential } = require('../tokens');
const { CATALOG, getRolePermissions, setRolePermissions, DEFAULT_ROLE_PERMISSIONS, normalizeRole } = require('../permissions');

const router = express.Router();
const { logAction } = require('./logs');

const ALLOWED_ROLES = ['admin', 'colaborador'];

function issueTokens(user) {
  return { token: signAccessToken(user), refreshToken: signRefreshToken(user) };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function roleKey(name) {
  return normalizeRole(name);
}

async function ensureRolesTable(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function getRolesList(db) {
  await ensureRolesTable(db);
  const rows = await db.all('SELECT name, label FROM roles ORDER BY id ASC');
  const out = [];
  const seen = new Set();
  rows.forEach(r => {
    const n = normalizeRole(r.name);
    if (n === 'admin') return;
    if (!seen.has(n)) { seen.add(n); out.push({ name: n, label: r.label || r.name }); }
  });
  if (!out.length) {
    await db.run("INSERT INTO roles (name, label) VALUES (?, ?) ON CONFLICT (name) DO NOTHING", ['colaborador', 'Colaborador']);
    const r2 = await db.all('SELECT name, label FROM roles ORDER BY id ASC');
    r2.forEach(r => {
      const n = normalizeRole(r.name);
      if (n === 'admin') return;
      out.push({ name: n, label: r.label || r.name });
    });
  }
  return out;
}

router.post('/register', async (req, res) => {
  try {
    const { name, activationCode } = req.body;
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!name || !email || !password || !activationCode) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (!/^[0-9]{6}$/.test(activationCode)) {
      return res.status(400).json({ error: 'El código de activación debe tener 6 dígitos.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const db = await getDb();

    const existingUser = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }

    const code = await db.get('SELECT id FROM activation_codes WHERE code = ? AND used = 0', [activationCode]);
    if (!code) {
      return res.status(400).json({ error: 'Código de activación inválido o ya utilizado.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, 'colaborador']);

    const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    await db.run('UPDATE activation_codes SET used = 1, used_by = ? WHERE id = ?', [user.id, code.id]);

    const { token, refreshToken } = issueTokens({ id: user.id, name, email, role: 'colaborador' });

    logAction(user.id, email, 'Registro', 'Usuario registrado como colaborador', req.ip);

    res.status(201).json({
      message: 'Cuenta creada exitosamente.',
      token,
      refreshToken,
      user: { id: user.id, name, email, role: 'colaborador' }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
    }

    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [normalizeEmail(email)]);

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const { token, refreshToken } = issueTokens(user);

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

    logAction(user.id, user.email, 'Inicio de sesión', '', req.ip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Renueva la sesión sin volver a pedir usuario/contraseña:
//  - Prefiere el refresh token (30 días).
//  - Fallback: un access token vencido hace menos de 7 días (gracia para
//    sesiones antiguas que no tienen refresh token).
router.post('/refresh', async (req, res) => {
  try {
    const credential = (req.body && (req.body.refreshToken || req.body.token)) || '';
    if (!credential) {
      return res.status(401).json({ error: 'Token de refresh requerido.' });
    }

    let decoded;
    try {
      decoded = verifyRefreshCredential(credential);
    } catch {
      return res.status(401).json({ error: 'Sesión vencida. Iniciá sesión nuevamente.' });
    }

    const db = await getDb();
    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    const tokens = issueTokens(user);
    res.json({
      message: 'Sesión renovada.',
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al renovar la sesión.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email, activationCode, newPassword } = req.body;

    if (!email || !activationCode || !newPassword) {
      return res.status(400).json({ error: 'Email, código de activación y nueva contraseña son obligatorios.' });
    }

    if (!/^[0-9]{6}$/.test(activationCode)) {
      return res.status(400).json({ error: 'El código de activación debe tener 6 dígitos.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const db = await getDb();
    const user = await db.get('SELECT id, email FROM users WHERE LOWER(email) = ?', [normalizeEmail(email)]);
    if (!user) {
      return res.status(400).json({ error: 'El email o el código de activación no son correctos.' });
    }

    const code = await db.get('SELECT id FROM activation_codes WHERE code = ? AND used_by = ?', [activationCode, user.id]);
    if (!code) {
      return res.status(400).json({ error: 'El email o el código de activación no son correctos.' });
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);

    logAction(user.id, user.email, 'Recuperación de contraseña', 'Contraseña restablecida con código de activación', req.ip);

    res.json({ message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al restablecer la contraseña.' });
  }
});

router.get('/roles', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const roles = await getRolesList(db);
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener roles.' });
  }
});

router.post('/roles', authenticate, requireAdmin, async (req, res) => {
  try {
    const label = String(req.body.label || '').trim();
    const name = roleKey(label || req.body.name);
    if (!label) return res.status(400).json({ error: 'Nombre del rol requerido.' });
    if (name === 'admin') return res.status(400).json({ error: 'No se puede crear el rol administrador.' });
    if (name.length < 2) return res.status(400).json({ error: 'Nombre de rol inválido.' });
    const db = await getDb();
    await ensureRolesTable(db);
    try {
      await db.run('INSERT INTO roles (name, label) VALUES (?, ?)', [name, label]);
    } catch (e) {
      return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' });
    }
    logAction(req.user.id, req.user.email, 'Creación de rol', `Rol creado: ${label} (${name})`, req.ip);
    res.status(201).json({ name, label });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear rol.' });
  }
});

router.delete('/roles/:name', authenticate, requireAdmin, async (req, res) => {
  try {
    const name = roleKey(req.params.name);
    if (name === 'admin') return res.status(400).json({ error: 'No se puede eliminar el rol administrador.' });
    const db = await getDb();
    await ensureRolesTable(db);
    const count = await db.get('SELECT COUNT(*) as c FROM users WHERE LOWER(role) = ?', [name]);
    if (count && (count.c > 0 || (count.count || count.COUNT) > 0)) return res.status(400).json({ error: 'Hay usuarios asignados a este rol. Reasignalos primero.' });
    await db.run('DELETE FROM role_permissions WHERE role = ?', [name]);
    await db.run('DELETE FROM roles WHERE LOWER(name) = ?', [name]);
    logAction(req.user.id, req.user.email, 'Eliminación de rol', `Rol eliminado: ${name}`, req.ip);
    res.json({ message: 'Rol eliminado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar rol.' });
  }
});

router.get('/permissions/:role', authenticate, requireAdmin, async (req, res) => {
  try {
    const role = normalizeRole(req.params.role);
    const db = await getDb();
    const permissions = await getRolePermissions(db, role);
    res.json({ role, permissions, catalog: CATALOG, defaults: DEFAULT_ROLE_PERMISSIONS[role] || {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener permisos.' });
  }
});

router.put('/permissions/:role', authenticate, requireAdmin, async (req, res) => {
  try {
    const role = normalizeRole(req.params.role);
    const updates = req.body && req.body.permissions;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Permisos inválidos.' });
    }
    const db = await getDb();
    await setRolePermissions(db, role, updates);
    const permissions = await getRolePermissions(db, role);

    logAction(req.user.id, req.user.email, 'Cambio de permisos', `Permisos del rol ${role} actualizados`, req.ip);

    res.json({ message: 'Permisos actualizados correctamente.', role, permissions, catalog: CATALOG });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar permisos.' });
  }
});

router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const users = await db.all('SELECT id, name, email, role, created_at as fecha FROM users ORDER BY id');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const email = normalizeEmail(req.body.email);
    const role = normalizeRole(req.body.role || 'colaborador');
    if (!name || !email) return res.status(400).json({ error: 'Nombre y email requeridos.' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });

    const db = await getDb();
    const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (existing) return res.status(409).json({ error: 'El email ya está registrado.' });

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashed = bcrypt.hashSync(tempPassword, 10);
    await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, role]);

    const user = await db.get('SELECT id, name, email, role, created_at as fecha FROM users WHERE email = ?', [email]);
    user.tempPassword = tempPassword;

    logAction(req.user.id, req.user.email, 'Creación de usuario', `Usuario creado: ${name} (${email}) como ${role}`, req.ip);

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario.' });
  }
});

router.put('/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  try {
    const role = normalizeRole(req.body && req.body.role);
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }
    const db = await getDb();
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);

    logAction(req.user.id, req.user.email, 'Cambio de rol', `Usuario #${req.params.id} ahora es ${role}`, req.ip);

    res.json({ message: 'Rol actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar rol.' });
  }
});

router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT role, email FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (user.role === 'admin') return res.status(400).json({ error: 'No se puede eliminar al administrador principal.' });
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);

    logAction(req.user.id, req.user.email, 'Eliminación de usuario', `Usuario #${req.params.id} (${user.email}) eliminado`, req.ip);

    res.json({ message: 'Usuario eliminado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

router.get('/codes', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const codes = await db.all(`
      SELECT c.id, c.code, c.used, c.created_at, u.name as used_by_name
      FROM activation_codes c
      LEFT JOIN users u ON c.used_by = u.id
      ORDER BY c.created_at DESC
    `);
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener códigos.' });
  }
});

router.post('/codes', authenticate, requireAdmin, async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 50);
    const db = await getDb();
    const generated = [];
    for (let i = 0; i < count; i++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      try {
        await db.run('INSERT INTO activation_codes (code) VALUES (?)', [code]);
        generated.push(code);
      } catch { /* code exists, skip */ }
    }
    logAction(req.user.id, req.user.email, 'Creación de códigos', `${generated.length} códigos generados`, req.ip);

    res.status(201).json({ message: `${generated.length} código(s) generado(s).`, codes: generated });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar códigos.' });
  }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Ambas contraseñas son obligatorias.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

    logAction(req.user.id, req.user.email, 'Cambio de contraseña', '', req.ip);

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar contraseña.' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT id, name, email, role, created_at as fecha FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuario.' });
  }
});

router.delete('/codes/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const code = await db.get('SELECT * FROM activation_codes WHERE id = ?', [req.params.id]);
    if (!code) return res.status(404).json({ error: 'Código no encontrado.' });
    if (code.used) return res.status(400).json({ error: 'No se puede eliminar un código ya utilizado.' });
    await db.run('DELETE FROM activation_codes WHERE id = ?', [req.params.id]);

    logAction(req.user.id, req.user.email, 'Eliminación de código', `Código #${req.params.id} eliminado`, req.ip);

    res.json({ message: 'Código eliminado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar código.' });
  }
});

module.exports = router;
