const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/utils/nativeLaunch.js', 'utf8')
  .replace(/^import .*;$/m, '').replaceAll('export function', 'function');

function launch(native = true, plugin = true) {
  const timers = new Map();
  const context = vm.createContext({
    Capacitor: { isNativePlatform: () => native, isPluginAvailable: () => plugin },
    setTimeout(callback, delay) { timers.set(callback, delay); return callback; },
    clearTimeout(key) { timers.delete(key); },
  });
  vm.runInContext(source, context);
  return { ...context, timers };
}

test('all startup services share one handoff, including services mounted after dismissal', async () => {
  const app = launch();
  const waiting = app.waitForNativeLaunch();
  assert.equal(app.waitForNativeLaunch(), waiting);
  assert.equal(app.timers.size, 1);
  app.finishNativeLaunch();
  await waiting;
  await app.waitForNativeLaunch();
  assert.equal(app.timers.size, 0);
});

test('the recovery deadline releases startup services if the native callback is lost', async () => {
  const app = launch();
  const waiting = app.waitForNativeLaunch();
  const [[recover, delay]] = app.timers;
  assert.equal(delay, 10000);
  recover();
  await waiting;
  app.finishNativeLaunch();
  assert.equal(app.timers.size, 0);
});

test('web and older native shells start services without waiting for a cover', async () => {
  for (const app of [launch(false), launch(true, false)]) {
    await app.waitForNativeLaunch();
    assert.equal(app.timers.size, 0);
  }
});
