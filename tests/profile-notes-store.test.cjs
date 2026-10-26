const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/components/testimonies/profileNotesStore.js'), 'utf8').replace('export function', 'function');
const context = { AbortController };
vm.runInNewContext(source + ';globalThis.createStore = createProfileNotesStore;', context);
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const note = (i, contentVersion = 0, author = A) => ({ _id: String(i).padStart(24, '0'), author: { _id: author, Name: 'Author' }, title: `Note ${i}`,
  body: `An archived story ${i}`, contentVersion, loveCount: 0, loveVersion: 0, createdAt: new Date(i * 1000).toISOString(),
  updatedAt: new Date((i + contentVersion) * 1000).toISOString(), feedExpiresAt: new Date(10000).toISOString() });
const index = items => items.map(({ body, title, author, feedExpiresAt, ...metadata }) => metadata);
const result = (items, version = 0, author = A) => ({ items, manifest: index(items), notesVersion: version, nextCursor: null,
  canViewTestimonies: true, user: { _id: author, Name: 'Author' }, stats: { testimonies: items.length }, publishing: { canPublish: true } });
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(disk = new Map(), userId = A) {
  const requests = [];
  const diskReads = [], diskWrites = [];
  const key = id => `${userId}:${id}`;
  const store = context.createStore({ userId, storage: {
    getItem: async id => { diskReads.push(id); return disk.get(key(id)); }, setItem: async (id, value) => { diskWrites.push(id); return disk.set(key(id), JSON.parse(JSON.stringify(value))); },
    removeItem: async id => disk.delete(key(id)), clearForeign: async () => { for (const saved of disk.keys()) if (saved.startsWith(`${userId}:`) && saved !== key(userId)) disk.delete(saved); },
  }, request: (path, options) => new Promise((resolve, reject) => {
    requests.push({ path, options, resolve, reject });
    options?.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  }) });
  return { store, requests, disk, diskReads, diskWrites, finish: (i, value) => requests[i].resolve(JSON.parse(JSON.stringify(value))) };
}

test('profile visits share one load, persist in device storage, and restore before a lightweight restart check', async () => {
  const f = fixture(); const load = f.store.ensure(A), duplicate = f.store.ensure(A); await flush();
  assert.equal(f.requests.length, 1); f.finish(0, result([note(1)])); await Promise.all([load, duplicate]); await flush();
  for (let i = 0; i < 5; i++) await f.store.ensure(A);
  assert.equal(f.requests.length, 1);
  const restart = fixture(f.disk); const check = restart.store.ensure(A); await flush();
  assert.equal(restart.store.getSnapshot(A).items[0].body, note(1).body);
  assert.equal(restart.store.getSnapshot(A).loading, false);
  assert.match(restart.requests[0].path, /notesVersion=0/);
  restart.finish(0, { ...result([], 0), items: undefined, manifest: undefined, unchanged: true }); await check;
  assert.equal(restart.store.getSnapshot(A).items.length, 1);
  await restart.store.ensure(A); assert.equal(restart.requests.length, 1);
  const other = fixture(f.disk, B); const otherLoad = other.store.ensure(A); await flush();
  assert.equal(other.store.getSnapshot(A).ready, false, 'another account cannot use this cached collection');
  other.finish(0, result([], 0)); await otherLoad;
  f.store.dispose(); restart.store.dispose(); other.store.dispose();
});

test('missed edit, creation and deletion download only changed note bodies and retain archived notes', async () => {
  const f = fixture(); let load = f.store.ensure(A); await flush(); f.finish(0, result([note(3), note(2), note(1)], 1)); await load; await flush();
  const restart = fixture(f.disk); load = restart.store.ensure(A); await flush();
  const current = [note(4, 2), note(3), note(1, 2)];
  restart.finish(0, { ...result(current, 2), items: undefined, unchanged: false }); await flush();
  assert.equal(restart.requests.length, 2);
  const downloadedIds = restart.requests[1].path.split('ids=')[1].split(',');
  assert.deepEqual(downloadedIds.sort(), [note(1)._id, note(4)._id].sort());
  restart.finish(1, { items: [note(4, 2), note(1, 2)], notesVersion: 2 }); await load;
  const state = restart.store.getSnapshot(A);
  assert.equal(state.items.length, 3); assert.equal(state.items.some(item => item._id === note(2)._id), false);
  assert.equal(state.items.find(item => item._id === note(3)._id).body, note(3).body, 'unchanged expired feed note stays in profile');
  f.store.dispose(); restart.store.dispose();
});

