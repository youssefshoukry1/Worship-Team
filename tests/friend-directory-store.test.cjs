const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const ctx = { AbortController };
vm.runInNewContext(fs.readFileSync('src/app/utils/friendDirectory/store.js', 'utf8').replaceAll('export ', '') + ';globalThis.create = createFriendDirectory;', ctx);
const id = n => n.toString(16).padStart(24, '0');
const person = n => ({ _id: id(n), Name: `Person ${n}`, username: `user${n}`, revision: 1 });
function fixture(initial = [], cacheValue = null) {
  let people = initial, offline = false, clock = 10000; const events = [];
  const calls = [], writes = [], rows = new Map((cacheValue?.items || []).map(item => [item._id, item]));
  let meta = cacheValue?.meta;
  const cache = { load: async () => ({ items: [...rows.values()], meta }), save: async change => {
    writes.push(change); for (const item of change.upserts || []) rows.set(item._id, item); for (const key of change.removed || []) rows.delete(key); if (change.meta) meta = JSON.parse(JSON.stringify(change.meta));
  } };
  const store = ctx.create({ cache, now: () => clock, request: async (path, options) => {
    calls.push(path); if (offline) throw new Error('Offline');
    const url = new URL('https://test/friends-directory' + path);
    if (path.startsWith('/snapshot')) {
      const after = url.searchParams.get('after'), cursor = url.searchParams.get('cursor') || String(events.length);
      const rows = people.filter(item => !after || item._id > after);
      return { items: rows.slice(0, 200), next: rows.length > 200 ? rows[199]._id : null, cursor };
    }
    const cursor = Number(url.searchParams.get('cursor'));
    const batch = events.slice(cursor, cursor + 200);
    return { changes: batch, cursor: String(cursor + batch.length), hasMore: cursor + batch.length < events.length };

  } });
  return { store, calls, writes, rows, cache, saved: () => ({ items: [...rows.values()], meta }), people: value => {
    for (const row of people) if (!value.some(next => next._id === row._id)) events.push({ type: 'remove', id: row._id });
    for (const row of value) if (JSON.stringify(row) !== JSON.stringify(people.find(old => old._id === row._id))) events.push({ type: 'upsert', person: row });
    people = value;
  }, offline: value => { offline = value; }, time: value => { clock = value; } };
}
test('initial batched directory supports local search across thousands without query requests', async () => {
  const f = fixture(Array.from({ length: 10000 }, (_, i) => person(i + 1)));
  await f.store.sync();
  assert.equal(f.store.getSnapshot().complete, true); assert.equal(f.rows.size, 10000);
  assert.equal(f.calls.filter(path => path.startsWith('/snapshot')).length, 50);
  const before = f.calls.length, started = performance.now();
  for (let n = 1; n <= 100; n++) assert.ok(f.store.search(`user${n}`).length);
  console.log(`100 local searches over 10,000 names: ${(performance.now() - started).toFixed(1)}ms`);
  assert.equal(f.store.search('user10000')[0]._id, id(10000)); assert.equal(f.calls.length, before);
  f.store.dispose();
});
test('offline restart retains complete names and does not require a server search', async () => {
  const original = fixture([person(1), person(2)]); await original.store.sync(); original.store.dispose();
  const f = fixture([], original.saved()); f.offline(true); await f.store.sync();
  assert.equal(f.store.getSnapshot().complete, true); assert.equal(f.store.search('user2').length, 1); f.store.dispose();
});
test('delta updates names, fetches newly accepted old profiles, removes revoked friends and writes changed rows only', async () => {
  const f = fixture([person(1), person(2)]); await f.store.sync(); f.writes.length = 0;
  f.time(20000); f.people([{ ...person(1), Name: 'Renamed', revision: 15000 }, person(3)]);
  await f.store.sync(true);
  assert.equal(f.store.search('Renamed').length, 1); assert.equal(f.store.search('user2').length, 0); assert.equal(f.store.search('user3').length, 1);
  assert.equal(f.rows.has(id(2)), false); assert.equal(f.calls.filter(path => path.startsWith('/snapshot')).length, 1);
  assert.deepEqual(f.writes.flatMap(change => change.upserts || []).map(item => item._id).sort(), [id(1), id(3)]);
  f.store.dispose();
});
test('optimistic removal updates disk and rolls back on rejection, while remote removal cannot restore from a late response', async () => {
  const f = fixture([person(1), person(2)]); await f.store.sync(); f.offline(true);
  const settle = f.store.beginRemoval(id(1));
  assert.equal(f.store.search('user1').length, 0); await f.store.sync();
  settle(false); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.store.search('user1').length, 1); assert.equal(f.rows.has(id(1)), true);
  f.store.removeKnown(id(1)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.rows.has(id(1)), false); f.store.dispose();
});
test('failed initial sync stays partial and resumes without losing downloaded records', async () => {
  const data = Array.from({ length: 205 }, (_, i) => person(i + 1));
  const f = fixture(data); const original = f.cache.save;
  f.cache.save = async change => { await original(change); if ((change.upserts || []).length === 200) f.offline(true); };
  await f.store.sync(); assert.equal(f.store.getSnapshot().complete, false); assert.equal(f.rows.size, 200);
  f.cache.save = original; f.offline(false); await f.store.sync(true);
  assert.equal(f.store.getSnapshot().complete, true); assert.equal(f.rows.size, 205); f.store.dispose();
});
test('membership changes mid-sync are revalidated before claiming completeness', async () => {
  const f = fixture([person(1), person(2)]), original = f.cache.save; let changed = false;
  f.cache.save = async update => { await original(update); if (update.upserts?.length && !changed) { changed = true; f.people([person(2), person(3)]); } };
  await f.store.sync();
  assert.equal(f.store.getSnapshot().complete, true); assert.equal(f.rows.has(id(1)), false); assert.equal(f.rows.has(id(3)), true); f.store.dispose();
});

