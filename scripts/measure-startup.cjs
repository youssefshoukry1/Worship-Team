// Build first. PLAYWRIGHT_CHANNEL=chrome node scripts/measure-startup.cjs <report.json>
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'))).version;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__seed') { res.setHeader('Content-Type', 'text/html'); return res.end('<html></html>'); }
    let file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const report = { environment: { browser: browser.version(), cpu: os.cpus()[0].model, viewport: '390x844', backend: 'all backend requests deliberately stalled', data: 'returning signed-in user; empty saved-prayer list', note: 'Fresh browser context per trial; localhost assets; 4x CPU simulates a slower CPU, not a phone. Native process/WebView startup is excluded.' }, definitions: { layout: 'First rendering opportunity with the Prayer layout present; the startup shell is public and inert.', editor: 'First rendering opportunity with the authenticated Prayer textarea present and not disabled.' }, profiles: [] };
    const scripts = [...new Set([...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]))];
    report.entryScripts = scripts.reduce((sum, src) => {
      const bytes = fs.readFileSync(path.join(root, src));
      return { bytes: sum.bytes + bytes.length, gzipBytes: sum.gzipBytes + zlib.gzipSync(bytes).length };
    }, { bytes: 0, gzipBytes: 0 });
    for (const cpuRate of [1, 4]) {
      const trials = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        let release; const pending = new Promise(resolve => { release = resolve; });
        try {
          await page.route('**/*', async route => {
            if (route.request().url().startsWith(base)) return route.continue();
            await pending; await route.abort().catch(() => {});
          });
          await page.goto(base + '/__seed');
          await page.evaluate(version => {
            for (const [key, value] of Object.entries({ user_Taspe7_Token: 'test-token', user_Taspe7_ID: 'tester', user_Taspe7_Username: 'tester', 'app-language': 'en', wasla_splash_version: version, taspe7_theme: 'dark' })) localStorage.setItem(key, value);
          }, version);
          await page.addInitScript(() => {
            window.__startupTimes = {};
            const sample = () => {
              const result = window.__startupTimes;
              const shell = document.querySelector('[data-startup-prayer]');
              if (!result.layout && ((shell && shell.getBoundingClientRect().height > 0) || document.querySelector('nav[aria-label="Primary navigation"]'))) result.layout = performance.now();
              if (!result.editor && document.querySelector('main textarea:not(:disabled)')) result.editor = performance.now();
              if (!result.editor) requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
          await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.__startupTimes.editor);
          trials.push(await page.evaluate(() => ({ ...window.__startupTimes, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime })));
        } finally { release(); await context.close(); }
      }
      report.profiles.push({ cpuRate, trials, medianLayoutMs: trials.map(t => t.layout).sort((a,b) => a-b)[1], medianEditorMs: trials.map(t => t.editor).sort((a,b) => a-b)[1] });
    }
    const output = path.resolve(process.argv[2] || path.join(__dirname, '../performance/startup.json'));
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
