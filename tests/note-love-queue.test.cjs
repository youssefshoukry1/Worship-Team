const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/components/testimonies/noteLoveQueue.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replace('export function', 'function').replace('export const', 'const');
const context = { testimonyRequest() {} };
vm.runInNewContext(source + ';globalThis.createQueue = createNoteLoveQueue;', context);
const item = { _id: 'note', loved: false, loveCount: 2 };
function fixture() {
  const pending = [], updates = [], errors = [];
  const queue = context.createQueue((token, path, options) => new Promise((resolve, reject) => pending.push({ token, path, options, resolve, reject })));
  const onUpdate = (id, reaction) => updates.push({ id, ...reaction });
  const stop = queue.subscribe('alice', item._id, { onUpdate, onError: error => errors.push(error.message) });
  return { queue, pending, updates, errors, stop, onUpdate, toggle: () => queue.toggle({ item, userId: 'alice', token: 'token', onUpdate }) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('love updates synchronously and saves in the background without aborting when the reader closes', async () => {
  const f = fixture(); f.toggle();
  assert.equal(f.updates.at(-1).loved, true);
  assert.equal(f.updates.at(-1).loveCount, 3);
  assert.equal(f.pending.length, 1);
  assert.equal(f.pending[0].options.keepalive, true);
  f.stop();
  f.pending[0].resolve({ reaction: { loved: true, loveCount: 4 } });
  await flush();
  assert.equal(f.updates.at(-1).loveCount, 4, 'the parent still receives the saved count after the reader closes');
});

test('rapid unlike is immediate and is saved after the pending like, preserving the last tap', async () => {
  const f = fixture(); f.toggle(); f.toggle();
  assert.equal(f.updates.at(-1).loved, false);
  assert.equal(f.updates.at(-1).loveCount, 2);
  assert.equal(f.pending.length, 1);
  f.pending[0].resolve({ reaction: { loved: true, loveCount: 3 } });
  await flush();
  assert.equal(f.pending.length, 2);
  assert.equal(f.pending[1].options.method, 'DELETE');
  assert.equal(f.updates.at(-1).loved, false);
  f.pending[1].resolve({ reaction: { loved: false, loveCount: 2 } });
  await flush(); f.stop();
});

test('three quick taps coalesce into one love request and do not overcount', async () => {
  const f = fixture(); f.toggle(); f.toggle(); f.toggle();
  assert.equal(f.updates.at(-1).loved, true);
  assert.equal(f.updates.at(-1).loveCount, 3);
  f.pending[0].resolve({ reaction: { loved: true, loveCount: 3 } });
  await flush();
  assert.equal(f.pending.length, 1); f.stop();
});

test('failed saves roll back the optimistic state, report an error, and allow retry', async () => {
  const f = fixture(); f.toggle();
  f.pending[0].reject(new Error('Could not save'));
  await flush();
  assert.equal(f.updates.at(-1).loved, false);
  assert.equal(f.updates.at(-1).loveCount, 2);
  assert.deepEqual(f.errors, ['Could not save']);
  f.toggle();
  assert.equal(f.pending.length, 2);
  f.pending[1].resolve({ reaction: { loved: true, loveCount: 3 } });
  await flush(); f.stop();
});

test('reopening a reader restores the pending reaction and never exposes it to another account', async () => {
  const f = fixture(); f.toggle(); f.stop();
  const reopened = [], otherUser = [];
  const stop = f.queue.subscribe('alice', item._id, { onUpdate: (id, reaction) => reopened.push(reaction), onError() {} });
  const stopOther = f.queue.subscribe('bob', item._id, { onUpdate: (id, reaction) => otherUser.push(reaction), onError() {} });
  assert.equal(reopened.at(-1).loved, true);
  assert.equal(otherUser.length, 0);
  f.pending[0].resolve({ reaction: { loved: true, loveCount: 3 } });
  await flush();
  assert.equal(reopened.at(-1).loveCount, 3);
  assert.equal(otherUser.length, 0); stop(); stopOther();
});
