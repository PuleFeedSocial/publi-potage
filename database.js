const { Pool } = require('pg');

let db = null;

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

async function getDb() {
  if (db) return db;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/publi_potage',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
  });

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
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT DEFAULT '',
      message TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id)
    )
  `);

  db = {
    run: async (sql, params) => {
      return await pool.query(toPg(sql), params);
    },
    get: async (sql, params) => {
      const result = await pool.query(toPg(sql), params);
      return convertDates(result.rows[0] || null);
    },
    all: async (sql, params) => {
      const result = await pool.query(toPg(sql), params);
      return convertDates(result.rows);
    },
    _pool: pool,
  };

  return db;
}

module.exports = getDb;
