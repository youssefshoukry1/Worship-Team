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
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    PushNotifications: {
      createChannel: async () => {}, checkPermissions: async () => ({ receive: 'granted' }),
      addListener: async (name, callback) => { listeners[name] = callback; calls.push(name); return { remove: async () => {} }; },
      register: async () => { calls.push('register'); }
    }
  };
  let source = fs.readFileSync(path.join(__dirname, '../src/app/services/pushNotificationService.js'), 'utf8');
  source = source.replace(/import .*from .*;/, '').replaceAll('export async function', 'async function')
    .replace("await import('@capacitor/core')", '({ Capacitor })')
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
