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
const { router: logsRoutes } = require('./routes/logs');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

app.use('/api/auth', authRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/grupos', gruposRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/informes', informesRoutes);
app.use('/api/zonas', zonasRoutes);
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

app.get('/api/seed', async (req, res) => {
  try {
    if (req.query.force === 'true') {
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

app.get('/debug', async (req, res) => {
  try {
    const db = await getDb();
    const admin = await db.get('SELECT id, email, role FROM users WHERE role = ?', ['admin']);
    const userCount = (await db.all('SELECT COUNT(*) as c FROM users'))[0]?.c || 0;
    const codeCount = (await db.all('SELECT COUNT(*) as c FROM activation_codes'))[0]?.c || 0;
    res.json({ admin: admin || null, userCount, codeCount });
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
