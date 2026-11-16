const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = ['prayerActivity.js', 'prayRecordings.js'].map(file => fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n');
const prayer = id => ({ _id: id, words: 'Prayer ' + id, date: '2026-11-17T00:00:00Z' });
function fixture(native, shared = { disk: { guestPrays: [prayer('old')], recordings: {} }, tail: Promise.resolve() }) {
    let reads = 0, writes = 0, error = null, failWrite = false, partial = false;
    const audio = new Map();
    const read = async () => { reads++; if (error) throw error; await Promise.resolve(); return structuredClone(shared.disk); };
    const write = async value => { if (partial) shared.disk = '{broken'; if (failWrite || partial) throw new Error('Disk full'); writes++; shared.disk = structuredClone(value); };
    const context = vm.createContext({ Blob, Uint8Array, btoa, atob, window: {},
        navigator: { locks: { request: (_, fn) => { const next = shared.tail.then(fn); shared.tail = next.catch(() => {}); return next; } } },
        Capacitor: { isNativePlatform: () => native }, Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' },
        localforage: { createInstance: () => ({ getItem: key => key === 'index' ? read() : audio.get(key) || null, setItem: (key, value) => key === 'index' ? write(value) : audio.set(key, value), removeItem: key => audio.delete(key) }) },
        Filesystem: {
            readFile: async () => { const value = await read(); if (value === null) throw Object.assign(new Error('missing'), { code: 'OS-PLUG-FILE-0008' }); return { data: typeof value === 'string' ? value : JSON.stringify(value) }; },
            writeFile: async ({ path, data }) => path.endsWith('index.json') ? write(JSON.parse(data)) : audio.set(path, data),
            deleteFile: async ({ path }) => audio.delete(path),
        },
    });
    vm.runInContext(source + '\nglobalThis.api = { getGuestPrays, getRecordingsIndex, getCachedPrayerSnapshot, getPrayerStorageError, subscribeLocalPrayers, refreshLocalPrayerCache, addGuestPray, updateGuestPray, deleteGuestPray, repairPrayerTexts, importLegacyPrayers, addExternalRecordings };', context);
    return { api: context.api, shared, audio, get reads() { return reads; }, get writes() { return writes; }, error(value) { error = value; }, fail(value) { failWrite = value; }, partial() { partial = true; } };
}
for (const native of [false, true]) {
    const adapter = native ? 'native JSON adapter' : 'web adapter';
    test(adapter + ': missing store initializes, failed reads and invalid structures never overwrite history', async () => {
        const f = fixture(native); const old = structuredClone(f.shared.disk);
        for (const error of [new Error('I/O failed'), Object.assign(new Error('denied'), { code: 'OS-PLUG-FILE-0007' })]) {
            f.error(error); await assert.rejects(f.api.addGuestPray(prayer('new')), /Could not read/);
            assert.deepEqual(f.shared.disk, old); assert.equal(f.writes, 0);
        }
        f.error(null);
        for (const value of ['{bad json', [], { guestPrays: null }, { recordings: { one: {} } }, { version: 99 }]) {
            f.shared.disk = value; await assert.rejects(f.api.addGuestPray(prayer('new')), /Could not read/); assert.equal(f.writes, 0);
        }
        f.shared.disk = null; await f.api.addGuestPray(prayer('first')); assert.equal(f.writes, 1);
        assert.equal(f.api.getPrayerStorageError(), null);
    });
    test(adapter + ': a failed write keeps the published snapshot immutable and retry succeeds', async () => {
        const f = fixture(native); await f.api.getGuestPrays(); const before = f.api.getCachedPrayerSnapshot(); let publications = 0;
        f.api.subscribeLocalPrayers(() => publications++); f.fail(true);
        await assert.rejects(f.api.updateGuestPray('old', { words: 'Changed' }), /Disk full/);
        assert.equal(f.api.getCachedPrayerSnapshot(), before); assert.equal(publications, 0); assert.equal(f.shared.disk.guestPrays[0].words, 'Prayer old');
        f.fail(false); await f.api.updateGuestPray('old', { words: 'Changed' }); assert.equal(publications, 1);
    });
    test(adapter + ': batched import and guarded repair use one write each; no-ops do not write or publish', async () => {
        const f = fixture(native); await f.api.getGuestPrays(); let publications = 0; f.api.subscribeLocalPrayers(() => publications++);
        const entries = Array.from({ length: 100 }, (_, i) => ({ ...prayer(String(i)), words: 'enc:v1:' + i }));
        await f.api.importLegacyPrayers(entries); assert.equal(f.writes, 1);
        await f.api.repairPrayerTexts(entries.map(entry => ({ id: entry._id, field: 'words', text: entry.words, plain: 'Plain ' + entry._id })));
        assert.equal(f.writes, 2); assert.equal(publications, 2);
        await f.api.updateGuestPray('old', { words: 'Prayer old' }); await f.api.deleteGuestPray('absent'); await f.api.importLegacyPrayers(entries);
        await f.api.repairPrayerTexts([{ id: '0', field: 'words', text: 'enc:v1:0', plain: 'Stale reply' }]);
        assert.equal(f.writes, 2); assert.equal(publications, 2); assert.equal((await f.api.getGuestPrays()).find(entry => entry._id === '0').words, 'Plain 0');
    });
    test(adapter + ': audio batch is committed once and incomplete delivery cannot succeed', async () => {
        const f = fixture(native);
        const clips = Array.from({ length: 4 }, (_, i) => ({ id: 'clip-' + i, data: btoa('audio'), mimeType: 'audio/wav' }));
        f.fail(true);
        await assert.rejects(f.api.addExternalRecordings('old', clips), /Disk full/);
        assert.equal(f.writes, 0); assert.equal((await f.api.getRecordingsIndex()).old, undefined);
        f.fail(false);
        await f.api.addExternalRecordings('old', clips); assert.equal(f.writes, 1); assert.equal((await f.api.getRecordingsIndex()).old.length, 4);
        await f.api.addExternalRecordings('old', clips); assert.equal(f.writes, 1);
        await assert.rejects(f.api.addExternalRecordings('old', [{ id: 'missing' }]), /incomplete/); assert.equal(f.writes, 1);
        // Restored legacy prayer IDs need the actual share ID for revocation checks.
        f.shared.disk.revokedPrayerShares = { revoked: true };
        const rejected = await f.api.addExternalRecordings('legacy-local-id', [{ id: 'late-clip', data: btoa('audio') }], 'revoked');
        assert.equal(rejected.length, 0); assert.equal(f.shared.disk.recordings['legacy-local-id'], undefined);
    });
}
test('two web runtimes serialize fresh read-modify-write and retain both prayers', async () => {
    const a = fixture(false), b = fixture(false, a.shared);
    await Promise.all([a.api.addGuestPray(prayer('a')), b.api.addGuestPray(prayer('b'))]);
    assert.deepEqual(a.shared.disk.guestPrays.map(entry => entry._id).sort(), ['a', 'b', 'old']);
});
test('a native reader rejects a partial index and later mutations remain blocked rather than treating it as empty', async () => {
    const writer = fixture(true), reader = fixture(true, writer.shared); await writer.api.getGuestPrays(); const before = writer.api.getCachedPrayerSnapshot();
    writer.partial(); await assert.rejects(writer.api.updateGuestPray('old', { words: 'New' }), /Disk full/);
    await assert.rejects(reader.api.getGuestPrays(), /Could not read/); await assert.rejects(reader.api.addGuestPray(prayer('new')), /Could not read/);
    assert.equal(writer.api.getCachedPrayerSnapshot(), before); assert.equal(writer.shared.disk, '{broken');
});
