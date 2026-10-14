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
vm.runInNewContext(source + ';globalThis.api = { prayerNotificationHref, navigateDocumentFallback };', context);
const api = context.api;
test('shared prayer and reply taps open the actual prayer document without selecting a card', () => {
  for (const type of ['PRAY_SHARED', 'PRAY_CONFIRMED']) {
    const href = api.prayerNotificationHref({ type, shareId: 'share-123', url: '/' });
    assert.equal(href, '/pray/');
    api.navigateDocumentFallback(href);
    assert.equal(context.window.location.assigned, '/pray/index.html');
  }
});
test('prayer notification routing ignores incoming share IDs and rejects unrelated types', () => {
  assert.equal(api.prayerNotificationHref({ type: 'PRAY_SHARED', shareId: 'id&notificationType=OTHER' }), '/pray/');
  assert.equal(api.prayerNotificationHref({ type: 'OTHER', url: '/pray' }), null);
});
