// Run after `npm run build`: node --test tests/prayer-notification-opening.browser.cjs
// Set PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome instead of Playwright Chromium.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/version.json'))).version;
const contentTypes = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let browser, server, base;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__seed') { res.setHeader('Content-Type', 'text/html'); return res.end('<html></html>'); }
    let file = path.join(root, decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', contentTypes[path.extname(file)] || 'application/octet-stream');
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

const received = id => ({ _id: `received-${id}`, words: `Prayer ${id}`, date: new Date().toISOString(), sharedFrom: { username: 'friend', shareId: id, status: 'pending' } });
const sent = { _id: 'sent-789', words: 'Sent prayer', date: new Date().toISOString(), sharedWith: { username: 'friend', shareId: '789', status: 'sent' } };

async function seed(page, prayers) {
  await page.goto(base + '/__seed');
  await page.evaluate(async ({ prayers, version }) => {
    for (const [key, value] of Object.entries({ 'app-language': 'en', user_Taspe7_Token: 'test-token', user_Taspe7_ID: 'tester', user_Taspe7_Username: 'tester', wasla_splash_version: version, wasla_intro_last_time: String(Date.now()) })) localStorage.setItem(key, value);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('my_prays', 2);
      request.onupgradeneeded = () => request.result.createObjectStore('keyvaluepairs');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keyvaluepairs', 'readwrite');
      tx.objectStore('keyvaluepairs').put({ version: 1, recordings: {}, pendingWords: {}, guestPrays: prayers }, 'index');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { prayers, version });
}

test('native backup settings save intervals and manual progress continues after closing settings', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.backupCalls = [];
      window.backupStatus = { state: 'idle', progress: 0, intervalDays: 0 };
      window.CapacitorCustomPlatform = { name: 'ios' };
      window.Capacitor = {
        PluginHeaders: [{ name: 'PrayerBackup', methods: ['configure', 'getStatus', 'runNow', 'suspend', 'setOwner'].map(name => ({ name, rtype: 'promise' })) }],
        nativePromise: async (plugin, method, options) => {
          window.backupCalls.push({ method, options });
          if (method === 'configure') window.backupStatus = { ...window.backupStatus, ...options, nextBackupAt: Date.now() + options.intervalDays * 86400000 };
          if (method === 'runNow') window.backupStatus = { ...window.backupStatus, state: 'running', progress: 57 };
          return window.backupStatus;
        },
      };
    });
    await page.route('**/*', route => {
      if (route.request().url().startsWith(base)) return route.continue();
      if (route.request().url().includes('/backup/drive-accounts')) return route.fulfill({ json: { accounts: [{ email: 'drive@test', isDefault: true }] } });
      return route.fulfill({ json: { user: { username: 'tester', prayTime: [] }, inbox: [], updates: [], friends: [] } });
    });
    await seed(page, []); await page.goto(base + '/pray/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const select = page.getByRole('combobox', { name: 'Automatic backup' });
    await select.waitFor(); await page.getByText('drive@test', { exact: true }).waitFor();
    for (const days of [7, 14, 30]) {
      await select.selectOption(String(days));
      await page.waitForFunction(days => JSON.parse(localStorage.getItem('my_prays_schedule_tester') || '{}').intervalDays === days, days);
    }
    await page.getByRole('button', { name: 'Backup', exact: true }).click();
    await page.waitForFunction(() => window.backupCalls.some(call => call.method === 'runNow'));
    await page.getByText('57%', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await select.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.backupStatus.state), 'running');
    await page.evaluate(() => { window.backupStatus = { ...window.backupStatus, state: 'complete', progress: 100, lastSuccess: Date.now() }; });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByText('Backup completed', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('my_prays_schedule_tester')).email), 'drive@test');
  } finally { await context.close(); }
});

