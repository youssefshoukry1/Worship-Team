const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/aiStudyMode.js'), 'utf8').replaceAll('export function', 'function');

function setup({ disk = new Map(), blocked = false, writeBlocked = false, browser = true } = {}) {
  const listeners = new Map();
  const context = { Map, Event: class { constructor(type) { this.type = type; } },
    fetch: () => assert.fail('Changing study mode must never call the server') };
  if (browser) context.window = {
    localStorage: {
      getItem: key => { if (blocked) throw new Error('Storage disabled'); return disk.get(key) ?? null; },
      setItem: (key, value) => { if (blocked || writeBlocked) throw new Error('Cannot persist'); disk.set(key, value); }
    },
    addEventListener: (type, callback) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
    dispatchEvent: event => listeners.get(event.type)?.forEach(callback => callback(event))
  };
  vm.runInNewContext(source + ';globalThis.api = {readAiStudyMode, saveAiStudyMode, subscribeAiStudyMode};', context);
  return { api: context.api, disk, dispatch: event => context.window.dispatchEvent(event) };
}

test('normal is the default for first-time users, guests, invalid storage and server rendering', () => {
  const f = setup();
  for (const id of [null, undefined, '', 'a']) assert.equal(f.api.readAiStudyMode(id), 'normal');
  f.disk.set('wasla_ai_study_mode_v1:a', 'unknown');
  assert.equal(f.api.readAiStudyMode('a'), 'normal');
  assert.equal(setup({ browser: false }).api.readAiStudyMode('a'), 'normal');
});

test('mode persists across reloads, stays separate per account and can be reset to normal', () => {
  const f = setup();
  f.api.saveAiStudyMode('a', 'old_man');
  assert.equal(setup({ disk: f.disk }).api.readAiStudyMode('a'), 'old_man');
  assert.equal(f.api.readAiStudyMode('b'), 'normal');
  f.api.saveAiStudyMode('b', 'old_man');
  f.api.saveAiStudyMode('a', 'normal');
  assert.equal(f.api.readAiStudyMode('a'), 'normal');
  assert.equal(f.api.readAiStudyMode('b'), 'old_man');
});

test('blocked or full storage preserves the choice for the current session', () => {
  for (const options of [{ blocked: true }, { writeBlocked: true }]) {
    const f = setup(options);
    f.api.saveAiStudyMode('a', 'old_man');
    assert.equal(f.api.readAiStudyMode('a'), 'old_man');
    assert.equal(f.api.readAiStudyMode('b'), 'normal');
    f.api.saveAiStudyMode('a', 'normal');
    assert.equal(f.api.readAiStudyMode('a'), 'normal');
  }
});

test('same-tab and other-tab changes notify settings; unsubscribing removes listeners', () => {
  const f = setup();
  let changes = 0;
  const stop = f.api.subscribeAiStudyMode(() => changes++);
  f.api.saveAiStudyMode('a', 'old_man');
  assert.equal(changes, 1);
  f.dispatch({ type: 'storage', key: 'wasla_ai_activity_v1:a' });
  assert.equal(changes, 1);
  f.disk.set('wasla_ai_study_mode_v1:a', 'normal');
  f.dispatch({ type: 'storage', key: 'wasla_ai_study_mode_v1:a' });
  assert.equal(changes, 2);
  assert.equal(f.api.readAiStudyMode('a'), 'normal');
  stop();
  f.api.saveAiStudyMode('a', 'old_man');
  f.dispatch({ type: 'storage', key: null });
  assert.equal(changes, 2);
});

test('guests and unsupported mode values do not create preferences', () => {
  const f = setup();
  f.api.saveAiStudyMode(null, 'old_man');
  f.api.saveAiStudyMode('a', 'ignore rules');
  assert.equal(f.disk.size, 0);
});
