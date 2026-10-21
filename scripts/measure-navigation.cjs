// Build first, then: $env:PLAYWRIGHT_CHANNEL='chrome'; node scripts/measure-navigation.cjs
// Measures the exported app against local assets and mocked backend responses.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../out');
const hymns = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/hymns.json')));
const bible = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/Taspe7.bibles.json')))
  .map(v => ({ ...v, _id: v._id?.$oid || v._id, translation: 'AVD' }));
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/version.json'))).version;
const prayers = Array.from({ length: 200 }, (_, i) => ({ _id: `personal-${i}`, words: `Personal prayer ${i}`, date: '2026-10-01T00:00:00.000Z' }));
const profile = { user: { _id: 'tester', Name: 'Performance test', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [] }, prayTime: [], bibleNotes: [], bibleHighlights: [] };
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const stats = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1), p95Ms: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(1), maxMs: +sorted.at(-1).toFixed(1) };
};

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__seed') { res.setHeader('Content-Type', 'text/html'); return res.end('<html></html>'); }
    let file = path.join(root, decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const report = { measuredAt: new Date().toISOString(), environment: { platform: os.platform(), cpu: os.cpus()[0].model, browser: browser.version(), viewport: '390x844 CSS pixels', host: 'localhost static export; mocked backend; Electron UA selects native data path' }, data: { hymns: hymns.length, verses: bible.length, syntheticPersonalPrayers: prayers.length, friends: 0 }, definition: 'Trusted browser click event to ready route content plus one rendering opportunity. First visits share the normal app prefetch behavior. 4x CPU is a desktop simulation, not a phone.', profiles: [] };
  try {
    for (const cpuRate of [1, 4]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Electron/30.0.0' });
      try {
        const page = await context.newPage();
        await page.route('**/*', route => {
          const url = route.request().url();
          if (url.startsWith(base)) return route.continue();
          if (url.includes('/hymns/version')) return route.fulfill({ json: { version: 1 } });
          if (url.includes('/my-teams')) return route.fulfill({ json: [] });
          if (url.includes('/bible/translations')) return route.fulfill({ json: ['AVD', 'KEH'] });
          if (url.includes('/hymns') || url.includes('/bible/')) return route.fulfill({ json: [] });
          return route.fulfill({ json: { ...profile, inbox: [], updates: [], accounts: [], friends: [], incoming: [], outgoing: [] } });
        });
        await page.goto(base + '/__seed');
        await page.evaluate(async ({ hymns, bible, version, prayers, profile }) => {
          for (const [key, value] of Object.entries({ 'app-language': 'en', user_Taspe7_Token: 'test-token', user_Taspe7_ID: 'tester', user_Taspe7_Username: 'tester', wasla_splash_version: version, wasla_intro_last_time: String(Date.now()), taspe7_storage_migrated_v1: '1', taspe7_category_hymns_tour_done: '1', taspe7_hymns_sync_version: '1', taspe7_bible_last_position: JSON.stringify({ bookName: bible[0].bookName, chapter: 1 }) })) localStorage.setItem(key, value);
          const open = (name, version, store) => new Promise(resolve => { const req = indexedDB.open(name, version); req.onupgradeneeded = () => req.result.createObjectStore(store); req.onsuccess = () => resolve(req.result); });
          const db = await open('taspe7_app', 1, 'bible_store');
          await new Promise(resolve => {
            const tx = db.transaction('bible_store', 'readwrite'), store = tx.objectStore('bible_store');
            store.put(hymns, 'taspe7_hymns_json'); store.put(bible, 'taspe7_bible_db_AVD'); store.put(profile, 'profile_data_tester');
            store.put({ friends: [], incomingRequests: [], outgoingRequests: [], friendsSyncedAt: Date.now(), requestsSyncedAt: Date.now() }, 'friends_data_tester');
            tx.oncomplete = resolve;
          }); db.close();
          const prayerDb = await open('my_prays', 2, 'keyvaluepairs');
          await new Promise(resolve => { const tx = prayerDb.transaction('keyvaluepairs', 'readwrite'); tx.objectStore('keyvaluepairs').put({ version: 1, guestPrays: prayers, recordings: {}, pendingWords: {} }, 'index'); tx.oncomplete = resolve; }); prayerDb.close();
        }, { hymns, bible, version, prayers, profile });
        await page.addInitScript(() => {
          window.__benchmarkSession = Math.random();
          window.__benchmarkLongTasks = [];
          new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__benchmarkLongTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
          const cold = () => {
            if (location.pathname === '/hymns/' && document.querySelector('[data-item-index="0"] h3')) requestAnimationFrame(() => { window.__benchmarkColdReady = performance.now(); });
            else requestAnimationFrame(cold);
          }; requestAnimationFrame(cold);
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        await page.goto(base + '/hymns/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__benchmarkColdReady > 0);
        const launch = await page.evaluate(() => window.__benchmarkColdReady);
        await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('navigation-v2'));
        const targets = [
          { route: '/friends/', selector: 'h1', text: 'Friends', body: 'No pending incoming requests' },
          { route: '/pray/', selector: '[data-prayer-id="personal-0"]', text: 'Personal prayer 0' },
          { route: '/normal_UserProfile/', selector: 'button[title="Edit Name"]' },
          { route: '/bible_form/', selector: '[data-feature="bible-reader"]', text: bible[0].text },
          { route: '/hymns/', selector: '[data-item-index="0"] h3' },
        ];
        const measure = async (target, burst) => {
          await page.evaluate(({ target, burst }) => {
            window.__tabMeasurement = new Promise((resolve, reject) => {
              let started;
              const timeout = setTimeout(() => reject(new Error('Tab content did not become ready')), 10000);
              const ready = () => {
                const el = document.querySelector(target.selector);
                return location.pathname === target.route && el && (!target.text || el.textContent.includes(target.text)) && (!target.body || document.body.textContent.includes(target.body));
              };
              const poll = () => {
                if (ready()) requestAnimationFrame(() => { if (ready()) { clearTimeout(timeout); resolve(performance.now() - started); } else requestAnimationFrame(poll); });
                else requestAnimationFrame(poll);
              };
              if (burst) {
                started = performance.now();
                for (const route of burst) document.querySelector(`nav[aria-label="Primary navigation"] a[href="${route}"]`).click();
                requestAnimationFrame(poll);
              } else document.addEventListener('click', () => { started = performance.now(); requestAnimationFrame(poll); }, { capture: true, once: true });
            });
          }, { target, burst });
          if (!burst) await page.locator(`nav[aria-label="Primary navigation"] a[href="${target.route}"]`).click();
          return page.evaluate(() => window.__tabMeasurement);
        };
        const firstVisits = {};
        for (const target of targets) firstVisits[target.route] = +(await measure(target)).toFixed(1);
        const samples = new Map(targets.map(target => [target.route, []]));
        for (let round = 0; round < 10; round++) for (const target of targets) samples.get(target.route).push(await measure(target));
        const burstTimes = [];
        const session = await page.evaluate(() => window.__benchmarkSession);
        for (let i = 0; i < 20; i++) {
          const target = i % 2 ? targets[0] : targets[2];
          burstTimes.push(await measure(target, ['/bible_form/', '/pray/', '/hymns/', target.route]));
          assert.equal(await page.evaluate(() => window.__benchmarkSession), session);
        }
        const longTasks = await page.evaluate(() => window.__benchmarkLongTasks);
        const result = { cpuRate, launchToHymnsContentMs: +launch.toFixed(1), firstVisitsMs: firstVisits, warmTabs: Object.fromEntries([...samples].map(([route, values]) => [route, stats(values)])), allWarmTabs: stats([...samples.values()].flat()), rapidTapBursts: { ...stats(burstTimes), clicksPerBurst: 4, wrongDestinations: 0, documentReloads: 0 }, longTasksOver50ms: { count: longTasks.length, maxMs: longTasks.length ? +Math.max(...longTasks.map(task => task.duration)).toFixed(1) : 0 }, initialHymnEntryScripts: [...new Set([...fs.readFileSync(path.join(root, 'hymns/index.html'), 'utf8').matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]))].reduce((sum, src) => sum + fs.statSync(path.join(root, src)).size, 0) };
        report.profiles.push(result);
        console.log(JSON.stringify(result));
      } finally { await context.close(); }
    }
    const destination = path.resolve(__dirname, '../performance/navigation-benchmark.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    console.log('Saved:', destination);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
