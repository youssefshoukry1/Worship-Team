const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function fixture(responses) {
  const calls = [];
  const context = {
    module: { exports: {} },
    getApiBaseUrl: () => 'https://api.example.test/api',
    markFriendsCacheDirty() {}, invalidateTabRead() {}, tabReadKey() {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      const value = responses.shift();
      if (!value) throw new Error('Unexpected request');
      return { ok: (value.status || 200) < 400, status: value.status || 200, json: async () => value.body };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/friendshipActions.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replaceAll('export async function', 'async function').replaceAll('export function', 'function');
  vm.runInNewContext(`${source};module.exports = { readFriendship, changeFriendship };`, context);
  return { ...context.module.exports, calls };
}

test('existing accepted friends are recognized from populated or raw IDs, independently of profile metadata', async () => {
  for (const friend of [B, { _id: B, Name: 'Youssef' }]) {
    const f = fixture([{ body: { friends: [friend] } }]);
    assert.equal(await f.readFriendship('token', B), 'friends');
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].options.cache, 'no-store');
    assert.equal(f.calls[0].options.headers.Authorization, 'Bearer token');
  }
});

test('pending requests and nonfriends are distinguished using the authenticated requests list', async () => {
  for (const [pending, expected] of [
    [{ incoming: [{ from: { _id: B } }], outgoing: [] }, 'incoming'],
    [{ incoming: [], outgoing: [{ to: B }] }, 'outgoing'],
    [{ incoming: [], outgoing: [] }, 'none'],
  ]) {
    const f = fixture([{ body: { friends: [] } }, { body: pending }]);
    assert.equal(await f.readFriendship('token', B), expected);
  }
});

test('failed or malformed status checks throw rather than classifying the user as a nonfriend', async () => {
  for (const responses of [
    [{ status: 503, body: { message: 'Temporarily unavailable' } }],
    [{ body: {} }],
    [{ body: { friends: [] } }, { body: {} }],
  ]) await assert.rejects(fixture(responses).readFriendship('token', B));
});

test('legacy and structured Already friends responses preserve the authoritative friendship status', async () => {
  for (const body of [{ msg: 'Already friends' }, { message: 'The relationship already exists', code: 'ALREADY_FRIENDS', relationship: 'friends' }]) {
    const f = fixture([{ status: 400, body }]);
    await assert.rejects(f.changeFriendship('token', B, 'add'), error => error.status === 400 && error.relationship === 'friends');
  }
});

test('other request errors remain errors rather than falsely marking the user as a friend', async () => {
  const f = fixture([{ status: 500, body: { msg: 'Request failed' } }]);
  await assert.rejects(f.changeFriendship('token', B, 'add'), error => error.relationship === undefined && error.message === 'Request failed');
});