test('live edit shares its existing note response; deletions and reactions need no profile download', async () => {
  const f = fixture(); const load = f.store.ensure(A); await flush(); f.finish(0, result([note(1)], 1)); await load;
  await f.store.changed({ id: note(1)._id, authorId: A, action: 'updated', notesVersion: 2 }, Promise.resolve({ item: note(1, 2) }));
  assert.equal(f.store.getSnapshot(A).items[0].contentVersion, 2);
  await f.store.changed({ id: note(1)._id, authorId: A, action: 'updated', notesVersion: 2, publishing: { canPublish: false } }, Promise.resolve({ item: note(1, 2) }));
  assert.equal(f.store.getSnapshot(A).publishing.canPublish, false, 'mutation response still updates availability when the live event arrived first');
  await f.store.changed({ id: note(1)._id, authorId: A, action: 'reaction', loveCount: 2, loveVersion: 2 });
  assert.equal(f.store.getSnapshot(A).items[0].loveCount, 2);
  await f.store.changed({ id: note(1)._id, authorId: A, action: 'deleted', notesVersion: 3 });
  assert.equal(f.store.getSnapshot(A).items.length, 0);
  assert.equal(f.requests.length, 1);
  await flush(); assert.equal(f.disk.get(`${A}:${A}`).items.length, 0);
  f.store.dispose();
});

test('valid empty collections are cached; missing device cache downloads again', async () => {
  const f = fixture(); let load = f.store.ensure(A); await flush(); f.finish(0, result([], 0)); await load; await flush();
  await f.store.ensure(A); assert.equal(f.requests.length, 1);
  const restart = fixture(f.disk); load = restart.store.ensure(A); await flush();
  assert.match(restart.requests[0].path, /notesVersion=0/);
  restart.finish(0, { ...result([], 0), unchanged: true }); await load;
  f.disk.clear(); const cleared = fixture(f.disk); load = cleared.store.ensure(A); await flush();
  assert.equal(cleared.requests[0].path, `/profile/${A}`);
  cleared.finish(0, result([note(1)], 1)); await load;
  f.store.dispose(); restart.store.dispose(); cleared.store.dispose();
});

test('permission revocation clears memory and disk and prevents a late response from restoring friend notes', async () => {
  const f = fixture(); let load = f.store.ensure(B); await flush(); f.finish(0, result([note(1, 0, B)], 1, B)); await load; await flush();
  const unsubscribe = f.store.subscribe(B, () => {});
  load = f.store.ensure(B, { force: true }); await flush();
  f.store.accessChanged(); await flush();
  assert.equal(f.store.getSnapshot(B).items.length, 0);
  f.finish(1, result([note(1, 0, B)], 1, B)); await load;
  f.finish(2, { ...result([], 1, B), canViewTestimonies: false }); await flush();
  assert.equal(f.store.getSnapshot(B).items.length, 0);
  assert.equal(JSON.stringify([...f.disk.values()]).includes('An archived story'), false);
  unsubscribe(); f.store.dispose();
});

test('offline refresh keeps cached notes and a forbidden response clears them without retry loops', async () => {
  const f = fixture(); let load = f.store.ensure(A); await flush(); f.finish(0, result([note(1)], 1)); await load;
  const unsubscribe = f.store.subscribe(A, () => {});
  load = f.store.ensure(A, { force: true }); await flush(); f.requests[1].reject(new Error('Offline')); await load;
  assert.equal(f.store.getSnapshot(A).items.length, 1);
  load = f.store.ensure(A, { force: true }); await flush(); f.requests[2].reject(Object.assign(new Error('Forbidden'), { status: 403 })); await load; await flush();
  assert.equal(f.store.getSnapshot(A).items.length, 0); assert.equal(f.requests.length, 3);
  unsubscribe(); f.store.dispose();
});

test('requested archive pages persist across restart without downloading previous pages again', async () => {
  const all = Array.from({ length: 25 }, (_, i) => note(25 - i));
  const f = fixture(); let load = f.store.ensure(A); await flush();
  f.finish(0, { ...result(all, 1), items: all.slice(0, 12) }); await load;
  const more = f.store.loadMore(A); await flush();
  const ids = f.requests[1].path.split('ids=')[1].split(',');
  assert.equal(ids.length, 12); assert.equal(ids[0], all[12]._id);
  f.finish(1, { notesVersion: 1, items: all.slice(12, 24) }); await more; await flush();
  const restart = fixture(f.disk); load = restart.store.ensure(A); await flush();
  assert.equal(restart.store.getSnapshot(A).items.length, 24);
  restart.finish(0, { ...result([], 1), items: undefined, manifest: undefined, unchanged: true }); await load;
  assert.equal(restart.store.getSnapshot(A).nextCursor, all[24]._id);
  assert.equal(restart.requests.length, 1);
  f.store.dispose(); restart.store.dispose();
});

