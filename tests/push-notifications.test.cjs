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
    window: { addEventListener() {}, dispatchEvent: event => { events.push(event.type); return true; }, location: {} },
    document: { visibilityState: 'visible', addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout() {},
    getApiBaseUrl: () => 'https://example.test/api',
    navigateDocumentFallback: href => calls.push(href),
    markFriendsCacheDirty: () => storage.set('friends-dirty', '1'),
    URLSearchParams,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    nativeRegistration: { getFcmToken: async () => ({ token: 'ios-fcm-token' }) },
    registerPlugin: () => context.nativeRegistration,
    PushNotifications: {
      createChannel: async () => {}, checkPermissions: async () => ({ receive: 'granted' }),
      addListener: async (name, callback) => { listeners[name] = callback; calls.push(name); return { remove: async () => {} }; },
      register: async () => { calls.push('register'); }
    }
  };
  let source = fs.readFileSync(path.join(__dirname, '../src/app/services/pushNotificationService.js'), 'utf8');
  source = source.replace(/^import .*from .*;$/gm, '').replaceAll('export async function', 'async function')
    .replaceAll("await import('@capacitor/core')", '({ Capacitor, registerPlugin })')
    .replace("await import('@capacitor/push-notifications')", '({ PushNotifications })');
  // Avoid shadowing the mocked imports when replacing the dynamic import expressions.
  source = source.replace('const { Capacitor } = ({ Capacitor, registerPlugin });', '')
    .replace('const { PushNotifications } = ({ PushNotifications });', '');
  const navigationSource = fs.readFileSync(path.join(__dirname, '../src/app/utils/prayerNotificationNavigation.js'), 'utf8')
    .replaceAll('export function', 'function');
  const friendSource = fs.readFileSync(path.join(__dirname, '../src/app/utils/friendNotificationNavigation.js'), 'utf8')
    .replaceAll('export function', 'function');
  const testimonySource = fs.readFileSync(path.join(__dirname, '../src/app/utils/testimonyNotificationNavigation.js'), 'utf8').replaceAll('export function', 'function');
  vm.runInNewContext(navigationSource + '\n' + friendSource + '\n' + testimonySource + '\n' + source + ';globalThis.api = { syncFcmTokenWithBackend, initPushNotifications };', context);
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

