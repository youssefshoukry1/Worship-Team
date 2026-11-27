/* eslint-disable @typescript-eslint/no-require-imports */
// Run after building the production export. PROFILE_CDP selects an installed Android WebView.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'))).version;
const owner = '000000000000000000000001';
const user = { _id: owner, username: 'fixture', Name: 'Fixture Owner' };
const types = { html: 'text/html', txt: 'text/x-component', js: 'application/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', woff2: 'font/woff2' };
function fixture(size) {
  const records = Array.from({ length: size }, (_, i) => ({
    _id: (1000 + i).toString(16).padStart(24, '0'), verseId: String(i + 1), verseNumber: i % 30 + 1,
    bookName: 'Fixture Book', chapter: Math.floor(i / 30) + 1, color: 'yellow', note: 'Fixture annotation',
    text: 'Fixture verse text '.repeat(5), date: i === size - 1 ? undefined : new Date(Date.UTC(2026, 9, 1) - Math.floor(i / 2) * 90000).toISOString(),
  }));
  const items = Array.from({ length: size >= 1000 ? 120 : size ? 15 : 0 }, (_, i) => ({
    _id: (4000 + i).toString(16).padStart(24, '0'), title: 'Fixture note ' + i, body: 'Saved social note ' + i,
    author: user, createdAt: new Date(Date.UTC(2026, 9, 1) - i * 86400000).toISOString(),
  }));
  return { profile: { user: { ...user, bibleNotes: records, bibleHighlights: records, prayTime: [] } }, items,
    manifest: items.map(({ _id, createdAt }) => ({ _id, createdAt, contentVersion: 1 })) };
}

