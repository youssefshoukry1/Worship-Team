// Run after npm run build: node --test tests/logout.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
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

const sessionKeys = ['Token', 'GlobalRole', 'SubRole', 'Role', 'ID', 'ChurchId', 'HymnIds', 'Status', 'Username', 'Teams', 'ProfilePhoto', 'Email'];

for (const engine of ['chromium', 'webkit']) {
  for (const desktop of [false, true]) {
    test(`${engine} ${desktop ? 'navbar' : 'profile'} logout renders sign-in without waiting for chunks or navigation`, async t => {
      const context = await browsers[engine].newContext({ viewport: desktop ? { width: 1280, height: 900 } : { width: 390, height: 844 }, serviceWorkers: 'block' });
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      t.after(async () => { release(); await context.close(); });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let loggingOut = false;
      await page.route('**/*', async route => {
        const url = route.request().url();
        if (url.startsWith(base)) {
          // Sign-in must already be usable even if route/chunk loading stalls.
          if (loggingOut && (url.includes('/_next/static/chunks/') || url.includes('/login/'))) await pending;
          return route.continue().catch(() => {});
        }
        if (url.includes('accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){}}}};' });
        if (url.includes('/my-teams')) return route.fulfill({ json: [] });
        return route.fulfill({ json: { user: { _id: 'tester', Name: 'Logout Tester', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [] }, friends: [], incoming: [], outgoing: [], items: [], accounts: [] } });
      });
      await page.goto(base + '/__seed');
      await page.evaluate(({ version, sessionKeys }) => {
        for (const key of sessionKeys) localStorage.setItem(`user_Taspe7_${key}`, 'old-value');
        for (const [key, value] of Object.entries({ 'app-language': 'en', user_Taspe7_Token: 'test-token', user_Taspe7_ID: 'tester', user_Taspe7_Username: 'tester', user_Taspe7_GlobalRole: 'USER', user_Taspe7_HymnIds: '[]', user_Taspe7_Teams: '[]', wasla_splash_version: version, taspe7_theme: 'dark' })) localStorage.setItem(key, value);
      }, { version, sessionKeys });
      await page.goto(base + '/normal_UserProfile/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Logout Tester', exact: true }).waitFor();
      const button = page.getByRole('button', { name: desktop ? 'Logout' : 'Log Out', exact: true });
      await button.scrollIntoViewIfNeeded();
      if (!desktop) assert.ok(await page.evaluate(() => scrollY > 0), 'reproduce logging out from the bottom of profile settings');
      await page.evaluate(() => {
        window.__logoutFrames = [];
        const sample = () => {
          if (!localStorage.getItem('user_Taspe7_Token')) window.__logoutFrames.push({
            auth: document.body.textContent.includes('Sign in to Wasla'),
            skeleton: !!document.querySelector('[data-startup-shell], [data-page-skeleton]'),
            nav: !!document.querySelector('nav'), scroll: scrollY,
            focusedInput: document.activeElement?.tagName === 'INPUT',
          });
          window.__logoutRaf = requestAnimationFrame(sample);
        };
        window.__logoutRaf = requestAnimationFrame(sample);
      });
      loggingOut = true;
      await button.click();
      await page.getByRole('heading', { name: 'Sign in to Wasla' }).waitFor({ timeout: 2000 });
      // A fast logout can finish before the first scheduled animation frame.
      // Sample the rendered state before focusing the email field below.
      await page.waitForFunction(() => window.__logoutFrames.length > 0);
      await page.getByPlaceholder('name@example.com').fill('next@example.com');
      await page.evaluate(() => document.activeElement.blur());
      const frames = await page.evaluate(() => { cancelAnimationFrame(window.__logoutRaf); return window.__logoutFrames; });
      assert.ok(frames.length > 0);
      assert.ok(frames.every(frame => frame.auth && !frame.skeleton && !frame.nav && frame.scroll === 0), JSON.stringify(frames));
      assert.equal(frames[0].focusedInput, false, 'logout must not open the keyboard automatically');
      assert.deepEqual(await page.evaluate(keys => keys.filter(key => localStorage.getItem(`user_Taspe7_${key}`) !== null), sessionKeys), []);
      assert.equal(await page.evaluate(() => localStorage.getItem('taspe7_theme')), 'dark');
      assert.equal(await page.evaluate(() => localStorage.getItem('app-language')), 'en');
      release();
      await page.waitForURL(base + '/login/');
      assert.equal(await page.getByPlaceholder('name@example.com').inputValue(), 'next@example.com', 'route completion must not remount the form and erase input');
      assert.deepEqual(errors, []);
    });
  }
}
