const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/prayerArchiveTask.js'), 'utf8').replaceAll('export ', '').replace("new URL('./prayerArchive.worker.js', import.meta.url)", "'worker.js'");
function setup(mode) {
    let worker, terminated = 0, activeTimers = 0;
    const c = vm.createContext({ DOMException, Uint8Array, Worker: class {
        constructor() { if (mode === 'startup') throw new Error('Worker unavailable'); worker = this; }
        terminate() { terminated++; }
        postMessage(data, transfer) { this.data = structuredClone(data, { transfer }); }
    }, setTimeout: fn => { activeTimers++; return fn; }, clearTimeout: timer => { if (timer) activeTimers--; } });
    vm.runInContext(source + '\nglobalThis.run = runPrayerArchive;', c);
    return { run: c.run, get worker() { return worker; }, get terminated() { return terminated; }, get timers() { return activeTimers; } };
}
test('success transfers audio buffers and terminates worker without retaining a timer', async () => {
    const f = setup(), bytes = new Uint8Array([1, 2]);
    const p = f.run({ operation: 'pack', files: { audio: [bytes, { level: 0 }] }, manifest: {} });
    assert.equal(bytes.byteLength, 0); assert.equal(f.worker.data.files.audio[0].length, 2);
    f.worker.onmessage({ data: { result: new Uint8Array([3]) } });
    assert.equal((await p)[0], 3); assert.equal(f.terminated, 1); assert.equal(f.timers, 0);
});
test('restore input remains reusable after transfer and failure', async () => {
    const f = setup(), bytes = new Uint8Array([1, 2]);
    const p = f.run({ operation: 'unpack', bytes });
    f.worker.onmessage({ data: { error: 'Invalid ZIP' } });
    await assert.rejects(p, /Invalid ZIP/); assert.equal(bytes.length, 2); assert.equal(f.terminated, 1);
});
test('startup failure rejects without a synchronous fallback', async () => {
    const f = setup('startup'); await assert.rejects(f.run({ operation: 'unpack', bytes: new Uint8Array() }), /Worker unavailable/);
    assert.equal(f.timers, 0);
});
test('cancellation stops active work; late messages cannot complete it', async () => {
    const f = setup(), controller = new AbortController();
    const p = f.run({ operation: 'unpack', bytes: new Uint8Array() }, { signal: controller.signal });
    controller.abort(); f.worker.onmessage({ data: { result: {} } });
    await assert.rejects(p, { name: 'AbortError' }); assert.equal(f.terminated, 1); assert.equal(f.timers, 0);
});
test('an already-cancelled operation never creates a worker', async () => {
    const f = setup(), controller = new AbortController(); controller.abort();
    await assert.rejects(f.run({}, { signal: controller.signal }), { name: 'AbortError' }); assert.equal(f.worker, undefined);
});
test('worker runtime and message failures release resources', async () => {
    for (const event of ['onerror', 'onmessageerror']) {
        const f = setup(); const p = f.run({ operation: 'unpack', bytes: new Uint8Array() });
        f.worker[event]({ preventDefault() {} });
        await assert.rejects(p, /Please retry/); assert.equal(f.terminated, 1); assert.equal(f.timers, 0);
    }
});
