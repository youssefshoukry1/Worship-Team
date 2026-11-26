const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const alice = { _id: 'alice', username: 'alice' },
  bob = { _id: 'bob', username: 'bob' };

function fixture() {
  const bus = new EventEmitter(),
    writes = new Map(),
    reads = [],
    changes = [];
  let epoch = 1;
  const window = {
    addEventListener: bus.on.bind(bus),
    removeEventListener: bus.off.bind(bus),
    dispatchEvent(event) {
      bus.emit(event.type, event);
    },
  };
  const source = fs
    .readFileSync('src/app/utils/useFriendActions.js', 'utf8')
    .split('export function useFriendActions')[0]
    .replace(/^import .*;$/gm, '');
  const ctx = {
    window,
    AbortController,
    setTimeout,
    clearTimeout,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    directory: { sessionVersion: () => epoch },
    changeFriendship(token, id) {
      return new Promise((resolve, reject) => writes.set(id, { resolve, reject }));
    },
    readFriendship(token, id) {
      return new Promise((resolve, reject) => reads.push({ id, resolve, reject }));
    },
    invalidatePeoplePages() {},
    invalidateTabRead() {},
    friendsSummaryKey() {
      return 'summary';
    },
  };
  vm.runInNewContext(source + ";globalThis.actions=createActions(directory,'token','owner');", ctx);
  bus.on('taspe7:friends-push', (event) => {
    if (event.detail?.friendChange) changes.push(event.detail);
  });
  return {
    ...ctx,
    changes,
    writes,
    reads,
    logout: () => epoch++,
    push: (detail) => window.dispatchEvent({ type: 'taspe7:friends-push', detail }),
  };
}

for (const [action, before, after] of [
  ['accept', 'incoming', 'friends'],
  ['cancel', 'outgoing', 'none'],
  ['remove', 'friends', 'none'],
]) {
  test(action + ' isolates simultaneous operations and rejects duplicate submission', async () => {
    const f = fixture();
    const first = f.actions.run(alice, action, before),
      second = f.actions.run(bob, action, before);
    const aliceWrite = f.writes.get('alice');
    await f.actions.run(alice, action, before);
    assert.equal(f.writes.get('alice'), aliceWrite);
    f.writes.get('bob').resolve({});
    assert.equal(await second, after);
    assert.deepEqual(Array.from(f.actions.snapshot().keys()), ['alice']);
    f.writes.get('alice').reject(Object.assign(new Error('Rejected'), { status: 403 }));
    await assert.rejects(first, /Rejected/);
    assert.equal(f.actions.snapshot().size, 0);
    assert.equal(f.changes.length, 1);
    assert.equal(f.changes[0].friendChange.person, bob);
    assert.equal(f.changes[0].notesHandled, action === 'cancel');
    assert.equal(f.changes[0].removedFriendId, action === 'remove' ? 'bob' : undefined);
  });
}
test('crossed requests, lost response and a superseding push use the confirmed relationship', async () => {
  const f = fixture();
  const first = f.actions.run(alice, 'add', 'none');
  f.writes.get('alice').resolve({ status: 'accepted' });
  assert.equal(await first, 'friends');
  const lost = f.actions.run(bob, 'add', 'none');
  f.writes.get('bob').reject(new TypeError('Network error'));
  await new Promise(setImmediate);
  f.push({ removedFriendId: 'bob' });
  f.reads[0].resolve('friends');
  await new Promise(setImmediate);
  f.reads[1].resolve('outgoing');
  assert.equal(await lost, 'outgoing');
  assert.equal(f.changes[1].notesHandled, true);
});
test('late writes from a signed-out session and rejected sends publish no changes', async () => {
  const f = fixture();
  const first = f.actions.run(alice, 'add', 'none');
  f.writes.get('alice').reject(Object.assign(new Error('Forbidden'), { status: 403 }));
  await assert.rejects(first, /Forbidden/);
  const late = f.actions.run(bob, 'accept', 'incoming');
  f.logout();
  f.writes.get('bob').resolve({});
  assert.equal(await late, undefined);
  assert.equal(f.changes.length, 0);
});
test('an unavailable verification read reports uncertainty without committing or retrying the write', async () => {
  const f = fixture();
  const change = f.actions.run(alice, 'remove', 'friends');
  f.writes.get('alice').reject(new Error('Response lost'));
  await new Promise(setImmediate);
  assert.deepEqual(
    f.reads.map((read) => read.id),
    ['alice']
  );
  f.reads[0].reject(new Error('Offline'));
  await assert.rejects(change, /Could not confirm/);
  assert.equal(f.actions.snapshot().size, 0);
  assert.equal(f.changes.length, 0);
});
