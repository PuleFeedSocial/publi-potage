const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

test('inline arguments preserve names without allowing quote injection', () => {
  const context = vm.createContext({});
  vm.runInContext(source.match(/function encArg\(s\) \{[^\n]+/)[0], context);
  const value = `O'Brien\\');alert(1);//"<img src=x onerror=alert(1)>`;
  const encoded = context.encArg(value);
  assert.equal(decodeURIComponent(encoded), value);
  assert.doesNotMatch(encoded, /['"<>\\]/);
  assert.equal(vm.runInContext(`decodeURIComponent('${encoded}')`, context), value);
});

for (const [name, fetch, expected] of [
  ['network failure', async () => { throw new Error('offline'); }, null],
  ['service unavailable', async () => ({ status: 503, json: async () => ({}) }), null],
  ['proxy HTML error', async () => ({ status: 502, json: async () => { throw new Error('HTML'); } }), null],
  ['revoked credentials', async () => ({ status: 401, json: async () => ({}) }), false],
  ['valid renewal', async () => ({ status: 200, json: async () => ({ token: 'new', user: {} }) }), true]
]) {
  test('session renewal distinguishes ' + name, async () => {
    let saved = false;
    const context = vm.createContext({ fetch, API_BASE: '', getToken: () => 'old', getRefreshToken: () => 'refresh', setSession: () => { saved = true; } });
    vm.runInContext(source.slice(source.indexOf('let _refreshPromise'), source.indexOf('function ensureFreshToken')), context);
    assert.equal(await context.refreshSession(), expected);
    assert.equal(saved, expected === true);
  });
}
