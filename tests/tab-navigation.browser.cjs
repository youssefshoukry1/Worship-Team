// Run after npm run build: node --test tests/tab-navigation.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/version.json'))).version;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
let browser, server, base;
const gates = new Map();

function gateRoute(prefix) {
  let release, markSeen;
  const gate = { wait: new Promise(resolve => { release = resolve; }), seen: new Promise(resolve => { markSeen = resolve; }), markSeen };
  gate.markSeen = markSeen;
  gates.set(prefix, gate);
  return { seen: gate.seen, release() { gates.delete(prefix); release(); } };
}

before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__seed') { res.setHeader('Content-Type', 'text/html'); return res.end('<html></html>'); }
    for (const [prefix, gate] of gates) {
      if (pathname.startsWith(prefix) && !pathname.endsWith('.html')) { gate.markSeen(); await gate.wait; }
    }
    let file = path.join(root, decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function setup({ electron = false, api } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    ...(electron ? { userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Electron/30.0.0' } : {}) });
  const page = await context.newPage();
  await page.route('**/*', async route => {
    if (route.request().url().startsWith(base)) return route.continue();
    if (api) { const handled = await api(route); if (handled) return; }
    const url = route.request().url();
    if (url.includes('/my-teams') || url.includes('/hymns') || url.includes('/bible/')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { user: { _id: 'tester', name: 'Tester', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [] }, inbox: [], updates: [], accounts: [], friends: [], incoming: [], outgoing: [] } });
  });
  await page.goto(base + '/__seed');
  await page.evaluate(async version => {
    for (const [key, value] of Object.entries({ 'app-language': 'en', user_Taspe7_Token: 'test-token', user_Taspe7_ID: 'tester', user_Taspe7_Username: 'tester', wasla_splash_version: version, wasla_intro_last_time: String(Date.now()), taspe7_storage_migrated_v1: '1', taspe7_category_hymns_tour_done: '1', taspe7_hymns_sync_version: '1' })) localStorage.setItem(key, value);
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('taspe7_app', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('bible_store');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('bible_store', 'readwrite');
      tx.objectStore('bible_store').put([{ _id: 'old', title: 'Old hymn', party: ['all'], lyrics: [], usageCount: 1 }], 'taspe7_hymns_json');
      tx.objectStore('bible_store').put([{ _id: 'verse', bookName: 'Genesis', bookNumber: 1, chapter: 1, verseNumber: 1, text: 'Verse', translation: 'AVD' }], 'taspe7_bible_db_AVD');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, version);
  await page.addInitScript(() => { window.__navigationSession = Math.random(); });
  return { context, page };
}

async function openHymns(page) {
  await page.goto(base + '/hymns/', { waitUntil: 'domcontentloaded' });
  await page.locator('nav[aria-label="Primary navigation"]').waitFor();
}

async function controlled(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('navigation-v2'));
}

async function taps(page, hrefs) {
  await page.evaluate(hrefs => {
    const nav = document.querySelector('nav[aria-label="Primary navigation"]');
    for (const href of hrefs) nav.querySelector(`a[href^="${href}"]`).click();
  }, hrefs);
}

test('latest tap wins, including returning to the current tab, without a document reload', async () => {
  const { context, page } = await setup();
  try {
    await openHymns(page); await controlled(page);
    const session = await page.evaluate(() => window.__navigationSession);
    await taps(page, ['/friends', '/hymns']);
    await page.waitForTimeout(500);
    assert.equal(new URL(page.url()).pathname, '/hymns/');
    await taps(page, ['/friends', '/bible_form', '/pray', '/normal_UserProfile']);
    await page.waitForURL(base + '/normal_UserProfile/');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('nav[aria-label="Primary navigation"] a[aria-current="page"]').getAttribute('href'), '/normal_UserProfile/');
    assert.equal(await page.evaluate(() => window.__navigationSession), session);
  } finally { await context.close(); }
});

test('tapping back while a route payload is stalled supersedes the dispatched navigation', async () => {
  const gate = gateRoute('/friends/');
  const { context, page } = await setup();
  try {
    await openHymns(page); await controlled(page);
    await taps(page, ['/friends']);
    await gate.seen;
    await page.waitForTimeout(100);
    assert.equal(new URL(page.url()).pathname, '/hymns/');
    await taps(page, ['/hymns']);
    gate.release();
    await page.waitForTimeout(700);
    assert.equal(new URL(page.url()).pathname, '/hymns/');
    assert.equal(await page.locator('nav[aria-label="Primary navigation"] a[aria-current="page"]').getAttribute('href'), '/hymns/');
  } finally { gate.release(); await context.close(); }
});

test('cold worker startup routes only the latest selection after control is acquired', async () => {
  const { context, page } = await setup();
  try {
    await page.addInitScript(() => {
      const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (...args) => new Promise(resolve => {
        window.__releaseWorker = () => resolve(register(...args));
      });
    });
    await openHymns(page);
    const session = await page.evaluate(() => window.__navigationSession);
    await taps(page, ['/friends', '/bible_form', '/pray']);
    assert.equal(new URL(page.url()).pathname, '/hymns/');
    await page.evaluate(() => window.__releaseWorker());
    await page.waitForURL(base + '/pray/');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__navigationSession), session);
    assert.equal(await page.locator('nav[aria-label="Primary navigation"] a[aria-current="page"]').getAttribute('href'), '/pray/');
  } finally { await context.close(); }
});

