const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ yieldToMain: async () => {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/services/prayerInbox.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '') + '\nglobalThis.sync = syncPrayerPages;', context);
function fixture() {
    const consumed = [], ack = [], removed = [], calls = []; let current = true;
    const options = { kind: 'inbox', active: () => current,
        read: async params => { calls.push(params); if (params.kind === 'deletions') return { protocol: 2, items: [{ shareId: 'gone' }], deletionCursor: 'watermark' }; return { protocol: 2, items: Array.from({ length: 10 }, (_, i) => ({ shareId: String(i + (params.cursor ? 10 : 0)) })), nextCursor: params.cursor ? null : 'next' }; },
        download: async item => ({ ...item, words: 'Prayer', recordings: [] }), consume: async bundle => { consumed.push(bundle.shareId); },
        remove: async ids => removed.push(...ids), saveDeletionCursor: async cursor => removed.push(cursor),
        acknowledge: async id => { ack.push(id); return { ok: true }; },
    };
    return { options, consumed, ack, removed, calls, stop: () => { current = false; } };
}
test('bounded pages apply deletions first and acknowledge only after persistence', async () => {
    const f = fixture(); f.options.acknowledge = async id => { assert.ok(f.consumed.includes(id)); f.ack.push(id); return { ok: true }; };
    await context.sync(f.options); assert.equal(f.consumed.length, 20); assert.equal(f.ack.length, 20); assert.deepEqual(f.removed, ['gone', 'watermark']);
});
test('download/storage failures do not acknowledge or block unrelated deliveries; next scan retries', async () => {
    const f = fixture(); let fail = true;
    f.options.download = async item => { if (item.shareId === '0' && fail) throw new Error('Offline'); return item; };
    assert.equal((await context.sync(f.options)).failures, 1); assert.equal(f.ack.includes('0'), false); assert.ok(f.ack.includes('19'));
    fail = false; await context.sync(f.options); assert.ok(f.ack.includes('0')); assert.equal(f.calls[3].cursor, undefined, 'new scan starts at deletions without a durable delivery cursor');
});
test('account change during a payload request prevents its persistence and acknowledgement', async () => {
    const f = fixture(); f.options.download = async item => { f.stop(); return item; };
    await assert.rejects(context.sync(f.options), { name: 'AbortError' }); assert.equal(f.consumed.length, 0); assert.equal(f.ack.length, 0);
});
test('ack failure retains saved content across paged delivery', async () => {
    const f = fixture(); f.options.acknowledge = async () => ({ ok: false });
    const result = await context.sync(f.options); assert.equal(result.protocol, 2); assert.equal(result.failures, 20); assert.equal(f.consumed.length, 20);
});

test('unsupported full-bundle responses are rejected before persistence or acknowledgement', async () => {
    const f = fixture(); f.options.read = async () => ({ inbox: [{ shareId: 'old' }] });
    await assert.rejects(context.sync(f.options), /Unsupported prayer delivery protocol/);
    assert.equal(f.consumed.length, 0); assert.equal(f.ack.length, 0);
});

test('revoked payload is removed rather than acknowledged and malformed continuation stops', async () => {
    const f = fixture(); f.options.download = async item => { if (item.shareId === '0') throw Object.assign(new Error('Gone'), { code: 'PRAYER_DELETED' }); return item; };
    await context.sync(f.options); assert.ok(f.removed.includes('0')); assert.equal(f.ack.includes('0'), false);
    f.options.read = async () => ({ protocol: 2, items: [], nextCursor: 'same' }); await assert.rejects(context.sync(f.options), /cursor repeated/);
});

test('a target-only notification scan applies deletions then stops after the selected item', async () => {
    const f = fixture(); f.options.targetOnly = true; f.options.target = 'target';
    f.options.read = async params => { f.calls.push(params); return { protocol: 2, items: params.kind === 'deletions' ? [] : [{ shareId: 'target' }] }; };
    await context.sync(f.options); assert.deepEqual(f.consumed, ['target']); assert.equal(f.calls.length, 2);
});

test('a target-only reply fetches only the requested descriptor and acknowledges its payload', async () => {
    const f = fixture();
    f.options.read = async params => { f.calls.push(params); return { protocol: 2, items: [{ shareId: 'other' }, { shareId: 'reply' }] }; };
    const result = await context.sync({ ...f.options, kind: 'replies', target: 'reply', targetOnly: true });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].target, 'reply');
    assert.deepEqual(f.ack, ['reply']);
    assert.equal(result.targetSaved, true);
});

test('an early target descriptor cannot bypass a revocation on the last deletion page', async () => {
    const f = fixture();
    let release;
    const lastPage = new Promise(resolve => { release = resolve; });
    f.options.read = async params => {
        f.calls.push(params);
        if (params.target) return { protocol: 2, items: [{ shareId: 'gone' }] };
        if (!params.cursor) return { protocol: 2, items: [], nextCursor: 'last' };
        await lastPage;
        return { protocol: 2, items: [{ shareId: 'gone' }], deletionCursor: 'done' };
    };
    let downloads = 0;
    f.options.download = async item => { downloads++; return item; };
    const run = context.sync({ ...f.options, target: 'gone', targetOnly: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(f.calls.some(call => call.target === 'gone'));
    assert.equal(downloads, 0);
    release();
    assert.equal((await run).targetSaved, false);
    assert.deepEqual(f.removed, ['gone', 'done']);
    assert.deepEqual(f.ack, []);
    assert.equal(downloads, 0);
});
