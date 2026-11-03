// Run after npm run build: node --test tests/primary-tab-swipe.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/version.json'))).version;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
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
    if (url.includes('/bible/translations')) return route.fulfill({ json: ['AVD'], headers });
    if (url.includes('/bible/')) return route.fulfill({ json: [], headers });
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

async function touch(page, type, x, y = 350, { edge = false, cancel = false, selector } = {}) {
  return page.evaluate(({ type, x, y, edge, cancel, selector }) => {
    if (type === 'touchstart') window.__dragTarget = selector ? document.querySelector(selector) : edge ? document.elementFromPoint(x, y) : document.querySelector('[data-tab-active="true"]');
    const target = window.__dragTarget;
    const point = { identifier: 10, clientX: x, clientY: y, target };
    const event = new Event(cancel ? 'touchcancel' : type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [point] }, changedTouches: { value: [point] } });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, x, y, edge, cancel, selector });
}
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const panel = (page, href) => page.locator(`[data-tab-panel="${href}"]`);
async function drag(page, from, to, { cancel = false } = {}) {
  await touch(page, 'touchstart', from);
  await touch(page, 'touchmove', to);
  await frame(page);
  await touch(page, 'touchend', to, 350, { cancel });
}

for (const engine of ['webkit', 'chromium']) {
  test(`${engine}: a held drag reveals the real Profile page proportionally, then commits without reloading`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/friends/' });
    await panel(page, '/friends').locator('[data-page-skeleton]').waitFor({ state: 'detached' });
    const documentId = await page.evaluate(() => window.__documentId);
    await touch(page, 'touchstart', 280);
    await touch(page, 'touchmove', 200);
    await panel(page, '/normal_UserProfile').getByText('iOS Tester', { exact: true }).waitFor();
    await frame(page);
    const first = await panel(page, '/normal_UserProfile').evaluate(node => node.getBoundingClientRect().left);
    assert.ok(first > 200 && first < 340, `partial page at ${first}`);
    assert.equal(new URL(page.url()).pathname, '/friends/');
    assert.equal(await panel(page, '/normal_UserProfile').getAttribute('inert'), '');
    await panel(page, '/normal_UserProfile').evaluate(node => { node.__previewProof = 'same-page'; });
    await touch(page, 'touchmove', 100); await frame(page);
    const second = await panel(page, '/normal_UserProfile').evaluate(node => node.getBoundingClientRect().left);
    assert.ok(Math.abs(first - second - 100) < 3, `${first} -> ${second} must track the finger`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'swiping must not create horizontal document scrolling');
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `wasla-held-swipe-${engine}.png`) });
    await touch(page, 'touchend', 60);
    await page.waitForURL(base + '/normal_UserProfile/');
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await panel(page, '/normal_UserProfile').getAttribute('data-tab-active'), 'true');
    assert.equal(await panel(page, '/normal_UserProfile').evaluate(node => node.__previewProof), 'same-page', 'the revealed page must stay mounted when navigation commits');
    assert.equal(await page.locator('[data-tab-panel]').count(), 1);
    assert.equal(await page.evaluate(() => window.__documentId), documentId);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: cancelled and short drags keep the current page and draft`, async t => {
    const { page, errors } = await setup(t, engine);
    const draft = page.locator('textarea').first(); await draft.fill('Do not lose this prayer'); await draft.blur();
    await drag(page, 270, 180, { cancel: true });
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await draft.inputValue(), 'Do not lose this prayer');
    // Slow enough that this is a short drag, not a deliberate flick.
    await touch(page, 'touchstart', 250); await touch(page, 'touchmove', 225); await frame(page);
    await touch(page, 'touchend', 225);
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await draft.inputValue(), 'Do not lose this prayer');
    assert.equal(await page.locator('[data-tab-panel]').count(), 1);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: Profile setting defaults on, persists off, and leaves edge Back enabled`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/normal_UserProfile/' });
    const toggle = page.getByRole('switch', { name: 'Swipe between pages', exact: true });
    await toggle.waitFor(); assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `wasla-swipe-setting-${engine}.png`) });
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await page.reload(); await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await drag(page, 100, 280);
    assert.equal(new URL(page.url()).pathname, '/normal_UserProfile/');
    assert.equal(await page.locator('[data-tab-panel]').count(), 1);
    // Native iOS edge Back must remain independent of the interior-swipe option.
    await touch(page, 'touchstart', 8, 400, { edge: true });
    await touch(page, 'touchmove', 75, 400); await touch(page, 'touchend', 150, 400);
    await page.waitForURL(base + '/');
    await page.getByRole('link', { name: 'Profile', exact: true }).click();
    await page.waitForURL(base + '/normal_UserProfile/');
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await drag(page, 100, 300); await page.waitForURL(base + '/friends/');
    assert.deepEqual(errors, []);
  });

  test(`${engine}: vertical scrolling, inputs, horizontal galleries and tab boundaries do not start a page drag`, async t => {
    const { page, errors } = await setup(t, engine);
    const root = page.locator('[data-tab-pager]');
    await touch(page, 'touchstart', 160, 400); await touch(page, 'touchmove', 165, 200); await touch(page, 'touchend', 165, 150);
    assert.equal(await root.getAttribute('data-swiping'), null);
    await drag(page, 150, 300); // no previous tab before Pray
    assert.equal(await root.getAttribute('data-swiping'), null);
    await touch(page, 'touchstart', 180, 250, { selector: 'textarea' }); await touch(page, 'touchmove', 40, 250); await touch(page, 'touchend', 40, 250);
    await page.evaluate(() => {
      const div = document.createElement('div'); div.style.cssText = 'width:200px;overflow-x:auto';
      div.innerHTML = '<div id="horizontal-gallery" style="width:800px">Gallery</div>';
      document.querySelector('[data-tab-active="true"]').appendChild(div);
    });
    await touch(page, 'touchstart', 180, 300, { selector: '#horizontal-gallery' }); await touch(page, 'touchmove', 40, 300); await touch(page, 'touchend', 40, 300);
    assert.equal(await root.getAttribute('data-swiping'), null);
    assert.equal(new URL(page.url()).pathname, '/');
    assert.deepEqual(errors, []);
  });
}

