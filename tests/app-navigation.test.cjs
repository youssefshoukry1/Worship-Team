const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/appNavigation.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replaceAll('export function', 'function');
const currentWorker = { scriptURL: 'https://localhost/sw.js?v=navigation-v2' };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function setup(register = async () => ({ update: async () => {} })) {
  const listeners = new Set();
  const timers = new Map();
  let nextTimer = 0;
  let registrations = 0;
  const serviceWorker = {
    controller: null,
    // Deliberately never resolves: readiness must depend on actual control.
    ready: new Promise(() => {}),
    register(...args) { registrations++; return register(...args); },
    addEventListener(type, listener) { assert.equal(type, 'controllerchange'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'controllerchange'); listeners.delete(listener); },
  };
  const context = {
    navigator: { serviceWorker },
    window: {
      setTimeout(callback, ms) { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
  };
  vm.runInNewContext(source + ';globalThis.ensure = ensureNavigationServiceWorker;', context);
  return {
    context, serviceWorker, listeners, timers,
    ensure: context.ensure,
    get registrations() { return registrations; },
    control(worker = currentWorker) {
      serviceWorker.controller = worker;
      for (const listener of [...listeners]) listener();
    },
    timeout() {
      assert.equal(timers.size, 1);
      const { callback, ms } = [...timers.values()][0];
      assert.equal(ms, 4000);
      callback();
    },
  };
}

test('ready controller navigates immediately without registration or a timer', async () => {
  const h = setup();
  h.serviceWorker.controller = currentWorker;
  assert.equal(await h.ensure(), true);
  assert.equal(h.registrations, 0);
  assert.equal(h.timers.size, 0);
});

test('missing service-worker support safely uses the compatibility fallback', async () => {
  const h = setup();
  delete h.context.navigator.serviceWorker;
  assert.equal(await h.ensure(), false);
});

test('concurrent callers share registration and resolve on control even while register and ready hang', async () => {
  const h = setup(() => new Promise(() => {}));
  const first = h.ensure();
  assert.equal(h.ensure(), first);
  assert.equal(h.registrations, 1);
  h.control({ scriptURL: 'https://localhost/sw.js?v=old' });
  assert.equal(h.listeners.size, 1);
  h.control();
  assert.equal(await first, true);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test('the deadline covers stalled registration and later calls can retry', async () => {
  const h = setup(() => new Promise(() => {}));
  const first = h.ensure();
  h.timeout();
  assert.equal(await first, false);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  const retry = h.ensure();
  assert.notEqual(retry, first);
  assert.equal(h.registrations, 2);
  h.control();
  assert.equal(await retry, true);
});

test('registration succeeding without taking control is also bounded', async () => {
  const h = setup();
  const ready = h.ensure();
  await flush();
  h.timeout();
  assert.equal(await ready, false);
  assert.equal(h.listeners.size, 0);
});

test('registration rejection cleans up and does not poison the session', async () => {
  let fail = true;
  const h = setup(async () => {
    if (fail) throw new Error('temporary registration failure');
    return { update: async () => {} };
  });
  assert.equal(await h.ensure(), false);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  fail = false;
  const retry = h.ensure();
  h.control();
  assert.equal(await retry, true);
});

test('timing out does not stop worker installation or its update check', async () => {
  let finishRegistration;
  let updates = 0;
  const h = setup(() => new Promise(resolve => { finishRegistration = resolve; }));
  const ready = h.ensure();
  h.timeout();
  assert.equal(await ready, false);
  finishRegistration({ update: async () => { updates++; } });
  await flush();
  assert.equal(updates, 1);
  h.control();
  assert.equal(await h.ensure(), true);
  assert.equal(h.registrations, 1);
  assert.equal(h.listeners.size, 0);
});

test('a rejected update check does not prevent use of a controlling worker', async () => {
  const h = setup(async () => ({ update: async () => { throw new Error('offline'); } }));
  const ready = h.ensure();
  await flush();
  h.control();
  assert.equal(await ready, true);
});
