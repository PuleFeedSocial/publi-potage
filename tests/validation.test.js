const { test } = require('node:test');
const assert = require('node:assert/strict');
const { count } = require('../services/sheets');
const { dateKey } = require('../services/validation');
const rateLimit = require('../middleware/rate-limit');

test('metric parsing accepts integers and thousands but not invalid quantities', () => {
  for (const value of [1234, '1.234', '1,234', '1 234']) assert.equal(count(value), 1234);
  assert.equal(count('1.234.567'), 1234567);
  assert.equal(count(''), 0);
  for (const value of [-1, '2.5', '3,5', '=1+1', {}, Infinity, '1.23.45']) assert.equal(count(value), null);
});
test('date matching normalizes formats and rejects impossible dates', () => {
  assert.equal(dateKey('20/10/2026'), '2026-10-20');
  assert.equal(dateKey('2026-10-20T12:00:00Z'), '2026-10-20');
  assert.equal(dateKey('29/02/2024'), '2024-02-29');
  for (const value of ['31/02/2026', '2026-13-01', '29/02/2025', {}, '']) assert.equal(dateKey(value), null);
});
test('rate limiter rejects excess attempts without blocking other addresses', () => {
  const middleware = rateLimit({ limit: 2 });
  let passed = 0, status;
  const res = { set() {}, status(code) { status = code; return this; }, json() {} };
  for (let i = 0; i < 3; i++) middleware({ ip: '127.0.0.1' }, res, () => passed++);
  assert.equal(status, 429);
  assert.equal(passed, 2);
  middleware({ ip: '127.0.0.2' }, res, () => passed++);
  assert.equal(passed, 3);
});
