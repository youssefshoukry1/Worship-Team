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

test('a legacy owner archive restores twelve bodies and updates a saved older body without loading it into the head', async () => {
  const items = Array.from({ length: 120 }, (_, n) => ({ _id: String(n), createdAt: String(n), contentVersion: 1, body: 'Saved ' + n }));
  const manifest = items.map(({ body, ...row }) => row);
  const values = new Map([[`${A}:${A}`, { ready: true, items, manifest }]]);
  const reads = [];
  const context = { localforage: { createInstance: () => ({
    keys: async () => [...values.keys()], getItem: async key => { reads.push(key); return values.get(key); },
    setItem: async (key, value) => values.set(key, value), removeItem: async key => values.delete(key),
  }) } };
  vm.runInNewContext(source + ';globalThis.makeStorage = profileNotesStorage;', context);
  const storage = context.makeStorage(A);
  const head = await storage.getItem(A);
  assert.equal(head.items.length, 12);
  reads.length = 0;
  assert.equal((await storage.bodies(A, [manifest[119]]))[0].body, 'Saved 119');
  assert.equal(reads.length, 1);
  const edited = { ...items[119], contentVersion: 2, body: 'Corrected' };
  const updated = manifest.slice(1).map(row => row._id === edited._id ? { ...row, contentVersion: 2 } : row);
  await storage.setItem(A, { ...head, manifest: updated, items: head.items.slice(1) }, [edited]);
  assert.equal((await storage.bodies(A, [manifest[0], manifest[119]])).length, 0);
  assert.equal((await storage.bodies(A, [updated.at(-1)]))[0].body, 'Corrected');
  assert.equal((await storage.bodies(B, [updated.at(-1)])).length, 0);
});
