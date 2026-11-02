// Run after npm run build: node --test tests/android-back.browser.cjs
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

before(async () => {
  server = http.createServer((req, res) => {
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
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function setup(t, { platform = 'android', href = '/', authenticated = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = { profileReads: 0, inboxReads: 0, sentReads: 0 };
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (url.includes('accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){}}}};' });
    if (url.includes('/my-teams') || url.includes('/hymns')) return route.fulfill({ json: [] });
    if (url.includes('/my-profile')) state.profileReads++;
    if (url.includes('/pray-time/inbox')) state.inboxReads++;
    if (url.includes('/pray-time/sent-updates')) state.sentReads++;
    return route.fulfill({ json: { user: { _id: 'tester', Name: 'Back Tester', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [] }, inbox: [], updates: [], friends: [], incoming: [], outgoing: [], items: [], accounts: [] } });
  });
  await page.goto(base + '/__seed');
  await page.evaluate(({ version, authenticated }) => {
    if (authenticated) for (const [key, value] of Object.entries({ Token: 'test-token', ID: 'tester', Username: 'tester', GlobalRole: 'USER' })) localStorage.setItem(`user_Taspe7_${key}`, value);
    localStorage.setItem('app-language', 'en'); localStorage.setItem('wasla_splash_version', version);
  }, { version, authenticated });
  await page.addInitScript(platform => {
    window.__documentId = Math.random();
    window.__nativeEvents = {};
    window.__backRegistrations = 0;
    window.__exits = 0;
    if (platform === 'web') return;
    window.CapacitorCustomPlatform = { name: platform };
    window.Capacitor = {
      PluginHeaders: [{ name: 'App', methods: [
        { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' },
        { name: 'exitApp', rtype: 'promise' }, { name: 'getLaunchUrl', rtype: 'promise' },
      ] }],
      nativeCallback(plugin, method, options, callback) {
        if (plugin === 'App' && method === 'addListener') {
          window.__nativeEvents[options.eventName] = callback;
          if (options.eventName === 'backButton') window.__backRegistrations++;
        }
        return `${plugin}:${options.eventName}`;
      },
      async nativePromise(plugin, method, options) {
        if (method === 'exitApp') window.__exits++;
        if (method === 'removeListener') delete window.__nativeEvents[options.eventName];
        return {};
      },
    };
  }, platform);
  const initialReads = authenticated && ['/', '/index.html', '/pray/', '/pray/index.html'].includes(href)
    ? Promise.all(['/my-profile', '/pray-time/inbox', '/pray-time/sent-updates'].map(suffix => page.waitForResponse(response => response.url().includes(suffix))))
    : Promise.resolve();
  await page.goto(base + href, { waitUntil: 'domcontentloaded' });
  if (platform === 'android') await page.waitForFunction(() => !!window.__nativeEvents.backButton);
  if (authenticated) await page.locator('nav[aria-label="Primary navigation"]').waitFor();
  else await page.getByRole('heading', { name: 'Sign in to Wasla' }).waitFor();
  await initialReads;
  return { page, state, errors };
}

const back = page => page.evaluate(() => window.__nativeEvents.backButton({ canGoBack: true }));

for (const href of ['/', '/index.html', '/pray/', '/pray/index.html']) {
  test(`${href}: refresh preserves the Home draft and document, then Back exits`, async t => {
    const { page, state, errors } = await setup(t, { href });
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('navigation-v2'));
    const draft = page.locator('textarea').first(); await draft.fill('Keep my unsaved prayer');
    await draft.blur();
    const reads = { ...state };
    const documentId = await page.evaluate(() => window.__documentId);
    const refreshed = Promise.all(['/my-profile', '/pray-time/inbox', '/pray-time/sent-updates'].map(suffix => page.waitForResponse(response => response.url().includes(suffix))));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await back(page); await refreshed;
    assert.ok(state.profileReads > reads.profileReads && state.inboxReads > reads.inboxReads && state.sentReads > reads.sentReads);
    assert.equal(await draft.inputValue(), 'Keep my unsaved prayer');
    assert.equal(await page.evaluate(() => window.__documentId), documentId);
    assert.equal(await page.evaluate(() => window.__exits), 0);
    await back(page);
    await page.waitForFunction(() => window.__exits === 1);
    assert.equal(await page.evaluate(() => window.__backRegistrations), 1);
    assert.deepEqual(errors, []);
  });
}

test('Back scrolls Home to the top before exit; a later interaction cancels exit', async t => {
  const { page, errors } = await setup(t);
  await page.locator('textarea').first().waitFor();
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await page.waitForFunction(() => scrollY > 8);
  await back(page);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.equal(await page.evaluate(() => window.__exits), 0);
  // A normal tap resets the sequence. Edge gestures are cancelled pointer streams.
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup')));
  await back(page);
  assert.equal(await page.evaluate(() => window.__exits), 0);
  await back(page); await page.waitForFunction(() => window.__exits === 1);
  assert.deepEqual(errors, []);
});

test('Back from Profile returns Home despite navigable history and keeps one native listener', async t => {
  const { page, errors } = await setup(t, { href: '/normal_UserProfile/' });
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('navigation-v2'));
  const documentId = await page.evaluate(() => window.__documentId);
  await back(page);
  await page.waitForURL(base + '/');
  await page.locator('textarea').first().waitFor();
  assert.equal(await page.evaluate(() => window.__exits), 0);
  assert.equal(await page.evaluate(() => window.__documentId), documentId);
  assert.equal(await page.evaluate(() => window.__backRegistrations), 1);
  await back(page); assert.equal(await page.evaluate(() => window.__exits), 0);
  await back(page); await page.waitForFunction(() => window.__exits === 1);
  assert.deepEqual(errors, []);
});

test('signed-out Back never opens a private Home route', async t => {
  const { page, state, errors } = await setup(t, { href: '/login/', authenticated: false });
  await back(page); await back(page); await page.waitForFunction(() => window.__exits === 1);
  assert.equal(new URL(page.url()).pathname, '/login/');
  assert.equal(state.profileReads, 0);
  assert.deepEqual(errors, []);
});

test('web does not install an Android Back handler', async t => {
  const { page, errors } = await setup(t, { platform: 'web' });
  assert.equal(await page.evaluate(() => window.__backRegistrations), 0);
  assert.deepEqual(errors, []);
});
