const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const strip = text => text.replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const activity = fs.readFileSync(path.join(root, 'src/app/utils/prayerActivity.js'), 'utf8');
const oldSource = execFileSync('git', ['show', 'b058331:src/app/utils/prayRecordings.js'], { cwd: root, encoding: 'utf8' });
const newSource = fs.readFileSync(path.join(root, 'src/app/utils/prayRecordings.js'), 'utf8');
function fixture(source, native) {
    let disk = { guestPrays: Array.from({ length: 2000 }, (_, i) => ({ _id: String(i), words: 'enc:v1:' + i, date: '2026-11-17T00:00:00Z' })), recordings: {} }, reads = 0, writes = 0, publications = 0;
    const store = { getItem: async () => { reads++; return structuredClone(disk); }, setItem: async (_, value) => { writes++; disk = structuredClone(value); } };
    const context = vm.createContext({ window: {}, localforage: { createInstance: () => store }, Capacitor: { isNativePlatform: () => native }, Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' }, Filesystem: { readFile: async () => ({ data: JSON.stringify(await store.getItem()) }), writeFile: async ({ data }) => store.setItem('index', JSON.parse(data)) } });
    vm.runInContext(strip(activity) + '\n' + strip(source) + '\nglobalThis.api = {getGuestPrays, updateGuestPray, subscribeLocalPrayers, repair: typeof repairPrayerTexts === "function" ? repairPrayerTexts : null};', context);
    context.api.subscribeLocalPrayers(() => publications++);
    return { api: context.api, counters: () => ({ reads, writes, publications }) };
}
(async () => {
    const results = [];
    for (const native of [false, true]) for (const [name, source] of [['mission1', oldSource], ['mission5', newSource]]) {
        const f = fixture(source, native); await f.api.getGuestPrays();
        let before = f.counters(), start = performance.now();
        for (let i = 0; i < 100; i++) await f.api.getGuestPrays();
        const warm = { ms: performance.now() - start, reads: f.counters().reads - before.reads };
        before = f.counters(); start = performance.now();
        if (f.api.repair) await f.api.repair(Array.from({ length: 100 }, (_, i) => ({ id: String(i), field: 'words', text: 'enc:v1:' + i, plain: 'Plain ' + i })));
        else for (let i = 0; i < 100; i++) await f.api.updateGuestPray(String(i), { words: 'Plain ' + i });
        const after = f.counters();
        results.push({ name, adapter: native ? 'mock native JSON' : 'mock structured-clone web', history: 2000, repaired: 100, ms: performance.now() - start, reads: after.reads - before.reads, writes: after.writes - before.writes, publications: after.publications - before.publications, warm });
    }
    const report = { measuredAt: new Date().toISOString(), baselineRevision: 'b058331', method: 'Same 2000-prayer fixture and VM adapters for both revisions; compares the original sequential repair flow with batched repair. No physical disk, Capacitor bridge, browser-frame or native crash-safety claims.', results };
    fs.writeFileSync(path.join(root, 'performance/pray-mission-5-storage.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(results));
})();