test('cached cards open while every backend request is stalled; further taps do not reload', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release;
  const stalled = new Promise(resolve => { release = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      if (route.request().url().startsWith(base)) return route.continue();
      if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.abort();
      await stalled;
      await route.fulfill({ json: {} }).catch(() => {});
    });
    await seed(page, [received('123'), received('456')]);
    const started = performance.now();
    await page.goto(base + '/pray/?notificationType=PRAY_SHARED&shareId=123', { waitUntil: 'domcontentloaded' });
    const card = page.locator('[data-prayer-id="received-123"]');
    await card.getByText('Prayer 123', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    t.diagnostic(`Cached document navigation and card opening: ${Math.round(performance.now() - started)} ms on this machine`);
    assert.equal(await page.getByText('Prayer 456', { exact: true }).count(), 0);
    assert.equal(await card.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(await card.evaluate(el => el === document.activeElement), false);
    const href = page.url();
    const warmStart = performance.now();
    const handled = await page.evaluate(() => !window.dispatchEvent(new CustomEvent('taspe7:open-prayer', {
      detail: { href: '/pray/?notificationType=PRAY_SHARED&shareId=456' }, cancelable: true,
    })));
    assert.equal(handled, true);
    await page.locator('[data-prayer-id="received-456"]').getByText('Prayer 456', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    t.diagnostic(`Already mounted page, tap to expanded card: ${Math.round(performance.now() - warmStart)} ms on this machine`);
    assert.equal(page.url(), href);
    await card.locator(':scope > div').first().click();
    await card.getByText('Prayer 123', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByText('Opening the prayer from your notification...', { exact: true }).count(), 0);
  } finally { release(); await context.close(); }
});

test('uncached prayers and replies appear before acknowledgement requests finish', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release;
  const stalled = new Promise(resolve => { release = resolve; });
  const acknowledged = [];
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (/\/(ack|sent-ack)$/.test(url)) {
        acknowledged.push(route.request().postDataJSON().shareId);
        await stalled;
        return route.fulfill({ json: {} }).catch(() => {});
      }
      const inbox = ['456', '123'].map(shareId => ({ shareId, words: `Prayer ${shareId}`, senderUsername: 'friend' }));
      const updates = [{ shareId: '789', responseWords: 'New reply', recipientUsername: 'friend' }];
      return route.fulfill({ json: { user: { username: 'tester', prayTime: [] }, friends: [], inbox, updates } });
    });
    await seed(page, [sent]);
    await page.goto(base + '/pray/?notificationType=PRAY_SHARED&shareId=123');
    await page.locator('[data-prayer-id="received-123"]').getByText('Prayer 123', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="received-456"]'));
    // The selected prayer is processed before earlier unrelated inbox entries.
    assert.equal(acknowledged.filter(id => id !== '789')[0], '123');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('taspe7:open-prayer', {
      detail: { href: '/pray/?notificationType=PRAY_CONFIRMED&shareId=789' }, cancelable: true,
    })));
    await page.locator('[data-prayer-id="sent-789"]').getByText('New reply', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  } finally { release(); await context.close(); }
});

async function seedFriends(page, cache) {
  await seed(page, []);
  await page.evaluate(async cache => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('taspe7_app', 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('bible_store')) request.result.createObjectStore('bible_store'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('bible_store', 'readwrite');
      tx.objectStore('bible_store').put({ ...cache, requestsSyncedAt: Date.now(), friendsSyncedAt: Date.now() }, 'friends_data_tester');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, cache);
}

test('friend notifications select the right cached section with a stalled backend and no warm-page reload', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release;
  const stalled = new Promise(resolve => { release = resolve; });
  const fetched = [];
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.abort();
      fetched.push(url); await stalled;
      return route.fulfill({ json: {} }).catch(() => {});
    });
    await seedFriends(page, { friends: [{ _id: 'alice', Name: 'Alice', username: 'alice' }],
      incomingRequests: [{ _id: 'request-bob', from: { _id: 'bob', Name: 'Bob', username: 'bob' } }], outgoingRequests: [] });
    await page.goto(base + '/friends/index.html?notificationType=FRIEND_REQUEST_ACCEPTED&actorId=alice', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-friend-id="alice"]').getByText('Alice', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await page.getByText('Loading connections...', { exact: true }).count(), 0);
    const href = page.url();
    const handled = await page.evaluate(() => !window.dispatchEvent(new CustomEvent('taspe7:open-friends', {
      detail: { href: '/friends/?notificationType=FRIEND_REQUEST_RECEIVED&actorId=bob' }, cancelable: true,
    })));
    assert.equal(handled, true);
    const row = page.locator('[data-friend-id="bob"]');
    await row.getByRole('button', { name: 'Accept', exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await row.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    assert.equal(page.url(), href);
    assert.ok(fetched.some(url => url.endsWith('/friend-requests')), 'Notification must bypass the fresh cache TTL');
  } finally { release(); await context.close(); }
});

