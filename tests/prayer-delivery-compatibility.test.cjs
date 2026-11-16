const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const { fixture } = require('./helpers/prayer-client.cjs');
const indexFixture = require('./fixtures/prayer-archive-index.json');
const ok = data => ({ ok: true, status: 200, json: async () => ({ success: true, ...data }) });

test('two independent clients retain audio, anonymity and replies through restart, lost response and duplicate delivery', async () => {
    let sentBody, replyBody, attempts = 0;
    const offline = fixture({ online: false }); offline.api.configurePrayerSync('alice', 'token-a');
    const entry = { _id: 'local-send', words: 'Private prayer', date: '2026-11-17', sharedWith: { userId: 'bob', isAnonymous: true }, _sync: offline.api.newPrayerAction('send', 'alice', { audioCount: 2 }) };
    await offline.api.preparePrayerAction(entry, ['one', 'two'].map(id => ({ id, blob: new Blob([id], { type: 'audio/webm' }) })));
    const sender = fixture({ store: offline.store, fetch: async (url, options) => {
        sentBody = JSON.parse(options.body);
        if (++attempts === 1) throw new Error('Lost response after relay persisted bundle');
        return ok({ shareId: 'share', date: entry.date });
    } });
    sender.api.configurePrayerSync('alice', 'token-a'); await sender.api.wakePrayerSync();
    const receiver = fixture({ fetch: async (url, options) => { replyBody = JSON.parse(options.body); return ok({ respondedAt: '2026-11-17T01:00:00Z' }); } });
    receiver.api.configurePrayerSync('bob', 'token-b');
    const bundle = { ...sentBody, shareId: 'share', date: entry.date, senderUsername: null, senderId: null };
    // A failed delivery acknowledgement leaves the relay bundle available for replay.
    for (let delivery = 0; delivery < 2; delivery++) {
        const merged = await receiver.api.mergeIncomingPrayers([bundle]);
        await receiver.api.addExternalRecordings(merged.prayerIds.share, bundle.recordings, 'share');
    }
    let received = (await receiver.api.getGuestPrays())[0];
    assert.equal((await receiver.api.getGuestPrays()).length, 1); assert.equal(received.sharedFrom.isAnonymous, true);
    assert.equal((await receiver.api.getRecordingsIndex())[received._id].length, 2);
    for (const rec of (await receiver.api.getRecordingsIndex())[received._id]) assert.equal(await receiver.api.getRecordingBase64(rec), btoa(rec.id));
    await sender.api.retryPrayerAction((await sender.api.getGuestPrays())[0]); await sender.api.wakePrayerSync();
    assert.equal(sentBody.requestId, entry._sync.requestId); assert.equal(attempts, 2);
    received = { ...received, sharedFrom: { ...received.sharedFrom, status: 'confirmed', responseWords: 'Praying for you' }, _sync: receiver.api.newPrayerAction('reply', 'bob') };
    await receiver.api.preparePrayerAction(received); await receiver.api.wakePrayerSync();
    const reply = { shareId: replyBody.shareId, responseWords: replyBody.responseWords, respondedAt: '2026-11-17T01:00:00Z' };
    await sender.api.applyPrayerReplies([reply]); await sender.api.markPrayerActivitySeen(entry._id, 'alice', 'reply:share:2026-11-17T01:00:00Z');
    const before = JSON.stringify(sender.store.get('index'));
    await sender.api.applyPrayerReplies([reply]); assert.equal(JSON.stringify(sender.store.get('index')), before);
    const archive = await receiver.api.buildMyPraysZip();
    await receiver.api.applyPrayerRevocations(['share'], 'bob');
    await receiver.api.mergeIncomingPrayers([bundle]);
    assert.equal((await receiver.api.addExternalRecordings('received-share', bundle.recordings, 'share')).length, 0);
    await receiver.api.restoreMyPraysZip(archive, undefined, { ownerId: 'bob' });
    assert.equal((await receiver.api.getGuestPrays()).length, 0);
});