test('trusted mobile drag follows the finger before navigating to the next tab', async t => {
  const { page, context, errors } = await setup(t, 'chromium', { href: '/friends/' });
  await panel(page, '/friends').locator('[data-page-skeleton]').waitFor({ state: 'detached' });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y: 180 }] });
  for (const x of [260, 230, 190, 140]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 180 }] });
  await frame(page);
  const left = await panel(page, '/normal_UserProfile').evaluate(node => node.getBoundingClientRect().left);
  assert.ok(left > 180 && left < 310, `neighbor follows held finger at ${left}`);
  assert.equal(new URL(page.url()).pathname, '/friends/');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForURL(base + '/normal_UserProfile/');
  assert.deepEqual(errors, []);
});

test('interior swipes traverse every bottom tab in both directions', async t => {
  const { page, errors } = await setup(t, 'chromium');
  await page.evaluate(() => localStorage.setItem('taspe7_category_hymns_tour_done', '1'));
  const hrefs = ['/pray', '/bible_form', '/hymns', '/friends', '/normal_UserProfile'];
  for (const href of hrefs.slice(1)) {
    await drag(page, 280, 70);
    await page.waitForURL(base + href + '/');
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await panel(page, href).getAttribute('data-tab-active'), 'true');
  }
  for (const href of hrefs.slice(0, -1).reverse()) {
    await drag(page, 90, 310);
    await page.waitForURL(base + href + '/');
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await panel(page, href).getAttribute('data-tab-active'), 'true');
  }
  assert.equal(await page.locator('[data-tab-panel]').count(), 1);
  assert.deepEqual(errors, []);
});