test('a new incoming request appears before a slow friends-list response completes', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release;
  const stalled = new Promise(resolve => { release = resolve; });
  let requests = 0;
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.abort();
      if (url.endsWith('/users/friends')) { await stalled; return route.fulfill({ json: { friends: [] } }).catch(() => {}); }
      if (url.endsWith('/users/friend-requests')) {
        requests++;
        return route.fulfill({ json: { incoming: [{ from: { _id: requests === 1 ? 'new-friend' : 'later-friend', Name: 'New Friend', username: 'newfriend' } }], outgoing: [] } });
      }
      return route.fulfill({ json: { user: { username: 'tester' } } });
    });
    await seedFriends(page, { friends: [], incomingRequests: [], outgoingRequests: [] });
    // A push received while on another page invalidates this otherwise fresh cache.
    await page.evaluate(() => localStorage.setItem('taspe7_friends_dirty_tester', '1'));
    await page.goto(base + '/friends/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-friend-id="new-friend"]').getByText('New Friend', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await page.getByText('Loading connections...', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('taspe7_friends_dirty_tester')), '1');
    await page.evaluate(() => window.dispatchEvent(new Event('taspe7:friends-push')));
    await page.locator('[data-friend-id="later-friend"]').getByText('New Friend', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  } finally { release(); await context.close(); }
});

test('a late background response cannot restore a request that the user has already accepted', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alice = { _id: 'alice', Name: 'Alice', username: 'alice' };
  let release, firstStarted, secondStarted, accepted = false, count = 0;
  const first = new Promise(resolve => { firstStarted = resolve; });
  const second = new Promise(resolve => { secondStarted = resolve; });
  const stale = new Promise(resolve => { release = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (!['fetch', 'xhr'].includes(route.request().resourceType())) return route.abort();
      if (url.endsWith('/friend-request/accept/alice')) { accepted = true; return route.fulfill({ json: { success: true } }); }
      if (url.endsWith('/users/friend-requests')) {
        count++;
        if (count === 1) {
          firstStarted(); await stale;
          return route.fulfill({ json: { incoming: [{ from: alice }], outgoing: [] } }).catch(() => {});
        }
        secondStarted();
        return route.fulfill({ json: { incoming: accepted ? [] : [{ from: alice }], outgoing: [] } });
      }
      if (url.endsWith('/users/friends')) return route.fulfill({ json: { friends: accepted ? [alice] : [] } });
      return route.fulfill({ json: { user: { username: 'tester' } } });
    });
    await seedFriends(page, { friends: [], incomingRequests: [{ from: alice }], outgoingRequests: [] });
    await page.goto(base + '/friends/', { waitUntil: 'domcontentloaded' });
    await first;
    await page.locator('[data-friend-id="alice"]').getByRole('button', { name: 'Accept', exact: true }).click();
    await page.getByText('No pending incoming requests', { exact: true }).waitFor({ state: 'visible' });
    await page.evaluate(() => {
      window.requestRestored = false;
      new MutationObserver(() => { if (document.querySelector('[data-friend-id="alice"]')) window.requestRestored = true; })
        .observe(document.body, { childList: true, subtree: true });
    });
    release(); await second;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.requestRestored), false);
    await page.getByRole('button', { name: /My Friends/ }).click();
    await page.locator('[data-friend-id="alice"]').getByText('Alice', { exact: true }).waitFor({ state: 'visible' });
  } finally { release(); await context.close(); }
});
