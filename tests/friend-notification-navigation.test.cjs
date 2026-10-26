const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = new Map();
const context = { URLSearchParams, URL, Capacitor: { isNativePlatform: () => true },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  window: { location: { origin: 'capacitor://localhost', assign(href) { this.assigned = href; } } } };
const files = ['friendNotificationNavigation.js', 'testimonyNotificationNavigation.js', 'friendsCache.js', 'appNavigation.js'];
const source = files.map(file => fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8')
  .replace(/^import .*;$/gm, '').replaceAll('export function', 'function').replaceAll('export async function', 'async function').replaceAll('export const', 'const')).join('\n');
vm.runInNewContext(source + ';globalThis.api = { testimonyNotificationHref, friendNotificationHref, readFriendNotificationTarget, navigateDocumentFallback, markFriendsCacheDirty, readFriendsInvalidation, clearFriendsInvalidation };', context);
const api = context.api;

test('love notifications open the author profile note using a validated ID and native document navigation', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const href = api.testimonyNotificationHref({ type: 'TESTIMONY_LOVED', testimonyId: id, url: 'https://untrusted.example/' });
  assert.equal(href, `/normal_UserProfile/?note=${id}`);
  api.navigateDocumentFallback(href);
  assert.equal(context.window.location.assigned, `/normal_UserProfile/index.html?note=${id}`);
  for (const value of ['', '../private', 'x'.repeat(24), { $gt: '' }]) assert.equal(api.testimonyNotificationHref({ type: 'TESTIMONY_LOVED', testimonyId: value }), null);
  assert.equal(api.testimonyNotificationHref({ type: 'OTHER', testimonyId: id }), null);
});

test('request and acceptance target the correct section through native static-document navigation', () => {
  for (const [type, tab] of [['FRIEND_REQUEST_RECEIVED', 'requests'], ['FRIEND_REQUEST_ACCEPTED', 'friends']]) {
    const href = api.friendNotificationHref({ type, actorId: 'person&tab=other' });
    api.navigateDocumentFallback(href);
    assert.ok(context.window.location.assigned.startsWith('/friends/index.html?'));
    const target = api.readFriendNotificationTarget(new URL(context.window.location.assigned, 'capacitor://localhost').search);
    assert.equal(target.tab, tab); assert.equal(target.actorId, 'person&tab=other');
  }
  assert.equal(api.friendNotificationHref({ type: 'OTHER' }), null);
  assert.equal(api.readFriendNotificationTarget('?notificationType=constructor'), null);
});

test('friend cache invalidation is per account and cannot erase a push arriving during refresh', () => {
  api.markFriendsCacheDirty('alice');
  const version = api.readFriendsInvalidation('alice');
  assert.ok(version); assert.equal(api.readFriendsInvalidation('bob'), null);
  api.markFriendsCacheDirty('alice');
  api.clearFriendsInvalidation('alice', version);
  const newer = api.readFriendsInvalidation('alice');
  assert.notEqual(newer, version);
  api.clearFriendsInvalidation('alice', newer);
  assert.equal(api.readFriendsInvalidation('alice'), null);
});
