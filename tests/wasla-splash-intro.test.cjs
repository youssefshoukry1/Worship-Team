const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/components/WaslaSplashIntro.jsx'), 'utf8'),
  { compilerOptions: { allowJs: true, esModuleInterop: true, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

const versionExports = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/utils/appVersion.js'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText, { exports: versionExports });

async function launch({ saved, version = '1.0.76', native = false, bundle, fetchError = false, currentError = false, storageError = false, cancel = false, showSplash = true } = {}) {
  const storage = new Map(saved === undefined ? [] : [['wasla_splash_version', saved]]);
  const state = [], timers = [], events = [];
  let cursor = 0, effect, fetches = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    },
    useEffect(callback) { effect = callback; },
  };
  const modules = {
    react,
    'framer-motion': { motion: new Proxy({}, { get: (_, key) => key }), AnimatePresence: 'presence' },
    '../Navbar/WaslaLogo': 'logo',
    '../utils/appVersion': versionExports,
    '../services/otaUpdateService': { shouldShowReleaseSplash: () => showSplash === true },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => native } },
    '@capgo/capacitor-updater': { CapacitorUpdater: { current: async () => {
      if (currentError) throw new Error('native unavailable');
      return { bundle: bundle || { id: 'active', version } };
    } } },
  };
  const context = {
    exports: {}, require: name => {
      assert.ok(name in modules, `Unexpected module: ${name}`);
      return modules[name];
    },
    window: { dispatchEvent: event => events.push(event.type) },
    localStorage: {
      getItem: key => { if (storageError) throw new Error('storage unavailable'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (storageError) throw new Error('storage unavailable'); storage.set(key, value); },
    },
    fetch: async () => {
      fetches++;
      if (fetchError) throw new Error('offline');
      return { ok: true, json: async () => ({ version }) };
    },
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout: callback => timers.push(callback), Date,
  };
  vm.runInNewContext(source, context);
  const render = () => { cursor = 0; return context.exports.default(); };
  render();
  const cleanup = effect();
  if (cancel) cleanup();
  await new Promise(resolve => setImmediate(resolve));
  return { state, storage, events, context, render, timers, fetches };
}

test('first opening records the current version without showing an update', async () => {
  for (const native of [false, true]) {
    const app = await launch({ native });
    assert.equal(app.state[0], false);
    assert.equal(app.storage.get('wasla_splash_version'), '1.0.76');
    assert.deepEqual(app.events, ['wasla_splash_done']);
  }
});

test('equal versions, numeric equivalents and downgrades do not show the intro', async () => {
  for (const [saved, version] of [['1.0.76', '1.0.76'], ['1.0.76', '1.0.75'], ['1.0.9', '1.0.8'], ['1.0', '1.0.0']]) {
    const app = await launch({ saved, version });
    assert.equal(app.state[0], false);
    assert.equal(app.storage.get('wasla_splash_version'), saved);
    assert.deepEqual(app.events, ['wasla_splash_done']);
  }
});

test('higher versions show the intro, including numeric ordering across digit boundaries', async () => {
  for (const native of [false, true]) {
    for (const [saved, version] of [['1.0.75', '1.0.76'], ['1.0.9', '1.0.10'], ['1.9.99', '2.0.0']]) {
      const app = await launch({ saved, version, native });
      assert.equal(app.state[0], true);
      assert.equal(app.state[1], version);
      assert.equal(app.context.window.__wasla_splash_active, true);
    }
  }
});

test('native intro uses the active bundle even if local metadata advertises a higher version', async () => {
  const app = await launch({ saved: '1.0.76', version: '1.0.99', native: true, bundle: { id: 'active', version: '1.0.76' } });
  assert.equal(app.state[0], false);
  assert.equal(app.fetches, 0);
});

test('native built-in bundle uses local web metadata rather than the binary version', async () => {
  const app = await launch({ saved: '1.0.76', native: true, bundle: { id: 'builtin', version: '1.0.6' } });
  assert.equal(app.state[0], false);
  assert.equal(app.fetches, 1);
});

test('invalid saved versions establish a baseline without an update intro', async () => {
  for (const saved of ['', 'builtin', 'broken']) {
    const app = await launch({ saved });
    assert.equal(app.state[0], false);
    assert.equal(app.storage.get('wasla_splash_version'), '1.0.76');
  }
});

test('failed checks, invalid metadata and unavailable storage skip the intro and release waiting tours', async () => {
  for (const options of [{ fetchError: true }, { version: null }, { version: 'invalid' }, { native: true, currentError: true }, { storageError: true }]) {
    const app = await launch(options);
    assert.equal(app.state[0], false);
    assert.deepEqual(app.events, ['wasla_splash_done']);
  }
});

test('completed upgrade is remembered and does not show again on reopening', async () => {
  const app = await launch({ saved: '1.0.75' });
  const findLogo = node => node && typeof node === 'object' && (node.type === 'logo' ? node : node.children?.map(findLogo).find(Boolean));
  findLogo(app.render()).props.onComplete();
  app.timers.forEach(callback => callback());
  assert.equal(app.state[0], false);
  const saved = app.storage.get('wasla_splash_version');
  assert.equal(saved, '1.0.76');
  app.render().props.onExitComplete();
  assert.equal(app.context.window.__wasla_splash_done, true);
  assert.equal((await launch({ saved })).state[0], false);
});

test('unmounted checks cannot show an intro or overwrite saved state', async () => {
  const app = await launch({ saved: '1.0.75', cancel: true });
  assert.equal(app.state[0], false);
  assert.equal(app.storage.get('wasla_splash_version'), '1.0.75');
  assert.deepEqual(app.events, []);
});

test('disabled or missing release policy suppresses the intro and records the higher version', async () => {
  for (const showSplash of [false, null]) {
    const app = await launch({ saved: '1.0.75', native: true, showSplash });
    assert.equal(app.state[0], false);
    assert.equal(app.storage.get('wasla_splash_version'), '1.0.76');
    assert.deepEqual(app.events, ['wasla_splash_done']);
  }
});
