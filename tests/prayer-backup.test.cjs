const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const storage = new Map(), calls = [];
  const plugin = {
    configure: async options => { calls.push(['configure', options]); return { nextBackupAt: 123 }; },
    suspend: async () => calls.push(['suspend']),
    runNow: async () => calls.push(['runNow']),
    setOwner: async options => calls.push(['owner', options]),
    getStatus: async () => ({ lastSuccess: 1234567890000 }),
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/services/prayerBackupService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = { Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true }, registerPlugin: () => plugin,
    getApiBaseUrl: () => 'https://example.test/api',
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { dispatchEvent() {} }, Event: class {}, Date, JSON, Promise };
  vm.createContext(context); vm.runInContext(source, context);
  return { context, storage, calls, plugin };
}

test('schedule defaults off and accepts only supported intervals', () => {
  const { context: c, storage } = fixture();
  assert.equal(c.readBackupSettings('a').intervalDays, 0);
  for (const interval of [7, 14, 30]) {
    storage.set('my_prays_schedule_a', JSON.stringify({ intervalDays: interval, wifiOnly: false }));
    assert.equal(c.readBackupSettings('a').intervalDays, interval); assert.equal(c.readBackupSettings('a').wifiOnly, false);
  }
  storage.set('my_prays_schedule_a', '{invalid'); assert.equal(c.readBackupSettings('a').intervalDays, 0);
  storage.set('my_prays_schedule_a', '{"intervalDays":1}'); assert.equal(c.readBackupSettings('a').intervalDays, 0);
});
test('configuration serializes credentials, selected account and logout in order', async () => {
  const { context: c, calls, storage } = fixture();
  await Promise.all([c.configurePrayerBackup('a', 'token-a', { intervalDays: 7, email: 'a@test' }), c.configurePrayerBackup('b', 'token-b', { intervalDays: 14, email: 'b@test' }), c.configurePrayerBackup(null, null)]);
  assert.deepEqual(calls.map(call => call[0]), ['configure', 'configure', 'suspend']);
  assert.equal(calls[1][1].token, 'token-b'); assert.equal(calls[1][1].email, 'b@test');
  assert.equal(storage.size, 0, 'app credentials must never be persisted in JS backup settings');
});
test('failed native settings save does not pretend the schedule was enabled', async () => {
  const { context: c, plugin, storage } = fixture();
  plugin.configure = async () => { throw new Error('keychain unavailable'); };
  await assert.rejects(c.saveBackupSettings('a', 'token', { intervalDays: 7 }), /keychain/);
  assert.equal(storage.has('my_prays_schedule_a'), false);
});
test('manual backup uses the selected account and mirrors only native successful completion', async () => {
  const { context: c, calls, storage } = fixture();
  storage.set('my_prays_schedule_a', '{"intervalDays":30,"wifiOnly":true}');
  await c.startPrayerBackup('a', 'token', 'chosen@test');
  assert.equal(calls[0][1].email, 'chosen@test'); assert.equal(calls[0][1].intervalDays, 30);
  assert.equal(c.readBackupSettings('a').email, 'chosen@test', 'resuming the app must keep the active upload account');
  assert.equal(calls[1][0], 'runNow'); assert.equal(storage.has('my_prays_last_backup_a'), false);
  await c.prayerBackupStatus('a'); assert.equal(storage.get('my_prays_last_backup_a'), '2009-02-13T23:31:30.000Z');
});
test('queued owner markers cannot overwrite the currently signed-in account', async () => {
  const { context: c, calls, storage } = fixture();
  storage.set('user_Taspe7_ID', 'b');
  await c.cacheBackupOwner('a'); assert.equal(calls.length, 0);
  await c.cacheBackupOwner('b'); assert.equal(calls[0][0], 'owner'); assert.equal(calls[0][1].userId, 'b');
});
