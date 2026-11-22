const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'app.js'), 'utf8');
const loaderSource = appSource.slice(
  appSource.indexOf('const PageLoader = (() => {'),
  appSource.indexOf('function showPageLoader(')
);
assert.ok(loaderSource.includes('const PageLoader'), 'No se encontró el módulo de carga.');

function fakeElement(tag = 'div') {
  const classes = new Set();
  const listeners = {};
  const element = {
    tagName: tag,
    children: [],
    attributes: {},
    textContent: '',
    className: '',
    inert: false,
    isConnected: true,
    focused: false,
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name)
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    dispatch(name, event) { (listeners[name] || []).forEach(fn => fn(event)); },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    focus() { focusedElement = this; this.focused = true; },
    querySelector(selector) {
      const className = selector.replace('.', '');
      return this.children.find(child => child.className.split(' ').includes(className)) || null;
    },
    set innerHTML(html) {
      this.children = [];
      for (const match of html.matchAll(/class="([^"]+)"/g)) {
        const child = fakeElement('div');
        child.className = match[1];
        this.appendChild(child);
      }
    },
    get innerHTML() { return this._html || ''; }
  };
  return element;
}
let focusedElement;

function context() {
  focusedElement = { focus() { focusedElement = this; } };
  const body = fakeElement('body');
  const app = fakeElement('div');
  app.className = 'app-container';
  body.appendChild(app);
  focusedElement = app;
  const documentObject = {
    body,
    activeElement: app,
    getElementById: id => (id === 'page-loader' ? null : null),
    createElement: tag => fakeElement(tag)
  };
  const sandbox = { document: documentObject, setTimeout, clearTimeout, Date, Promise, console };
  vm.createContext(sandbox);
  vm.runInContext(loaderSource, sandbox);
  return { sandbox, body, app, get loader() { return vm.runInContext('PageLoader', sandbox); } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 420));

test('the blocking loader covers the page and releases it after the task settles', async () => {
  const { body, app, loader } = context();
  let resolveTask;
  const task = new Promise(resolve => { resolveTask = resolve; });
  const tracked = loader.track(() => task, 'Cargando informes…');
  assert.equal(loader.active(), true);
  assert.equal(body.classList.contains('page-loading'), true);
  assert.equal(app.inert, true);
  resolveTask();
  await tracked;
  await tick();
  assert.equal(loader.active(), false);
  assert.equal(body.classList.contains('page-loading'), false);
  assert.equal(app.inert, false);
});

test('concurrent data loads keep the loader visible until the last one finishes', async () => {
  const { loader } = context();
  let first, second;
  const one = loader.track(new Promise(resolve => { first = resolve; }));
  const two = loader.track(new Promise(resolve => { second = resolve; }));
  first();
  await one;
  await tick();
  assert.equal(loader.active(), true);
  second();
  await two;
  await tick();
  assert.equal(loader.active(), false);
});

test('track also waits for an already-started promise', async () => {
  const { loader } = context();
  let resolveTask;
  const promise = new Promise(resolve => { resolveTask = resolve; });
  const tracked = loader.track(promise, 'Cargando datos ya iniciados…');
  assert.equal(loader.active(), true);
  resolveTask();
  await tracked;
  await tick();
  assert.equal(loader.active(), false);
});

test('manual show/hide changes the message and restores focus', async () => {
  const { body, app, loader } = context();
  loader.show('Actualizando datos…');
  assert.equal(loader.active(), true);
  assert.equal(body.classList.contains('page-loading'), true);
  loader.hide();
  await tick();
  assert.equal(loader.active(), false);
  assert.equal(focusedElement, app);
});
