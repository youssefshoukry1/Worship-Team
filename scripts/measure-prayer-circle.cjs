/* eslint-disable @typescript-eslint/no-require-imports */
// Run against a production export. CIRCLE_CDP selects a connected Chrome/WebView test target.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = process.env.CIRCLE_EXPORT || path.resolve(__dirname, '../out');
const exportVersion = JSON.parse(fs.readFileSync(path.join(root, 'version.json'))).version;
const origin = 'https://circle-baseline.test';
const mode = process.env.CIRCLE_DEVICE || 'desktop';
const destination = path.resolve(__dirname, '../performance', 'prayer-circle-' + (process.env.CIRCLE_RUN || 'baseline') + '-' + mode + '.json');
const types = {
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/x-component',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};
const compareSwipe = process.env.CIRCLE_RUN?.startsWith('swipe-');
const compareBlur = process.env.CIRCLE_RUN === 'blur-comparison';
const cache = new Map();
function asset(url) {
  let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) && file !== root) throw Error('Invalid fixture URL');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory())
    file = path.join(file, url.searchParams.has('_rsc') ? 'index.txt' : 'index.html');
  if (!fs.existsSync(file)) return { status: 404, body: '' };
  if (!cache.has(file)) {
    let body = fs.readFileSync(file);
    if (file.endsWith('.js')) {
      // Count the two specific compiled functions, without changing production source.
      const js = body
        .toString()
        .replace(
          /return (\w+)\.map\(\((\w+),(\w+)\)=>\(\{entry:\2,index:\3,time:/g,
          'window.circleProbe.sort++;return $1.map(($2,$3)=>({entry:$2,index:$3,time:'
        )
        .replace(
          /let (\w+)=new Map\((\w+)\.map\((\w+)=>\[String\(\3\._id\),\(0,(\w+)\.prayerActivityKey\)\(\3\)\]\)\)/g,
          'window.circleProbe.order++;let $1=new Map($2.map($3=>[String($3._id),(0,$4.prayerActivityKey)($3)]))'
        );
      body = Buffer.from(js);
    }
    cache.set(file, { contentType: types[path.extname(file)] || 'application/octet-stream', body });
  }
  return cache.get(file);
}
async function seed(page, count) {
  await page.goto(origin + '/seed');
  await page.evaluate(async ({ count, version }) => {
    const prayers = Array.from({ length: count }, (_, i) => {
      const date = new Date(Date.UTC(2026, 9, 1) - i * 60000).toISOString();
      const p = {
        _id: 'probe-' + i,
        words: 'Fixture prayer ' + i + ' ' + 'Prayer for family. '.repeat(i % 10 === 0 ? 20 : 2),
        date,
        prayType: 'general',
      };
      const party = { userId: 'friend', username: 'friend', shareId: 'share-' + i, seenActivityBy: {} };
      if (i % 3 === 1) p.sharedFrom = { ...party, status: 'pending' };
      if (i % 3 === 2)
        p.sharedWith = { ...party, status: 'confirmed', responseWords: 'Amen', respondedAt: date };
      return p;
    });
    for (const [k, v] of Object.entries({
      'app-language': 'en',
      user_Taspe7_Token: 'fixture',
      user_Taspe7_ID: 'tester',
      user_Taspe7_Username: 'tester',
      wasla_splash_version: version,
    }))
      localStorage.setItem(k, v);
    const req = indexedDB.open('my_prays', 2);
    req.onupgradeneeded = () => req.result.createObjectStore('keyvaluepairs');
    const db = await new Promise((yes, no) => {
      req.onsuccess = () => yes(req.result);
      req.onerror = () => no(req.error);
    });
    const tx = db.transaction('keyvaluepairs', 'readwrite'),
      store = tx.objectStore('keyvaluepairs');
    store.put(
      {
        version: 1,
        guestPrays: prayers,
        recordings: {
          'probe-0': [
            {
              id: 'fixture',
              ext: 'wav',
              mimeType: 'audio/wav',
              duration: 1,
              blockType: 'general',
              sectionIndex: 0,
            },
          ],
        },
        pendingWords: {},
      },
      'index'
    );
    const wave = new ArrayBuffer(16044),
      v = new DataView(wave);
    for (const [s, i] of [
      ['RIFF', 0],
      ['WAVEfmt ', 8],
      ['data', 36],
    ])
      [...s].forEach((c, j) => v.setUint8(i + j, c.charCodeAt(0)));
    for (const [i, n] of [
      [4, 16036],
      [16, 16],
      [24, 8000],
      [28, 16000],
      [40, 16000],
    ])
      v.setUint32(i, n, true);
    for (const [i, n] of [
      [20, 1],
      [22, 1],
      [32, 2],
      [34, 16],
    ])
      v.setUint16(i, n, true);
    store.put(new Blob([wave], { type: 'audio/wav' }), 'audio_fixture');
    await new Promise((yes, no) => {
      tx.oncomplete = yes;
      tx.onerror = () => no(tx.error);
    });
    db.close();
  }, { count, version: exportVersion });
}
async function run() {
  const browser = process.env.CIRCLE_CDP
    ? await chromium.connectOverCDP(process.env.CIRCLE_CDP)
    : await chromium.launch();
  const context =
    browser.contexts()[0] ||
    (await browser.newContext({
      viewport: { width: 393, height: 820 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    }));
  const attached = mode === 'webview';
  const page = attached ? context.pages()[0] : await context.newPage();
  const original = page.url();
  const cdp = await context.newCDPSession(page);
  const report = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.dirname(root) })
      .toString()
      .trim(),
    build: fs.readFileSync(path.join(root, 'pray/index.html'), 'utf8').match(/<!--([^>]+)-->/)?.[1],
    version: exportVersion,
    engine: await browser.version(),
    mode,
    trials: [],
  };
  let events = [],
    phase = '',
    offline = false;
  try {
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.origin === origin) {
        if (u.pathname === '/seed') return r.fulfill({ contentType: 'text/html', body: 'fixture' });
        return r.fulfill(asset(u));
      }
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      };
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers });
      events.push({ phase, path: u.pathname, kind: u.searchParams.get('kind') });
      if (offline) return r.abort('internetdisconnected');
      let json = {
        user: { _id: 'tester', username: 'tester', prayTime: [] },
        items: [],
        incoming: [],
        outgoing: [],
        friends: [],
      };
      if (u.pathname.includes('/pray-time/')) json = { protocol: 2, items: [], nextCursor: null };
      if (u.pathname.endsWith('/activity-reads/prayers')) json = { after: 0, seen: [], more: false };
      if (u.pathname.endsWith('/translations')) json = ['AVD'];
      return r.fulfill({ json, headers });
    });
    await page.addInitScript(
      ({ origin }) => {
        if (location.origin !== origin) return;
        window.circleProbe = { sort: 0, order: 0 };
        Object.defineProperty(navigator, 'onLine', { get: () => !window.circleOffline });
        if (navigator.serviceWorker)
          Object.defineProperty(navigator.serviceWorker, 'controller', {
            value: { scriptURL: '/sw.js?v=navigation-v2' },
          });
        // The isolated fixture uses IndexedDB on both renderers. Never invoke installed app plugins.
        window.CapacitorCustomPlatform = undefined;
        window.Capacitor = undefined;
        for (const key of ['androidBridge', 'webkit'])
          Object.defineProperty(window, key, { value: undefined, configurable: true });
        function sample() {
          if (document.querySelector('textarea[data-preview-content="pray"]')?.getBoundingClientRect().height)
            window.circleProbe.editorMs = Math.round(performance.now());
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      },
      { origin }
    );
    const circle = page.getByRole('button', { name: /^Prayer Circle/ }).first(),
      journal = page.getByRole('button', { name: 'My Journal', exact: true });
    const rows = () =>
      page.evaluate(() => ({
        sort: circleProbe.sort,
        order: circleProbe.order,
        rows: document.querySelectorAll('[data-prayer-id]').length,
        circleRows: document.querySelectorAll(
          '[data-prayer-list]:not([data-journal-panel] [data-prayer-list]) [data-prayer-id]'
        ).length,
      }));
    const open = async () => {
      await circle.scrollIntoViewIfNeeded();
      return page.evaluate(async () => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          b.textContent.trim().startsWith('Prayer Circle')
        );
        const t = performance.now();
        btn.click();
        for (let i = 0; i < 180; i++) {
          await new Promise(requestAnimationFrame);
          const el = document.querySelector(
            '[data-prayer-list]:not([data-journal-panel] [data-prayer-list]) [data-prayer-id]'
          );
          if (el?.getBoundingClientRect().height) {
            return Math.round(performance.now() - t);
          }
        }
        throw Error('Circle card did not appear');
      });
    };
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      return Math.round(((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576) * 10) / 10;
    };
    for (const count of [30, 2000]) {
      await seed(page, count);
      for (let n = 1; n <= (compareBlur ? 10 : 5); n++) {
        phase = 'journal';
        events = [];
        offline = false;
        await page.goto(origin + '/pray/', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-prayer-id="probe-0"]').first().waitFor();
        await page.waitForFunction(() => circleProbe.editorMs);
        const result = { count, n, editorMs: await page.evaluate(() => circleProbe.editorMs) };
        if (process.env.CIRCLE_RUN?.startsWith('startup-')) {
          report.trials.push(result);
          fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
          continue;
        }
        if (compareSwipe) {
          await open();
          await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
          await page.waitForTimeout(550);
          for (const [field, tab] of [['toBibleMs', 1], ['toPrayMs', 0]]) {
            const { x, y, delta } = await page.evaluate(tab => {
              window.touchStarted = 0;
              window.addEventListener('touchstart', () => { window.touchStarted = performance.now(); }, { once: true, capture: true });
              return { x: innerWidth * (tab ? .76 : .24), y: innerHeight * .51, delta: innerWidth * (tab ? -.085 : .085) };
            }, tab);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
            for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + delta * i, y }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForFunction(tab => document.querySelector('[data-tab-active="true"]')?.dataset.tabIndex === String(tab), tab, {timeout:3000});
            result[field] = await page.evaluate(() => Math.round(performance.now() - window.touchStarted));
            await page.waitForTimeout(450);
          }
          report.trials.push(result);
          fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
          continue;
        }
        if (n === 1 && !compareBlur) await page.waitForTimeout(45000);
        result.journal = await rows();
        phase = 'typing';
        await page.locator('textarea[data-preview-content="pray"]').fill('Fixture draft');
        result.afterTyping = await rows();
        phase = 'circle';
        result.openMs = await open();
        result.circle = await rows();
        result.circleHeapMiB = await heap();
        // Counterbalance the order within successive pairs on the same build.
        if (compareBlur && [1, 0].includes(n % 4)) {
          await page.addStyleTag({ content: '.app-card[data-prayer-list-panel]:not([data-journal-panel]) { backdrop-filter: blur(12px); }' });
        }
        const point = await page.evaluate(() => {
          const card = document.querySelector(
            '[data-prayer-list]:not([data-journal-panel] [data-prayer-list]) [data-prayer-id]'
          );
          card.scrollIntoView({ block: 'center', behavior: 'instant' });
          const panel = card.closest('.app-card');
          window.circleFrames = [];
          let last;
          function frame(t) {
            if (last !== undefined) circleFrames.push(t - last);
            last = t;
            window.circleFrame = requestAnimationFrame(frame);
          }
          window.circleFrame = requestAnimationFrame(frame);
          return {
            x: Math.floor(innerWidth * 0.48),
            y: Math.floor(innerHeight * 0.72),
            height: innerHeight,
            start: scrollY,
            blur: getComputedStyle(panel).backdropFilter,
          };
        });
        await cdp.send('Input.synthesizeScrollGesture', {
          x: point.x,
          y: point.y,
          yDistance: -Math.round(point.height * 0.52),
          speed: 1400,
          preventFling: false,
          gestureSourceType: 'touch',
        });
        await page.waitForTimeout(550);
        result.scroll = await page.evaluate(({ start, blur }) => {
          cancelAnimationFrame(circleFrame);
          const gaps = circleFrames.sort((a, b) => a - b);
          return {
            distance: Math.round(scrollY - start),
            blur,
            frames: gaps.length,
            over34: gaps.filter((g) => g > 34).length,
            p95Ms: Math.round(gaps[Math.ceil(gaps.length * 0.95) - 1]),
          };
        }, point);
        phase = 'return';
        await journal.evaluate((button) => button.click());
        result.hidden = await rows();
        result.warmMs = await open();
        if (n === 1 && !compareBlur) {
          await journal.evaluate((button) => button.click());
          phase = 'offline';
          offline = true;
          await page.evaluate(() => {
            window.circleOffline = true;
            dispatchEvent(new Event('offline'));
          });
          result.offlineOpenMs = await open();
          offline = false;
          await page.evaluate(() => {
            window.circleOffline = false;
            dispatchEvent(new Event('online'));
          });
          phase = 'bible';
          await page
            .locator('nav[aria-label="Primary navigation"]')
            .getByText('Bible', { exact: true })
            .evaluate((button) => button.click());
          await page.waitForTimeout(900);
          await page
            .locator('nav[aria-label="Primary navigation"]')
            .getByText('Pray', { exact: true })
            .evaluate((button) => button.click());
          await page.waitForTimeout(700);
          result.afterBible = await rows();
        }
        result.events = events.slice();
        report.trials.push(result);
        fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
        console.log(mode, count, n, result.openMs);
      }
    }
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    if (attached) await page.goto(original, { waitUntil: 'commit', timeout: 6000 }).catch(() => {});
    else await page.close();
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
