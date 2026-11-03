/* eslint-disable @typescript-eslint/no-require-imports -- Node test and benchmark entry points use CommonJS. */
const { chromium, webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../out');
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/version.json'))).version;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
let server, base;
const browsers = {};

async function start(engines = ['chromium', 'webkit']) {
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
  for (const engine of engines) browsers[engine] = await ({ chromium, webkit }[engine]).launch();
}
async function stop() {
  await Promise.all(Object.values(browsers).map(browser => browser.close()));
  if (server) await new Promise(resolve => server.close(resolve));
}

async function setup(t, engine, { href = '/', platform = 'ios', authenticated = true, profile = {}, deferIdle = false } = {}) {
  const context = await browsers[engine].newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  if (deferIdle) await page.addInitScript(() => {
    // Hold idle warming to exercise a genuinely cold neighboring page.
    window.requestIdleCallback = () => 1;
    window.cancelIdleCallback = () => {};
  });
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
    return route.fulfill({ headers, json: { user: { _id: 'tester', Name: 'iOS Tester', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [], ...profile }, inbox: [], updates: [], friends: [], incoming: [], outgoing: [], items: [], accounts: [] } });
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


module.exports = { start, stop, setup, getBase: () => base };
