const express = require('express');
const cors = require('cors');
const path = require('path');
const getDb = require('./database');
const bcrypt = require('bcryptjs');

const authRoutes = require('./routes/auth');
const marketingRoutes = require('./routes/marketing');
const gruposRoutes = require('./routes/grupos');
const historialRoutes = require('./routes/historial');
const informesRoutes = require('./routes/informes');
const zonasRoutes = require('./routes/zonas');
const sucursalesRoutes = require('./routes/sucursales');
const calendarioRoutes = require('./routes/calendario');
const { router: logsRoutes } = require('./routes/logs');
const { authenticate, requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos públicos: solo front-end. Nunca servir código del servidor,
// node_modules, .env, package.json ni la base de datos.
const STATIC_EXT = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.json', '.webmanifest', '.txt']);
const BLOCKED_TOP = new Set([
  'server.js', 'database.js', 'permissions.js', 'tokens.js',
  'package.json', 'package-lock.json', 'database.sqlite', '.env', '.env.example', '.gitignore'
]);

app.use(express.static(__dirname, {
  index: false,
  maxAge: 0,
  etag: true,
  filter(filePath) {
    const rel = path.relative(__dirname, filePath);
    if (!rel || rel.startsWith('..')) return false;
    const parts = rel.split(path.sep);
    if (parts.some(p => p.startsWith('.'))) return false;
    if (parts[0] === 'node_modules' || parts[0] === 'routes' || parts[0] === 'middleware') return false;
    if (parts.length === 1 && BLOCKED_TOP.has(parts[0])) return false;
    return STATIC_EXT.has(path.extname(filePath).toLowerCase());
  },
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-store');
    else res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  }
}));

app.get('/', (req, res) => res.redirect('/index.html'));

app.use('/api/auth', authRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/grupos', gruposRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/informes', informesRoutes);
app.use('/api/zonas', zonasRoutes);
app.use('/api/sucursales', sucursalesRoutes);
app.use('/api/calendario', calendarioRoutes);
app.use('/api/logs', logsRoutes);

async function runSeed() {
  const db = await getDb();

  const existing = await db.get('SELECT id FROM users WHERE email = ?', ['admin@potage.com']);
  if (existing) return;

  const adminEmail = 'admin@potage.com';
  const adminPassword = 'Admin123!';
  const hashed = bcrypt.hashSync(adminPassword, 10);
  await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    ['Víctor Alejandro', adminEmail, hashed, 'admin']);

  const codes = ['111111', '222222', '333333', '444444', '555555'];
  for (const code of codes) {
    try {
      await db.run('INSERT INTO activation_codes (code) VALUES (?)', [code]);
    } catch { }
  }

  console.log('Seed completado: admin + 5 códigos de activación creados.');
}

// El seed normal solo completa lo que falte (idempotente).
// Borrar datos (force=true) requiere administrador autenticado.
app.get('/api/seed', async (req, res) => {
  try {
    if (req.query.force === 'true') {
      const header = req.headers.authorization || '';
      if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autenticación requerida para forzar el seed.' });
      }
      const { verifyAccessToken } = require('./tokens');
      const payload = verifyAccessToken(header.split(' ')[1]);
      if (!payload.role || String(payload.role).toLowerCase() !== 'admin') {
        return res.status(403).json({ error: 'Se requiere rol de administrador.' });
      }
      const db = await getDb();
      await db.run('DELETE FROM activation_codes');
      await db.run('DELETE FROM users');
    }
    await runSeed();
    res.json({ message: 'Seed ejecutado correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en seed.' });
  }
});

// Diagnóstico mínimo (sin exponer emails ni datos sensibles).
app.get('/debug', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const adminCount = (await db.all("SELECT COUNT(*) as c FROM users WHERE role = 'admin'"))[0]?.c || 0;
    const userCount = (await db.all('SELECT COUNT(*) as c FROM users'))[0]?.c || 0;
    const codeCount = (await db.all('SELECT COUNT(*) as c FROM activation_codes'))[0]?.c || 0;
    res.json({ hasAdmin: adminCount > 0, userCount, codeCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

async function start() {
  const db = await getDb();
  await runSeed();

  process.on('SIGTERM', async () => {
    if (db._pool) await db._pool.end();
    process.exit(0);
  });

  app.listen(PORT, () => {
    console.log(`Potage SRL Server corriendo en puerto ${PORT}`);
  });
}

start();
