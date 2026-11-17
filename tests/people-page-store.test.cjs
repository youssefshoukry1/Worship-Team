const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = { AbortController };
vm.runInNewContext(fs.readFileSync('src/app/utils/peoplePageStore.js', 'utf8').replace('export function', 'function') + ';globalThis.create = createPeoplePageStore;', ctx);
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(cache) {
  const requests = [];
  const store = ctx.create({ cache, request: (cursor, signal) => new Promise((resolve, reject) => requests.push({ cursor, signal, resolve, reject })) });
  return { store, requests };
}
const page = (start, nextCursor = null) => ({ items: Array.from({ length: 10 }, (_, i) => ({ _id: String(start + i) })), total: 45, nextCursor });
test('first page, deduplicated loading, failed next-page retry and totals', async () => {
  const f = fixture(); const initial = f.store.ensure(); await tick();
  f.requests[0].resolve(page(0, '10')); await initial;
  assert.equal(f.store.getSnapshot().items.length, 10); assert.equal(f.store.getSnapshot().total, 45);
  const more = f.store.loadMore(), same = f.store.loadMore();
  assert.equal(f.requests.length, 2); f.requests[1].reject(new Error('Offline')); await Promise.all([more, same]);
  assert.equal(f.store.getSnapshot().items.length, 10); assert.equal(f.store.getSnapshot().nextCursor, '10');
  const retry = f.store.retry(); f.requests[2].resolve(page(9, '19')); await retry;
  assert.equal(f.store.getSnapshot().items.length, 19);
});
test('refresh keeps loaded pages until all replacements arrive and ignores invalidated responses', async () => {
  const f = fixture(); let task = f.store.ensure(); await tick(); f.requests[0].resolve(page(0, '10')); await task;
  task = f.store.loadMore(); f.requests[1].resolve(page(10, '20')); await task;
  task = f.store.refresh(); f.requests[2].resolve(page(1, '11')); await tick();
  assert.equal(f.store.getSnapshot().items[0]._id, '0');
  f.requests[3].resolve(page(11, '21')); await task;
  assert.equal(f.store.getSnapshot().items.length, 20); assert.equal(f.store.getSnapshot().items[0]._id, '1');
  task = f.store.loadMore(); f.store.invalidate(); f.requests[4].resolve(page(21)); await task;
  assert.equal(f.store.getSnapshot().items.length, 20);
});
test('offline cache retains downloaded pages on network failure and excludes stale hydration', async () => {
  const cache = { get: async () => page(0, '10'), set: async () => {} };
  const f = fixture(cache); const task = f.store.ensure(); await tick();
  assert.equal(f.store.getSnapshot().items.length, 10);
  f.requests[0].reject(new Error('Offline')); await task;
  assert.equal(f.store.getSnapshot().items.length, 10);
  let resolve; const delayed = fixture({ get: () => new Promise(done => { resolve = done; }), set: async () => {} });
  const waiting = delayed.store.ensure(); delayed.store.invalidate(); resolve(page(0)); await waiting;
  assert.equal(delayed.store.getSnapshot().items.length, 0);
});

test('an in-progress friendship mutation blocks refresh and pagination until settled', async () => {
  const f = fixture(); let task = f.store.ensure(); await tick(); f.requests[0].resolve(page(0, '10')); await task;
  f.store.pause(true); f.store.setItems(items => items.filter(item => item._id !== '0'));
  await f.store.ensure(); await f.store.loadMore();
  assert.equal(f.requests.length, 1); assert.equal(f.store.getSnapshot().items.length, 9);
  f.store.pause(false); task = f.store.refresh(); f.requests[1].resolve(page(1)); await task;
  assert.equal(f.store.getSnapshot().items[0]._id, '1');
});
