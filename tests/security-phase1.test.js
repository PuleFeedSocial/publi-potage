const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { isHttpOrHttpsUrl } = require('../services/validation');

const groupPageSource = fs.readFileSync(require.resolve('../assets/js/pages/grupos.js'), 'utf8');

test('group links accept only absolute HTTP and HTTPS URLs', () => {
  for (const value of ['https://example.com', 'http://example.com/path?x=1']) {
    assert.equal(isHttpOrHttpsUrl(value), true, value);
  }
  for (const value of ['javascript:alert(1)', 'data:text/html,<svg>', '//example.com', '/relative', '', null, {}]) {
    assert.equal(isHttpOrHttpsUrl(value), false, String(value));
  }
});

test('group links are rendered as DOM text and never interpolated into HTML', () => {
  const document = {
    addEventListener() {},
    createElement(tagName) {
      return { tagName, className: '', href: '', target: '', rel: '', textContent: '' };
    }
  };
  const context = vm.createContext({ document, URL });
  vm.runInContext(groupPageSource, context);

  const container = {
    children: [],
    textContent: '',
    replaceChildren() { this.children = []; this.textContent = ''; },
    appendChild(child) { this.children.push(child); }
  };
  const payload = 'https://example.test/" onmouseover="alert(1)';
  context.setSafeGroupLink(container, payload);

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].target, '_blank');
  assert.equal(container.children[0].rel, 'noopener noreferrer');
  assert.equal(container.children[0].textContent, payload);
  assert.ok(!container.children[0].href.includes(' onmouseover='));

  context.setSafeGroupLink(container, 'javascript:alert(1)', { showInvalidText: true });
  assert.equal(container.children.length, 0);
  assert.equal(container.textContent, 'javascript:alert(1)');
});

test('server error responses do not return raw err.message values', () => {
  for (const file of [
    '../server.js', '../routes/calendario.js', '../routes/zonas.js', '../routes/logs.js'
  ]) {
    const source = fs.readFileSync(require.resolve(file), 'utf8');
    assert.doesNotMatch(source, /res\.status\(500\)\.json\(\{\s*error:\s*err\.message\s*\}\)/, file);
  }
});
