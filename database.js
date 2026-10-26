const { Pool } = require('pg');

let db = null;
let initializing = null;

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function convertDates(row) {
  if (!row || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(convertDates);
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    o[k] = v instanceof Date ? v.toISOString() : v;
  }
  return o;
}

async function initializeDb() {
  if (db) return db;

  let connStr = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/publi_potage';
  // Limpiar parametros que el driver pg no soporta
  connStr = connStr.replace(/&channel_binding=[^&]*/g, '').replace(/\?channel_binding=[^&]*&?/g, '?');
  const sslDisabled = /(\?|&)sslmode=disable/.test(connStr);

  const pool = new Pool({
    connectionString: connStr,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
    ssl: sslDisabled ? false : (process.env.DATABASE_URL ? { rejectUnauthorized: false } : false),
  });

  pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
  });

  try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activation_codes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      used INTEGER DEFAULT 0,
      used_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      email TEXT NOT NULL,
      accion TEXT NOT NULL,
      detalle TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS zonas (
      id SERIAL PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migración: zonas preexistentes sin estado
  await pool.query(`ALTER TABLE zonas ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE zonas ADD COLUMN IF NOT EXISTS sucursal_id TEXT`);
  await pool.query(`ALTER TABLE zonas ADD COLUMN IF NOT EXISTS sucursal_nombre TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS zonas_sucursal_unique ON zonas (sucursal_id) WHERE sucursal_id IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendario (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      fecha DATE NOT NULL,
      hora TEXT DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'tarea',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migración: mejora integral del calendario (horas fin, multi-día, autoría de realización, series)
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS hora_fin TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS fecha_fin DATE`);
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS responsable_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS realizado_por INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS realizado_en TIMESTAMP`);
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS serie_id INTEGER`);
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS serie_pos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE calendario ADD COLUMN IF NOT EXISTS recurrencia TEXT NOT NULL DEFAULT 'none'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_calendario_fecha ON calendario (fecha)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_calendario_serie ON calendario (serie_id)`);
  // Migración de estado: término consistente "realizada" (acepta ambos en la API)
  await pool.query(`UPDATE calendario SET estado = 'realizada' WHERE estado = 'completada'`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'sistema',
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      link TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      dedupe_key TEXT UNIQUE,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read, created_at DESC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT NOT NULL,
      permission TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (role, permission)
    )
  `);

  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE activation_codes DROP CONSTRAINT IF EXISTS activation_codes_used_by_fkey, ADD CONSTRAINT activation_codes_used_by_fkey FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL');
  await pool.query('ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_user_id_fkey, ADD CONSTRAINT logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
  } catch (err) {
    await pool.end();
    throw err;
  }
  db = adapter(pool);
  db._pool = pool;
  db.transaction = async work => {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const result = await work(adapter(connection));
      await connection.query('COMMIT');
      return result;
    } catch (err) {
      await connection.query('ROLLBACK');
      throw err;
    } finally { connection.release(); }
  };
  return db;
}

function adapter(connection) {
  return {
    run: (sql, params) => connection.query(toPg(sql), params),
    get: async (sql, params) => convertDates((await connection.query(toPg(sql), params)).rows[0] || null),
    all: async (sql, params) => convertDates((await connection.query(toPg(sql), params)).rows)
  };
}

function getDb() {
  if (db) return Promise.resolve(db);
  if (!initializing) initializing = initializeDb().catch(err => { initializing = null; throw err; });
  return initializing;
}

module.exports = getDb;
