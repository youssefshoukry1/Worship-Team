// Run after npm run build: node --test tests/ios-back.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/version.json'))).version;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const gestureSource = fs.readFileSync(path.join(__dirname, '../src/app/utils/iosEdgeBack.js'), 'utf8').replace('export function', 'function');
let server, base;
const browsers = {};

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
  browsers.chromium = await chromium.launch();
  browsers.webkit = await webkit.launch();
});
after(async () => {
  await Promise.all(Object.values(browsers).map(browser => browser.close()));
  if (server) await new Promise(resolve => server.close(resolve));
});

async function setup(t, engine, { href = '/', platform = 'ios', authenticated = true } = {}) {
  const context = await browsers[engine].newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [], state = { profiles: 0, inbox: 0, sent: 0 };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base)) {
      // Keep API mocks interceptable in WebKit. Exported RSC remapping is
      // reproduced here; real worker routing has separate integration tests.
      const parsed = new URL(url);
      if (parsed.searchParams.has('_rsc') && !parsed.pathname.split('/').filter(Boolean).pop()?.includes('.')) {
        const payload = path.join(root, parsed.pathname, 'index.txt');
        return route.fulfill({ contentType: 'text/x-component', body: fs.readFileSync(payload) });
      }
      return route.continue();
    }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.includes('accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){}}}};' });
    if (url.includes('/my-teams') || url.includes('/hymns')) return route.fulfill({ json: [], headers });
    if (url.includes('/my-profile')) state.profiles++;
    if (url.includes('/pray-time/inbox')) state.inbox++;
    if (url.includes('/pray-time/sent-updates')) state.sent++;
    return route.fulfill({ headers, json: { user: { _id: 'tester', Name: 'iOS Tester', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [] }, inbox: [], updates: [], friends: [], incoming: [], outgoing: [], items: [], accounts: [] } });
  });
  await page.goto(base + '/__seed');
  await page.evaluate(({ authenticated, version }) => {
    if (authenticated) for (const [key, value] of Object.entries({ Token: 'test-token', ID: 'tester', Username: 'tester', GlobalRole: 'USER' })) localStorage.setItem(`user_Taspe7_${key}`, value);
    localStorage.setItem('app-language', 'en'); localStorage.setItem('wasla_splash_version', version);
  }, { authenticated, version });
  await page.addInitScript(platform => {
    window.__documentId = Math.random(); window.__refreshes = 0; window.__exits = 0;
    Object.defineProperty(navigator.serviceWorker, 'controller', { value: { scriptURL: '/sw.js?v=navigation-v2' } });
    window.addEventListener('taspe7:home-refresh', () => window.__refreshes++);
    if (platform === 'web') return;
    window.CapacitorCustomPlatform = { name: platform };
    window.Capacitor = {
      PluginHeaders: [{ name: 'App', methods: [{ name: 'exitApp', rtype: 'promise' }, { name: 'getLaunchUrl', rtype: 'promise' }] }],
      async nativePromise(plugin, method) { if (method === 'exitApp') window.__exits++; return {}; },
    };
  }, platform);
  const initialReads = authenticated && ['/', '/index.html', '/pray/', '/pray/index.html'].includes(href)
    ? Promise.all(['/my-profile', '/pray-time/inbox', '/pray-time/sent-updates'].map(suffix => page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes(suffix))))
    : Promise.resolve();
  await page.goto(base + href, { waitUntil: 'domcontentloaded' });
  if (authenticated) await page.locator('nav[aria-label="Primary navigation"]').waitFor();
  else await page.getByRole('heading', { name: 'Sign in to Wasla' }).waitFor();
  await initialReads;
  return { page, context, state, errors };
}

// WebKit automation exposes taps but not a finger-drag API. Dispatch TouchEvent
// payloads through the real document listeners; trusted drags are checked below
// separately with Chromium's mobile input compositor.
async function swipe(page, { right = false, x, y = 400, dx, dy = 0, selector, cancel = false, fingers = 1 } = {}) {
  return page.evaluate(({ right, x, y, dx, dy, selector, cancel, fingers }) => {
    x ??= right ? innerWidth - 8 : 8;
    dx ??= right ? -130 : 130;
    const target = selector ? document.querySelector(selector) : document.elementFromPoint(x, y);
    const send = (type, px, py) => {
      const touch = { identifier: 1, clientX: px, clientY: py, target };
      const active = type === 'touchend' || type === 'touchcancel' ? [] : [touch];
      if (fingers === 2 && active.length) active.push({ ...touch, identifier: 2, clientX: px + 15 });
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: active }, changedTouches: { value: [touch] } });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    send('touchstart', x, y);
    const prevented = send('touchmove', x + dx / 2, y + dy / 2);
    send(cancel ? 'touchcancel' : 'touchend', x + dx, y + dy);
    return prevented;
  }, { right, x, y, dx, dy, selector, cancel, fingers });
}

