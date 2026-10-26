const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/components/testimonies/noteReactorsStore.js'), 'utf8').replace('export function', 'function');
const context = { AbortController, setTimeout, clearTimeout };
vm.runInNewContext(source + ';globalThis.createStore = createNoteReactorsStore;', context);
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb', ID = '111111111111111111111111';
const note = (loveVersion = 1, loveCount = 2) => ({ _id: ID, author: { _id: A }, loveVersion, loveCount });
const person = i => ({ _id: String(i).padStart(24, '0'), Name: `Friend ${i}`, username: `friend${i}` });
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(storageMap = new Map(), userId = A) {
  let time = 1000;
  const requests = [], timers = [];
  const store = context.createStore({ userId, now: () => time,
    storage: { getItem: key => storageMap.get(key), setItem: (key, value) => storageMap.set(key, value) },
    schedule: fn => { const timer = { fn }; timers.push(timer); return timer; }, cancel: timer => { if (timer) timer.cancelled = true; },
    request: (path, options) => new Promise((resolve, reject) => {
      requests.push({ path, options, resolve, reject });
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    }) });
  const finish = (index, users = [person(1), person(2)], extra = {}) => requests[index].resolve({ users, nextCursor: null, loveVersion: 1, ...extra });
  const runTimers = async () => { const pending = timers.splice(0); for (const timer of pending) if (!timer.cancelled) timer.fn(); await flush(); };
  return { store, requests, timers, storageMap, finish, runTimers, time: value => { time = value; } };
}

test('prefetch and repeated opens share one request; cache survives reload and is isolated by account', async () => {
  const f = fixture();
  f.store.prime(note());
  const same = f.store.ensure(note());
  assert.equal(f.requests.length, 1);
  f.finish(0); await same;
  for (let i = 0; i < 10; i++) await f.store.ensure(note());
  assert.equal(f.requests.length, 1);
  assert.equal(f.store.getSnapshot(ID).users.length, 2);
  const reloaded = fixture(f.storageMap);
  assert.equal(reloaded.store.getSnapshot(ID).users.length, 2, 'available synchronously before any request');
  await reloaded.store.ensure(note());
  assert.equal(reloaded.requests.length, 0);
  const other = fixture(f.storageMap, B);
  assert.equal(other.store.getSnapshot(ID).ready, false);
  await other.store.ensure(note());
  assert.equal(other.requests.length, 0, 'friends never prefetch another author’s identities');
  f.store.dispose(); reloaded.store.dispose(); other.store.dispose();
});

test('empty notes need no query; cached pagination stays available when reopened', async () => {
  const f = fixture();
  await f.store.ensure(note(0, 0)); assert.equal(f.requests.length, 0);
  assert.equal(f.store.getSnapshot(ID).ready, true);
  const load = f.store.ensure(note(1, 21));
  f.finish(0, Array.from({ length: 20 }, (_, i) => person(i + 1)), { nextCursor: person(20)._id }); await load;
  const more = f.store.loadMore(note(1, 21));
  assert.match(f.requests[1].path, /cursor=/);
  f.finish(1, [person(20), person(21)]); await more;
  await f.store.ensure(note(1, 21));
  assert.equal(f.store.getSnapshot(ID).users.length, 21);
  assert.equal(f.requests.length, 2);
  const reloaded = fixture(f.storageMap);
  assert.equal(reloaded.store.getSnapshot(ID).users.length, 20, 'persist only the bounded first page');
  assert.equal(reloaded.store.getSnapshot(ID).nextCursor, person(20)._id);
  f.store.dispose(); reloaded.store.dispose();
});

test('live updates coalesce, ignore duplicate versions and do not fetch while closed', async () => {
  const f = fixture(); let load = f.store.ensure(note()); f.finish(0); await load;
  f.store.invalidate(ID, { loveVersion: 2, loveCount: 2 });
  f.store.prime(note(2, 2)); // First feed warmup may fetch once.
  f.finish(1, [person(2), person(3)], { loveVersion: 2 }); await flush();
  f.store.invalidate(ID, { loveVersion: 3, loveCount: 3 });
  f.store.prime(note(3, 3));
  await f.runTimers(); assert.equal(f.requests.length, 2, 'no identities requests for closed cached lists');
  const unsubscribe = f.store.subscribe(ID, () => {});
  load = f.store.ensure(note(3, 3));
  assert.equal(f.store.getSnapshot(ID).ready, true, 'old names remain visible during refresh');
  f.finish(2, [person(2), person(3), person(4)], { loveVersion: 3 }); await load;
  f.store.invalidate(ID, { loveVersion: 4, loveCount: 2 });
  f.store.invalidate(ID, { loveVersion: 5, loveCount: 3 });
  f.store.invalidate(ID, { loveVersion: 5, loveCount: 3 });
  await f.runTimers(); assert.equal(f.requests.length, 4);
  f.finish(3, [person(3), person(4), person(5)], { loveVersion: 5 }); await flush();
  f.store.invalidate(ID, { loveVersion: 4, loveCount: 2 });
  await f.runTimers(); assert.equal(f.requests.length, 4);
  unsubscribe(); f.store.dispose();
});

test('updates during a request cannot restore an obsolete list; deletion cancels late results', async () => {
  const f = fixture(); const unsubscribe = f.store.subscribe(ID, () => {});
  const load = f.store.ensure(note());
  f.store.invalidate(ID, { loveVersion: 2, loveCount: 1 });
  f.finish(0); await load;
  assert.equal(f.store.getSnapshot(ID).ready, false);
  await f.runTimers();
  f.finish(1, [person(2)], { loveVersion: 2 }); await flush();
  assert.equal(f.store.getSnapshot(ID).users[0]._id, person(2)._id);
  f.store.invalidate(ID, { loveVersion: 3, loveCount: 2 });
  await f.runTimers();
  f.store.remove(ID); f.finish(2); await flush();
  assert.equal(f.store.getSnapshot(ID).users.length, 0);
  assert.equal(JSON.parse([...f.storageMap.values()][0]).length, 0);
  unsubscribe(); f.store.dispose();
});

test('expired cache refreshes silently only on demand; offline failure keeps names and retry works', async () => {
  const f = fixture(); let load = f.store.ensure(note()); f.finish(0); await load;
  f.time(16 * 60 * 1000);
  assert.equal(f.timers.length, 0, 'no periodic sync timers');
  load = f.store.ensure(note());
  assert.equal(f.store.getSnapshot(ID).users.length, 2);
  f.requests[1].reject(new Error('Offline')); await load;
  assert.equal(f.store.getSnapshot(ID).ready, true);
  assert.equal(f.store.getSnapshot(ID).users.length, 2);
  load = f.store.retry(note()); f.finish(2); await load;
  assert.equal(f.store.getSnapshot(ID).error, '');
  f.store.dispose();
});

test('a restarted session can replace an aborted request and permission failures erase saved identities', async () => {
  const f = fixture();
  const cancelled = f.store.ensure(note());
  f.store.dispose(); f.store.activate();
  const current = f.store.ensure(note());
  f.finish(1); await Promise.all([cancelled, current]);
  assert.equal(f.store.getSnapshot(ID).users.length, 2);
  const refresh = f.store.retry(note());
  f.requests[2].reject(Object.assign(new Error('No longer available'), { status: 404 })); await refresh;
  assert.equal(f.store.getSnapshot(ID).users.length, 0);
  assert.equal(JSON.parse([...f.storageMap.values()][0]).length, 0);
  f.store.dispose();
});