test('a new tap immediately after the URL changes is not cleared by the previous transition', async () => {
  const { context, page } = await setup();
  try {
    await openHymns(page); await controlled(page);
    for (const href of ['/friends', '/hymns', '/pray', '/hymns', '/friends', '/hymns']) {
      await taps(page, [href]);
      await page.waitForURL(base + href + '/', { timeout: 5000 });
    }
  } finally { await context.close(); }
});

test('the team bottom navigation also honors the latest tap and keeps client routing', async () => {
  const { context, page } = await setup({ api: async route => {
    if (new URL(route.request().url()).pathname.endsWith('/users/my-team')) {
      await route.fulfill({ json: [] }); return true;
    }
    return false;
  } });
  try {
    await page.evaluate(() => localStorage.setItem('user_Taspe7_Status', 'approved'));
    await page.goto(base + '/chat_team/', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Search chats or teams').waitFor(); await controlled(page);
    const session = await page.evaluate(() => window.__navigationSession);
    await page.evaluate(() => {
      const links = href => [...document.querySelectorAll(`a[href^="${href}"]`)].at(-1);
      links('/Trainings').click(); links('/chat_team').click();
    });
    await page.waitForTimeout(400);
    assert.equal(new URL(page.url()).pathname, '/chat_team/');
    await page.locator('a[href^="/Trainings"]').last().evaluate(link => link.click());
    await page.waitForURL(base + '/Trainings/');
    await page.locator('a[href^="/chat_team"]').last().evaluate(link => link.click());
    await page.waitForURL(base + '/chat_team/');
    assert.equal(await page.evaluate(() => window.__navigationSession), session);
  } finally { await context.close(); }
});

test('a hung registration falls back within the total deadline using only the latest destination', async () => {
  const { context, page } = await setup();
  try {
    await page.addInitScript(() => {
      navigator.serviceWorker.register = () => new Promise(() => {});
    });
    await openHymns(page);
    const session = await page.evaluate(() => window.__navigationSession);
    const started = performance.now();
    await taps(page, ['/pray', '/bible_form', '/friends']);
    await page.waitForURL(url => url.pathname.replace(/\/$/, '') === '/friends', { timeout: 6500, waitUntil: 'domcontentloaded' });
    assert.ok(performance.now() - started < 6000);
    assert.notEqual(await page.evaluate(() => window.__navigationSession), session);
  } finally { await context.close(); }
});

test('hymn version checks, incremental updates, deletions and force-sync still run', async () => {
  let serverVersion = 2;
  const versions = [];
  const { context, page } = await setup({ electron: true, api: async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/hymns/version')) {
      versions.push(serverVersion);
      await route.fulfill({ json: { version: serverVersion } }); return true;
    }
    if (url.pathname.endsWith('/hymns/changes')) {
      await route.fulfill({ json: { updated: [{ _id: 'updated', title: `Updated hymn ${serverVersion}`, party: ['all'], lyrics: [], usageCount: 2 }], deleted: ['old'], currentVersion: serverVersion } }); return true;
    }
    return false;
  } });
  try {
    await openHymns(page); await controlled(page);
    await page.waitForFunction(() => localStorage.getItem('taspe7_hymns_sync_version') === '2');
    await page.getByText('Updated hymn 2', { exact: true }).waitFor();
    assert.equal(await page.getByText('Old hymn', { exact: true }).count(), 0);
    await taps(page, ['/friends']); await page.waitForURL(base + '/friends/');
    serverVersion = 3;
    await taps(page, ['/hymns']); await page.waitForURL(base + '/hymns/');
    await page.waitForFunction(() => localStorage.getItem('taspe7_hymns_sync_version') === '3');
    await page.getByText('Updated hymn 3', { exact: true }).waitFor();
    serverVersion = 4;
    await page.evaluate(() => {
      const channel = new BroadcastChannel('taspe7_sync');
      channel.postMessage({ type: 'force_sync' }); channel.close();
    });
    await page.waitForFunction(() => localStorage.getItem('taspe7_hymns_sync_version') === '4');
    await page.getByText('Updated hymn 4', { exact: true }).waitFor();
    assert.deepEqual(versions, [2, 3, 4]);
    const saved = await page.evaluate(async () => {
      const db = await new Promise(resolve => { const req = indexedDB.open('taspe7_app'); req.onsuccess = () => resolve(req.result); });
      const data = await new Promise(resolve => { const req = db.transaction('bible_store').objectStore('bible_store').get('taspe7_hymns_json'); req.onsuccess = () => resolve(req.result); });
      db.close(); return data;
    });
    assert.deepEqual(saved.map(hymn => hymn.title), ['Updated hymn 4']);
  } finally { await context.close(); }
});

