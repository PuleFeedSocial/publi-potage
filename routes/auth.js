const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const getDb = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'Potage_S3cr3t_K3y_2026';

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, activationCode } = req.body;

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

    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'El email ya está registrado.' });
    }

    const code = await db.get('SELECT id FROM activation_codes WHERE code = ? AND used = 0', [activationCode]);
    if (!code) {
      return res.status(400).json({ error: 'Código de activación inválido o ya utilizado.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, 'Colaborador']);

    const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    await db.run('UPDATE activation_codes SET used = 1, used_by = ? WHERE id = ?', [user.id, code.id]);

    const token = jwt.sign({ id: user.id, name, email, role: 'Colaborador' }, SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Cuenta creada exitosamente.',
      token,
      user: { id: user.id, name, email, role: 'Colaborador' }
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
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
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
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nombre y email requeridos.' });

    const db = await getDb();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'El email ya está registrado.' });

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashed = bcrypt.hashSync(tempPassword, 10);
    await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, role || 'Colaborador']);

    const user = await db.get('SELECT id, name, email, role, created_at as fecha FROM users WHERE email = ?', [email]);
    user.tempPassword = tempPassword;
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario.' });
  }
});

router.put('/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['Admin', 'Colaborador'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }
    const db = await getDb();
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'Rol actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar rol.' });
  }
});

router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (user.role === 'admin') return res.status(400).json({ error: 'No se puede eliminar al administrador principal.' });
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
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
    res.json({ message: 'Código eliminado.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar código.' });
  }
});

module.exports = router;
