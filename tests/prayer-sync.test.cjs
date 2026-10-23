const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function fixture({ prayers = [], online = true, fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, shareId: 'server-id' }) }), store = new Map() } = {}) {
    if (!store.has('index')) store.set('index', { version: 1, guestPrays: prayers, recordings: {}, pendingWords: {} });
    let writes = 0, failWrite = false;
    const events = [];
    const storage = { getItem: async key => structuredClone(store.get(key)), removeItem: async key => store.delete(key),
        setItem: async (key, value) => { if (failWrite) throw new Error('Disk full'); store.set(key, structuredClone(value)); writes++; } };
    const context = { ...require('fflate'), Blob, Uint8Array, btoa, atob, crypto: webcrypto, AbortController,
        navigator: { onLine: online }, window: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        Capacitor: { isNativePlatform: () => false }, localforage: { createInstance: () => storage },
        getApiBaseUrl: () => 'https://example.test/api', fetch, clearTimeout,
        setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); if (delay > 1000) timer.unref(); return timer; } };
    vm.createContext(context);
    const source = ['utils/prayerActivity.js', 'utils/prayRecordings.js', 'services/prayerSync.js'].map(file =>
        fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n');
    vm.runInContext(source + '\n;globalThis.api = { configurePrayerSync, preparePrayerAction, retryPrayerAction, wakePrayerSync, newPrayerAction, getGuestPrays, getPrayerActions, settlePrayerAction, applyPrayerRevocations, getRecordingsIndex, buildMyPraysZip, restoreMyPraysZip, localPrayerOverlay };', context);
    return { api: context.api, store, events, context, get writes() { return writes; }, failWrite(value) { failWrite = value; } };
}
const sent = () => ({ _id: 'local-prayer', words: 'Keep my prayer', date: new Date().toISOString(), prayType: 'general', sharedWith: { userId: 'friend', username: 'friend', status: 'sent', shareId: null } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ok = data => ({ ok: true, status: 200, json: async () => ({ success: true, ...data }) });

test('a pending card is persisted before a slow request and only cleared after acknowledgement', async () => {
    const response = deferred(), started = deferred(); let body;
    const f = fixture({ fetch: async (url, options) => { body = JSON.parse(options.body); started.resolve(); return response.promise; } });
    f.api.configurePrayerSync('owner', 'token');
    const entry = { ...sent(), _sync: f.api.newPrayerAction('send', 'owner') };
    await f.api.preparePrayerAction(entry); await started.promise;
    assert.equal((await f.api.getGuestPrays())[0]._sync.state, 'pending');
    assert.equal(body.requestId, entry._sync.requestId);
    assert.equal(JSON.stringify(f.store.get('index')).includes('token'), false);
    response.resolve(ok({ shareId: 'server-id', date: entry.date })); await f.api.wakePrayerSync();
    const saved = (await f.api.getGuestPrays())[0];
    assert.equal(saved._sync, null); assert.equal(saved.sharedWith.shareId, 'server-id');
    const writes = f.writes; await f.api.wakePrayerSync(); assert.equal(f.writes, writes, 'idle wakeups never rewrite the journal');
});

test('lost responses preserve content and Retry sends the same action ID', async () => {
    const ids = []; let attempts = 0;
    const f = fixture({ fetch: async (url, options) => { ids.push(JSON.parse(options.body).requestId); if (++attempts === 1) throw new Error('Lost acknowledgement'); return ok({ shareId: 'server-id' }); } });
    f.api.configurePrayerSync('owner', 'token');
    await f.api.preparePrayerAction({ ...sent(), _sync: f.api.newPrayerAction('send', 'owner') }); await f.api.wakePrayerSync();
    let entry = (await f.api.getGuestPrays())[0];
    assert.equal(entry.words, 'Keep my prayer'); assert.equal(entry._sync.state, 'failed');
    await f.api.retryPrayerAction(entry); await f.api.wakePrayerSync();
    assert.equal((await f.api.getGuestPrays())[0]._sync, null); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
});

test('personal saves and deletions finish locally while a network upload is stalled', async () => {
    const response = deferred(), started = deferred();
    const f = fixture({ fetch: async () => { started.resolve(); return response.promise; } });
    f.api.configurePrayerSync('owner', 'token');
    await f.api.preparePrayerAction({ ...sent(), _sync: f.api.newPrayerAction('send', 'owner') }); await started.promise;
    const note = { _id: 'personal', words: 'Saved immediately', date: new Date().toISOString(), _sync: f.api.newPrayerAction('save', 'owner') };
    await f.api.preparePrayerAction(note);
    assert.equal((await f.api.getGuestPrays()).find(entry => entry._id === 'personal')._sync, null);
    await f.api.preparePrayerAction({ ...note, _sync: f.api.newPrayerAction('delete-local', 'owner', { hidden: true }) });
    assert.equal((await f.api.getGuestPrays()).some(entry => entry._id === 'personal'), false);
    response.resolve(ok({ shareId: 'server-id' })); await f.api.wakePrayerSync();
});

test('offline queue survives a restart, stays scoped to its owner, and uploads saved audio', async () => {
    const f = fixture({ online: false }); f.api.configurePrayerSync('owner', 'token');
    const entry = { ...sent(), _sync: f.api.newPrayerAction('send', 'owner', { audioCount: 1 }) };
    await f.api.preparePrayerAction(entry, [{ id: 'clip', blob: new Blob(['audio'], { type: 'audio/webm' }), duration: 2 }]); await f.api.wakePrayerSync();
    assert.equal((await f.api.getPrayerActions('owner')).length, 1);
    let posted;
    const restored = fixture({ store: f.store, fetch: async (url, options) => { posted = JSON.parse(options.body); return ok({ shareId: 'server-id' }); } });
    restored.api.configurePrayerSync('another', 'other-token'); await restored.api.wakePrayerSync(); assert.equal(posted, undefined);
    restored.api.configurePrayerSync('owner', 'token'); await restored.api.wakePrayerSync();
    assert.equal(posted.recordings[0].data, btoa('audio')); assert.equal(posted.recordings[0].id, 'clip');
    assert.equal((await restored.api.getGuestPrays())[0]._sync, null);
});

test('optimistic deletion hides its durable copy, restores failure, and removes text/audio only on success', async () => {
    const response = deferred(), started = deferred(); let attempt = 0;
    const f = fixture({ fetch: async () => { if (++attempt === 1) { started.resolve(); return response.promise; } return ok({ shareId: 'server-id' }); } });
    f.api.configurePrayerSync('owner', 'token');
    const entry = { ...sent(), sharedWith: { ...sent().sharedWith, shareId: 'server-id' }, _sync: f.api.newPrayerAction('delete', 'owner', { hidden: true }) };
    await f.api.preparePrayerAction(entry); await started.promise;
    assert.equal((await f.api.getGuestPrays()).length, 0); assert.equal((await f.api.getPrayerActions('owner')).length, 1);
    response.resolve({ ok: false, status: 503, json: async () => ({}) }); await f.api.wakePrayerSync();
    const failed = (await f.api.getGuestPrays())[0]; assert.equal(failed._sync.state, 'failed'); assert.equal(failed._sync.hidden, false);
    await f.api.retryPrayerAction(failed); await f.api.wakePrayerSync();
    assert.equal((await f.api.getGuestPrays()).length, 0); assert.equal(f.store.get('index').revokedPrayerShares['server-id'], true);
});

test('revocation wins over a late reply acknowledgement', async () => {
    const response = deferred(), started = deferred();
    const f = fixture({ fetch: async () => { started.resolve(); return response.promise; } });
    f.api.configurePrayerSync('owner', 'token');
    await f.api.preparePrayerAction({ _id: 'received-server-id', date: new Date().toISOString(), words: 'Original',
        sharedFrom: { username: 'friend', shareId: 'server-id', status: 'confirmed', responseWords: 'My reply', respondedAt: '2026-10-24' },
        _sync: f.api.newPrayerAction('reply', 'owner') });
    await started.promise; await f.api.applyPrayerRevocations(['server-id'], 'owner');
    response.resolve(ok({ respondedAt: new Date().toISOString() })); await f.api.wakePrayerSync();
    assert.equal((await f.api.getGuestPrays()).length, 0); assert.equal((await f.api.getPrayerActions('owner')).length, 0);
});

test('storage failures retain the draft and blobs in memory for Retry', async () => {
    const f = fixture(); f.api.configurePrayerSync('owner', 'token'); f.failWrite(true);
    const entry = { ...sent(), _sync: f.api.newPrayerAction('save', 'owner', { audioCount: 1 }) };
    await f.api.preparePrayerAction(entry, [{ id: 'clip', blob: new Blob(['audio']) }]);
    const failed = f.api.localPrayerOverlay()[0]; assert.equal(failed._sync.localFailure, true);
    f.failWrite(false); await f.api.retryPrayerAction(failed); await f.api.wakePrayerSync();
    assert.equal((await f.api.getGuestPrays())[0]._sync, null); assert.equal((await f.api.getRecordingsIndex())[entry._id].length, 1);
});

test('interrupted preparations cannot silently send a prayer with missing audio', async () => {
    const f = fixture({ prayers: [{ ...sent(), _sync: { kind: 'send', ownerId: 'owner', requestId: 'request', state: 'preparing', audioCount: 2 } }], fetch: async () => { assert.fail('Missing clips must not be sent'); } });
    f.api.configurePrayerSync('owner', 'token'); await f.api.wakePrayerSync();
    const entry = (await f.api.getGuestPrays())[0]; assert.equal(entry._sync.state, 'failed'); assert.equal(entry._sync.retryable, false);
});

test('interrupted replies and deletions recover without treating existing audio as new uploads', async () => {
    for (const kind of ['reply', 'delete']) {
        const entry = kind === 'reply' ? { _id: 'received-server-id', words: 'Original audio prayer', date: new Date().toISOString(),
            sharedFrom: { username: 'friend', shareId: 'server-id', status: 'confirmed', responseWords: 'My reply' } }
            : { ...sent(), sharedWith: { ...sent().sharedWith, shareId: 'server-id' } };
        entry._sync = { kind, ownerId: 'owner', requestId: 'request', state: 'preparing', hidden: kind === 'delete' };
        const f = fixture({ prayers: [entry] });
        f.store.get('index').recordings[entry._id] = [{ id: 'original-clip', mimeType: 'audio/webm', ext: 'webm' }];
        f.api.configurePrayerSync('owner', 'token'); await f.api.wakePrayerSync();
        assert.equal((await f.api.getPrayerActions('owner')).length, 0);
        if (kind === 'reply') assert.equal((await f.api.getGuestPrays())[0]._sync, null);
        else assert.equal((await f.api.getGuestPrays()).length, 0);
    }
});

test('restoring a backup retains pending text but requires an explicit Retry', async () => {
    const f = fixture({ online: false }); f.api.configurePrayerSync('owner', 'token');
    await f.api.preparePrayerAction({ ...sent(), _sync: f.api.newPrayerAction('send', 'owner') }); await f.api.wakePrayerSync();
    const zip = await f.api.buildMyPraysZip([]);
    const restored = fixture({ online: false });
    await restored.api.restoreMyPraysZip(zip);
    const entry = (await restored.api.getGuestPrays())[0]; assert.equal(entry.words, 'Keep my prayer'); assert.equal(entry._sync.state, 'failed'); assert.equal(entry._sync.nextAttemptAt, 0);
});