test('late responses cannot resurrect a removed friend and normalized Arabic/accent search stays local', async () => {
  let release; const rows = new Map([[id(1), { ...person(1), Name: '\u064a\u064f\u0648\u0633\u064f\u0641 Jos\u00e9' }]]);
  const cache = { load: async () => ({ items: [...rows.values()], meta: { version: 1, ids: [id(1)], complete: true, membership: 'old', watermark: 1 } }),
    save: async change => { for (const key of change.removed || []) rows.delete(key); } };
  const store = ctx.create({ cache, request: () => new Promise(resolve => { release = resolve; }) });
  await store.hydrate(); assert.equal(store.search('\u064a\u0648\u0633\u0641 Jose').length, 1);
  const sync = store.sync(true); await new Promise(resolve => setImmediate(resolve));
  store.removeKnown(id(1)); release({ ids: [id(1)], membership: 'old', watermark: 100 }); await sync;
  assert.equal(store.search('user1').length, 0); assert.equal(rows.size, 0); store.dispose();
});

test('expired cursor rebuilds once, then ordinary reconnects use only the log', async () => {
  const old = fixture([person(1)]); await old.store.sync();
  const saved = old.saved(); old.store.dispose();
  let resets = 0; const f = fixture([person(2)], saved);
  // Simulate an expired cursor using an isolated request adapter.
  const calls = [];
  const store = ctx.create({ cache: f.cache, request: async path => {
    calls.push(path);
    if (path.startsWith('/sync') && resets++ === 0) return { reset: true };
    if (path.startsWith('/snapshot')) return { items: [person(2)], next: null, cursor: 'fresh' };
    return { changes: [], cursor: 'fresh', hasMore: false };
  } });
  await store.sync(); assert.equal(store.getSnapshot().complete, true); assert.equal(f.rows.has(id(1)), false); assert.equal(f.rows.has(id(2)), true);
  calls.length = 0; await store.sync(true); assert.equal(calls.length, 1); assert.ok(calls[0].startsWith('/sync'));
  store.dispose(); f.store.dispose();
});

test('failed local transaction retains dirty rows until the matching cursor can be saved', async () => {
  const f = fixture([person(1)]); await f.store.sync();
  const save = f.cache.save; let failing = true;
  f.cache.save = async change => { if (failing) throw new Error('Disk unavailable'); return save(change); };
  f.people([{ ...person(1), Name: 'Changed offline cache' }, person(2)]); await f.store.sync(true);
  assert.ok(f.store.getSnapshot().storageError); assert.equal(f.rows.has(id(2)), false);
  failing = false; await f.store.sync(true);
  assert.equal(f.rows.get(id(1)).Name, 'Changed offline cache'); assert.equal(f.rows.has(id(2)), true);
  const restarted = fixture([], f.saved()); restarted.offline(true); await restarted.store.sync();
  assert.equal(restarted.store.search('Changed offline cache').length, 1); assert.equal(restarted.store.getSnapshot().complete, true);
  f.store.dispose(); restarted.store.dispose();
});
