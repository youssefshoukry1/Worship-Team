const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/components/testimonies/feedNotesStorage.js', 'utf8')
  .replace("import localforage from 'localforage';", '').replaceAll('export function', 'function');
function fixture() {
  const data = new Map(); let writes = 0;
  const disk = { getItem: async key => data.get(key), setItem: async (key, value) => { writes++; data.set(key, value); }, removeItem: async key => data.delete(key) };
  const ctx = { localforage: { createInstance: () => disk } };
  vm.runInNewContext(source + ';globalThis.api = { feedNotesStorage, clearFeedNotes };', ctx);
  return { ...ctx.api, data, disk, writes: () => writes };
}
test('feed disk snapshots are account scoped and identical writes are skipped', async () => {
  const f = fixture(), a = f.feedNotesStorage('a'), b = f.feedNotesStorage('b');
  const value = { version: 1, items: [{ body: 'Private to account a' }] };
  await a.set(value); await a.set(value);
  assert.equal(f.writes(), 1); assert.equal(await b.get(), null);
  assert.deepEqual(await a.get(), value);
});
test('logout invalidates queued and future writes from the old session, retaining other accounts', async () => {
  const f = fixture(), a = f.feedNotesStorage('a'), b = f.feedNotesStorage('b');
  await b.set({ version: 1, items: ['b'] });
  const queued = a.set({ version: 1, items: ['a'] });
  await f.clearFeedNotes('a'); await queued;
  await a.set({ version: 1, items: ['late'] });
  assert.equal(f.data.has('a'), false); assert.equal(await a.get(), null);
  assert.ok(await b.get());
  const next = f.feedNotesStorage('a'); await next.set({ version: 1, items: ['new login'] });
  assert.deepEqual((await next.get()).items, ['new login']);
});
test('a disk read that completes after logout cannot return the prior account snapshot', async () => {
  const f = fixture(), a = f.feedNotesStorage('a');
  let resolve; f.disk.getItem = () => new Promise(done => { resolve = done; });
  const reading = a.get(); await new Promise(done => setImmediate(done));
  await f.clearFeedNotes('a'); resolve({ version: 1, items: ['secret'] });
  assert.equal(await reading, null);
});
test('failed disk writes can be retried', async () => {
  const f = fixture(), a = f.feedNotesStorage('a');
  const original = f.disk.setItem;
  f.disk.setItem = async () => { throw new Error('quota'); };
  const value = { version: 1, items: [] };
  await assert.rejects(a.set(value)); f.disk.setItem = original;
  await a.set(value); assert.deepEqual(await a.get(), value);
});
