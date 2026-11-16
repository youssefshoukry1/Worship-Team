const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/pray/navigationStateQueue.js'), 'utf8').replaceAll('export ', ''), context);
function fixture() {
    let busy = false, resolve, value = 0, commits = 0, waits = 0;
    const idle = new Promise(done => { resolve = done; });
    const queue = context.createNavigationStateQueue(update => { commits++; value = update(value); }, () => busy, () => { waits++; return idle; });
    return { queue, hold() { busy = true; }, async release() { busy = false; resolve(); await idle; }, get value() { return value; }, get commits() { return commits; }, get waits() { return waits; } };
}
test('100 snapshots during a gesture publish only the latest value once released', async () => {
    const f = fixture(); f.hold();
    for (let i = 1; i <= 100; i++) f.queue.push(i);
    assert.equal(f.commits, 0); assert.equal(f.waits, 1);
    await f.release(); assert.equal(f.value, 100); assert.equal(f.commits, 1);
});
test('functional actions preserve order after the latest complete snapshot', async () => {
    const f = fixture(); f.hold();
    f.queue.push(v => v + 1); f.queue.push(10); f.queue.push(v => v + 2); f.queue.push(v => v * 3);
    await f.release(); assert.equal(f.value, 36);
    f.queue.push(v => v + 1); assert.equal(f.value, 37);
});
test('hidden or unmounted views discard deferred work and reject late callbacks', async () => {
    const f = fixture(); f.hold(); f.queue.push(100); f.queue.dispose(); await f.release(); f.queue.push(200);
    assert.equal(f.commits, 0);
});
