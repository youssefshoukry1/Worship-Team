const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/components/testimonies/testimonyFeedStore.js'), 'utf8').replace('export function', 'function');
const context = { AbortController, setTimeout, clearTimeout };
vm.runInNewContext(source + ';globalThis.createStore = createTestimonyFeedStore;', context);
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb', ID = '111111111111111111111111';
const note = (id = ID, author = B) => ({ _id: id, author: { _id: author }, title: 'A shared note', body: 'Shared testimony text', createdAt: new Date(1000).toISOString(), feedExpiresAt: new Date(10000).toISOString() });
function fixture(storageMap = new Map(), userId = A, cache = null, sendSeen) {
  let time = 2000;
  const requests = [], timers = [];
  const store = context.createStore({ userId, cache, sendSeen, now: () => time, storage: { getItem: key => storageMap.get(key), setItem: (key, value) => storageMap.set(key, value) },
    schedule: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; }, cancel: timer => { if (timer) timer.cancelled = true; },
    request: (path, options) => new Promise((resolve, reject) => {
      requests.push({ path, options, resolve, reject });
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    }) });
  const finish = (index, items = [], extras = {}) => requests[index].resolve({ items, nextCursor: null, publishing: { canPublish: true }, ...extras });
  return { store, requests, timers, storageMap, finish, time: value => { time = value; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('offline opens upload after sign-in and server receipts clear the first badge on a fresh device', async () => {
  const storage = new Map(), uploaded = [];
  const active = seen => [{ _id: ID, authorId: B, feedExpiresAt: note().feedExpiresAt, seen }];
  const offline = fixture(storage, A, null, async () => { throw Error('offline'); });
  offline.store.markSeen(ID, note());
  await offline.timers.find(timer => timer.delay === 300).fn();
  offline.store.clear();
  const same = fixture(storage, A, null, async ids => uploaded.push(...ids));
  const sync = same.store.sync(); same.finish(0, [note()], { activeNotes: active(false) }); await sync;
  await same.timers.find(timer => timer.delay === 300).fn();
  assert.deepEqual(uploaded, [ID]);
  same.store.dispose();
  const fresh = fixture();
  const pull = fresh.store.sync(); fresh.finish(0, [note()], { activeNotes: active(true) }); await pull;
  assert.equal(fresh.store.isSeen(ID), true);
  assert.equal(fresh.store.getSnapshot().hasUnseen, false);
  fresh.store.dispose();
});

test('startup sync prepares notes globally and tracks seen IDs for all active pages without storing note text', async () => {
  const f = fixture(), old = note('222222222222222222222222');
  const sync = f.store.sync();
  f.finish(0, [note()], { activeNotes: [note(), old].map(item => ({ _id: item._id, authorId: B, feedExpiresAt: item.feedExpiresAt })) });
  await sync;
  assert.equal(f.store.getSnapshot().hasUnseen, true);
  f.store.markSeen(ID);
  assert.equal(f.store.getSnapshot().hasUnseen, true, 'an unread note beyond the first page still keeps the dot');
  f.store.markSeen(old._id);
  assert.equal(f.store.getSnapshot().hasUnseen, false);
  assert.equal(JSON.stringify([...f.storageMap.values()]).includes('Shared testimony text'), false);
  assert.equal(f.requests.length, 1);
  const other = fixture(f.storageMap, B);
  const otherSync = other.store.sync(); other.finish(0, [note(ID, A)]); await otherSync;
  assert.equal(other.store.getSnapshot().hasUnseen, true, 'seen state belongs to one account');
  f.store.dispose(); other.store.dispose();
});

test('live creation, edits, deletion, and local expiry work without periodic feed checks', async () => {
  const f = fixture(); const sync = f.store.sync(); f.finish(0); await sync;
  const created = f.store.changed({ id: ID, authorId: B, action: 'created' });
  assert.equal(f.requests[1].path, `/note/${ID}`);
  f.requests[1].resolve({ item: note() }); await created;
  assert.equal(f.store.getSnapshot().items.length, 1); assert.equal(f.store.getSnapshot().hasUnseen, true);
  f.store.markSeen(ID);
  const edited = f.store.changed({ id: ID, action: 'updated' });
  f.requests[2].resolve({ item: { ...note(), body: 'Changed reflection' } }); await edited;
  assert.equal(f.store.getSnapshot().items[0].body, 'Changed reflection');
  assert.equal(f.store.getSnapshot().hasUnseen, false);
  for (let i = 0; i < 100; i++) f.store.getSnapshot();
  f.time(10011); f.timers.at(-1).fn();
  assert.equal(f.store.getSnapshot().items.length, 0);
  assert.equal(f.requests.length, 3, 'expiry and reads never query the server');
  await f.store.changed({ id: ID, action: 'deleted' }); assert.equal(f.requests.length, 3);
  f.store.dispose();
});

test('a late note response cannot restore content after deletion or friendship revocation', async () => {
  const f = fixture(); const sync = f.store.sync(); f.finish(0, [note()]); await sync;
  const updating = f.store.changed({ id: ID, action: 'updated' });
  await f.store.changed({ id: ID, action: 'deleted' });
  f.requests[1].resolve({ item: note() }); await updating;
  assert.equal(f.store.getSnapshot().items.length, 0);
  const creating = f.store.changed({ id: ID, action: 'created' });
  await f.store.changed({ action: 'access' });
  assert.equal(f.requests[2].options.signal.aborted, true);
  assert.equal(f.store.getSnapshot().items.length, 0);
  assert.equal(f.store.getSnapshot().hasUnseen, false);
  f.finish(3); await creating; await flush();
  assert.equal(f.store.getSnapshot().items.length, 0); f.store.dispose();
});

test('a note opened before startup completes is already seen when the feed arrives', async () => {
  const f = fixture(); f.store.markSeen(ID, note());
  const sync = f.store.sync(); f.finish(0, [note()]); await sync;
  assert.equal(f.store.getSnapshot().hasUnseen, false); f.store.dispose();
});

test('visiting Friends keeps notes unread until individually opened, including offscreen and newly arriving notes', async () => {
  const f = fixture(), nextId = '333333333333333333333333', offscreenId = '222222222222222222222222';
  const sync = f.store.sync();
  f.finish(0, [note()], { activeNotes: [note(), note(offscreenId)].map(item => ({ _id: item._id, authorId: B, feedExpiresAt: item.feedExpiresAt })) });
  await sync;
  f.store.setFeedVisible(true);
  assert.equal(f.store.getSnapshot().hasUnseen, true);
  assert.equal(f.store.isSeen(note()._id), false);
  f.store.markSeen(note()._id);
  assert.equal(f.store.isSeen(note()._id), true);
  assert.equal(f.store.isSeen(offscreenId), false);
  assert.equal(f.store.getSnapshot().hasUnseen, true, 'opening one note cannot acknowledge others');
  const incoming = f.store.changed({ id: nextId, authorId: B, action: 'created' });
  f.requests[1].resolve({ item: note(nextId) }); await incoming;
  assert.equal(f.store.isSeen(nextId), false, 'arriving on the visible page is not an opening');
  f.store.markSeen(offscreenId); f.store.markSeen(nextId);
  assert.equal(f.store.getSnapshot().hasUnseen, false);
  assert.equal(f.requests.length, 2, 'marking seen needs no server requests');
  f.store.dispose();
  const restored = fixture(f.storageMap);
  const startup = restored.store.sync(); restored.finish(0, [note(), note(nextId)]); await startup;
  assert.equal(restored.store.getSnapshot().hasUnseen, false);
  assert.equal(restored.store.isSeen(nextId), true, 'opened state survives restarting the app');
  restored.store.dispose();
});

test('opening Friends before initial sync does not acknowledge notes when they finish loading', async () => {
  const f = fixture(); f.store.setFeedVisible(true);
  const sync = f.store.sync(); f.finish(0, [note()]); await sync;
  f.store.setFeedVisible(false);
  assert.equal(f.store.getSnapshot().hasUnseen, true);
  assert.equal(f.store.isSeen(note()._id), false);
  f.store.dispose();
});

test('pagination uses the shared store and concurrent sync requests are deduplicated', async () => {
  const f = fixture(); const sync = f.store.sync(), same = f.store.sync();
  assert.equal(f.requests.length, 1);
  f.finish(0, [note()], { nextCursor: 'cursor' }); await Promise.all([sync, same]);
  const more = f.store.loadMore(); f.finish(1, [note(), note('222222222222222222222222')]); await more;
  assert.equal(f.store.getSnapshot().items.length, 2);
  assert.equal(f.store.getSnapshot().nextCursor, null);
  assert.equal(f.requests.length, 2); f.store.dispose();
});

test('owner reaction events update counts without a server read and ignore older versions', async () => {
  const f = fixture(); const sync = f.store.sync(); f.finish(0, [{ ...note(ID, A), loveVersion: 0, loveCount: 0 }]); await sync;
  await f.store.changed({ id: ID, authorId: A, action: 'reaction', loveCount: 2, loveVersion: 2 });
  await f.store.changed({ id: ID, authorId: A, action: 'reaction', loveCount: 1, loveVersion: 1 });
  assert.equal(f.store.getSnapshot().items[0].loveCount, 2);
  assert.equal(f.requests.length, 1, 'the existing event contains all needed count metadata');
  f.store.dispose();
});

test('an orphaned publishing cooldown cannot block a feed without an active owner note', async () => {
  const f = fixture(); const sync = f.store.sync();
  f.finish(0, [note()], { publishing: { canPublish: false, unlimited: false, nextPublishAt: new Date(20000).toISOString() } });
  await sync;
  assert.equal(f.store.getSnapshot().publishing.canPublish, true);
  assert.equal(f.store.getSnapshot().publishing.nextPublishAt, null);
  f.store.dispose();
});

test('only active owner notes block publishing; deletion and expiry unlock without a server read', async () => {
  const f = fixture(), ownId = '222222222222222222222222';
  const sync = f.store.sync(); f.finish(0, [note(ID, A), note(ownId, A), note()], { publishing: { canPublish: false, unlimited: false } }); await sync;
  const removed = await f.store.changed({ id: ID, authorId: A, action: 'deleted' });
  assert.equal(removed.publishing.canPublish, false, 'another active owner note still blocks sharing');
  const unlocked = await f.store.changed({ id: ownId, authorId: A, action: 'deleted' });
  assert.equal(unlocked.publishing.canPublish, true);
  const created = f.store.changed({ id: '333333333333333333333333', authorId: A, action: 'created' });
  f.requests[1].resolve({ item: note('333333333333333333333333', A), publishing: { canPublish: false, unlimited: false } }); await created;
  assert.equal(f.store.getSnapshot().publishing.canPublish, false);
  f.time(10000); f.store.tick();
  assert.equal(f.store.getSnapshot().publishing.canPublish, true, 'unlock at the exact expiry boundary');
  assert.equal(f.requests.length, 2);
  f.store.dispose();
});

test('an active owner note beyond the first feed page still blocks sharing', async () => {
  const f = fixture(); const sync = f.store.sync();
  f.finish(0, [note()], { activeNotes: [note(), note('222222222222222222222222', A)].map(item => ({ _id: item._id, authorId: item.author._id, feedExpiresAt: item.feedExpiresAt })),
    publishing: { canPublish: false, unlimited: false } });
  await sync;
  assert.equal(f.store.getSnapshot().publishing.canPublish, false);
  f.store.dispose();
});

function memoryCache(value = null) {
  return { value, writes: 0, async get() { return this.value; }, async set(next) { this.value = JSON.parse(JSON.stringify(next)); this.writes++; } };
}

test('downloaded bodies survive offline restart, without storing publishing permission', async () => {
  const cache = memoryCache(), f = fixture(new Map(), A, cache);
  await f.store.hydrate();
  const sync = f.store.sync(); f.finish(0, [note()]); await sync; f.store.dispose();
  const restarted = fixture(new Map(), A, cache);
  await restarted.store.hydrate();
  assert.equal(restarted.store.getSnapshot().items[0].body, note().body);
  assert.equal(restarted.store.getSnapshot().publishing, null);
  const offline = restarted.store.sync(); restarted.requests[0].reject(new Error('Offline')); await offline;
  assert.equal(restarted.store.getSnapshot().items.length, 1);
  const update = restarted.store.changed({ action: 'updated', id: ID });
  restarted.requests[1].reject(new Error('Offline')); await update;
  assert.equal(restarted.store.getSnapshot().items.length, 1);
  const writes = cache.writes;
  restarted.store.markSeen(ID); restarted.store.tick(); restarted.store.setFeedVisible(true);
  assert.equal(cache.writes, writes, 'time/seen/visibility changes do not rewrite note bodies');
  restarted.time(10000); restarted.store.tick();
  assert.equal(restarted.store.getSnapshot().items.length, 0);
  assert.equal(cache.value.items.length, 0, 'original expiry removes disk content too');
  restarted.store.dispose();
});

test('reconnect reconciles the full index, retaining valid downloaded later pages only', async () => {
  const older = note('222222222222222222222222'), removed = note('333333333333333333333333');
  const cache = memoryCache({ version: 1, items: [note(), older, removed] });
  const f = fixture(new Map(), A, cache); await f.store.hydrate();
  const sync = f.store.sync();
  f.finish(0, [note()], { activeNotes: [note(), older].map(item => ({ _id: item._id, authorId: B, feedExpiresAt: item.feedExpiresAt })) }); await sync;
  assert.equal(f.store.getSnapshot().items.length, 2);
  assert.equal(cache.value.items.some(item => item._id === removed._id), false);
  await f.store.changed({ action: 'deleted', id: older._id });
  assert.equal(cache.value.items.length, 1);
  const late = f.store.changed({ action: 'updated', id: older._id });
  f.requests[1].resolve({ item: older }); await late;
  assert.equal(cache.value.items.length, 1, 'deleted IDs cannot be resurrected by late events');
  f.store.dispose();
});

test('delayed disk reads cannot resurrect deletion, access revocation or logout', async () => {
  for (const action of ['deleted', 'access', 'logout']) {
    let resolve;
    const cache = memoryCache(); cache.get = () => new Promise(done => { resolve = done; });
    const f = fixture(new Map(), A, cache), loading = f.store.hydrate();
    if (action === 'logout') f.store.clear();
    else await f.store.changed({ action, id: ID });
    resolve({ version: 1, items: [note()] }); await loading;
    assert.equal(f.store.getSnapshot().items.length, 0, action);
    f.store.dispose();
  }
});

test('cache expiry is checked on restart and a denied feed clears cached content', async () => {
  const cache = memoryCache({ version: 1, items: [note()] }), expired = fixture(new Map(), A, cache);
  expired.time(10000); await expired.store.hydrate();
  assert.equal(cache.value.items.length, 0); expired.store.dispose();
  cache.value = { version: 1, items: [note()] };
  const f = fixture(new Map(), A, cache); await f.store.hydrate();
  const sync = f.store.sync(); f.requests[0].reject(Object.assign(new Error('Denied'), { status: 403 })); await sync;
  assert.equal(cache.value.items.length, 0); f.store.dispose();
});

test('persistent feed cache is bounded and storage failures do not break the feed', async () => {
  const cache = memoryCache(), f = fixture(new Map(), A, cache); await f.store.hydrate();
  const items = Array.from({ length: 350 }, (_, i) => note(i.toString(16).padStart(24, '0')));
  const sync = f.store.sync(); f.finish(0, items); await sync;
  assert.equal(cache.value.items.length, 300);
  assert.ok(JSON.stringify(cache.value).length * 2 <= 2 * 1024 * 1024);
  cache.set = async () => { throw new Error('Disk full'); };
  await f.store.changed({ action: 'deleted', id: items[0]._id }); await flush();
  assert.equal(f.store.getSnapshot().items.length, 349); f.store.dispose();
});

test('a StrictMode deactivate/activate during hydration still restores offline notes', async () => {
  let resolve;
  const cache = memoryCache({ version: 1, items: [note()] });
  const originalGet = cache.get.bind(cache);
  cache.get = () => new Promise(done => { resolve = done; });
  const f = fixture(new Map(), A, cache); f.store.activate();
  f.store.dispose(); f.store.activate();
  cache.get = originalGet; resolve(cache.value); await flush();
  assert.equal(f.store.getSnapshot().items.length, 1); f.store.dispose();
});


test('reconnect reconciliation rejects an older individual response for a now-missing note', async () => {
  const f = fixture();
  const sync = f.store.sync(); f.finish(0, [note()]); await sync;
  const oldRead = f.store.changed({ action: 'updated', id: ID });
  const refresh = f.store.sync(); f.finish(2, [], { activeNotes: [] }); await refresh;
  f.requests[1].resolve({ item: note() }); await oldRead;
  assert.equal(f.store.getSnapshot().items.length, 0);
  f.store.dispose();
});

test('unchanged tab visits keep the same feed snapshot and expiry timer until a deadline passes', async () => {
  const f = fixture();
  const loading = f.store.sync(); f.finish(0, [note()]); await loading;
  const snapshot = f.store.getSnapshot(), timers = f.timers.length;
  let notifications = 0;
  f.store.subscribe(() => notifications++);
  for (let i = 0; i < 100; i++) {
    f.store.setFeedVisible(false);
    f.store.setFeedVisible(true);
    f.store.tick();
  }
  assert.equal(f.store.getSnapshot(), snapshot);
  assert.equal(f.timers.length, timers);
  assert.equal(notifications, 0);
  f.time(10000);
  f.store.setFeedVisible(true);
  assert.equal(notifications, 1);
  assert.equal(f.store.getSnapshot().items.length, 0);
  assert.equal(f.store.getSnapshot().hasUnseen, false);
  assert.equal(f.requests.length, 1);
  f.store.dispose();
});
