const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = ['prayerActivity.js', 'prayRecordings.js'].map(file => fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n');
const prayer = id => ({ _id: id, words: id, date: '2026-11-17T00:00:00Z' });
function fixture(shared = { disk: { guestPrays: [prayer('old')], recordings: {} }, revision: 1 }) {
    let attempts = 0, hook = null, failure = null;
    const deleted = [];
    const context = vm.createContext({ window: {}, Blob, Uint8Array, btoa, atob,
        Capacitor: { isNativePlatform: () => true, isPluginAvailable: name => name === 'PrayerStorage' },
        Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' },
        Filesystem: { readFile: () => assert.fail('No legacy fallback'), writeFile: () => assert.fail('No legacy fallback'), deleteFile: async ({ path }) => deleted.push(path) },
        registerPlugin: name => { assert.equal(name, 'PrayerStorage'); return {
            readIndex: async () => ({ data: shared.disk === null ? null : JSON.stringify(shared.disk), fingerprint: shared.disk === null ? 'missing' : String(shared.revision) }),
            writeIndex: async ({ expectedFingerprint, data }) => {
                attempts++;
                if (hook) hook(shared);
                if (failure) throw failure;
                if (expectedFingerprint !== (shared.disk === null ? 'missing' : String(shared.revision))) throw Object.assign(new Error('Conflict'), { code: 'PRAYER_STORAGE_CONFLICT' });
                shared.disk = JSON.parse(data); shared.revision++;
                return { fingerprint: String(shared.revision) };
            },
        }; },
    });
    vm.runInContext(source + '\nglobalThis.api = { getGuestPrays, getCachedPrayerSnapshot, subscribeLocalPrayers, addGuestPray, updateGuestPray, deleteGuestPray, stagePrayerAction, settlePrayerAction };', context);
    return { api: context.api, shared, deleted, get attempts() { return attempts; }, hook(value) { hook = value; }, fail(value) { failure = value; } };
}
test('atomic bridge initializes first run and preserves existing history', async () => {
    const f = fixture({ disk: null, revision: 0 });
    await f.api.addGuestPray(prayer('first')); await f.api.addGuestPray(prayer('second'));
    assert.deepEqual(f.shared.disk.guestPrays.map(p => p._id).sort(), ['first', 'second']);
});
test('competing native runtimes reread and recompute without losing either write', async () => {
    const a = fixture(), b = fixture(a.shared);
    await Promise.all([a.api.addGuestPray(prayer('a')), b.api.addGuestPray(prayer('b'))]);
    assert.deepEqual(a.shared.disk.guestPrays.map(p => p._id).sort(), ['a', 'b', 'old']);
    assert.equal(a.attempts + b.attempts, 3);
});
test('conflicts are bounded and failed attempts never publish or delete audio', async () => {
    const f = fixture(); f.shared.disk.recordings.old = [{ id: 'audio', ext: 'wav' }];
    await f.api.getGuestPrays(); const before = f.api.getCachedPrayerSnapshot(); let publications = 0;
    f.api.subscribeLocalPrayers(() => publications++); f.hook(s => s.revision++);
    await assert.rejects(f.api.deleteGuestPray('old'), { code: 'PRAYER_STORAGE_CONFLICT' });
    assert.equal(f.attempts, 3); assert.equal(publications, 0); assert.equal(f.api.getCachedPrayerSnapshot(), before); assert.deepEqual(f.deleted, []);
});
test('supported bridge write failures never fall back to non-atomic storage', async () => {
    const f = fixture(); f.fail(new Error('Disk full'));
    await assert.rejects(f.api.addGuestPray(prayer('new')), /Disk full/);
    assert.equal(f.attempts, 1); assert.deepEqual(f.shared.disk.guestPrays.map(p => p._id), ['old']);
});
test('retry deletes only audio returned by the successful mutation', async () => {
    const f = fixture(); f.shared.disk.recordings.old = [{ id: 'previous', ext: 'wav' }];
    f.hook(s => { s.disk.recordings.old = [{ id: 'current', ext: 'wav' }]; s.revision++; f.hook(null); });
    await f.api.deleteGuestPray('old');
    assert.deepEqual(f.deleted, ['my_prays/audio/current.wav']); assert.equal(f.attempts, 2);
});
test('a revocation arriving during staging prevents a stale outbox commit', async () => {
    const f = fixture();
    f.hook(s => { s.disk.revokedPrayerShares = { share: true }; s.revision++; f.hook(null); });
    const result = await f.api.stagePrayerAction({ ...prayer('new'), sharedWith: { shareId: 'share' }, _sync: { ownerId: 'me', requestId: 'request' } });
    assert.equal(result, false); assert.equal(f.attempts, 1); assert.equal(f.shared.disk.guestPrays.length, 1);
});
test('a newer action arriving during acknowledgement is retained', async () => {
    const f = fixture(); f.shared.disk.guestPrays[0]._sync = { requestId: 'first' };
    f.hook(s => { s.disk.guestPrays[0]._sync.requestId = 'second'; s.revision++; f.hook(null); });
    assert.equal(await f.api.settlePrayerAction('old', 'first', { words: 'stale' }), false);
    assert.equal(f.attempts, 1); assert.equal(f.shared.disk.guestPrays[0].words, 'old');
});