async function observeBibleStorage(page) {
  await page.evaluate(() => localStorage.setItem('taspe7_bible_last_position', JSON.stringify({ bookName: 'Genesis', chapter: 1 })));
  await page.addInitScript(() => {
    window.__bibleReads = 0;
    window.__bibleMetadataChecks = 0;
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      if (key === 'taspe7_bible_db_AVD') window.__bibleReads++;
      return get.call(this, key);
    };
    const cursor = IDBObjectStore.prototype.openKeyCursor;
    IDBObjectStore.prototype.openKeyCursor = function (...args) {
      const request = cursor.apply(this, args);
      if (this.transaction.db.name === 'taspe7_app' && this.name === 'bible_store') {
        request.addEventListener('success', () => { if (!request.result) window.__bibleMetadataChecks++; });
      }
      return request;
    };
    // Deterministically check both idle background preparation and immediate
    // activation without waiting for the browser's idle scheduling heuristic.
    const callbacks = new Map(); let id = 0;
    window.requestIdleCallback = callback => { callbacks.set(++id, callback); return id; };
    window.cancelIdleCallback = handle => callbacks.delete(handle);
    window.__runBibleIdle = () => {
      const pending = [...callbacks.values()]; callbacks.clear();
      pending.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
    };
  });
}

function bibleApi(requests) {
  return async route => {
    const pathname = new URL(route.request().url()).pathname;
    requests.push(pathname);
    if (pathname.endsWith('/hymns/version')) { await route.fulfill({ json: { version: 1 } }); return true; }
    if (pathname.endsWith('/bible/translations')) { await route.fulfill({ json: ['AVD', 'KEH'] }); return true; }
    return false;
  };
}

