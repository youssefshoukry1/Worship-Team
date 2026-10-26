const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/components/testimonies/profileNotesStorage.js'), 'utf8')
  .replace("import localforage from 'localforage';", '').replace('export function', 'function');
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

test('persistent storage keeps only own notes and migrates previously saved friend profiles', async () => {
  const values = new Map([[`${A}:${A}`, { owner: A }], [`${A}:${B}`, { owner: B }], [`${A}:index`, [{ id: B }]], [`${B}:${B}`, { owner: B }]]);
  const context = { localforage: { createInstance: () => ({
    keys: async () => [...values.keys()], getItem: async key => values.get(key),
    setItem: async (key, value) => values.set(key, value), removeItem: async key => values.delete(key),
  }) } };
  vm.runInNewContext(source + ';globalThis.makeStorage = profileNotesStorage;', context);
  const storage = context.makeStorage(A);
  assert.equal((await storage.getItem(A)).owner, A);
  assert.equal(values.has(`${A}:${B}`), false);
  assert.equal(values.has(`${A}:index`), false);
  assert.equal(values.has(`${B}:${B}`), true, 'another account’s own cache is preserved');
  assert.equal(await storage.getItem(B), null);
  await storage.setItem(B, { unexpected: true });
  assert.equal(values.has(`${A}:${B}`), false);
  await storage.setItem(A, { updated: true });
  assert.equal(values.get(`${A}:${A}`).updated, true);
});
