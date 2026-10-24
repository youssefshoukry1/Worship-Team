const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { zipSync, strToU8 } = require('fflate');
const archive = (prays, files = {}) => zipSync({ 'prays.json': strToU8(JSON.stringify({ type: 'my-prays-backup', version: 1, prays })), ...files });

function fixture(prayers = []) {
    let index = { version: 1, recordings: {}, pendingWords: {}, guestPrays: structuredClone(prayers) };
    let writes = 0;
    const removedAudio = [];
    const audio = new Map();
    const storage = {
        getItem: async key => key === 'index' ? structuredClone(index) : audio.get(key) || null,
        setItem: async (key, value) => { if (key === 'index') { index = structuredClone(value); writes++; } else audio.set(key, value); },
        removeItem: async key => { removedAudio.push(key); audio.delete(key); },
    };
    const context = { ...require('fflate'), console, Blob, window: {}, Capacitor: { isNativePlatform: () => false }, localforage: { createInstance: () => storage } };
    vm.createContext(context);
    const source = ['utils/prayerActivity.js', 'utils/prayRecordings.js'].map(file => fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n');
    vm.runInContext(source + '\n;globalThis.api = { sortPrayerActivity, prayerActivityTime, incomingPrayerActivity, isPrayerUnread, reconcilePrayerEntries, reconcilePrayerRecordings, mergeIncomingPrayers, applyPrayerReplies, markPrayerActivitySeen, migratePrayerReadState, getGuestPrays, updateGuestPray, addGuestPray, addExternalRecording, getPrayerDeletionState, applyPrayerRevocations, buildMyPraysZip, restoreMyPraysZip };', context);
    return { api: context.api, removedAudio, get writes() { return writes; }, get index() { return index; } };
}
const received = (id, date, extra = {}) => ({ _id: `received-${id}`, words: 'Private prayer', date, sharedFrom: { shareId: id, username: 'friend', status: 'pending', ...extra } });
const sent = (id, date, extra = {}) => ({ _id: `sent-${id}`, words: 'Private sent prayer', date, sharedWith: { shareId: id, userId: 'friend', status: 'sent', ...extra } });

test('all directions sort by send/reply activity, never by pending state or read time', () => {
    const { api } = fixture();
    const entries = [received('old-pending', '2026-10-01'), sent('new-send', '2026-10-20'),
        sent('old-with-reply', '2026-09-01', { status: 'confirmed', respondedAt: '2026-10-22' }),
        received('my-response', '2026-08-01', { status: 'confirmed', respondedAt: '2026-10-21' })];
    assert.deepEqual(Array.from(api.sortPrayerActivity(entries), p => p._id), ['sent-old-with-reply', 'received-my-response', 'sent-new-send', 'received-old-pending']);
    assert.equal(entries[0]._id, 'received-old-pending', 'sorting must not mutate stored order');
    assert.equal(api.prayerActivityTime(sent('bad', 'invalid', { respondedAt: 'invalid' })), 0);
    assert.deepEqual(Array.from(api.sortPrayerActivity([received('a', '2026-10-01'), received('b', '2026-10-01')]), p => p._id), ['received-a', 'received-b']);
});

test('unread is account scoped, includes replies, and preserves legacy opened history', () => {
    const { api } = fixture();
    const prayer = received('a', '2026-10-01', { seenActivityBy: { alice: 'prayer:a' } });
    assert.equal(api.isPrayerUnread(prayer, 'alice'), false);
    assert.equal(api.isPrayerUnread(prayer, 'bob'), true);
    assert.equal(api.isPrayerUnread(sent('b', '2026-10-01', { seenActivityBy: {} }), 'alice'), false);
    assert.equal(api.isPrayerUnread(sent('b', '2026-10-01', { status: 'confirmed', respondedAt: '2026-10-22', seenActivityBy: {} }), 'alice'), true);
    assert.equal(api.isPrayerUnread(sent('legacy', '2026-10-01', { status: 'confirmed' }), 'alice'), false);
    assert.equal(api.isPrayerUnread(received('legacy', '2026-10-01'), 'alice', new Set(['received-legacy'])), false);
});

test('inbox retries and duplicate replies preserve read state and perform no writes', async () => {
    const f = fixture();
    const bundle = { shareId: 'a', date: '2026-10-01', words: 'Private prayer', senderUsername: 'friend' };
    await f.api.mergeIncomingPrayers([bundle]);
    await f.api.markPrayerActivitySeen('received-a', 'alice', 'prayer:a');
    await f.api.updateGuestPray('received-a', { sharedFrom: { ...f.index.guestPrays[0].sharedFrom, status: 'confirmed', responseWords: 'Amen', respondedAt: '2026-10-22' } });
    const writes = f.writes;
    const result = await f.api.mergeIncomingPrayers([bundle, bundle]);
    assert.equal(result.prayers, null); assert.equal(f.writes, writes);
    assert.equal(f.index.guestPrays[0].sharedFrom.responseWords, 'Amen');
    assert.equal(f.api.isPrayerUnread(f.index.guestPrays[0], 'alice'), false);
    const g = fixture([sent('b', '2026-10-01')]);
    const update = { shareId: 'b', responseWords: 'Praying', respondedAt: '2026-10-22' };
    await g.api.applyPrayerReplies([update]);
    assert.equal(g.api.isPrayerUnread(g.index.guestPrays[0], 'alice'), true);
    const token = g.api.incomingPrayerActivity(g.index.guestPrays[0]);
    await g.api.markPrayerActivitySeen('sent-b', 'alice', token);
    const replyWrites = g.writes;
    const duplicate = await g.api.applyPrayerReplies([update]);
    assert.equal(duplicate.prayers, null); assert.equal(g.writes, replyWrites);
    assert.equal(g.api.isPrayerUnread(g.index.guestPrays[0], 'alice'), false);
});

test('reply matching uses exact share IDs and refuses ambiguous legacy recipient matches', async () => {
    const f = fixture([sent('a', '2026-10-01'), sent('b', '2026-10-02')]);
    await f.api.applyPrayerReplies([{ shareId: 'b', recipientId: 'friend', responseWords: 'For B', respondedAt: '2026-10-22' }]);
    assert.equal(f.index.guestPrays[0].sharedWith.status, 'sent');
    assert.equal(f.index.guestPrays[1].sharedWith.responseWords, 'For B');
    const g = fixture([sent('a', '2026-10-01', { shareId: null }), sent('b', '2026-10-01', { shareId: null })]);
    assert.equal((await g.api.applyPrayerReplies([{ shareId: 'unknown', recipientId: 'friend' }])).acknowledged.length, 0);
    assert.equal(g.writes, 0);
});

test('a queued send cannot consume a reply to an older prayer to the same friend', async () => {
    const pending = { ...sent('queued', '2026-10-24'), sharedWith: { userId: 'friend', status: 'sent', shareId: null },
        _sync: { kind: 'send', requestId: 'new-request', state: 'pending' } };
    const f = fixture([pending]);
    const result = await f.api.applyPrayerReplies([{ shareId: 'older-share', recipientId: 'friend', responseWords: 'For another prayer', respondedAt: '2026-10-24' }]);
    assert.equal(result.prayers, null); assert.equal(result.acknowledged.length, 0);
    assert.equal(f.index.guestPrays[0].sharedWith.status, 'sent'); assert.equal(f.writes, 0);
});

test('stale openings cannot mark a newer reply as read; concurrent read writes preserve both owners', async () => {
    const f = fixture([sent('a', '2026-10-01', { status: 'confirmed', respondedAt: '2026-10-22', seenActivityBy: {} })]);
    assert.equal(await f.api.markPrayerActivitySeen('sent-a', 'alice', 'reply:a:2026-10-21'), null);
    assert.equal(f.writes, 0);
    const token = f.api.incomingPrayerActivity(f.index.guestPrays[0]);
    await Promise.all([f.api.markPrayerActivitySeen('sent-a', 'alice', token), f.api.markPrayerActivitySeen('sent-a', 'bob', token)]);
    assert.equal(f.api.isPrayerUnread(f.index.guestPrays[0], 'alice'), false);
    assert.equal(f.api.isPrayerUnread(f.index.guestPrays[0], 'bob'), false);
    await f.api.markPrayerActivitySeen('sent-a', 'bob', token);
    assert.equal(f.writes, 2, 'already-seen activities must not write the index again');
});

test('backup/restore retains reply timestamps and account read markers', async () => {
    const prayer = sent('a', '2026-10-01', { status: 'confirmed', respondedAt: '2026-10-22', seenActivityBy: { alice: 'reply:a:2026-10-22' } });
    const f = fixture([prayer]);
    const archive = await f.api.buildMyPraysZip();
    const g = fixture();
    await g.api.restoreMyPraysZip(archive);
    assert.deepEqual(g.index.guestPrays[0].sharedWith, prayer.sharedWith);
    assert.equal(g.api.isPrayerUnread(g.index.guestPrays[0], 'alice'), false);
});

test('legacy opened prayers migrate once and keep their read status after restoring a backup', async () => {
    const f = fixture([received('legacy-opened', '2026-10-01'), received('legacy-unread', '2026-10-01'), sent('old-reply', '2026-10-01', { status: 'confirmed' })]);
    const opened = new Set(['received-legacy-opened']);
    await f.api.migratePrayerReadState('alice', opened);
    assert.equal(f.api.isPrayerUnread(f.index.guestPrays[0], 'alice'), false);
    assert.equal(f.api.isPrayerUnread(f.index.guestPrays[1], 'alice'), true);
    assert.equal(f.api.isPrayerUnread(f.index.guestPrays[2], 'alice'), false);
    await f.api.migratePrayerReadState('alice', opened);
    assert.equal(f.writes, 1, 'migration must not keep rewriting the index');
    const g = fixture();
    await g.api.restoreMyPraysZip(await f.api.buildMyPraysZip());
    assert.equal(g.api.isPrayerUnread(g.index.guestPrays.find(p => p._id === 'received-legacy-opened'), 'alice'), false);
    assert.equal(g.api.isPrayerUnread(g.index.guestPrays.find(p => p._id === 'received-legacy-opened'), 'bob'), true);
});

test('Drive restore merges saved replies and read receipts into an older pending local card', async () => {
    const f = fixture([received('history', '2026-10-01', { seenActivityBy: {} })]);
    const saved = received('history', '2026-10-01', { status: 'confirmed', responseWords: 'Already replied', respondedAt: '2026-10-02', seenActivityBy: { alice: 'prayer:history' } });
    const zip = archive([saved]);
    await f.api.restoreMyPraysZip(zip, undefined, { ownerId: 'alice' });
    const prayer = (await f.api.getGuestPrays())[0];
    assert.equal(prayer.sharedFrom.status, 'confirmed'); assert.equal(prayer.sharedFrom.responseWords, 'Already replied');
    assert.equal(prayer.sharedFrom.respondedAt, '2026-10-02'); assert.equal(prayer.date, '2026-10-01');
    assert.equal(f.api.isPrayerUnread(prayer, 'alice'), false);
    assert.equal(f.api.isPrayerUnread(prayer, 'bob'), true);
    const before = JSON.stringify(f.index.guestPrays);
    await f.api.restoreMyPraysZip(zip, undefined, { ownerId: 'alice' });
    await f.api.migratePrayerReadState('alice', new Set());
    assert.equal(JSON.stringify(f.index.guestPrays), before, 'repeated restores and a reload must not reactivate history');
});

test('creating a backup with a stale screen snapshot cannot drop persisted replies or read receipts', async () => {
    const saved = received('history', '2026-10-01', { status: 'confirmed', responseWords: 'Already replied', respondedAt: '2026-10-02', seenActivityBy: { alice: 'prayer:history' } });
    const f = fixture([saved]);
    const zip = await f.api.buildMyPraysZip([received('history', '2026-10-01', { seenActivityBy: {} })]);
    const restored = fixture(); await restored.api.restoreMyPraysZip(zip, undefined, { ownerId: 'alice' });
    const prayer = (await restored.api.getGuestPrays())[0];
    assert.equal(prayer.sharedFrom.status, 'confirmed'); assert.equal(prayer.sharedFrom.responseWords, 'Already replied');
    assert.equal(restored.api.isPrayerUnread(prayer, 'alice'), false);
});

test('imported history stays quiet even with old unread markers, while live unread prayers remain unread', async () => {
    const f = fixture([received('live', '2026-10-24', { seenActivityBy: {} })]);
    await f.api.restoreMyPraysZip(archive([received('legacy', '2026-10-01'), received('saved-unread', '2026-10-01', { seenActivityBy: {} }),
        sent('old-reply', '2026-10-01', { status: 'confirmed', respondedAt: '2026-10-02' })]), undefined, { ownerId: 'alice' });
    const byId = new Map((await f.api.getGuestPrays()).map(p => [p._id, p]));
    assert.equal(f.api.isPrayerUnread(byId.get('received-legacy'), 'alice'), false);
    assert.equal(f.api.isPrayerUnread(byId.get('received-legacy'), 'bob'), true);
    assert.equal(f.api.isPrayerUnread(byId.get('received-saved-unread'), 'alice'), false);
    assert.equal(f.api.isPrayerUnread(byId.get('received-saved-unread'), 'bob'), true);
    assert.equal(f.api.isPrayerUnread(byId.get('received-live'), 'alice'), true);
    assert.equal(f.api.isPrayerUnread(byId.get('sent-old-reply'), 'alice'), false);
    assert.equal(byId.get('received-legacy').sharedFrom.status, 'pending', 'read status does not invent a reply');
});

test('reply activity newly imported from an old unread backup is history for only the restoring account', async () => {
    const f = fixture([sent('reply', '2026-10-01', { status: 'sent', seenActivityBy: {} })]);
    await f.api.restoreMyPraysZip(archive([sent('reply', '2026-10-01', { status: 'confirmed', responseWords: 'Restored reply', respondedAt: '2026-10-20', seenActivityBy: {} })]), undefined, { ownerId: 'alice' });
    const prayer = (await f.api.getGuestPrays())[0];
    assert.equal(f.api.isPrayerUnread(prayer, 'alice'), false);
    assert.equal(f.api.isPrayerUnread(prayer, 'bob'), true);
    await f.api.applyPrayerReplies([{ shareId: 'reply', responseWords: 'A new reply', respondedAt: '2026-10-24' }]);
    assert.equal(f.api.isPrayerUnread((await f.api.getGuestPrays())[0], 'alice'), true);
});

test('newer local replies and read markers cannot be rolled back by an old backup', async () => {
    for (const alreadyRead of [true, false]) {
        const local = sent('reply', '2026-10-01', { status: 'confirmed', responseWords: 'Latest reply', respondedAt: '2026-10-23', seenActivityBy: { alice: alreadyRead ? 'reply:reply:2026-10-23' : 'reply:reply:2026-10-20' } });
        const f = fixture([local]);
        await f.api.restoreMyPraysZip(archive([sent('reply', '2026-10-01', { status: 'confirmed', responseWords: 'Old reply', respondedAt: '2026-10-20', seenActivityBy: { alice: 'reply:reply:2026-10-20', bob: 'reply:reply:2026-10-20' } })]), undefined, { ownerId: 'alice' });
        const prayer = (await f.api.getGuestPrays())[0];
        assert.equal(prayer.sharedWith.responseWords, 'Latest reply'); assert.equal(prayer.sharedWith.respondedAt, '2026-10-23');
        assert.equal(f.api.isPrayerUnread(prayer, 'alice'), !alreadyRead);
        assert.equal(f.api.isPrayerUnread(prayer, 'bob'), true, 'a read receipt for an older reply cannot hide the new reply');
    }
});

test('a newer backup reply retains its matching read receipt when the local receipt is older', async () => {
    const f = fixture([sent('reply', '2026-10-01', { status: 'confirmed', responseWords: 'Old', respondedAt: '2026-10-20', seenActivityBy: { alice: 'reply:reply:2026-10-20' } })]);
    await f.api.restoreMyPraysZip(archive([sent('reply', '2026-10-01', { status: 'confirmed', responseWords: 'New', respondedAt: '2026-10-23', seenActivityBy: { alice: 'reply:reply:2026-10-23', bob: 'reply:reply:2026-10-20' } })]), undefined, { ownerId: 'alice' });
    const prayer = (await f.api.getGuestPrays())[0];
    assert.equal(prayer.sharedWith.responseWords, 'New'); assert.equal(f.api.isPrayerUnread(prayer, 'alice'), false);
    assert.equal(f.api.isPrayerUnread(prayer, 'bob'), true);
});

test('restore collapses duplicate share IDs, keeps all recordings and ignores inbox replays under a different local ID', async () => {
    const legacy = { ...received('same-share', '2026-10-01', { seenActivityBy: { alice: 'prayer:same-share' } }), _id: 'legacy-local-id' };
    const f = fixture([legacy, received('same-share', '2026-10-01', { seenActivityBy: {} })]);
    await f.api.addExternalRecording('legacy-local-id', { id: 'clip-a' }, new Uint8Array([1, 2]));
    await f.api.addExternalRecording('received-same-share', { id: 'clip-b' }, new Uint8Array([3, 4]));
    const saved = received('same-share', '2026-10-01', { status: 'confirmed', responseWords: 'Replied', respondedAt: '2026-10-02', seenActivityBy: { alice: 'prayer:same-share' } });
    saved.recordings = [{ id: 'clip-c', ext: 'webm', mimeType: 'audio/webm', file: 'audio/clip-c.webm' }];
    const zip = archive([saved], { 'audio/clip-c.webm': new Uint8Array([5, 6]) });
    await f.api.restoreMyPraysZip(zip, undefined, { ownerId: 'alice' });
    const prayer = (await f.api.getGuestPrays())[0];
    assert.equal(f.index.guestPrays.length, 1); assert.equal(prayer._id, 'legacy-local-id');
    assert.equal(prayer.sharedFrom.status, 'confirmed'); assert.equal(f.api.isPrayerUnread(prayer, 'alice'), false);
    assert.deepEqual(Array.from(f.index.recordings['legacy-local-id'], rec => rec.id), ['clip-a', 'clip-b', 'clip-c']);
    assert.equal(f.index.recordings['received-same-share'], undefined);
    const writes = f.writes;
    const incoming = await f.api.mergeIncomingPrayers([{ shareId: 'same-share', words: 'Replayed from server' }]);
    assert.equal(incoming.prayers, null); assert.equal(incoming.prayerIds['same-share'], 'legacy-local-id'); assert.equal(f.writes, writes);
    await f.api.restoreMyPraysZip(zip, undefined, { ownerId: 'alice' });
    assert.equal(f.index.recordings['legacy-local-id'].length, 3); assert.equal(f.index.guestPrays.length, 1);
});

test('activity delivered during restore remains unread and wins over the backup snapshot', async () => {
    const f = fixture([sent('live-reply', '2026-10-01', { status: 'sent', seenActivityBy: {} })]);
    const saved = sent('live-reply', '2026-10-01', { status: 'confirmed', responseWords: 'Backup reply', respondedAt: '2026-10-20', seenActivityBy: { alice: 'reply:live-reply:2026-10-20' } });
    saved.recordings = [{ id: 'clip', ext: 'webm', mimeType: 'audio/webm', file: 'audio/clip.webm' }];
    let incoming;
    await f.api.restoreMyPraysZip(archive([saved], { 'audio/clip.webm': new Uint8Array([1]) }), () => {
        incoming ||= f.api.applyPrayerReplies([{ shareId: 'live-reply', responseWords: 'Live reply', respondedAt: '2026-10-24' }]);
    }, { ownerId: 'alice' });
    await incoming;
    const prayer = (await f.api.getGuestPrays())[0];
    assert.equal(prayer.sharedWith.responseWords, 'Live reply'); assert.equal(f.api.isPrayerUnread(prayer, 'alice'), true);
});

test('undated legacy history is not assigned the restore time or announced as newly sent', async () => {
    const f = fixture();
    const undated = received('undated'); delete undated.date;
    await f.api.restoreMyPraysZip(archive([undated, received('dated', '2026-10-01')]), undefined, { ownerId: 'alice' });
    const prayer = f.index.guestPrays.find(entry => entry._id === 'received-undated');
    assert.equal(prayer.date, null); assert.equal(f.api.prayerActivityTime(prayer), 0);
    assert.equal(f.api.isPrayerUnread(prayer, 'alice'), false);
    assert.equal(f.api.sortPrayerActivity(f.index.guestPrays)[0]._id, 'received-dated');
});

test('large snapshots retain unchanged card identities; sorting parses each date once', t => {
    const { api } = fixture();
    const prayers = Array.from({ length: 10000 }, (_, i) => sent(String(i), new Date(1700000000000 + i * 1000).toISOString()));
    const start = performance.now();
    const sorted = api.sortPrayerActivity(prayers);
    t.diagnostic(`10,000 prayer activity sort: ${(performance.now() - start).toFixed(1)} ms on this test machine`);
    assert.equal(sorted[0]._id, 'sent-9999');
    assert.equal(api.reconcilePrayerEntries(prayers, structuredClone(prayers)), prayers);
    const next = structuredClone(prayers); next[50].sharedWith.responseWords = 'Changed';
    const reconciled = api.reconcilePrayerEntries(prayers, next);
    assert.equal(reconciled[49], prayers[49]); assert.notEqual(reconciled[50], prayers[50]); assert.equal(reconciled[51], prayers[51]);
});

test('recording refreshes retain existing clip objects and skip unchanged arrays', () => {
    const { api } = fixture();
    const before = { a: [{ id: 'playing', duration: 60 }], b: [{ id: 'other', duration: 5 }] };
    assert.equal(api.reconcilePrayerRecordings(before, structuredClone(before)), before);
    const next = structuredClone(before); next.a.push({ id: 'new', duration: 1 }); next.c = [{ id: 'incoming', duration: 1 }];
    const merged = api.reconcilePrayerRecordings(before, next);
    assert.equal(merged.a[0], before.a[0]); assert.equal(merged.b, before.b);
    assert.equal(merged.a.length, 2); assert.equal(merged.c.length, 1);
});

test('remote deletion removes the exact prayer and audio; stale inboxes and reply responses cannot recreate it', async () => {
    const prayer = received('deleted', '2026-10-24');
    const f = fixture([prayer, received('keep', '2026-10-24')]);
    f.index.recordings[prayer._id] = [{ id: 'private-audio', ext: 'wav' }];
    f.index.pendingWords[prayer._id] = 'pending text';
    const result = await f.api.applyPrayerRevocations(['deleted'], 'alice', '2026-10-24T12:00:00Z');
    assert.equal(result.prayers.length, 1); assert.equal(f.index.guestPrays[0]._id, 'received-keep');
    assert.equal(f.index.recordings[prayer._id], undefined); assert.equal(f.index.pendingWords[prayer._id], undefined);
    assert.deepEqual(f.removedAudio, ['audio_private-audio']);
    const writes = f.writes;
    await f.api.applyPrayerRevocations(['deleted'], 'alice', '2026-10-24T12:00:00Z');
    await f.api.mergeIncomingPrayers([{ shareId: 'deleted', words: 'Old in-flight payload' }]);
    assert.equal(await f.api.addGuestPray(prayer), null);
    assert.equal(await f.api.addExternalRecording('received-deleted', { id: 'late-clip' }, new Uint8Array([1, 2, 3])), null);
    assert.equal(f.writes, writes, 'duplicate and stale payloads must not rewrite the index');
    assert.equal((await f.api.getPrayerDeletionState('alice')).cursor, '2026-10-24T12:00:00Z');
    assert.equal((await f.api.getPrayerDeletionState('bob')).cursor, null);
    assert.equal((await f.api.getGuestPrays()).length, 1);
});

test('deleted prayers stay removed when old backups are restored or deletion-only backups are imported', async () => {
    const prayer = sent('deleted', '2026-10-24');
    const old = fixture([prayer]);
    const oldArchive = await old.api.buildMyPraysZip();
    await old.api.applyPrayerRevocations(['deleted'], 'alice');
    const removedArchive = await old.api.buildMyPraysZip();
    await old.api.restoreMyPraysZip(oldArchive);
    assert.equal((await old.api.getGuestPrays()).length, 0);
    const fresh = fixture([prayer]);
    await fresh.api.restoreMyPraysZip(removedArchive);
    assert.equal((await fresh.api.getGuestPrays()).length, 0);
    await fresh.api.restoreMyPraysZip(oldArchive);
    assert.equal((await fresh.api.getGuestPrays()).length, 0);
    assert.equal(fresh.index.revokedPrayerShares.deleted, true);
});