test('closed Hymns tools never hydrate a saved Bible; repeated Bible visits share one disk read', async t => {
  const requests = [];
  const { context, page } = await setup({ electron: true, api: bibleApi(requests) });
  try {
    await observeBibleStorage(page);
    await openHymns(page); await controlled(page);
    await page.evaluate(() => window.__runBibleIdle());
    await page.waitForFunction(() => window.__bibleMetadataChecks > 0);
    assert.equal(await page.evaluate(() => window.__bibleReads), 0);
    assert.equal(requests.some(path => path.endsWith('/my-notes')), false);
    for (let i = 0; i < 3; i++) {
      await taps(page, ['/bible_form']); await page.waitForURL(base + '/bible_form/');
      await page.getByText('Verse', { exact: true }).waitFor();
      await taps(page, ['/hymns']); await page.waitForURL(base + '/hymns/');
    }
    assert.equal(await page.evaluate(() => window.__bibleReads), 1);
    assert.equal(requests.some(path => path.endsWith('/bible/books') || path.endsWith('/bible/download')), false);
    t.diagnostic('Full saved-Bible reads: 0 on closed Hymns tools; 1 total across three Bible visits.');
  } finally { await context.close(); }
});

test('desktop Bible presentation initializes immediately even with the Bible modal closed', async () => {
  const requests = [];
  const { context, page } = await setup({ electron: true, api: bibleApi(requests) });
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await observeBibleStorage(page);
    await openHymns(page); await controlled(page);
    await page.locator('#tour-presentation-desktop').click();
    assert.equal(await page.evaluate(() => window.__bibleReads), 0);
    await page.getByRole('button', { name: 'الكتاب', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('taspe7_bible_last_verses') || '{}').verses?.[0]?.text === 'Verse');
    assert.equal(await page.evaluate(() => window.__bibleReads), 1);
    assert.ok(requests.some(path => path.endsWith('/my-notes')));
    assert.equal(requests.some(path => path.endsWith('/bible/books') || path.endsWith('/bible/download')), false);
  } finally { await context.close(); }
});

