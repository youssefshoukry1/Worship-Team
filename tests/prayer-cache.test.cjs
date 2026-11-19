const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(native = false) {
    let disk = { guestPrays: [], recordings: {} }, reads = 0, writes = 0, fail = false, delay = null;
    const storage = {
        getItem: async () => { reads++; const value = structuredClone(disk); if (delay) await delay; return value; },
        setItem: async (_, value) => { if (fail) throw new Error('Disk full'); writes++; disk = structuredClone(value); },
    };
    const context = vm.createContext({ window: {}, Capacitor: { isNativePlatform: () => native }, localforage: { createInstance: () => storage },
        Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' },
        Filesystem: { readFile: async () => ({ data: JSON.stringify(await storage.getItem('index')) }), writeFile: async ({ data }) => storage.setItem('index', JSON.parse(data)) } });
    const source = ['prayerActivity.js', 'prayRecordings.js'].map(file => fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n');
    vm.runInContext(source + '\nglobalThis.api = { getGuestPrays, getRecordingsIndex, getCachedPrayerSnapshot, subscribeLocalPrayers, refreshLocalPrayerCache, addGuestPray, updateGuestPray, migratePrayerReadState, markPrayerActivitySeen, prayerReadSyncInput, savePrayerReadPage, mergeIncomingPrayers, applyPrayerReplies };', context);
    return { api: context.api, get reads() { return reads; }, get writes() { return writes; }, setDisk: value => { disk = structuredClone(value); }, fail: value => { fail = value; }, delay: value => { delay = value; } };
}
const prayer = id => ({ _id: id, words: `Prayer ${id}`, date: '2026-11-14T00:00:00Z', prayType: 'general' });

for (const native of [true, false]) test(`${native ? 'native' : 'web'} receipts survive offline opens, delayed delivery and a newer reply`, async () => {
    const a = fixture(native).api;
    const shareId = 'test-share', timestamp = '2026-11-20T07:00:00.000Z';
    await a.savePrayerReadPage('reader', 2, ['prayer:' + shareId, 'reply:' + shareId + ':' + timestamp]);
    await a.mergeIncomingPrayers([{ shareId, words: 'Local fixture' }]);
    await a.addGuestPray({ ...prayer('sent'), sharedWith: { shareId, status: 'sent' } });
    await a.applyPrayerReplies([{ shareId, respondedAt: timestamp }]);
    let entries = await a.getGuestPrays();
    assert.equal(entries.find(p => p.sharedFrom).sharedFrom.seenActivityBy.reader, 'prayer:' + shareId);
    assert.equal(entries.find(p => p.sharedWith).sharedWith.seenActivityBy.reader, 'reply:' + shareId + ':' + timestamp);
    const newer = '2026-11-21T07:00:00.000Z';
    await a.applyPrayerReplies([{ shareId, respondedAt: newer }]);
    const activity = 'reply:' + shareId + ':' + newer;
    entries = await a.getGuestPrays();
    assert.notEqual(entries.find(p => p.sharedWith).sharedWith.seenActivityBy.reader, activity);
    await a.markPrayerActivitySeen('sent', 'reader', activity);
    await a.refreshLocalPrayerCache();
    assert.deepEqual(Array.from((await a.prayerReadSyncInput('reader')).opened), [activity]);
    assert.equal((await a.prayerReadSyncInput('other')).opened.length, 0);
    await a.savePrayerReadPage('reader', 3, [activity]);
    assert.equal((await a.prayerReadSyncInput('reader')).opened.length, 0);
    assert.equal((await a.prayerReadSyncInput('reader')).after, 3);
});

test('parallel text and recording loads share one read; warm getters perform no reads', async () => {
    const f = fixture();
    await Promise.all([f.api.getGuestPrays(), f.api.getRecordingsIndex(), f.api.getGuestPrays()]);
    const first = f.api.getCachedPrayerSnapshot();
    for (let i = 0; i < 10; i++) { await f.api.getGuestPrays(); await f.api.getRecordingsIndex(); }
    assert.equal(f.reads, 1);
    assert.equal(f.api.getCachedPrayerSnapshot(), first);
});

test('native index.json is also cached and publishes changes after durable writes', async () => {
    const f = fixture(true);
    await Promise.all([f.api.getGuestPrays(), f.api.getRecordingsIndex()]);
    assert.equal(f.reads, 1);
    await f.api.addGuestPray(prayer('native'));
    const reads = f.reads;
    assert.equal((await f.api.getGuestPrays())[0]._id, 'native');
    await f.api.getRecordingsIndex();
    assert.equal(f.reads, reads);
    assert.equal(f.writes, 1);
});

test('text updates retain unrelated cards and recordings; unchanged refresh publishes nothing', async () => {
    const f = fixture();
    f.setDisk({ guestPrays: [prayer('a'), prayer('b')], recordings: { a: [{ id: 'clip' }] } });
    await f.api.getGuestPrays();
    const before = f.api.getCachedPrayerSnapshot(), events = [];
    const unsubscribe = f.api.subscribeLocalPrayers(next => events.push(next));
    await f.api.updateGuestPray('a', { words: 'Changed' });
    const after = f.api.getCachedPrayerSnapshot();
    assert.equal(after.prayers[1], before.prayers[1]);
    assert.equal(after.recordings, before.recordings);
    assert.equal(before.prayers[0].words, 'Prayer a', 'published snapshots must remain immutable');
    await f.api.refreshLocalPrayerCache();
    assert.equal(events.length, 1);
    unsubscribe();
});

test('failed writes cannot change the published snapshot or notify subscribers', async () => {
    const f = fixture(); await f.api.getGuestPrays();
    const before = f.api.getCachedPrayerSnapshot(); let notifications = 0;
    f.api.subscribeLocalPrayers(() => notifications++);
    f.fail(true);
    await assert.rejects(f.api.addGuestPray(prayer('a')), /Disk full/);
    assert.equal(f.api.getCachedPrayerSnapshot(), before);
    assert.equal(notifications, 0);
    f.fail(false); await f.api.addGuestPray(prayer('b'));
    assert.equal((await f.api.getGuestPrays())[0]._id, 'b');
});

test('external refresh catches background writes and transactions read fresh disk data', async () => {
    const f = fixture(); await f.api.getGuestPrays();
    f.setDisk({ guestPrays: [prayer('external')], recordings: {} });
    await f.api.refreshLocalPrayerCache();
    assert.equal((await f.api.getGuestPrays())[0]._id, 'external');
    f.setDisk({ guestPrays: [prayer('other')], recordings: {} });
    await f.api.addGuestPray(prayer('local'));
    assert.deepEqual(Array.from(await f.api.getGuestPrays(), entry => entry._id).sort(), ['local', 'other']);
});

test('migration is deduplicated per owner and invalidated after external changes', async () => {
    const f = fixture();
    await Promise.all([f.api.migratePrayerReadState('a', new Set()), f.api.migratePrayerReadState('a', new Set())]);
    const reads = f.reads;
    await f.api.migratePrayerReadState('a', new Set());
    assert.equal(f.reads, reads);
    await f.api.refreshLocalPrayerCache();
    const refreshed = f.reads;
    await f.api.migratePrayerReadState('a', new Set());
    assert.equal(f.reads, refreshed + 1);
});

test('an old in-flight read cannot overwrite a newer durable write', async () => {
    const f = fixture(); let release;
    f.delay(new Promise(resolve => { release = resolve; }));
    const load = f.api.getGuestPrays();
    await new Promise(resolve => setImmediate(resolve));
    f.delay(null);
    await f.api.addGuestPray(prayer('new'));
    release(); await load;
    assert.equal((await f.api.getGuestPrays())[0]._id, 'new');
    assert.equal(f.api.getCachedPrayerSnapshot().prayers.length, 1);
});
