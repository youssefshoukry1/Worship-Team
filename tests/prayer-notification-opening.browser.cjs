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