test('first-install idle preparation continues when Bible opens and makes verses available offline', async () => {
  const requests = [];
  const { context, page } = await setup({ electron: true, api: bibleApi(requests) });
  let release;
  const sourceReady = new Promise(resolve => { release = resolve; });
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  let seeds = 0;
  try {
    await observeBibleStorage(page);
    await page.evaluate(async () => {
      const db = await new Promise(resolve => { const req = indexedDB.open('taspe7_app'); req.onsuccess = () => resolve(req.result); });
      await new Promise(resolve => { const tx = db.transaction('bible_store', 'readwrite'); tx.objectStore('bible_store').delete('taspe7_bible_db_AVD'); tx.oncomplete = resolve; });
      db.close();
    });
    await page.route('**/Taspe7.bibles.json', async route => {
      seeds++; markStarted(); await sourceReady;
      await route.fulfill({ json: [{ _id: { $oid: 'verse' }, bookName: 'Genesis', bookNumber: 1, chapter: 1, verseNumber: 1, text: 'First install verse', translation: 'AVD' }] }).catch(() => {});
    });
    await openHymns(page); await controlled(page);
    assert.equal(seeds, 0);
    await page.evaluate(() => window.__runBibleIdle()); await started;
    await taps(page, ['/bible_form']); await page.waitForURL(base + '/bible_form/');
    release();
    await page.getByText('First install verse', { exact: true }).waitFor();
    assert.equal(seeds, 1);
    assert.equal(await page.evaluate(() => window.__bibleReads), 1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('First install verse', { exact: true }).waitFor();
    assert.equal(seeds, 1);
    assert.equal(requests.some(path => path.endsWith('/bible/books') || path.endsWith('/bible/download')), false);
  } finally { release(); await context.close(); }
});

async function waitUntil(predicate) {
  const until = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('Expected background request did not run');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('rapid tab revisits reuse profile/social reads; focus and push still refresh immediately', async t => {
  const counts = new Map();
  const { context, page } = await setup({ electron: true, api: async route => {
    const path = new URL(route.request().url()).pathname;
    counts.set(path, (counts.get(path) || 0) + 1);
    if (path.endsWith('/hymns/version')) { await route.fulfill({ json: { version: 1 } }); return true; }
    return false;
  } });
  const count = suffix => [...counts].filter(([path]) => path.endsWith(suffix)).reduce((n, [, value]) => n + value, 0);
  try {
    await openHymns(page); await controlled(page);
    for (let i = 0; i < 2; i++) {
      for (const href of ['/normal_UserProfile', '/pray', '/bible_form', '/friends', '/hymns']) {
        await taps(page, [href]); await page.waitForURL(base + href + '/');
        await page.waitForTimeout(80);
      }
    }
    assert.equal(count('/users/my-profile'), 1);
    assert.equal(count('/users/friends'), 1);
    assert.equal(count('/users/friend-requests'), 1);
    assert.equal(count('/users/my-notes'), 1);
    assert.equal(count('/bible/translations'), 1);
    assert.equal(count('/hymns/version'), 3, 'Completed version checks still run on each visit');
    t.diagnostic('Ten tab switches used one profile request, one friends-list request and one requests-list request.');
    await taps(page, ['/normal_UserProfile']); await page.waitForURL(base + '/normal_UserProfile/');
    await page.getByRole('button', { name: 'Edit Name', exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitUntil(() => count('/users/my-profile') >= 2);
    await taps(page, ['/friends']); await page.waitForURL(base + '/friends/');
    await page.getByRole('heading', { name: 'Friends', exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('taspe7:friends-push')));
    // Visibility refreshes may also run while the other browser suite opens tabs.
    await waitUntil(() => count('/users/friend-requests') >= 2 && count('/users/friends') >= 2);
  } finally { await context.close(); }
});

test('hymn sync survives tab switches without duplicate downloads and queues a force-sync pass', async () => {
  let release; const stalled = new Promise(resolve => { release = resolve; });
  let serverVersion = 2, checks = 0, changes = 0, activeDownloads = 0, peakDownloads = 0;
  const { context, page } = await setup({ electron: true, api: async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/hymns/version')) { checks++; await route.fulfill({ json: { version: serverVersion } }); return true; }
    if (path.endsWith('/hymns/changes')) {
      const version = serverVersion; changes++; activeDownloads++; peakDownloads = Math.max(peakDownloads, activeDownloads);
      if (changes === 1) await stalled;
      await route.fulfill({ json: { deleted: ['old'], updated: [{ _id: 'updated', title: `Synced hymn ${version}`, lyrics: [], party: ['all'] }], currentVersion: version } }).catch(() => {});
      activeDownloads--; return true;
    }
    return false;
  } });
  try {
    await openHymns(page); await controlled(page); await waitUntil(() => changes === 1);
    for (let i = 0; i < 2; i++) {
      await taps(page, ['/friends']); await page.waitForURL(base + '/friends/');
      await taps(page, ['/hymns']); await page.waitForURL(base + '/hymns/');
    }
    assert.equal(checks, 1); assert.equal(changes, 1);
    serverVersion = 3;
    await page.evaluate(() => {
      const channel = new BroadcastChannel('taspe7_sync'); channel.postMessage({ type: 'force_sync' }); channel.close();
    });
    await page.waitForTimeout(60); release();
    await page.getByText('Synced hymn 3', { exact: true }).waitFor();
    assert.equal(checks, 2); assert.equal(changes, 2); assert.equal(peakDownloads, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('taspe7_hymns_sync_version')), '3');
  } finally { release(); await context.close(); }
});

test('an in-flight prayer import survives leaving the tab and is reused on returning', async () => {
  let release; const stalled = new Promise(resolve => { release = resolve; });
  let inboxCalls = 0; const acknowledged = [];
  const { context, page } = await setup({ api: async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/pray-time/inbox')) {
      inboxCalls++; await stalled;
      await route.fulfill({ json: { inbox: [{ shareId: 'across-tabs', words: 'Prayer delivered across tab changes', senderUsername: 'alice' }] } }).catch(() => {}); return true;
    }
    if (path.endsWith('/pray-time/ack')) {
      acknowledged.push(route.request().postDataJSON().shareId);
      await route.fulfill({ json: { success: true } }); return true;
    }
    return false;
  } });
  try {
    await openHymns(page); await controlled(page);
    await taps(page, ['/pray']); await page.waitForURL(base + '/pray/'); await waitUntil(() => inboxCalls === 1);
    await taps(page, ['/normal_UserProfile']); await page.waitForURL(base + '/normal_UserProfile/');
    await taps(page, ['/pray']); await page.waitForURL(base + '/pray/');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('taspe7:open-prayer', {
      detail: { href: '/pray/?notificationType=PRAY_SHARED&shareId=across-tabs' }, cancelable: true,
    })));
    release();
    await page.getByText('Prayer delivered across tab changes', { exact: true }).waitFor();
    await waitUntil(() => acknowledged.includes('across-tabs'));
    assert.equal(inboxCalls, 1);
    assert.deepEqual(acknowledged, ['across-tabs']);
  } finally { release(); await context.close(); }
});