test('notification taps pass the exact prayer or reply target to navigation', async () => {
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

test('a mounted prayer page handles taps synchronously without reloading or waiting for network', async () => {
  const s = service(() => new Promise(() => {}));
  await s.api.initPushNotifications();
  const count = s.calls.length;
  s.window.dispatchEvent = event => {
    s.events.push(event.type);
    if (event.type === 'taspe7:open-prayer') {
      assert.equal(event.detail.href, '/pray/?notificationType=PRAY_SHARED&shareId=abc');
      assert.equal(event.cancelable, true);
      return false;
    }
    return true;
  };
  s.listeners.pushNotificationActionPerformed({ notification: { data: { type: 'PRAY_SHARED', shareId: 'abc' } } });
  assert.equal(s.calls.length, count);
  assert.deepEqual(s.events, ['taspe7:open-prayer', 'taspe7:prayer-push']);
});

test('iOS registration replaces cached APNs tokens with the native Firebase token', async () => {
  let body;
  const s = service(async (url, options) => { body = JSON.parse(options.body); return { ok: true }; });
  s.Capacitor.getPlatform = () => 'ios'; s.Capacitor.isPluginAvailable = () => true;
  s.localStorage.setItem('taspe7_fcm_token', 'cached-apns-token');
  await s.api.syncFcmTokenWithBackend();
  assert.equal(body.fcmToken, 'ios-fcm-token'); assert.equal(body.androidAvatar, false);
  assert.equal(s.localStorage.getItem('taspe7_fcm_token'), 'ios-fcm-token');
});
test('iOS does not upload a token before APNs/FCM registration is ready', async () => {
  let called = false;
  const s = service(async () => { called = true; return { ok: true }; });
  s.Capacitor.getPlatform = () => 'ios'; s.Capacitor.isPluginAvailable = () => true;
  s.nativeRegistration.getFcmToken = async () => { throw new Error('not ready'); };
  assert.equal(await s.api.syncFcmTokenWithBackend(), false); assert.equal(called, false);
  assert.equal(s.timers.length, 1);
});

test('iOS launch taps open the exact prayer before permission checks or FCM registration finish', async () => {
  const s = service(() => new Promise(() => {}));
  s.Capacitor.getPlatform = () => 'ios';
  let checked, finishPermissions;
  const permissionStarted = new Promise(resolve => { checked = resolve; });
  const permissions = new Promise(resolve => { finishPermissions = resolve; });
  s.PushNotifications.checkPermissions = () => { checked(); return permissions; };
  const initialization = s.api.initPushNotifications();
  await permissionStarted;
  assert.equal(typeof s.listeners.pushNotificationActionPerformed, 'function');
  assert.equal(s.calls.includes('register'), false);
  s.listeners.pushNotificationActionPerformed({ actionId: 'tap', notification: { data: {
    type: 'PRAY_SHARED', shareId: 'ios-share', aps: { alert: { title: 'Friend', body: 'Shared a prayer' } },
  } } });
  assert.equal(s.calls.at(-1), '/pray/?notificationType=PRAY_SHARED&shareId=ios-share');
  finishPermissions({ receive: 'denied' });
  await initialization;
  await s.api.initPushNotifications();
  assert.equal(s.calls.filter(call => call === 'pushNotificationActionPerformed').length, 1);
});

test('iOS reply taps open the card without reloading a mounted page; dismissing never navigates', async () => {
  const s = service(() => new Promise(() => {}));
  s.Capacitor.getPlatform = () => 'ios';
  await s.api.initPushNotifications();
  const count = s.calls.length;
  const action = { actionId: 'tap', notification: { data: { type: 'PRAY_CONFIRMED', shareId: 'ios-reply' } } };
  s.window.dispatchEvent = event => {
    s.events.push(event.type);
    if (event.type === 'taspe7:open-prayer') {
      assert.equal(event.detail.href, '/pray/?notificationType=PRAY_CONFIRMED&shareId=ios-reply');
      return false;
    }
    return true;
  };
  s.listeners.pushNotificationActionPerformed(action);
  assert.equal(s.calls.length, count);
  assert.deepEqual(s.events, ['taspe7:open-prayer', 'taspe7:prayer-push']);
  s.events.length = 0;
  s.listeners.pushNotificationActionPerformed({ ...action, actionId: 'dismiss' });
  assert.equal(s.calls.length, count);
  assert.equal(s.events.length, 0);
});

test('friend taps route to the right section on both platforms and bypass a stale friends cache', async () => {
  for (const platform of ['android', 'ios']) {
    const s = service(async () => ({ ok: true })); s.Capacitor.getPlatform = () => platform;
    await s.api.initPushNotifications();
    for (const type of ['FRIEND_REQUEST_RECEIVED', 'FRIEND_REQUEST_ACCEPTED']) {
      s.listeners.pushNotificationActionPerformed({ actionId: 'tap', notification: { data: { type, actorId: 'friend' } } });
      assert.equal(s.calls.at(-1), `/friends/?notificationType=${type}&actorId=friend`);
      assert.equal(s.localStorage.getItem('friends-dirty'), '1');
    }
    s.listeners.pushNotificationReceived({ data: { type: 'FRIEND_REQUEST_RECEIVED' } });
    assert.equal(s.events.at(-1), 'taspe7:friends-push');
  }
});

test('friend taps on an already mounted page avoid navigation and request an immediate refresh', async () => {
  const s = service(async () => ({ ok: true })); await s.api.initPushNotifications();
  const count = s.calls.length;
  s.window.dispatchEvent = event => { assert.equal(event.type, 'taspe7:open-friends'); return false; };
  s.listeners.pushNotificationActionPerformed({ notification: { data: { type: 'FRIEND_REQUEST_ACCEPTED', actorId: 'friend' } } });
  assert.equal(s.calls.length, count);
});

test('old APKs retain standard friend alerts while a rebuilt Android renderer advertises avatar support', async () => {
  let body;
  const s = service(async (url, options) => { body = JSON.parse(options.body); return { ok: true }; });
  s.Capacitor.isPluginAvailable = () => true;
  await s.api.syncFcmTokenWithBackend(); assert.equal(body.androidFriendAvatar, false);
  s.nativeRegistration.getCapabilities = async () => ({ friendAvatar: true });
  await s.api.syncFcmTokenWithBackend(); assert.equal(body.androidFriendAvatar, true);
});

test('note avatar support is advertised independently, and data-only reactions retain their actor name and tap target', async () => {
  let body;
  const s = service(async (url, options) => { body = JSON.parse(options.body); return { ok: true }; });
  s.Capacitor.isPluginAvailable = () => true;
  s.nativeRegistration.getCapabilities = async () => ({ friendAvatar: true });
  await s.api.syncFcmTokenWithBackend(); assert.equal(body.androidTestimonyAvatar, false);
  s.nativeRegistration.getCapabilities = async () => ({ friendAvatar: true, testimonyAvatar: true });
  await s.api.syncFcmTokenWithBackend(); assert.equal(body.androidTestimonyAvatar, true);
  await s.api.initPushNotifications();
  let received;
  s.window.dispatchEvent = event => { received = event; return true; };
  const data = { type: 'TESTIMONY_LOVED', testimonyId: 'aaaaaaaaaaaaaaaaaaaaaaaa', actorId: 'friend', title: 'Youssef' };
  s.listeners.pushNotificationReceived({ data });
  assert.equal(received.type, 'taspe7:testimony-push');
  assert.equal(received.detail.title, 'Youssef loved your note');
  s.listeners.pushNotificationActionPerformed({ actionId: 'tap', notification: { data } });
  assert.equal(s.calls.at(-1), '/normal_UserProfile/?note=aaaaaaaaaaaaaaaaaaaaaaaa');
});
