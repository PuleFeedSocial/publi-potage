const express = require('express');
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
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)'
  });
  next();
});
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', require('./services/validation').objectBody);

// Archivos públicos: solo front-end. Nunca servir código del servidor,
// node_modules, .env, package.json ni la base de datos.
const PUBLIC_FILES = new Set([
  'index.html', 'login.html', 'register.html', 'dashboard.html', 'grupos.html',
  'informes.html', 'sucursales.html', 'calendario.html', 'logs.html', 'ayuda.html',
  'account-settings.html', 'politicas-privacidad.html', 'terminos-condiciones.html',
  'app.js', 'theme.js', 'style.css', 'sw.js', 'manifest.json',
  'output/pdf/politicas-privacidad-atlas.pdf'
]);
const servePublic = express.static(__dirname, {
  index: false, dotfiles: 'deny', redirect: false,
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', filePath.endsWith('sw.js') ? 'no-store' : 'public, max-age=0, must-revalidate');
  }
});
app.use((req, res, next) => {
  let pathname;
  try { pathname = decodeURIComponent(req.path); } catch { return res.sendStatus(400); }
  if (PUBLIC_FILES.has(pathname.slice(1)) || /^\/img\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|svg|ico)$/.test(pathname)) {
    return servePublic(req, res, next);
  }
  next();
});

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
  if (await db.get("SELECT id FROM users WHERE LOWER(role) = 'admin' LIMIT 1")) return;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('La base no tiene administrador. Configurá ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres).');
  }
  await db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING',
    ['Administrador', email.trim().toLowerCase(), await bcrypt.hash(password, 10), 'admin']);
  if (!await db.get("SELECT id FROM users WHERE LOWER(role) = 'admin' LIMIT 1")) {
    throw new Error('ADMIN_EMAIL ya pertenece a otro usuario. Elegí un email nuevo para inicializar el administrador.');
  }
}

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
  const status = err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500;
  if (status === 500) console.error(err.stack);
  res.status(status).json({ error: status === 413 ? 'La solicitud supera el límite de 5 MB.' : status === 400 ? 'JSON inválido.' : 'Error interno del servidor.' });
});

async function start() {
  const db = await getDb();
  try { await runSeed(); } catch (err) { await db._pool.end(); throw err; }
  const server = app.listen(PORT, () => {
    console.log(`Potage SRL Server corriendo en puerto ${PORT}`);
  });
  process.once('SIGTERM', () => {
    const deadline = setTimeout(() => process.exit(1), 30000);
    deadline.unref();
    server.close(async () => {
      try { await db._pool.end(); clearTimeout(deadline); }
      catch { process.exitCode = 1; }
    });
  });
  return server;
}

if (require.main === module) start().catch(err => { console.error(err.message); process.exitCode = 1; });
module.exports = { app, start };
