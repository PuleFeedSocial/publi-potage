const { test } = require('node:test');
const assert = require('node:assert/strict');
let pools = 0, released = 0;
const statements = [];
const connection = {
  async query(sql, params) {
    statements.push({ sql, params });
    if (sql === 'FAIL') throw new Error('database failure');
    return { rows: [{ value: 1 }] };
  },
  release() { released++; }
};
class Pool {
  constructor() { pools++; }
  on() {}
  query(...args) { return connection.query(...args); }
  async connect() { return connection; }
  async end() {}
}
require.cache[require.resolve('pg')] = { exports: { Pool } };
const getDb = require('../database');
test('concurrent initialization shares one pool and one initialized adapter', async () => {
  const [a, b] = await Promise.all([getDb(), getDb()]);
  assert.equal(a, b);
  assert.equal(pools, 1);
  assert.ok(statements.some(s => s.sql.includes('token_version')));
});
test('transactions use a single connection, commit and release it', async () => {
  const db = await getDb();
  const result = await db.transaction(async tx => tx.get('SELECT ? AS value', [1]));
  assert.equal(result.value, 1);
  assert.equal(statements.at(-1).sql, 'COMMIT');
  assert.ok(statements.some(s => s.sql === 'SELECT $1 AS value'));
  assert.equal(released, 1);
});
test('failed transactions roll back and release their connection', async () => {
  const db = await getDb();
  await assert.rejects(db.transaction(tx => tx.run('FAIL')), /database failure/);
  assert.equal(statements.at(-1).sql, 'ROLLBACK');
  assert.equal(released, 2);
});
