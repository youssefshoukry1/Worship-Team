/* eslint-disable @typescript-eslint/no-require-imports */
// npm run build; node scripts/measure-pray-baseline.cjs
// Disposable browser contexts, synthetic data, intercepted network. No real account or storage.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { start, stop, setup } = require('../tests/helpers/swipe-browser.cjs');
const destination = path.resolve(__dirname, '../performance/pray-mission-1-baseline.json');
const counts = (process.env.PRAY_COUNTS || '10,100,500,2000').split(',').map(Number);
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)] || 0;
function fixture(count) {
  const guestPrays = [], recordings = {};
  for (let i = 0; i < count; i++) {
    const _id = `baseline-${i}`, shareId = `share-${i}`;
    const entry = { _id, date: new Date(Date.UTC(2026, 9, 1) - i * 60000).toISOString(), prayType: 'general',
      words: `Prayer ${i}\n${'A quiet prayer for family. شكراً يا رب على اليوم. '.repeat(i % 10 === 0 ? 30 : 2)}\n[ PRAY FOR ME ]\nSection prayer.` };
    if (i % 3 === 1) entry.sharedFrom = { userId: 'friend', username: 'friend', shareId, status: 'pending', seenActivityBy: {} };
    if (i % 3 === 2) entry.sharedWith = { userId: 'friend', username: 'friend', shareId, status: 'confirmed', responseWords: 'Amen', respondedAt: entry.date, seenActivityBy: {} };
    guestPrays.push(entry);
    if (i % 12 === 0) recordings[_id] = [0, 1].map(sectionIndex => ({ id: `clip-${i}-${sectionIndex}`, ext: 'wav', mimeType: 'audio/wav', duration: 1, blockType: sectionIndex ? 'prayer for me' : 'general', sectionIndex }));
  }
  return { version: 1, guestPrays, recordings, pendingWords: {}, revokedPrayerShares: {}, prayerDeletionCursors: {} };
}
// Exercise the real utility implementation with isolated mock adapters. These are CPU/serialization
// measurements, not IndexedDB, Capacitor bridge or physical disk latency measurements.
async function storageBaseline(index, native) {
  let disk = structuredClone(index), reads = 0, writes = 0, publications = 0;
  const adapter = { getItem: async () => { reads++; return structuredClone(disk); }, setItem: async (_, value) => { writes++; disk = structuredClone(value); } };
  const context = vm.createContext({ window: {}, localforage: { createInstance: () => adapter }, Capacitor: { isNativePlatform: () => native }, Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' },
    Filesystem: { readFile: async () => ({ data: JSON.stringify(await adapter.getItem()) }), writeFile: async ({ data }) => adapter.setItem('index', JSON.parse(data)) } });
  const source = ['prayerActivity.js', 'prayRecordings.js'].map(file => fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n');
  vm.runInContext(source + '\nglobalThis.api = { getGuestPrays, getRecordingsIndex, updateGuestPray, subscribeLocalPrayers };', context);
  context.api.subscribeLocalPrayers(() => publications++);
  const coldStart = performance.now(); await context.api.getGuestPrays(); const coldMs = performance.now() - coldStart;
  const warmReads = reads, warmStart = performance.now();
  for (let i = 0; i < 20; i++) await Promise.all([context.api.getGuestPrays(), context.api.getRecordingsIndex()]);
  const warmPairsMs = performance.now() - warmStart, warmReadCount = reads - warmReads;
  const updates = [];
  for (let i = 0; i < 10; i++) { const started = performance.now(); await context.api.updateGuestPray('baseline-0', { words: `Changed ${i}` }); updates.push(performance.now() - started); }
  assert.equal(warmReadCount, 0);
  return { adapter: native ? 'mock native JSON filesystem' : 'mock localForage structured clone', coldMs, warmPairsMs, warmReadCount, updateMedianMs: percentile(updates, .5), updateP95Ms: percentile(updates, .95), reads, writes, publications };
}
async function seed(page, index) {
  await page.evaluate(async index => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('my_prays', 2); r.onupgradeneeded = () => r.result.createObjectStore('keyvaluepairs'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    // A valid one-second PCM WAV, not an invalid placeholder that only exercises errors.
    const buffer = new ArrayBuffer(44 + 16000), view = new DataView(buffer);
    const chars = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    chars(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); chars(8, 'WAVE'); chars(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); chars(36, 'data'); view.setUint32(40, 16000, true);
    await new Promise((resolve, reject) => { const tx = db.transaction('keyvaluepairs', 'readwrite'), store = tx.objectStore('keyvaluepairs'); store.put(index, 'index'); for (const clips of Object.values(index.recordings)) for (const rec of clips) store.put(new Blob([buffer], { type: 'audio/wav' }), `audio_${rec.id}`); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
  }, index);
  await page.addInitScript(() => {
    window.__prayMetrics = { indexReads: 0, indexWrites: 0, audioReads: 0, mutations: 0, longTasks: [], frames: [], sampling: false };
    const metrics = window.__prayMetrics, get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.get = function(key) { if (this.transaction.db.name === 'my_prays') { if (key === 'index') metrics.indexReads++; else if (String(key).startsWith('audio_')) metrics.audioReads++; } return get.apply(this, arguments); };
    IDBObjectStore.prototype.put = function(value, key) { if (this.transaction.db.name === 'my_prays' && key === 'index') metrics.indexWrites++; return put.apply(this, arguments); };
    new PerformanceObserver(list => { for (const e of list.getEntries()) metrics.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask' });
    document.addEventListener('DOMContentLoaded', () => new MutationObserver(records => { if (metrics.sampling) metrics.mutations += records.length; }).observe(document.body, { subtree: true, childList: true, characterData: true }));
  });
}
async function snapshot(page, cdp) {
  const dom = await page.evaluate(() => {
    let audioElements = 0, canvases = 0;
    const visit = root => { for (const element of root.querySelectorAll('*')) { if (element.tagName === 'AUDIO') audioElements++; if (element.tagName === 'CANVAS') canvases++; if (element.shadowRoot) visit(element.shadowRoot); } }; visit(document);
    return { rows: document.querySelectorAll('[data-prayer-row]').length, cards: document.querySelectorAll('[data-prayer-id]').length,
      audioElements, waveformCanvases: canvases, panels: document.querySelectorAll('[data-tab-panel][data-tab-ready="true"]').length, elements: document.querySelectorAll('*').length,
      storage: { indexReads: __prayMetrics.indexReads, indexWrites: __prayMetrics.indexWrites, audioReads: __prayMetrics.audioReads } };
  });
  const metrics = (await cdp.send('Performance.getMetrics')).metrics;
  return { ...dom, heapUsedBytes: metrics.find(m => m.name === 'JSHeapUsedSize')?.value };
}
async function measure(page, action) {
  await page.evaluate(() => { const m = __prayMetrics; m.generation = (m.generation || 0) + 1; const generation = m.generation; m.sampling = true; m.frames = []; m.mutations = 0; m.started = performance.now(); let previous; const frame = now => { if (!m.sampling || m.generation !== generation) return; if (previous) m.frames.push(now - previous); previous = now; requestAnimationFrame(frame); }; requestAnimationFrame(frame); });
  await action();
  return page.evaluate(() => { const m = __prayMetrics; m.sampling = false; const sorted = m.frames.sort((a, b) => a - b); return { durationMs: performance.now() - m.started, frames: sorted.length, p95FrameGapMs: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] || 0, p99FrameGapMs: sorted[Math.max(0, Math.ceil(sorted.length * .99) - 1)] || 0, maxFrameGapMs: sorted.at(-1) || 0, frameGapsOver34ms: sorted.filter(n => n > 34).length, longTasks: m.longTasks.filter(t => t.start >= m.started), domMutationRecords: m.mutations }; });
}
async function traverse(page) {
  // Fixed stride and cadence: compare like-for-like across revisions; not a finger-physics simulation.
  let steps = 0;
  for (; steps < 600; steps++) {
    const done = await page.evaluate(() => { window.scrollBy(0, 700); return scrollY + innerHeight >= document.documentElement.scrollHeight - 3; });
    await page.waitForTimeout(25);
    if (done) break;
  }
  await page.waitForTimeout(250);
  return { steps: steps + 1, capped: steps === 600 };
}
async function swipe(page, cdp, commit) {
  await page.evaluate(() => scrollTo(0, 0));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 340, y: 190 }] });
  for (let i = 1; i <= 16; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 340 - i * (commit ? 18 : 5), y: 190 }] }); await page.waitForTimeout(12); }
  const engaged = await page.locator('[data-tab-pager]').getAttribute('data-swiping');
  assert.equal(engaged, 'true', 'trusted touch must engage the pager');
  await cdp.send('Input.dispatchTouchEvent', { type: commit ? 'touchEnd' : 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(450);
}
(async () => {
  const report = { measuredAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(__dirname, '..') }).toString().trim(), environment: { cpu: os.cpus()[0].model, platform: os.platform(), node: process.version, cpuThrottle: 4 },
    method: 'Production static export; Chromium iPhone 13 emulation; real IndexedDB; synthetic fixtures and mocked APIs. Scroll is scripted 700px/25ms; horizontal gestures use trusted CDP touch. No physical-device, network, native-bridge, or React-profiler claims. DOM mutation records are not React commits. Heap is sampled without forced GC.', scenarios: [] };
  await start(['chromium']);
  try {
    for (const count of counts) {
      const cleanups = [], scenario = { count, storage: [], phases: {} }; report.scenarios.push(scenario);
      try {
        const index = fixture(count);
        for (const native of [false, true]) scenario.storage.push(await storageBaseline(index, native));
        let cdp, openedAt;
        const { page, errors } = await setup({ after: close => cleanups.push(close) }, 'chromium', { platform: 'web', href: '/pray/', beforeNavigate: async page => {
          await seed(page, index); cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); openedAt = performance.now();
        } });
        report.environment.browser = await page.context().browser().version();
        await page.locator('[data-prayer-id]').first().waitFor(); scenario.openToCardMs = performance.now() - openedAt;
        await page.waitForTimeout(600); scenario.initial = await snapshot(page, cdp);
        scenario.phases.journalScroll = await measure(page, async () => { scenario.journalTraversal = await traverse(page); }); scenario.afterJournal = await snapshot(page, cdp);
        scenario.phases.returnScroll = await measure(page, async () => { for (let i = 0; i < 20; i++) { await page.evaluate(() => scrollBy(0, -700)); await page.waitForTimeout(25); } });
        await page.getByRole('button', { name: 'Prayer Circle', exact: false }).click(); await page.waitForTimeout(300);
        scenario.phases.circleScroll = await measure(page, async () => { scenario.circleTraversal = await traverse(page); }); scenario.afterCircle = await snapshot(page, cdp);
        await page.evaluate(() => scrollTo(0, 0));
        const receivedCard = page.locator('[data-prayer-id="baseline-1"]'); await receivedCard.click();
        const reply = receivedCard.locator('textarea');
        if (await reply.count()) scenario.phases.replyTyping = await measure(page, async () => { await reply.pressSequentially('Please pray for my family', { delay: 35 }); });
        await page.locator('textarea').evaluateAll(nodes => nodes.forEach(node => node.blur()));
        scenario.phases.externalUpdate = await measure(page, async () => {
          // Simulate another tab writing, then the app's real BroadcastChannel invalidation.
          // This phase's IDB counters include the fixture's one read/write.
          await page.evaluate(async () => {
            const db = await new Promise(resolve => { const r = indexedDB.open('my_prays', 2); r.onsuccess = () => resolve(r.result); });
            await new Promise((resolve, reject) => { const tx = db.transaction('keyvaluepairs', 'readwrite'), store = tx.objectStore('keyvaluepairs'), r = store.get('index'); r.onsuccess = () => { const index = r.result; index.guestPrays[0].words += '\nBackground update'; store.put(index, 'index'); }; tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
            const channel = new BroadcastChannel('taspe7-local-prayers'); channel.postMessage('changed'); channel.close();
          });
          await page.waitForTimeout(400);
        });
        scenario.phases.cancelSwipe = await measure(page, () => swipe(page, cdp, false));
        scenario.phases.commitSwipe = await measure(page, () => swipe(page, cdp, true));
        await page.locator('[data-tab-panel="/bible_form"][data-tab-active="true"]').waitFor();
        await page.locator('nav[aria-label="Primary navigation"] a[href^="/friends"]').click(); await page.waitForTimeout(400); scenario.onFriends = await snapshot(page, cdp);
        await page.locator('nav[aria-label="Primary navigation"] a[href^="/pray"]').click(); await page.waitForTimeout(400); scenario.returned = await snapshot(page, cdp);
        scenario.phases.repeatedNavigation = await measure(page, async () => {
          for (let i = 0; i < 3; i++) {
            await page.locator('nav[aria-label="Primary navigation"] a[href^="/friends"]').click(); await page.waitForTimeout(250);
            await page.locator('nav[aria-label="Primary navigation"] a[href^="/pray"]').click(); await page.waitForTimeout(250);
          }
        });
        scenario.afterRepeatedNavigation = await snapshot(page, cdp);
        scenario.errors = errors; assert.deepEqual(errors, []);
        scenario.status = 'complete'; console.log(`Measured ${count} prayers: ${scenario.initial.cards} -> ${scenario.afterCircle.cards} mounted cards`);
      } catch (error) { scenario.status = 'failed'; scenario.failure = error.stack; process.exitCode = 1; console.error(`Scenario ${count}: ${error.message}`); }
      finally { for (const close of cleanups) await close(); fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n'); }
    }
  } finally { await stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
