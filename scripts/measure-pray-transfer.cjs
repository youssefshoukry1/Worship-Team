// Synchronous codec reference for comparison; not the production worker path.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.addScriptTag({ path: path.join(__dirname, '../node_modules/fflate/umd/index.js') });
        const source = ['prayerActivity.js', 'prayerArchiveCodec.js', 'prayRecordings.js'].map(file => fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n')
            + '\nconst runPrayerArchive = async payload => processPrayerArchive(payload); const checkArchiveAbort = () => {}; const yieldArchiveWork = async () => {};';
        const results = await page.evaluate(async source => {
            const rows = [];
            for (const count of [10, 100, 500, 2000]) {
                const store = new Map([['index', { version: 1, recordings: {}, guestPrays: Array.from({ length: count }, (_, i) => ({ _id: 'p' + i, words: ('Prayer ' + i + ' صلاة ').repeat(160), date: '2026-11-17' })) }]]);
                const create = new Function('localforage', 'Capacitor', 'zipSync', 'unzipSync', 'strToU8', 'strFromU8', source + ';return {buildMyPraysZip,restoreMyPraysZip,mergeIncomingPrayers,getGuestPrays};');
                const api = create({ createInstance: () => ({ getItem: async k => structuredClone(store.get(k) ?? null), setItem: async (k, v) => store.set(k, structuredClone(v)), removeItem: async k => store.delete(k) }) }, { isNativePlatform: () => false }, fflate.zipSync, fflate.unzipSync, fflate.strToU8, fflate.strFromU8);
                await api.getGuestPrays();
                const measure = async fn => {
                    const start = performance.now(); let delay;
                    const tick = new Promise(resolve => setTimeout(() => { delay = performance.now() - start; resolve(); }, 0));
                    const result = await fn(); const elapsed = performance.now() - start; await tick;
                    return { result, elapsedMs: +elapsed.toFixed(2), timerDelayMs: +delay.toFixed(2) };
                };
                const backup = await measure(() => api.buildMyPraysZip());
                const restore = await measure(() => api.restoreMyPraysZip(backup.result));
                const bundles = Array.from({ length: count }, (_, i) => ({ shareId: 'share' + i, words: 'Received '.repeat(160), date: '2026-11-17', senderUsername: 'friend' }));
                const inbox = await measure(() => api.mergeIncomingPrayers(bundles));
                const metric = ({ elapsedMs, timerDelayMs }) => ({ elapsedMs, timerDelayMs });
                rows.push({ count, zipBytes: backup.result.length, inboxJsonBytes: new TextEncoder().encode(JSON.stringify(bundles)).length, backup: metric(backup), restore: metric(restore), inboxMerge: metric(inbox) });
            }
            return rows;
        }, source);
        fs.writeFileSync(path.join(__dirname, '../performance/pray-transfer-sync-reference.json'), JSON.stringify({ environment: 'Synchronous codec reference, desktop Chromium, memory-backed adapter, synthetic text-only; not production', results }, null, 2));
        console.log(JSON.stringify(results, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
