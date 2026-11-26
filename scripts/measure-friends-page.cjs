/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS benchmark */
// Measure an unmodified production export in an isolated origin on Chromium or the installed WebView.
const { chromium } = require('playwright');
const { readFileSync, writeFileSync, statSync, existsSync } = require('node:fs');
const path = require('node:path');
const { seedFriendCache } = require('../tests/helpers/friend-cache.cjs');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(readFileSync(path.join(root, 'version.json'))).version;
const types = {
  '.html': 'text/html',
  '.txt': 'text/x-component',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const id = (n) => n.toString(16).padStart(24, '0');
const ownerId = id(9000);
const person = (n) => ({ _id: id(n), Name: 'Person ' + n, username: 'person' + n });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function asset(url, assetRoot) {
  if (url.pathname === '/seed') return { contentType: 'text/html', body: 'Fixture' };
  let file = path.resolve(assetRoot, '.' + decodeURIComponent(url.pathname));
  if (file !== assetRoot && !file.startsWith(assetRoot + path.sep)) return { status: 403 };
  if (existsSync(file) && statSync(file).isDirectory())
    file = path.join(file, url.searchParams.has('_rsc') ? 'index.txt' : 'index.html');
  return existsSync(file)
    ? { contentType: types[path.extname(file)] || 'application/octet-stream', body: readFileSync(file) }
    : { status: 404 };
}

async function run() {
  const endpoint = process.env.FRIENDS_CDP;
  const browser = endpoint ? await chromium.connectOverCDP(endpoint) : await chromium.launch();
  const context = endpoint
    ? browser.contexts()[0]
    : await browser.newContext({
        viewport: { width: 393, height: 800 },
        isMobile: true,
        hasTouch: true,
        serviceWorkers: 'block',
      });
  const page = endpoint ? context.pages()[0] : await context.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  const original = page.url();
  if (endpoint && new URL(original).origin !== 'https://localhost') {
    await browser.close();
    throw new Error('Open the installed Wasla WebView before starting the device benchmark.');
  }
  const report = {
    engine: browser.version(),
    build: readFileSync(path.join(root, 'friends/index.html'), 'utf8').match(/<!--([^>]+)-->/)?.[1],
    version,
    mode: endpoint ? 'a24-webview' : 'desktop',
    trials: [],
  };
  const cdp = await context.newCDPSession(page);
  const session = Date.now();
  let requests, people, events, phase;
  const origins = new Set();
  const comparisonRoot = process.env.FRIENDS_ENTRY_BASELINE;
  let assetRoot = root;
  const label = process.env.FRIENDS_RUN || 'step1';
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid run label');
  const destination = path.resolve(__dirname, '../performance/friends-' + label + '-' + report.mode + '.json');
  try {
    await page.addInitScript(
      ({ version, ownerId }) => {
        if (!location.hostname.endsWith('.friends-bench.test')) return;
        for (const [key, value] of Object.entries({
          'app-language': 'en',
          user_Taspe7_Token: 'fixture',
          user_Taspe7_ID: ownerId,
          user_Taspe7_Username: 'fixture',
          wasla_splash_version: version,
        }))
          localStorage.setItem(key, value);
        for (const key of ['androidBridge', 'webkit', 'Capacitor', 'CapacitorCustomPlatform'])
          Object.defineProperty(window, key, { value: undefined, configurable: true, writable: true });
        if (navigator.serviceWorker)
          Object.defineProperty(navigator.serviceWorker, 'controller', {
            value: { scriptURL: '/sw.js?v=navigation-v2' },
          });
        window.metrics = { gaps: [], maxRows: 0 };
        let last;
        function frame(now) {
          const m = window.metrics;
          if (last) m.gaps.push(now - last);
          last = now;
          const rows = document.querySelectorAll('[data-friend-id]');
          m.maxRows = Math.max(m.maxRows, rows.length);
          if (rows.length && !m.firstRow) m.firstRow = Math.round(now);
          if (m.target) m.targetMaxRows = Math.max(m.targetMaxRows || 0, document.querySelectorAll('[aria-label="My Friends"] [data-friend-id]').length);
          if (m.target && !m.targetMs) {
            const row = document.querySelector('[data-friend-id="' + m.target + '"]');
            if (row && m.mountMs === undefined) m.mountMs = Math.round(performance.now() - m.start);
            const box = row?.getBoundingClientRect();
            if (box && box.bottom > 0 && box.top < innerHeight) {
              if (m.targetSeen) m.targetMs = Math.round(performance.now() - m.start);
              else m.targetSeen = true;
            }
          }
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      },
      { version, ownerId }
    );
    await page.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      if (u.hostname.endsWith('.friends-bench.test') && !u.pathname.startsWith('/api/'))
        return route.fulfill(asset(u, assetRoot));
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const name = u.pathname.split('/').pop(),
        kind = u.searchParams.get('kind'),
        offset = Number(u.searchParams.get('cursor')) || 0;
      const key = name + (kind ? '?kind=' + kind : '');
      events.push({ phase, key, cursor: u.searchParams.get('cursor') });
      let json = {
        items: [],
        activeNotes: [],
        incoming: [],
        outgoing: [],
        user: { _id: ownerId, username: 'fixture' },
        publishing: { canPublish: true },
      };
      if (name === 'friend-requests') {
        const rows = kind === 'incoming' ? requests : [];
        json = {
          items: rows.slice(offset, offset + 10),
          total: rows.length,
          nextCursor: offset + 10 < rows.length ? String(offset + 10) : null,
        };
        await wait(60);
      } else if (name === 'sync') json = { changes: [], hasMore: false, cursor: '1' };
      else if (name === 'friends-summary')
        json = { friends: people.length, incoming: requests.length, outgoing: 0 };
      else if (name === 'translations') json = ['AVD'];
      else if (u.pathname.includes('/pray-time/')) json = { protocol: 2, items: [], nextCursor: null };
      else if (name === 'people-search') json = { items: [person(8000)], nextCursor: null };
      await route.fulfill({ json, headers }).catch(() => {});
    });
    // Compare entry latency on paired, fresh origins using an export from each revision.
    if (comparisonRoot) {
      const baselineRoot = path.resolve(comparisonRoot);
      report.baselineBuild = readFileSync(path.join(baselineRoot, 'friends/index.html'), 'utf8').match(/<!--([^>]+)-->/)?.[1];
      for (let pair = 1; pair <= 6; pair++) {
        for (const variant of pair % 2 ? ['before', 'after'] : ['after', 'before']) {
          assetRoot = variant === 'before' ? baselineRoot : root;
          const origin = `https://entry-${session}-${pair}-${variant}.friends-bench.test`;
          origins.add(origin);
          people = Array.from({ length: 1250 }, (_, i) => person(i + 1));
          requests = Array.from({ length: 100 }, (_, i) => ({ _id: id(5000 + i), from: person(6000 + i) }));
          events = [];
          phase = 'open';
          await page.goto(origin + '/seed');
          await page.evaluate(seedFriendCache, { ownerId, friends: people, incomingRequests: requests });
          await page.goto(origin + '/friends/', { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.metrics.firstRow, undefined, { timeout: 10000 });
          const times = await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            return { cachedRowMs: metrics.firstRow, domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd) };
          });
          report.trials.push({ pair, variant, ...times });
        }
      }
      writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
      return;
    }
    for (const size of [10, 1250])
      for (let trial = 1; trial <= 5; trial++) {
        const origin = 'https://r' + session + '-' + size + '-' + trial + '.friends-bench.test';
        origins.add(origin);
        people = Array.from({ length: size }, (_, i) => person(i + 1));
        requests = Array.from({ length: size === 10 ? 10 : 100 }, (_, i) => ({
          _id: id(5000 + i),
          from: person(6000 + i),
        }));
        events = [];
        phase = 'open';
        await page.goto(origin + '/seed');
        await page.evaluate(seedFriendCache, { ownerId, friends: people, incomingRequests: requests });
        await page.goto(origin + '/friends/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.metrics.firstRow, undefined, { timeout: 10000 });
        await page.getByText('Incoming requests (' + requests.length + ')', { exact: true }).waitFor();
        await page.getByRole('status').filter({ hasText: 'Loading people' }).first().waitFor({ state: 'hidden' });
        // Wait until the cached-depth replay has been requested and the last response committed.
        await wait(800);
        phase = 'sent';
        await page.getByRole('button', { name: 'Sent', exact: true }).click();
        await page.getByText('No pending sent requests').waitFor();
        phase = 'fresh return';
        await page
          .getByRole('button', { name: /^Requests/ })
          .first()
          .click();
        await page.locator('[data-friend-id]').first().waitFor();
        await wait(200);
        phase = 'wait on Sent';
        await page.getByRole('button', { name: 'Sent', exact: true }).click();
        await page.getByText('No pending sent requests').waitFor();
        await wait(15500);
        phase = 'stale return';
        const firstIncoming = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === 'GET' &&
            url.pathname.endsWith('/friend-requests') &&
            url.searchParams.get('kind') === 'incoming' &&
            !url.searchParams.has('cursor')
          );
        });
        await page
          .getByRole('button', { name: /^Requests/ })
          .first()
          .click();
        await firstIncoming;
        await page.getByRole('status').filter({ hasText: 'Loading people' }).first().waitFor({ state: 'hidden' });
        const target = people[Math.min(999, size - 1)]._id;
        phase = 'target';
        await page.evaluate((id) => {
          metrics.gaps = [];
          metrics.target = id;
          metrics.start = performance.now();
          window.dispatchEvent(
            new CustomEvent('taspe7:open-friends', {
              cancelable: true,
              detail: { href: '/friends/?notificationType=FRIEND_REQUEST_ACCEPTED&actorId=' + id },
            })
          );
        }, target);
        await page.waitForFunction(() => window.metrics.targetMs, undefined, { timeout: 30000 });
        await page.waitForTimeout(300);
        const values = await page.evaluate(() => {
          const m = metrics,
            gaps = m.gaps.slice().sort((a, b) => a - b);
          return {
            cachedRowMs: m.firstRow,
            targetMountedMs: m.mountMs,
            targetMs: m.targetMs,
            maxRows: m.maxRows,
            targetMaxRows: m.targetMaxRows,
            targetScrollY: Math.round(scrollY),
            targetP95FrameGapMs: Math.round(gaps[Math.ceil(gaps.length * 0.95) - 1]),
            targetWorstFrameGapMs: Math.round(gaps.at(-1)),
          };
        });
        const counts = {};
        for (const { phase, key } of events) {
          counts[phase] ||= {};
          counts[phase][key] = (counts[phase][key] || 0) + 1;
        }
        report.trials.push({
          size,
          trial,
          ...values,
          counts,
          staleCursors: events
            .filter((e) => e.phase === 'stale return' && e.key === 'friend-requests?kind=incoming')
            .map((e) => e.cursor),
        });
        writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
      }
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    if (endpoint) await page.goto(original, { waitUntil: 'domcontentloaded' });
    for (const origin of origins)
      await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    await cdp.detach();
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