function featureChunks(marker) {
  return new Set(fs.readdirSync(path.join(root, '_next/static/chunks')).filter(name =>
    name.endsWith('.js') && fs.readFileSync(path.join(root, '_next/static/chunks', name), 'utf8').includes(marker)));
}

async function featurePage(api) {
  const { context, page } = await setup({ electron: true, api: async route => {
    if (api && await api(route)) return true;
    if (new URL(route.request().url()).pathname.endsWith('/hymns/version')) {
      await route.fulfill({ json: { version: 1 } }); return true;
    }
    return false;
  } });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async () => {
    localStorage.setItem('user_Taspe7_GlobalRole', 'PROGRAMER');
    localStorage.setItem('taspe7_bible_last_position', JSON.stringify({ bookName: 'Genesis', chapter: 1 }));
    const db = await new Promise(resolve => { const req = indexedDB.open('taspe7_app'); req.onsuccess = () => resolve(req.result); });
    await new Promise(resolve => {
      const tx = db.transaction('bible_store', 'readwrite');
      tx.objectStore('bible_store').put([{ _id: 'old', title: 'Lazy hymn', party: ['all'], scale: 'C', relatedChords: 'C G', BPM: 120, timeSignature: '4/4',
        lyrics: [{ _id: 'stanza', type: 'verse', title: '1', text: '[C] First line\nSecond line', slideMode: 'manual', slideBreaks: [1] }], usageCount: 1 }], 'taspe7_hymns_json');
      tx.oncomplete = resolve;
    }); db.close();
  });
  return { context, page };
}

test('Hymns defers reader/editor/lyrics/presentation chunks until requested and editing still saves', async () => {
  let saved;
  const { context, page } = await featurePage(async route => {
    if (route.request().method() === 'PATCH' && new URL(route.request().url()).pathname.endsWith('/hymns/old')) {
      saved = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); return true;
    }
    return false;
  });
  const requested = new Set();
  const chunks = ['hymn-editor', 'hymn-lyrics', 'hymn-presentation', 'bible-reader'].map(featureChunks);
  const loaded = group => [...group].some(file => requested.has(file));
  page.on('request', request => { if (request.resourceType() === 'script') requested.add(path.basename(new URL(request.url()).pathname)); });
  try {
    assert.ok(chunks.every(group => group.size > 0));
    await openHymns(page); await controlled(page); await page.getByText('Lazy hymn', { exact: true }).waitFor();
    assert.ok(chunks.every(group => !loaded(group)));
    await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
    const lyrics = page.locator('[data-feature="hymn-lyrics"]');
    await lyrics.getByText('First line', { exact: false }).first().waitFor();
    assert.equal(loaded(chunks[1]), true); assert.equal(loaded(chunks[0]), false);
    await lyrics.locator('button').filter({ has: page.locator('svg.lucide-x') }).first().click();
    await page.getByRole('button', { name: 'Edit Song', exact: true }).click();
    const editor = page.locator('[data-feature="hymn-editor"]');
    await editor.getByPlaceholder('e.g. Amazing Grace').fill('Updated lazy hymn');
    await editor.getByRole('button', { name: 'Update Song', exact: true }).click();
    await page.getByText('Updated lazy hymn', { exact: true }).waitFor();
    assert.equal(saved.title, 'Updated lazy hymn'); assert.equal(saved.lyrics[0].text, '[C] First line\nSecond line');
    assert.equal(loaded(chunks[0]), true); assert.equal(loaded(chunks[2]), false);
    await page.locator('#tour-presentation-desktop').click(); await page.locator('#showDataContainer').waitFor();
    assert.equal(loaded(chunks[2]), true);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await taps(page, ['/bible_form']); await page.waitForURL(base + '/bible_form/');
    await page.locator('[data-feature="bible-reader"]').getByText('Verse', { exact: true }).first().waitFor();
    assert.equal(loaded(chunks[3]), true);
  } finally { await context.close(); }
});

