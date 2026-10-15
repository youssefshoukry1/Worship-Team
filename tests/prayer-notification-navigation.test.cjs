const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { URLSearchParams, URL, Capacitor: { isNativePlatform: () => true }, navigator: {},
  window: { location: { origin: 'https://localhost', assign(href) { this.assigned = href; } } } };
let source = fs.readFileSync(path.join(__dirname, '../src/app/utils/prayerNotificationNavigation.js'), 'utf8')
  .replaceAll('export function', 'function');
source += fs.readFileSync(path.join(__dirname, '../src/app/utils/appNavigation.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replaceAll('export function', 'function');
vm.runInNewContext(source + ';globalThis.api = { prayerNotificationHref, navigateDocumentFallback, readPrayerNotificationTarget, findNotificationPrayer };', context);
const api = context.api;
test('shared prayer and reply taps preserve the target through native document navigation', () => {
  for (const type of ['PRAY_SHARED', 'PRAY_CONFIRMED']) {
    const href = api.prayerNotificationHref({ type, shareId: 'share-123', url: '/' });
    assert.equal(href, `/pray/?notificationType=${type}&shareId=share-123`);
    api.navigateDocumentFallback(href);
    assert.equal(context.window.location.assigned, `/pray/index.html?notificationType=${type}&shareId=share-123`);
    const target = api.readPrayerNotificationTarget(new URL(context.window.location.assigned, 'https://localhost').search);
    assert.equal(target.type, type);
    assert.equal(target.shareId, 'share-123');
  }
});
test('share IDs are safely encoded and missing IDs fall back to the page', () => {
  const href = api.prayerNotificationHref({ type: 'PRAY_SHARED', shareId: 'id&notificationType=OTHER' });
  const target = api.readPrayerNotificationTarget(new URL(href, 'https://localhost').search);
  assert.equal(target.type, 'PRAY_SHARED');
  assert.equal(target.shareId, 'id&notificationType=OTHER');
  assert.equal(api.prayerNotificationHref({ type: 'PRAY_SHARED' }), '/pray/');
  assert.equal(api.prayerNotificationHref({ type: 'OTHER', url: '/pray' }), null);
  assert.equal(api.readPrayerNotificationTarget('?notificationType=OTHER&shareId=123'), null);
  assert.equal(api.readPrayerNotificationTarget('?notificationType=PRAY_SHARED&shareId='), null);
});

test('a share opens only the exact received prayer, including older locally saved IDs', () => {
  const sent = { _id: 'sent', sharedWith: { shareId: '123', username: 'friend' } };
  const unrelated = { _id: 'received-456', sharedFrom: { username: 'friend', shareId: '456' } };
  const received = { _id: 'received-123', sharedFrom: { shareId: '123' } };
  const target = { type: 'PRAY_SHARED', shareId: '123' };
  assert.equal(api.findNotificationPrayer([sent, unrelated], target), null);
  assert.equal(api.findNotificationPrayer([sent, unrelated, received], target), received);
  const legacy = { _id: 'legacy', sharedFrom: { originalPrayId: 'received-123' } };
  assert.equal(api.findNotificationPrayer([legacy], target), legacy);
});

test('a reply opens only the sent prayer for that share, never another prayer to the same friend', () => {
  const received = { _id: 'received-123', sharedFrom: { shareId: '123' } };
  const other = { _id: 'other', sharedWith: { username: 'friend', shareId: '456' } };
  const sent = { _id: 'sent', sharedWith: { username: 'friend', shareId: '123' } };
  const target = { type: 'PRAY_CONFIRMED', shareId: 'received-123' };
  assert.equal(api.findNotificationPrayer([received, other], target), null);
  assert.equal(api.findNotificationPrayer([received, other, sent], target), sent);
  assert.equal(api.findNotificationPrayer([sent], { type: 'PRAY_CONFIRMED', shareId: '' }), null);
});
