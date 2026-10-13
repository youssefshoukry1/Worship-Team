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
vm.runInNewContext(source + ';globalThis.api = { prayerNotificationHref, readPrayerNotificationTarget, findNotificationPrayer, navigateDocumentFallback };', context);
const api = context.api;
test('native tap opens the prayer HTML document and retains notification identity', () => {
  const href = api.prayerNotificationHref({ type: 'PRAY_SHARED', shareId: 'received-share-123', url: '/' });
  api.navigateDocumentFallback(href);
  assert.equal(context.window.location.assigned, '/pray/index.html?notificationType=PRAY_SHARED&shareId=share-123');
  const target = api.readPrayerNotificationTarget(new URL(context.window.location.assigned, 'https://localhost').search);
  assert.equal(target.shareId, 'share-123'); assert.equal(target.type, 'PRAY_SHARED');
});
test('received and reply notifications resolve only their exact prayer, including legacy IDs', () => {
  const received = { _id: 'received-one', sharedFrom: { originalPrayId: 'one' } };
  const sent = { _id: 'local-two', sharedWith: { shareId: 'two' } };
  const unrelated = { _id: 'local-three', sharedWith: { shareId: 'three' } };
  const prayers = [unrelated, received, sent];
  assert.equal(api.findNotificationPrayer(prayers, { type: 'PRAY_SHARED', shareId: 'one' }), received);
  assert.equal(api.findNotificationPrayer(prayers, { type: 'PRAY_CONFIRMED', shareId: 'two' }), sent);
  assert.equal(api.findNotificationPrayer(prayers, { type: 'PRAY_CONFIRMED', shareId: 'missing' }), null);
  assert.equal(api.findNotificationPrayer(prayers, { type: 'PRAY_SHARED', shareId: 'two' }), null);
});
test('share IDs cannot change routes or inject additional query parameters', () => {
  const href = api.prayerNotificationHref({ type: 'PRAY_SHARED', shareId: 'id&notificationType=PRAY_CONFIRMED' });
  const target = api.readPrayerNotificationTarget(href.split('?')[1]);
  assert.equal(target.type, 'PRAY_SHARED'); assert.equal(target.shareId, 'id&notificationType=PRAY_CONFIRMED');
  assert.equal(api.prayerNotificationHref({ type: 'OTHER', url: '/pray' }), null);
});
test('missing IDs still open Prayer Circle without selecting an unrelated prayer', () => {
  const href = api.prayerNotificationHref({ type: 'PRAY_CONFIRMED' });
  const target = api.readPrayerNotificationTarget(href.split('?')[1]);
  assert.equal(target.shareId, ''); assert.equal(api.findNotificationPrayer([], target), null);
});
