// Production worker bundle, actual browser Workers, memory-backed adapter.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const root = path.join(__dirname, '../out');
const chunks = path.join(root, '_next/static/chunks');
// Resolve the worker runtime from its actual codec dependency, without fixed module IDs.
const codec = fs.readdirSync(chunks).find(name => name.endsWith('.js') && fs.readFileSync(path.join(chunks, name), 'utf8').includes('Unknown prayer archive operation'));
const workerRuntime = fs.readdirSync(chunks).find(name => name.startsWith('turbopack-') && fs.readFileSync(path.join(chunks, name), 'utf8').includes(codec));
assert.ok(codec && workerRuntime, 'Build the production archive worker first');
const urls = [workerRuntime, codec].map(name => '/_next/static/chunks/' + name);
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<html><body>Worker measurement</body></html>'); }
    res.setHeader('Content-Type', 'application/javascript');
    if (pathname === '/worker.js') return res.end(`self.TURBOPACK_WORKER_LOCATION=location.origin; self.TURBOPACK_CHUNK_SUFFIX=''; self.TURBOPACK_NEXT_CHUNK_URLS=${JSON.stringify(urls)}; importScripts(...self.TURBOPACK_NEXT_CHUNK_URLS.map(c=>location.origin+c).reverse());`);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.end(fs.readFileSync(file));
});
const load = name => fs.readFileSync(path.join(__dirname, '../src/app/utils', name), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const source = [load('prayerActivity.js'), load('prayerArchiveTask.js').replace("new URL('./prayerArchive.worker.js', import.meta.url)", "'/worker.js'"), load('prayRecordings.js')].join('\n');
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const results = {};
    for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
        const browser = await launcher.launch();
        try {
            const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
            results[engine] = await page.evaluate(async source => {
                const NativeWorker = Worker; let alive = 0, maxPost = 0;
                window.Worker = class extends NativeWorker {
                    constructor(...args) { super(...args); alive++; }
                    terminate() { alive--; return super.terminate(); }
                    postMessage(...args) { const start = performance.now(); super.postMessage(...args); maxPost = Math.max(maxPost, performance.now() - start); }
                };
                const create = new Function('localforage', 'Capacitor', source + ';return {buildMyPraysZip,restoreMyPraysZip,getGuestPrays};');
                const rows = [];
                for (const [count, audioMB] of [[10, 0], [100, 0], [500, 0], [2000, 0], [2000, 8]]) {
                    const recordings = audioMB ? { p0: [{ id: 'large', ext: 'wav', mimeType: 'audio/wav' }] } : {};
                    const store = new Map([['index', { version: 1, recordings, guestPrays: Array.from({ length: count }, (_, i) => ({ _id: 'p' + i, words: ('Prayer ' + i + ' صلاة ').repeat(160), date: '2026-11-17' })) }]]);
                    if (audioMB) store.set('audio_large', new Blob([new Uint8Array(audioMB * 1024 * 1024)]));
                    const api = create({ createInstance: () => ({ getItem: async k => structuredClone(store.get(k) ?? null), setItem: async (k, v) => store.set(k, structuredClone(v)), removeItem: async k => store.delete(k) }) }, { isNativePlatform: () => false });
                    await api.getGuestPrays();
                    const measure = async fn => {
                        maxPost = 0; let previous = performance.now(), maxGap = 0;
                        const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - previous); previous = now; }, 0);
                        const start = performance.now(); const value = await fn(); const elapsed = performance.now() - start;
                        await new Promise(resolve => setTimeout(resolve, 5)); clearInterval(timer);
                        return { value, elapsedMs: +elapsed.toFixed(2), maxTimerGapMs: +maxGap.toFixed(2), postMessageMs: +maxPost.toFixed(2) };
                    };
                    const backup = await measure(() => api.buildMyPraysZip());
                    const restore = await measure(() => api.restoreMyPraysZip(backup.value));
                    let freshRestore;
                    if (audioMB) {
                        const fresh = new Map();
                        const target = create({ createInstance: () => ({ getItem: async k => structuredClone(fresh.get(k) ?? null), setItem: async (k, v) => fresh.set(k, structuredClone(v)), removeItem: async k => fresh.delete(k) }) }, { isNativePlatform: () => false });
                        freshRestore = await measure(() => target.restoreMyPraysZip(backup.value));
                        if ((await target.getGuestPrays()).length !== count || fresh.get('audio_large')?.size !== audioMB * 1024 * 1024) throw new Error('Large audio restore incomplete');
                    }
                    if ((await api.getGuestPrays()).length !== count || alive !== 0) throw new Error('Lost prayers or retained worker');
                    const metrics = ({ elapsedMs, maxTimerGapMs, postMessageMs }) => ({ elapsedMs, maxTimerGapMs, postMessageMs });
                    rows.push({ count, audioMB, zipBytes: backup.value.length, backup: metrics(backup), restore: metrics(restore), ...(freshRestore ? { freshRestore: metrics(freshRestore) } : {}), aliveWorkers: alive });
                }
                // Abort and malformed archive use actual worker startup/termination.
                const store = new Map();
                const api = create({ createInstance: () => ({ getItem: async k => store.get(k) ?? null, setItem: async (k, v) => store.set(k, v) }) }, { isNativePlatform: () => false });
                try { await api.restoreMyPraysZip(new Uint8Array([1, 2])); throw new Error('Invalid archive accepted'); } catch (e) { if (e.message === 'Invalid archive accepted') throw e; }
                const controller = new AbortController(); const cancelled = api.buildMyPraysZip([], undefined, { signal: controller.signal }); controller.abort();
                try { await cancelled; throw new Error('Cancellation ignored'); } catch (e) { if (e.name !== 'AbortError') throw e; }
                if (alive !== 0 || store.size !== 0) throw new Error('Failed operation leaked resources or storage');
                return rows;
            }, source);
        } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(__dirname, '../performance/pray-mission-6a-worker.json'), JSON.stringify({ environment: 'Desktop Chromium/WebKit, compiled production worker, memory storage; diagnostic single runs', results }, null, 2));
    console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
