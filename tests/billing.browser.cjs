// Run after npm run build: node --test tests/billing.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/version.json'))).version;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
let server, browser, base;
const catalog = { currency: 'EGP', supportEmail: 'support@example.test', testMode: true, freeDailyLimit: 7, providers: { paymob: false, apple: false, google: false },
  plans: [{ id: 'plus', title: 'Plus', dailyLimit: 11, webDays: 30, webPriceCents: null }, { id: 'pro', title: 'Pro', dailyLimit: 25, webDays: 30, webPriceCents: null }] };
const current = { plan: 'free', accountToken: 'uuid-fixture', unlimited: false, testAllowed: false };
const reference = '00000000-0000-4000-8000-000000000001';

before(async () => {
  server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
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
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function setup({ language = 'en', paid = false, signedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ language, version, signedIn }) => {
    const fields = { 'app-language': language, wasla_splash_version: version, wasla_intro_last_time: String(Date.now()), taspe7_theme: 'dark', taspe7_storage_migrated_v1: '1' };
    if (signedIn) Object.assign(fields, { user_Taspe7_Token: 'fixture-token', user_Taspe7_ID: 'tester', user_Taspe7_Username: 'tester', user_Taspe7_GlobalRole: 'USER' });
    Object.entries(fields).forEach(([key, value]) => localStorage.setItem(key, value));
  }, { language, version, signedIn });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    requests.push(url);
    if (url.includes('/billing/catalog')) return route.fulfill({ json: catalog });
    if (url.includes('/billing/status')) return route.fulfill({ json: current });
    if (url.includes('/billing/orders/')) return route.fulfill({ json: { reference, status: paid ? 'paid' : 'pending', plan: 'plus', accessExpiresAt: paid ? '2027-01-01T00:00:00Z' : null } });
    if (url.includes('/my-teams') || url.includes('/hymns') || url.includes('/bible/')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { user: { _id: 'tester', Name: 'Test User', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [] }, inbox: [], updates: [], accounts: [], friends: [], incoming: [], outgoing: [] } });
  });
  return { context, page, requests, errors };
}

for (const language of ['en', 'ar']) test(`mobile ${language} plans show correct limits with purchases disabled until configured`, async () => {
  const f = await setup({ language });
  try {
    await f.page.goto(`${base}/plans/`);
    await f.page.getByText(language === 'en' ? 'Coming soon' : 'قريباً', { exact: true }).first().waitFor();
    const text = await f.page.locator('main').innerText();
    for (const limit of ['7', '11', '25']) assert.ok(text.includes(limit));
    const buttons = f.page.getByRole('button', { name: language === 'en' ? 'Not available yet' : 'غير متاح حالياً', exact: true });
    assert.equal(await buttons.count(), 2);
    assert.equal(await buttons.first().isDisabled(), true);
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(f.requests.some(url => /\/checkout\/|\/native\//.test(url)), false);
    assert.deepEqual(f.errors, []);
    if (process.env.BILLING_SCREENSHOT_DIR) await f.page.screenshot({ path: path.join(process.env.BILLING_SCREENSHOT_DIR, `wasla-plans-${language}.png`), fullPage: true });
  } finally { await f.context.close(); }
});

test('redirect success flags never show paid access without server confirmation', async () => {
  const f = await setup();
  try {
    await f.page.goto(`${base}/billing/result/?order=${reference}&success=true`);
    await f.page.getByRole('button', { name: 'Check payment status' }).waitFor();
    assert.equal(await f.page.getByText('Your Plus plan is ready.', { exact: true }).count(), 0);
    assert.equal(await f.page.getByRole('link', { name: 'Open the Wasla app' }).count(), 0);
  } finally { await f.context.close(); }
});

test('verified paid return provides the account confirmation and app link', async () => {
  const f = await setup({ paid: true });
  try {
    await f.page.goto(`${base}/billing/result/?order=${reference}`);
    await f.page.getByRole('heading', { name: 'Your Plus plan is ready.' }).waitFor();
    assert.equal(await f.page.getByRole('link', { name: 'Open the Wasla app' }).getAttribute('href'), 'wasla://billing');
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});

test('subscription terms are public without signing in', async () => {
  const f = await setup({ signedIn: false });
  try {
    await f.page.goto(`${base}/subscription-terms/`);
    await f.page.getByRole('heading', { name: 'Subscription terms', exact: true }).waitFor();
    assert.deepEqual(f.errors, []);
  } finally { await f.context.close(); }
});
