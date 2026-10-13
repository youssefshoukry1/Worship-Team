const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function service(fetch) {
  const listeners = {}, calls = [], timers = [], events = [];
  const storage = new Map([['user_Taspe7_Token', 'login'], ['taspe7_fcm_token', 'device']]);
  const context = {
    console: { log() {}, warn() {}, error() {} }, fetch,
    window: { addEventListener() {}, dispatchEvent: event => events.push(event.type), location: {} },
    document: { visibilityState: 'visible', addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {},
    getApiBaseUrl: () => 'https://example.test/api',
    navigateDocumentFallback: href => calls.push(href),
    prayerNotificationHref: data => data?.type === 'PRAY_SHARED' || data?.type === 'PRAY_CONFIRMED' ? '/pray/?notificationType=' + data.type + '&shareId=' + encodeURIComponent(data.shareId) : null,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    PushNotifications: {
      createChannel: async () => {}, checkPermissions: async () => ({ receive: 'granted' }),
      addListener: async (name, callback) => { listeners[name] = callback; calls.push(name); return { remove: async () => {} }; },
      register: async () => { calls.push('register'); }
    }
  };
  let source = fs.readFileSync(path.join(__dirname, '../src/app/services/pushNotificationService.js'), 'utf8');
  source = source.replace(/^import .*from .*;$/gm, '').replaceAll('export async function', 'async function')
    .replaceAll("await import('@capacitor/core')", '({ Capacitor })')
    .replace("await import('@capacitor/push-notifications')", '({ PushNotifications })');
  // Avoid shadowing the mocked imports when replacing the dynamic import expressions.
  source = source.replace('const { Capacitor } = ({ Capacitor });', '')
    .replace('const { PushNotifications } = ({ PushNotifications });', '');
  vm.runInNewContext(source + ';globalThis.api = { syncFcmTokenWithBackend, initPushNotifications };', context);
  return { ...context, listeners, calls, timers, events };
}
test('HTTP failures return false and schedule a retry rather than reporting success', async () => {
  const s = service(async () => ({ ok: false, status: 401 }));
  assert.equal(await s.api.syncFcmTokenWithBackend(), false);
  assert.equal(s.timers.length, 1); assert.equal(s.timers[0].delay, 15000);
});
test('successful token sync targets authenticated backend registration', async () => {
  let request; const s = service(async (url, options) => { request = { url, options }; return { ok: true }; });
  assert.equal(await s.api.syncFcmTokenWithBackend(), true);
  assert.equal(request.url, 'https://example.test/api/users/fcm-token');
  assert.equal(request.options.headers.Authorization, 'Bearer login');
  assert.equal(JSON.parse(request.options.body).fcmToken, 'device');
});
test('listeners attach before native registration; concurrent initialization registers once', async () => {
  const s = service(async () => ({ ok: true }));
  await Promise.all([s.api.initPushNotifications(), s.api.initPushNotifications()]);
  assert.equal(s.calls.at(-1), 'register'); assert.equal(s.calls.filter(c => c === 'register').length, 1);
  s.listeners.pushNotificationReceived({ data: { type: 'PRAY_SHARED' } });
  assert.deepEqual(s.events, ['taspe7:prayer-push']);
});

test('avatar capability is registered only when the native plugin exists', async () => {
  let body;
  const s = service(async (url, options) => { body = JSON.parse(options.body); return { ok: true }; });
  await s.api.syncFcmTokenWithBackend(); assert.equal(body.androidAvatar, false);
  s.Capacitor.isPluginAvailable = name => name === 'PrayerNotifications';
  await s.api.syncFcmTokenWithBackend(); assert.equal(body.androidAvatar, true);
});

test('notification taps use native navigation with the exact share ID', async () => {
  const s = service(async () => ({ ok: true })); await s.api.initPushNotifications();
  s.listeners.pushNotificationActionPerformed({ notification: { data: { type: 'PRAY_SHARED', shareId: 'abc', url: '/pray' } } });
  assert.equal(s.calls.at(-1), '/pray/?notificationType=PRAY_SHARED&shareId=abc');
  s.listeners.pushNotificationActionPerformed({ notification: { data: { type: 'PRAY_CONFIRMED', shareId: 'reply' } } });
  assert.equal(s.calls.at(-1), '/pray/?notificationType=PRAY_CONFIRMED&shareId=reply');
});
test('non-prayer notifications cannot navigate to an external website', async () => {
  const s = service(async () => ({ ok: true })); await s.api.initPushNotifications();
  const count = s.calls.length;
  s.listeners.pushNotificationActionPerformed({ notification: { data: { url: '//example.com' } } });
  assert.equal(s.calls.length, count);
});
