const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture() {
    const revoked = [];
    const context = vm.createContext({ queueMicrotask, URL: { revokeObjectURL: url => revoked.push(url) } });
    for (const name of ['prayerSession', 'prayerPlayback']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/pray', name + '.js'), 'utf8').replaceAll('export ', ''), context);
    return { session: context.createPrayerSession('one'), playback: context.createPrayerPlayback(), revoked };
}
function resource() {
    let playing = false, destroyed = 0;
    const handlers = new Map();
    const emit = name => { for (const fn of handlers.get(name) || []) fn(); };
    return { container: { remove() {} }, player: {
        on(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); return () => handlers.get(name).delete(fn); },
        isPlaying: () => playing, play() { playing = true; emit('play'); }, pause() { playing = false; emit('pause'); },
    }, destroy() { destroyed++; }, get destroyed() { return destroyed; } };
}
test('composer and reply changes notify only their subscribers and keep independent drafts', () => {
    const { session } = fixture(); let composer = 0, one = 0, two = 0;
    session.subscribe('prayWords', () => composer++); session.subscribe('reply:one', () => one++); session.subscribe('reply:two', () => two++);
    session.set('prayWords', 'draft'); session.set('reply:one', 'Amen'); session.set('reply:one', 'Amen');
    assert.deepEqual([composer, one, two], [1, 1, 0]);
    assert.equal(session.get('reply:one'), 'Amen'); assert.equal(session.get('reply:two'), '');
});
test('discard clears composer clips and recipient but preserves reply drafts and list filters', () => {
    const { session, revoked } = fixture();
    session.set('generalRecordings', [{ url: 'blob:one' }]); session.set('prayBlocks', [{ recordings: [{ url: 'blob:two' }] }]);
    session.set('selectedShareUser', { _id: 'friend' }); session.set('reply:one', 'reply'); session.set('circleFilter', 'sent');
    session.discardComposer();
    assert.deepEqual(revoked, ['blob:one', 'blob:two']); assert.equal(session.get('generalRecordings').length, 0);
    assert.equal(session.get('selectedShareUser'), null); assert.equal(session.get('reply:one'), 'reply'); assert.equal(session.get('circleFilter'), 'sent');
});
test('ending an owner session invalidates delayed writes and clears transient resources', async () => {
    const { session, playback, revoked } = fixture(); session.playback = playback;
    session.mount(); session.set('generalRecordings', [{ url: 'blob:old-owner' }]); session.unmount();
    session.set('prayWords', 'late update'); assert.equal(session.get('prayWords'), '');
    await Promise.resolve(); assert.equal(session.active, false); assert.deepEqual(revoked, ['blob:old-owner']);
});
test('effect replay does not dispose a live session', async () => {
    const { session } = fixture(); session.mount(); session.set('prayWords', 'draft'); session.unmount(); session.mount();
    await Promise.resolve(); assert.equal(session.get('prayWords'), 'draft'); assert.equal(session.active, true);
});
test('playing resource survives row removal, reattaches unchanged, and releases after pause', async () => {
    const { playback } = fixture(); const clip = resource(); let creates = 0;
    const first = await playback.acquire('clip', () => { creates++; return clip; }); clip.player.play(); first.release();
    assert.equal(clip.destroyed, 0); assert.equal(playback.isPlaying(), true);
    const second = await playback.acquire('clip', () => { creates++; return resource(); });
    assert.equal(second.resource, clip); assert.equal(creates, 1); second.release(); clip.player.pause();
    assert.equal(clip.destroyed, 1); assert.equal(playback.isPlaying(), false);
});
test('a second player pauses and releases an unattached first player; dispose releases the rest', async () => {
    const { playback } = fixture(); const first = resource(), second = resource();
    const a = await playback.acquire('a', () => first); first.player.play(); a.release();
    const b = await playback.acquire('b', () => second); second.player.play();
    assert.equal(first.destroyed, 1); playback.dispose(); b.release(); assert.equal(second.destroyed, 1);
});
test('a resource that finishes loading after session disposal is destroyed exactly once', async () => {
    const { playback } = fixture(); let resolve; const clip = resource();
    const pending = playback.acquire('late', () => new Promise(done => { resolve = done; }));
    await Promise.resolve(); playback.dispose(); resolve(clip); const lease = await pending; lease.release();
    assert.equal(clip.destroyed, 1);
});
test('removing a saved recording releases its player without stopping other recordings', async () => {
    const { playback } = fixture(); const removed = resource(), kept = resource();
    await playback.acquire('saved:1', () => removed); await playback.acquire('saved:2', () => kept);
    playback.retainSaved({ prayer: [{ id: 2 }] });
    assert.equal(removed.destroyed, 1); assert.equal(kept.destroyed, 0); playback.dispose();
});