for (const engine of ['webkit', 'chromium']) {
  test(`${engine}: either edge returns Profile to Home without a document reload`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/normal_UserProfile/' });
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('navigation-v2'));
    const documentId = await page.evaluate(() => window.__documentId);
    await swipe(page); await page.waitForURL(base + '/');
    await page.getByRole('link', { name: 'Profile', exact: true }).click();
    await page.waitForURL(base + '/normal_UserProfile/');
    await swipe(page, { right: true }); await page.waitForURL(base + '/');
    assert.equal(await page.evaluate(() => window.__documentId), documentId);
    assert.equal(await page.evaluate(() => window.__exits), 0);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: Home scrolls up, then refreshes data once per swipe while preserving drafts`, async t => {
    const { page, state, errors } = await setup(t, engine);
    const draft = page.locator('textarea').first();
    await draft.fill('Keep this iOS prayer draft'); await draft.blur();
    const documentId = await page.evaluate(() => window.__documentId);
    // Declare a finger scroll before changing the position. The app deliberately
    // suppresses automatic movement while the just-dismissed keyboard settles.
    await swipe(page, { dx: 0, dy: -200 });
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForFunction(() => scrollY > 8);
    await swipe(page);
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.evaluate(() => window.__refreshes), 0);
    const before = { ...state };
    // A forced refresh can queue behind an existing read. Observe new requests
    // so an older in-flight response cannot satisfy this check prematurely.
    const responses = Promise.all(['/my-profile', '/pray-time/inbox', '/pray-time/sent-updates'].map(suffix =>
      page.waitForRequest(request => request.method() === 'GET' && request.url().includes(suffix)).then(request => request.response())));
    await swipe(page, { right: true }); await responses;
    assert.ok(state.profiles > before.profiles && state.inbox > before.inbox && state.sent > before.sent, JSON.stringify({ before, after: state }));
    await swipe(page);
    assert.equal(await page.evaluate(() => window.__refreshes), 2);
    assert.equal(await page.evaluate(() => window.__exits), 0);
    assert.equal(await draft.inputValue(), 'Keep this iOS prayer draft');
    assert.equal(await page.evaluate(() => window.__documentId), documentId);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: scrolling, controls, galleries, dialogs, and cancelled touches do not navigate`, async t => {
    const { page, errors } = await setup(t, engine);
    await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.innerHTML = '<input id="edge-input"><div id="gallery" style="width:100px;overflow-x:auto"><div id="gallery-content" style="width:600px">Photos</div></div><div data-edge-back="off" id="opt-out">Custom gesture</div>';
      document.body.appendChild(fixture);
    });
    for (const options of [
      { x: 190 }, { dx: -130 }, { dx: 5, dy: -180 },
      { fingers: 2 }, { selector: '#edge-input' },
      { selector: '#gallery-content' }, { selector: '#opt-out' },
    ]) assert.equal(await swipe(page, options), false, JSON.stringify(options));
    await swipe(page, { dx: 20 });
    await swipe(page, { cancel: true });
    await page.evaluate(() => { const dialog = document.createElement('div'); dialog.setAttribute('aria-modal', 'true'); document.body.appendChild(dialog); });
    assert.equal(await swipe(page), false);
    assert.equal(await page.evaluate(() => window.__refreshes), 0);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: web and signed-out iOS do not consume edge gestures`, async t => {
    for (const options of [{ platform: 'web' }, { href: '/login/', authenticated: false }]) {
      const { page, errors } = await setup(t, engine, options);
      assert.equal(await swipe(page), false);
      assert.equal(await page.evaluate(() => window.__refreshes), 0);
      assert.equal(await page.evaluate(() => window.__exits), 0);
      assert.deepEqual(errors, []);
    }
  });
}

test('trusted mobile finger drags: edge horizontal triggers Back, vertical and middle swipes scroll normally', async t => {
  const context = await browsers.chromium.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:3000px;background:#123}</style>');
  await page.addScriptTag({ content: gestureSource + ';window.__backs=0;window.__gestures=installIOSEdgeBack({onBack:()=>window.__backs++});' });
  const cdp = await context.newCDPSession(page);
  const drag = async (x, y, dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await drag(8, 400, 140, 0); assert.equal(await page.evaluate(() => window.__backs), 1);
  await drag(382, 400, -140, 0); assert.equal(await page.evaluate(() => window.__backs), 2);
  await drag(8, 650, 0, -200); await page.waitForFunction(() => scrollY > 50);
  const before = await page.evaluate(() => scrollY);
  await drag(190, 650, 0, -200); await page.waitForFunction(before => scrollY > before + 50, before);
  assert.equal(await page.evaluate(() => window.__backs), 2);
  await page.evaluate(() => window.__gestures.dispose());
  await drag(8, 400, 140, 0); assert.equal(await page.evaluate(() => window.__backs), 2);
});
