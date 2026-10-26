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
function fixture(storageMap = new Map(), userId = A) {
  let time = 2000;
  const requests = [], timers = [];
  const store = context.createStore({ userId, now: () => time, storage: { getItem: key => storageMap.get(key), setItem: (key, value) => storageMap.set(key, value) },
    schedule: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; }, cancel: timer => { if (timer) timer.cancelled = true; },
    request: (path, options) => new Promise((resolve, reject) => {
      requests.push({ path, options, resolve, reject });
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    }) });
  const finish = (index, items = [], extras = {}) => requests[index].resolve({ items, nextCursor: null, publishing: { canPublish: true }, ...extras });
  return { store, requests, timers, storageMap, finish, time: value => { time = value; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

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

test('visiting Friends clears the dot, acknowledges incoming notes there, and only new notes after leaving restore it', async () => {
  const f = fixture(), nextId = '333333333333333333333333', laterId = '444444444444444444444444';
  const sync = f.store.sync();
  f.finish(0, [note()], { activeNotes: [note(), note('222222222222222222222222')].map(item => ({ _id: item._id, authorId: B, feedExpiresAt: item.feedExpiresAt })) });
  await sync;
  assert.equal(f.store.getSnapshot().hasUnseen, true);
  f.store.setFeedVisible(true);
  assert.equal(f.store.getSnapshot().hasUnseen, false, 'opening Friends acknowledges even notes beyond the first page');
  assert.equal(f.requests.length, 1, 'acknowledging the feed never requests the server');
  const incoming = f.store.changed({ id: nextId, authorId: B, action: 'created' });
  f.requests[1].resolve({ item: note(nextId) }); await incoming;
  assert.equal(f.store.getSnapshot().hasUnseen, false, 'notes arriving while Friends is visible are acknowledged');
  f.store.setFeedVisible(false);
  assert.equal(f.store.getSnapshot().hasUnseen, false, 'leaving does not restore the previous dot');
  const later = f.store.changed({ id: laterId, authorId: B, action: 'created' });
  f.requests[2].resolve({ item: note(laterId) }); await later;
  assert.equal(f.store.getSnapshot().hasUnseen, true);
  f.store.setFeedVisible(true); f.store.setFeedVisible(false);
  f.store.dispose();
  const restored = fixture(f.storageMap);
  const startup = restored.store.sync(); restored.finish(0, [note(), note(nextId), note(laterId)]); await startup;
  assert.equal(restored.store.getSnapshot().hasUnseen, false, 'acknowledgements survive restarting the app');
  restored.store.dispose();
});

test('opening Friends before initial sync acknowledges notes when they finish loading', async () => {
  const f = fixture(); f.store.setFeedVisible(true);
  const sync = f.store.sync(); f.finish(0, [note()]); await sync;
  f.store.setFeedVisible(false);
  assert.equal(f.store.getSnapshot().hasUnseen, false);
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