test('an event version gap reconciles a missed deletion and cannot be overwritten by an older edit response', async () => {
  const f = fixture(); const load = f.store.ensure(A); await flush(); f.finish(0, result([note(2), note(1)], 1)); await load;
  const unsubscribe = f.store.subscribe(A, () => {});
  let release;
  const oldEdit = f.store.changed({ id: note(1)._id, authorId: A, action: 'updated', notesVersion: 2 }, new Promise(resolve => { release = resolve; }));
  await flush();
  await f.store.changed({ id: note(1)._id, authorId: A, action: 'updated', notesVersion: 4 }, Promise.resolve({ item: note(1, 4) }));
  await flush();
  f.finish(1, { ...result([note(1, 4)], 4), items: undefined, unchanged: false }); await flush();
  f.finish(2, { notesVersion: 4, items: [note(1, 4)] }); await flush();
  release({ item: note(1, 2) }); await oldEdit;
  assert.equal(f.store.getSnapshot(A).notesVersion, 4);
  assert.equal(f.store.getSnapshot(A).items.length, 1);
  assert.equal(f.store.getSnapshot(A).items[0].contentVersion, 4);
  unsubscribe(); f.store.dispose();
});

test('friend notes never touch disk, reuse loaded pages in memory and disappear on restart', async () => {
  const f = fixture(); const all = Array.from({ length: 25 }, (_, i) => note(25 - i, 0, B));
  let load = f.store.ensure(B); await flush();
  f.finish(0, { ...result(all.slice(0, 12), 0, B), manifest: undefined, nextCursor: 'first-page-cursor' }); await load;
  assert.equal(f.store.getSnapshot(B).items.length, 12);
  assert.equal(f.store.getSnapshot(B).manifest.length, 0);
  await f.store.ensure(B); assert.equal(f.requests.length, 1);
  load = f.store.loadMore(B); await flush();
  assert.equal(f.requests[1].path, `/profile/${B}?cursor=first-page-cursor`);
  f.finish(1, { ...result(all.slice(12, 24), 0, B), manifest: undefined, nextCursor: 'second-page-cursor' }); await load;
  assert.equal(f.store.getSnapshot(B).items.length, 24);
  await f.store.ensure(B); assert.equal(f.requests.length, 2);
  await flush(); assert.deepEqual(f.diskReads, []); assert.deepEqual(f.diskWrites, []);
  const restarted = fixture(f.disk); load = restarted.store.ensure(B); await flush();
  assert.equal(restarted.store.getSnapshot(B).ready, false);
  assert.equal(restarted.requests[0].path, `/profile/${B}`);
  restarted.finish(0, { ...result(all.slice(0, 12), 0, B), manifest: undefined, nextCursor: 'first-page-cursor' }); await load;
  assert.equal(restarted.store.getSnapshot(B).items.length, 12);
  f.store.dispose(); restarted.store.dispose();
});

test('friends cache evicts the least recently visited of five profiles and preserves the owner', async () => {
  const f = fixture(); let load = f.store.ensure(A); await flush(); f.finish(0, result([note(1)])); await load;
  const friends = Array.from({ length: 6 }, (_, i) => String(i + 20).padStart(24, '0'));
  for (let i = 0; i < 5; i++) {
    load = f.store.ensure(friends[i]); await flush(); f.finish(i + 1, { ...result([note(i, 0, friends[i])], 0, friends[i]), manifest: undefined }); await load;
  }
  await f.store.ensure(friends[0]); // Refresh visit order without a request.
  load = f.store.ensure(friends[5]); await flush(); f.finish(6, { ...result([note(6, 0, friends[5])], 0, friends[5]), manifest: undefined }); await load;
  assert.equal(f.store.getSnapshot(friends[0]).ready, true);
  assert.equal(f.store.getSnapshot(friends[1]).ready, false);
  assert.equal(f.store.getSnapshot(A).ready, true);
  load = f.store.ensure(friends[1]); await flush(); assert.equal(f.requests.length, 8);
  f.finish(7, { ...result([], 0, friends[1]), manifest: undefined }); await load;
  assert.deepEqual(f.diskWrites.filter(id => id !== A), []);
  f.store.dispose();
});

test('live friend creation stays within the loaded page and an edit to an unloaded note does not download it', async () => {
  const f = fixture(); const all = Array.from({ length: 12 }, (_, i) => note(12 - i, 0, B));
  const load = f.store.ensure(B); await flush(); f.finish(0, { ...result(all, 1, B), manifest: undefined }); await load;
  await f.store.changed({ id: note(13)._id, authorId: B, action: 'created', notesVersion: 2 }, Promise.resolve({ item: note(13, 2, B) }));
  assert.equal(f.store.getSnapshot(B).items.length, 12);
  assert.equal(f.store.getSnapshot(B).items[0]._id, note(13)._id);
  assert.equal(f.store.getSnapshot(B).nextCursor, `${new Date(note(2).createdAt).getTime()}_${note(2)._id}`);
  await f.store.changed({ id: note(1)._id, authorId: B, action: 'updated', notesVersion: 3 });
  assert.equal(f.requests.length, 1, 'unloaded archived note is not prefetched');
  assert.equal(f.store.getSnapshot(B).items.some(item => item._id === note(1)._id), false);
  assert.deepEqual(f.diskWrites, []);
  f.store.dispose();
});