test('a presentation can be dismissed while its chunk loads and reopened afterward', async () => {
  const { context, page } = await featurePage();
  const files = featureChunks('hymn-presentation');
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/_next/static/chunks/*.js', async route => {
    if (files.has(path.basename(new URL(route.request().url()).pathname))) await pending;
    return route.continue().catch(() => {});
  });
  try {
    await openHymns(page); await controlled(page); await page.locator('#tour-presentation-desktop').click();
    await page.getByText('Loading presentation…', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click(); release();
    await page.waitForTimeout(200); assert.equal(await page.locator('#showDataContainer').count(), 0);
    await page.locator('#tour-presentation-desktop').click(); await page.locator('#showDataContainer').waitFor();
  } finally { release(); await context.close(); }
});

test('a failed feature chunk stays dismissible and offers an explicit reload to recover', async () => {
  const { context, page } = await featurePage();
  const files = featureChunks('hymn-lyrics'); let fail = true;
  await page.route('**/_next/static/chunks/*.js', route => {
    if (fail && files.has(path.basename(new URL(route.request().url()).pathname))) return route.abort();
    return route.continue();
  });
  try {
    await openHymns(page); await controlled(page);
    const session = await page.evaluate(() => window.__navigationSession);
    await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
    await page.getByRole('alert').getByText('Unable to open lyrics.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__navigationSession), session);
    await page.getByText('Lazy hymn', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
    await page.getByRole('alert').waitFor();
    fail = false;
    await page.getByRole('button', { name: 'Reload app', exact: true }).click();
    await page.waitForFunction(previous => window.__navigationSession !== previous, session);
    await page.getByRole('button', { name: 'Lyrics', exact: true }).click();
    await page.locator('[data-feature="hymn-lyrics"]').getByText('First line', { exact: false }).first().waitFor();
  } finally { await context.close(); }
});

test('deferred metronome unlocks audio on the first tap, plays once loaded and cleans up on navigation', async () => {
  let serverVersion = 1;
  const { context, page } = await featurePage(async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/hymns/version')) { await route.fulfill({ json: { version: serverVersion } }); return true; }
    if (pathname.endsWith('/hymns/changes')) {
      await route.fulfill({ json: { currentVersion: 2, deleted: [], updated: [{ _id: 'old', title: 'Live updated hymn', lyrics: [], party: ['all'], BPM: 120, timeSignature: '4/4', usageCount: 1 }] } });
      return true;
    }
    return false;
  });
  await page.addInitScript(() => {
    window.__metronomeAudio = [];
    window.AudioContext = class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; window.__metronomeAudio.push({ type: 'create', active: navigator.userActivation.isActive }); }
      resume() { this.state = 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; window.__metronomeAudio.push({ type: 'suspend' }); return Promise.resolve(); }
      close() { this.state = 'closed'; window.__metronomeAudio.push({ type: 'close' }); return Promise.resolve(); }
      createOscillator() { const context = this; return { frequency: { value: 0 }, connect() {}, start() { window.__metronomeAudio.push({ type: 'tick', state: context.state }); }, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    };
  });
  const files = featureChunks('metronome-start'); let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/_next/static/chunks/*.js', async route => {
    if (files.has(path.basename(new URL(route.request().url()).pathname))) await pending;
    return route.continue().catch(() => {});
  });
  try {
    await openHymns(page); await controlled(page);
    await page.getByRole('button', { name: 'Vocal', exact: true }).click();
    await page.getByRole('button', { name: 'Musician Mode', exact: true }).click();
    await page.getByRole('button', { name: 'Play Metronome (120 BPM)', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__metronomeAudio), [{ type: 'create', active: true }]);
    await page.getByRole('button', { name: 'Cancel Metronome', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__metronomeAudio.filter(event => event.type === 'close').length), 1);
    await page.getByRole('button', { name: 'Play Metronome (120 BPM)', exact: true }).click();
    release();
    await page.getByRole('button', { name: 'Stop Metronome', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => window.__metronomeAudio.some(event => event.type === 'tick')));
    assert.ok(await page.evaluate(() => window.__metronomeAudio.filter(event => event.type === 'tick').every(event => event.state === 'running')));
    serverVersion = 2;
    await page.evaluate(() => { const channel = new BroadcastChannel('taspe7_sync'); channel.postMessage({ type: 'force_sync' }); channel.close(); });
    await page.getByText('Live updated hymn', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__metronomeAudio.filter(event => event.type === 'close').length), 1, 'A background update must not unmount the playing metronome');
    await page.getByRole('button', { name: 'Stop Metronome', exact: true }).click();
    assert.ok(await page.evaluate(() => window.__metronomeAudio.some(event => event.type === 'suspend')));
    await taps(page, ['/friends']); await page.waitForURL(base + '/friends/');
    await page.waitForFunction(() => window.__metronomeAudio.filter(event => event.type === 'close').length === 2);
  } finally { release(); await context.close(); }
});

test('the full offline hymn library stays virtualized and navigation works during a pending local search', async t => {
  const { context, page } = await setup({ electron: true, api: bibleApi([]) });
  const hymns = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/hymns.json'), 'utf8'));
  hymns.push({ _id: 'step6-target', title: 'Step six unique hymn', lyrics: [{ text: 'Step six unique words' }], party: ['all'], usageCount: 0 });
  try {
    await page.evaluate(async hymns => {
      const db = await new Promise(resolve => { const req = indexedDB.open('taspe7_app'); req.onsuccess = () => resolve(req.result); });
      await new Promise(resolve => { const tx = db.transaction('bible_store', 'readwrite'); tx.objectStore('bible_store').put(hymns, 'taspe7_hymns_json'); tx.oncomplete = resolve; });
      db.close();
    }, hymns);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false });
      window.__workWaiters = []; window.__workYields = 0;
      const original = scheduler.yield.bind(scheduler);
      scheduler.yield = () => {
        window.__workYields++;
        return window.__holdWorkYields ? new Promise(resolve => window.__workWaiters.push(resolve)) : original();
      };
    });
    await openHymns(page); await controlled(page);
    await page.locator('[data-item-index="0"]').waitFor();
    const initialCount = await page.locator('[data-item-index]').count();
    assert.ok(initialCount > 0 && initialCount < 100);
    for (let i = 0; i < 4 && !await page.getByText('Step six unique hymn', { exact: true }).count(); i++) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(100);
    }
    await page.getByText('Step six unique hymn', { exact: true }).waitFor();
    assert.ok(await page.locator('[data-item-index]').count() < 100);
    await page.locator('#tour-search-btn').click();
    await page.getByRole('textbox').fill('Step six unique hymn');
    await page.waitForFunction(() => document.querySelectorAll('[data-item-index]').length === 1);
    await page.getByText('Step six unique hymn', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => window.__workYields > 0));
    await page.evaluate(() => { window.__holdWorkYields = true; });
    await page.getByRole('textbox').fill('Another uncached search');
    await page.waitForFunction(() => window.__workWaiters.length > 0);
    const session = await page.evaluate(() => window.__navigationSession);
    await taps(page, ['/friends']); await page.waitForURL(base + '/friends/');
    await page.getByRole('heading', { name: 'Friends', exact: true }).waitFor();
    await page.evaluate(() => { window.__holdWorkYields = false; window.__workWaiters.splice(0).forEach(resolve => resolve()); });
    assert.equal(await page.evaluate(() => window.__navigationSession), session);
    t.diagnostic(`${hymns.length} offline hymns: ${initialCount} initial mounted rows; the last hymn is reachable and tab navigation completes while search is pending.`);
  } finally { await context.close(); }
});