function sourceClient() {
    const store = new Map([['index', structuredClone(indexFixture)]]);
    for (const clips of Object.values(indexFixture.recordings)) for (const rec of clips) store.set('audio_' + rec.id, new Blob(['bytes:' + rec.id + '.' + rec.ext]));
    return fixture({ store });
}
async function checkRestore(bytes) {
    const target = fixture(); await target.api.restoreMyPraysZip(bytes, undefined, { ownerId: 'alice' });
    const index = target.store.get('index');
    assert.equal(index.guestPrays.length, 2); assert.equal(index.revokedPrayerShares['removed-share'], true);
    assert.deepEqual(index.prayerDeletionCursors, {});
    assert.equal(index.guestPrays.find(p => p._id === 'queued')._sync.state, 'failed');
    const prayer = index.guestPrays.find(p => p._id === 'legacy-local');
    assert.equal(prayer.sharedFrom.responseWords, 'Amen'); assert.ok(prayer.sharedFrom.seenActivityBy.alice);
    for (const clips of Object.values(index.recordings)) for (const rec of clips) assert.equal(strFromU8(await target.api.readAudioBytes(rec)), 'bytes:' + rec.id + '.' + rec.ext);
    assert.equal(index.pendingWords.orphan, 'Pending words');
    const roundTrip = fixture(); await roundTrip.api.restoreMyPraysZip(await target.api.buildMyPraysZip());
    assert.equal((await roundTrip.api.getGuestPrays()).length, 2);
    await target.api.restoreMyPraysZip(bytes); assert.equal((await target.api.getGuestPrays()).length, 2);
}
test('JavaScript archive round-trips activity, queued actions, tombstones and all clips', async () => checkRestore(await sourceClient().api.buildMyPraysZip()));
test('actual Android-produced archive imports and round-trips through JavaScript', async () => {
    const file = path.join(__dirname, 'fixtures/android-prayer-backup.zip');
    assert.ok(fs.existsSync(file), 'Android-produced fixture must accompany the compatibility tests');
    await checkRestore(new Uint8Array(fs.readFileSync(file)));
});
test('iOS STORE-format contract fixture imports (synthetic; not an iOS execution test)', async () => {
    const files = unzipSync(await sourceClient().api.buildMyPraysZip());
    await checkRestore(zipSync(files, { level: 0 }));
});
test('backup includes all 2000 saved prayers when the caller supplies only the first ten', async () => {
    const prayers = Array.from({ length: 2000 }, (_, i) => ({ _id: 'p' + i, words: 'Prayer ' + i, date: '2026-11-17' }));
    const f = fixture({ prayers });
    const manifest = JSON.parse(strFromU8(unzipSync(await f.api.buildMyPraysZip(prayers.slice(0, 10)))['prays.json']));
    assert.equal(manifest.prays.length, 2000);
});
test('missing audio blocks backup and restore before any local mutation', async () => {
    const source = sourceClient(); const good = await source.api.buildMyPraysZip();
    source.store.delete('audio_clip-b'); await assert.rejects(source.api.buildMyPraysZip(), /missing or unreadable/);
    const files = unzipSync(good); delete files['audio/legacy-local/clip-b.ogg'];
    const target = fixture(); const before = JSON.stringify([...target.store]);
    await assert.rejects(target.api.restoreMyPraysZip(zipSync(files)), /missing recording/);
    assert.equal(JSON.stringify([...target.store]), before); assert.equal(target.writes, 0);
    const manifest = JSON.parse(strFromU8(files['prays.json'])); manifest.version = 99;
    files['prays.json'] = strToU8(JSON.stringify(manifest));
    await assert.rejects(target.api.restoreMyPraysZip(zipSync(files)), /unsupported version/);
});

test('cancelled restore never commits metadata and leaves existing prayers intact', async () => {
    const bytes = await sourceClient().api.buildMyPraysZip(), target = fixture();
    const controller = new AbortController();
    await assert.rejects(target.api.restoreMyPraysZip(bytes, () => controller.abort(), { signal: controller.signal }), { name: 'AbortError' });
    assert.equal((await target.api.getGuestPrays()).length, 0);
    assert.equal(target.writes > 0, true, 'audio written before cancellation may remain unreferenced; metadata is never committed');
    await target.api.restoreMyPraysZip(bytes); assert.equal((await target.api.getGuestPrays()).length, 2);
});

test('a deletion committed while the archive is decoding wins over the restored copy', async () => {
    const bytes = await sourceClient().api.buildMyPraysZip(), target = fixture();
    const decode = target.context.runPrayerArchive;
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    target.context.runPrayerArchive = async (...args) => { const result = await decode(...args); await wait; return result; };
    const restore = target.api.restoreMyPraysZip(bytes);
    await target.api.applyPrayerRevocations(['share-1'], 'alice'); release(); await restore;
    assert.equal((await target.api.getGuestPrays()).some(p => p.sharedFrom?.shareId === 'share-1'), false);
    assert.equal(target.store.get('index').recordings['legacy-local'], undefined);
});