async function run() {
  const { groupNotes, groupHighlights } = await import('../src/app/utils/bibleProfileGroups.js');
  const device = process.env.PROFILE_CDP;
  const browser = device ? await chromium.connectOverCDP(device) : await chromium.launch({ channel: 'chrome' });
  const context = device ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });
  const page = device ? context.pages()[0] : await context.newPage();
  const original = page.url();
  if (device && new URL(original).origin !== 'https://localhost') throw Error('Open Wasla before starting');
  const cdp = await context.newCDPSession(page);
  const report = { engine: browser.version(), version, build: fs.readFileSync(path.join(root, 'normal_UserProfile/index.html'), 'utf8').match(/<!--([^>]+)-->/)?.[1], trials: [] };
  const destination = path.resolve(__dirname, '../performance/profile-render-' + (device ? 'a24-webview' : 'desktop') + '.json');
  const origins = new Set();
  let phase, offline, data, trial;
  try {
    await page.addInitScript(({ owner, version }) => {
      if (!location.hostname.endsWith('.profile-study.test')) return;
      for (const [key, value] of Object.entries({ user_Taspe7_ID: owner, user_Taspe7_Token: 'fixture', user_Taspe7_Username: 'fixture', 'app-language': 'en', wasla_splash_version: version })) localStorage.setItem(key, value);
      for (const key of ['androidBridge','webkit','Capacitor','CapacitorCustomPlatform']) Object.defineProperty(window, key, { configurable: true, writable: true, value: undefined });
      if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'controller', { value: { scriptURL: '/sw.js?v=navigation-v2' } });
      window.profileReads = {};
      if (location.pathname === '/normal_UserProfile/') {
        const observer = new MutationObserver(() => {
          const ready = Array.from(document.querySelectorAll('button')).some(button =>
            /^Highlights\s*\d+\s*records?$/.test(button.textContent.trim()));
          if (!ready) return;
          window.profileCountDomMs = Math.round(performance.now());
          observer.disconnect();
        });
        observer.observe(document, { childList: true, subtree: true, characterData: true });
      }
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function(key) {
        const name = this.transaction.db.name + '/' + this.name;
        window.profileReads[name] = (window.profileReads[name] || 0) + 1;
        return get.call(this, key);
      };
    }, { owner, version });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname.endsWith('.profile-study.test') && !url.pathname.startsWith('/api/')) {
        let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (file !== root && !file.startsWith(root + path.sep)) return route.abort();
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, url.searchParams.has('_rsc') ? 'index.txt' : 'index.html');
        return fs.existsSync(file) ? route.fulfill({ contentType: types[path.extname(file).slice(1)], body: fs.readFileSync(file) }) : route.fulfill({ status: 404 });
      }
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      let json = { items: [], activeNotes: [], friends: [], incoming: [], outgoing: [], user, publishing: { canPublish: true } };
      if (url.pathname.endsWith('/my-profile')) json = data.profile;
      else if (url.pathname.includes('/profile-bible/')) {
        const rows = data.profile.user;
        const groups = url.pathname.endsWith('/notes') ? groupNotes(rows.bibleNotes) : groupHighlights(rows.bibleHighlights);
        const start = Number(url.searchParams.get('cursor') || 0);
        json = { items: groups.slice(start, start + 10), total: groups.length, version: 1,
          nextCursor: start + 10 < groups.length ? String(start + 10) : null };
      }
      else if (url.pathname.endsWith('/profile-summary')) {
        const count = trial.sizePerCollection ? Math.floor(trial.sizePerCollection / 2) + 1 : 0;
        json = { user, counts: { notes: count, highlights: count } };
      }
      else if (url.pathname.endsWith('/profile/' + owner)) {
        const start = Number(url.searchParams.get('cursor') || 0);
        const archiveCursor = start + 12 < data.items.length ? String(start + 12) : null;
        json = { ...json, isOwner: true, stats: { friends: 0, testimonies: data.items.length }, canViewTestimonies: true, notesVersion: 1,
          ...(url.searchParams.has('notesVersion') ? { unchanged: true, reactions: [] } :
            { archiveCursor, nextCursor: archiveCursor, items: data.items.slice(start, start + 12) }) };
      }
      else if (url.searchParams.has('ids')) json = { notesVersion: 1, items: data.items.filter(i => url.searchParams.get('ids').split(',').includes(i._id)) };
      else if (url.pathname.endsWith('/translations')) json = ['AVD'];
      const bytes = Buffer.byteLength(JSON.stringify(json));
      trial.requests.push({ phase, path: url.pathname, bytes: offline ? 0 : bytes });
      if (offline) return route.abort('internetdisconnected');
      return route.fulfill({ json, headers });
    });
    const button = name => page.getByRole('button', { name: new RegExp('^' + name + ' [0-9]+ records?$', 'i') }).first();
    const waitMenu = () => button('Highlights').waitFor({ timeout: 12000 });
    const rail = page.locator('[aria-label="Profile testimony highlights"] [data-note-surface]');
    for (const size of [0, 24, 1000]) for (let n = 1; n <= 5; n++) {
      const origin = 'https://r' + Date.now() + '.profile-study.test';
      origins.add(origin);
      data = fixture(size); offline = false;
      trial = { sizePerCollection: size, n, requests: [], collections: {} };
      phase = 'first';
      await page.goto(origin + '/normal_UserProfile/', { waitUntil: 'domcontentloaded' });
      await waitMenu();
      trial.menuMs = await page.evaluate(() => Math.round(performance.now()));
      trial.menuCountDomMs = await page.evaluate(() => window.profileCountDomMs);
      trial.menuLabel = await button('Highlights').innerText();
      if (size) await rail.first().waitFor();
      trial.initialRail = await rail.count();
      trial.menuReads = await page.evaluate(() => profileReads);
      phase = 'loadMore';
      const more = page.getByRole('button', { name: 'More', exact: true });
      const scroller = page.locator('[aria-label="Profile testimony highlights"] [data-loaded-notes]');
      async function readArchive() {
        for (let count = 12; count < data.items.length; count += 12) {
          await more.evaluate(el => el.click());
          await page.waitForFunction(n => Number(document.querySelector('[aria-label="Profile testimony highlights"] [data-loaded-notes]')?.dataset.loadedNotes) > n, count);
        }
        if (data.items.length) {
          await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth; });
          await page.getByRole('button', { name: 'Read testimony: ' + data.items.at(-1).title, exact: true }).waitFor();
        }
      }
      await readArchive();
      trial.loadedRail = await rail.count();
      for (const name of ['Highlights','Notes']) {
        phase = name;
        await button(name).evaluate(el => { window.startProfileView = performance.now(); el.click(); });
        await page.waitForFunction(kind => location.hash === '#' + kind && (document.querySelector('h4') || document.querySelectorAll('button').length && !document.querySelector('[aria-label="Profile testimony highlights"]')), name.toLowerCase());
        if (size) await page.locator('h4').filter({ hasText: 'Fixture Book' }).first().waitFor();
        trial.collections[name] = await page.evaluate(async () => {
          await new Promise(requestAnimationFrame);
          const ms = Math.round(performance.now() - startProfileView);
          const cards = [...document.querySelectorAll('h4')].filter(e => e.textContent === 'Fixture Book').length;
          const gaps = [];
          let prev = performance.now();
          for (let i = 0; i < 12; i++) {
            window.scrollBy(0, 120);
            const now = await new Promise(requestAnimationFrame);
            if (i) gaps.push(now-prev);
            prev = now;
          }
          return { ms, cards, maxScrollFrameGapMs: Math.round(Math.max(...gaps)) };
        });
        await page.evaluate(() => history.back());
        await waitMenu();
      }
      phase = 'focus';
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(200);
      phase = 'warm';
      const nav = page.locator('nav[aria-label="Primary navigation"]');
      await nav.locator('a[href*="friends"]').evaluate(el => el.click());
      await page.waitForURL('**/friends/');
      const start = Date.now();
      await nav.locator('a[href*="normal_UserProfile"]').evaluate(el => el.click());
      await page.waitForURL('**/normal_UserProfile/');
      await waitMenu(); trial.warmMs = Date.now() - start;
      phase = 'offline'; offline = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitMenu();
      if (size) await rail.first().waitFor();
      trial.offlineMs = await page.evaluate(() => Math.round(performance.now()));
      trial.offlineRail = await rail.count();
      if (size) {
        phase = 'offlineArchive';
        if (data.items.length > 12) {
          const id = data.items.at(-1)._id;
          await page.evaluate(id => window.dispatchEvent(new CustomEvent('taspe7:open-testimony', {
            cancelable: true, detail: { href: '/normal_UserProfile/?note=' + id },
          })), id);
          await page.getByRole('dialog').waitFor();
          await page.keyboard.press('Escape');
        }
        await readArchive();
      }
      offline = false; phase = 'preview';
      const fresh = origin.replace('https://r','https://p');
      origins.add(fresh);
      await page.goto(fresh + '/friends/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!document.querySelector('[data-tab-active="false"][data-tab-index="3"] [aria-label="Profile testimony highlights"]'), undefined, { timeout: 12000 });
      await page.waitForTimeout(150);
      trial.previewReads = await page.evaluate(() => profileReads);
      report.trials.push(trial);
      fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    }
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    if (device) await page.goto(original, { waitUntil: 'commit' });
    for (const origin of origins) await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
