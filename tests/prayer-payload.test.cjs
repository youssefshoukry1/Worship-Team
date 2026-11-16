const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture() {
    const workers = []; let active = 0, maximum = 0;
    const context = vm.createContext({ DOMException, setTimeout, clearTimeout, setInterval, clearInterval, Worker: class {
        constructor() { active++; maximum = Math.max(maximum, active); workers.push(this); }
        postMessage(options) { this.options = options; }
        terminate() { active--; }
    } });
    const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/prayerPayload.js'), 'utf8').replaceAll('export ', '').replace("new URL('./prayerPayload.worker.js', import.meta.url)", "'worker.js'");
    vm.runInContext(source + '\nglobalThis.download = downloadPrayerPayload;', context);
    return { download: context.download, workers, get active() { return active; }, get maximum() { return maximum; } };
}
test('normal and notification downloads share a two-worker bound and release it on completion', async () => {
    const f = fixture(); const promises = [1, 2, 3].map(id => f.download({ shareId: id }));
    assert.equal(f.workers.length, 2);
    f.workers[0].onmessage({ data: { bundle: { shareId: 1 } } }); await promises[0]; await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.workers.length, 3); assert.equal(f.maximum, 2);
    f.workers[1].onmessage({ data: { bundle: { shareId: 2 } } }); f.workers[2].onmessage({ data: { bundle: { shareId: 3 } } });
    await Promise.all(promises); assert.equal(f.active, 0);
});
test('account change stops an active worker and stale queued work never starts', async () => {
    const f = fixture(); let current = true;
    const pending = [1, 2, 3].map(id => f.download({ shareId: id }, () => current));
    const assertions = pending.map(p => assert.rejects(p, { name: 'AbortError' })); current = false;
    await Promise.all(assertions); assert.equal(f.active, 0); assert.equal(f.workers.length, 2);
});
