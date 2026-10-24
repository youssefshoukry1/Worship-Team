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
const { zipSync, strToU8 } = require('fflate');
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

const mockPrayerApi = (route, base) => route.request().url().startsWith(base) ? route.continue()
  : route.fulfill({ json: { user: { username: 'tester', prayTime: [] }, inbox: [], updates: [], friends: [] } });
const personalPrayers = count => Array.from({ length: count }, (_, i) => ({ _id: 'personal-' + i, words: 'Personal prayer ' + i, date: '2026-10-01T00:00:00.000Z' }));

test('Drive restore keeps friend history read and replied across repeat restore, inbox replay and reload', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let restores = 0; const outboundMutations = [];
  const historical = { ...received('history'), _id: 'legacy-history', date: '2026-10-01T10:00:00.000Z',
    sharedFrom: { username: 'friend', shareId: 'history', status: 'confirmed', responseWords: 'Already replied', respondedAt: '2026-10-02T10:00:00.000Z', seenActivityBy: { tester: 'prayer:history' } } };
  const legacy = { ...received('legacy'), date: '2026-10-01T09:00:00.000Z' };
  const archivedUnread = { ...received('archived-unread'), date: '2026-10-01T08:00:00.000Z', sharedFrom: { username: 'friend', shareId: 'archived-unread', status: 'pending', seenActivityBy: {} } };
  const bytes = Buffer.from(zipSync({ 'prays.json': strToU8(JSON.stringify({ version: 1, type: 'my-prays-backup', prays: [historical, legacy, archivedUnread] })) }));
  try {
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (request.url().startsWith(base)) return route.continue();
      if (request.method() === 'POST' && /\/(share|confirm-share)$/.test(url.pathname)) outboundMutations.push(url.pathname);
      if (url.pathname.endsWith('/backup/drive-accounts')) return route.fulfill({ json: { accounts: [{ email: 'drive@test', isDefault: true }] } });
      if (url.pathname.endsWith('/backup/drive-token')) return route.fulfill({ json: { access_token: 'mock-drive-token' } });
      if (url.hostname === 'www.googleapis.com') {
        if (url.searchParams.get('alt') === 'media') { restores++; return route.fulfill({ contentType: 'application/zip', body: bytes }); }
        return route.fulfill({ json: { files: [{ id: url.searchParams.get('q').includes('application/vnd.google-apps.folder') ? 'folder' : 'backup' }] } });
      }
      if (url.pathname.endsWith('/pray-time/inbox') && restores) return route.fulfill({ json: { inbox: [{ shareId: 'history', words: 'Prayer history', senderUsername: 'friend', date: historical.date }], deletedShareIds: [] } });
      return mockPrayerApi(route, base);
    });
    await seed(page, [received('history'), received('truly-new')]);
    await page.goto(base + '/pray/');
    const restore = async () => {
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'My Prays Backup' });
      await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
      await dialog.getByText('Restored 0 recording(s) across 3 prayer(s).', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
    };
    await restore();
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    const history = page.locator('[data-prayer-id="received-history"]');
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="received-history"]')?.dataset.prayerUnread === 'false');
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="received-legacy"]')?.dataset.prayerUnread === 'false');
    assert.equal(await page.locator('[data-prayer-id="received-truly-new"]').getAttribute('data-prayer-unread'), 'true');
    await history.getByText('@friend', { exact: true }).click();
    await history.getByText('Already replied', { exact: true }).waitFor();
    assert.equal(await history.getByRole('textbox').count(), 0); assert.equal(await page.locator('[data-prayer-id="legacy-history"]').count(), 0);
    await restore();
    await page.evaluate(() => window.dispatchEvent(new Event('taspe7:prayer-push')));
    await page.reload();
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    await history.waitFor();
    assert.equal(await history.getAttribute('data-prayer-unread'), 'false');
    assert.equal(await page.locator('[data-prayer-id="received-legacy"]').getAttribute('data-prayer-unread'), 'false');
    assert.equal(await page.locator('[data-prayer-id="received-truly-new"]').getAttribute('data-prayer-unread'), 'true');
    assert.equal(await page.locator('[data-prayer-id="received-archived-unread"]').getAttribute('data-prayer-unread'), 'false');
    assert.equal(await page.locator('[data-prayer-id]').count(), 4);
    assert.deepEqual(outboundMutations, [], 'restoring history never sends or replies to friends');
    assert.equal(restores, 2); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('optimistic sends show a clock before acknowledgement and resume the same action after reload on a throttled CPU', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release; const pending = new Promise(resolve => { release = resolve; });
  const bodies = [];
  try {
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.endsWith('/pray-time/share')) {
        bodies.push(route.request().postDataJSON()); await pending;
        return route.fulfill({ json: { success: true, shareId: 'new-share', date: new Date().toISOString() } }).catch(() => {});
      }
      if (url.endsWith('/users/friends')) return route.fulfill({ json: { friends: [{ _id: 'friend', username: 'friend' }] } });
      return mockPrayerApi(route, base);
    });
    await seed(page, []);
    const cpu = await context.newCDPSession(page); await cpu.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.goto(base + '/pray/');
    await page.getByRole('button', { name: 'Share with friend...', exact: true }).click();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('textbox').first().fill('Immediate prayer');
    const started = performance.now();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.locator('[data-prayer-id]').filter({ hasText: 'Sending' });
    await card.getByRole('status').waitFor();
    await card.screenshot({ path: path.join(require('node:os').tmpdir(), 'wasla-prayer-pending.png') });
    t.diagnostic(`Pending card at 6x CPU throttling: ${Math.round(performance.now() - started)} ms; server response still held`);
    assert.equal(await page.getByRole('textbox').first().inputValue(), '');
    assert.equal(await card.locator('time').count(), 1);
    assert.equal(await card.getByRole('button', { name: 'Delete Note', exact: true }).count(), 0);
    await page.waitForRequest(request => request.url().endsWith('/pray-time/share'), { timeout: 5000 }).catch(() => assert.ok(bodies.length));
    const id = await card.getAttribute('data-prayer-id');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    const restored = page.locator(`[data-prayer-id="${id}"]`);
    await restored.getByText('Sending', { exact: true }).waitFor();
    await restored.getByText('You:', { exact: true }).click();
    await restored.getByText('Immediate prayer', { exact: true }).waitFor();
    release();
    await restored.getByRole('status').waitFor({ state: 'detached' });
    await restored.getByRole('button', { name: 'Delete Note', exact: true }).waitFor();
    assert.ok(bodies.length >= 2); assert.equal(new Set(bodies.map(body => body.requestId)).size, 1);
    assert.equal(await page.locator('[data-prayer-id]').count(), 1); assert.deepEqual(errors, []);
  } finally { release(); await context.close(); }
});

test('resumed audio sends encode saved clips without losing their section or making a second card', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let posted;
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      if (route.request().url().endsWith('/pray-time/share')) {
        posted = route.request().postDataJSON();
        return route.fulfill({ json: { success: true, shareId: 'audio-share', date: new Date().toISOString() } });
      }
      return mockPrayerApi(route, base);
    });
    await seed(page, [{ _id: 'local-audio', words: 'Audio prayer', date: new Date().toISOString(), prayType: 'general',
      sharedWith: { username: 'friend', userId: 'friend', status: 'sent', shareId: null },
      _sync: { kind: 'send', ownerId: 'tester', requestId: '12345678-1234-4234-8234-123456789abc', state: 'pending', audioCount: 1 } }]);
    await page.evaluate(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open('my_prays', 2); request.onsuccess = () => resolve(request.result); });
      const index = await new Promise(resolve => { const request = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get('index'); request.onsuccess = () => resolve(request.result); });
      index.recordings['local-audio'] = [{ id: 'audio-clip', blockType: 'general', sectionIndex: 0, mimeType: 'audio/webm', ext: 'webm', duration: 2 }];
      await new Promise(resolve => { const tx = db.transaction('keyvaluepairs', 'readwrite'), store = tx.objectStore('keyvaluepairs'); store.put(index, 'index'); store.put(new Blob(['audio bytes'], { type: 'audio/webm' }), 'audio_audio-clip'); tx.oncomplete = resolve; });
      db.close();
    });
    await page.goto(base + '/pray/');
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    const card = page.locator('[data-prayer-id="local-audio"]');
    await card.getByRole('button', { name: 'Delete Note', exact: true }).waitFor();
    assert.equal(posted.recordings[0].data, Buffer.from('audio bytes').toString('base64'));
    assert.equal(posted.recordings[0].sectionIndex, 0); assert.equal(posted.recordings[0].id, 'audio-clip');
    assert.equal(await page.locator('[data-prayer-id]').count(), 1);
  } finally { await context.close(); }
});

test('optimistic replies appear immediately, retain failed text, and offer a compact Retry', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release; const pending = new Promise(resolve => { release = resolve; }); const bodies = [];
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      if (route.request().url().endsWith('/confirm-share')) {
        bodies.push(route.request().postDataJSON());
        if (bodies.length === 1) { await pending; return route.fulfill({ status: 503, json: { msg: 'Offline' } }); }
        return route.fulfill({ json: { success: true, respondedAt: new Date().toISOString() } });
      }
      return mockPrayerApi(route, base);
    });
    await seed(page, [received('reply')]);
    await page.goto(base + '/pray/?notificationType=PRAY_SHARED&shareId=reply');
    const card = page.locator('[data-prayer-id="received-reply"]');
    await card.getByRole('textbox').fill('Keep this reply');
    await card.getByRole('button', { name: 'Send reply', exact: true }).click();
    await card.getByText('Keep this reply', { exact: true }).waitFor();
    await card.getByText('Sending', { exact: true }).waitFor();
    assert.equal(await card.getByRole('textbox').count(), 0);
    release(); await card.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal(await card.getByText('Keep this reply', { exact: true }).count(), 1);
    await card.getByRole('button', { name: 'Retry', exact: true }).click();
    await card.getByRole('status').waitFor({ state: 'detached' });
    assert.equal(bodies.length, 2); assert.equal(bodies[0].requestId, bodies[1].requestId);
    assert.equal(await card.locator('time').count(), 1);
  } finally { release(); await context.close(); }
});

test('returning users see the Prayer layout before JavaScript loads, then receive the authenticated screen', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let release; const scriptsReady = new Promise(resolve => { release = resolve; });
  try {
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => mockPrayerApi(route, base));
    await seed(page, personalPrayers(1));
    await page.route('**/_next/static/chunks/*.js', async route => {
      await scriptsReady; await route.continue().catch(() => {});
    });
    await page.goto(base + '/', { waitUntil: 'commit' });
    const shell = page.locator('[data-startup-prayer]');
    await shell.waitFor({ state: 'visible' });
    assert.equal(await shell.getAttribute('inert'), '');
    assert.equal(await page.locator('[data-startup-loading]').isVisible(), false);
    assert.equal(await page.locator('textarea').count(), 0, 'The public shell must not contain an editable draft');
    assert.equal(await page.getByText('Personal prayer 0', { exact: true }).count(), 0, 'Private data remains behind authentication');
    const screenshot = path.join(require('node:os').tmpdir(), 'wasla-startup-shell.png');
    await page.screenshot({ path: screenshot });
    release();
    await page.getByRole('button', { name: 'Save Note', exact: true }).waitFor();
    await page.getByText('Personal prayer 0', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-startup-shell]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { release(); await context.close(); }
});

test('the startup layout never exposes Prayer for signed-out users while scripts are loading', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release; const scriptsReady = new Promise(resolve => { release = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    await page.route('**/_next/static/chunks/*.js', async route => {
      await scriptsReady; await route.continue().catch(() => {});
    });
    await page.goto(base + '/', { waitUntil: 'commit' });
    await page.getByRole('status', { name: 'Loading', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-startup-loading] img, [data-startup-loading] svg').count(), 0);
    assert.equal(await page.locator('[data-startup-prayer]').isVisible(), false);
    release();
    await page.locator('input[type="email"]').waitFor();
    assert.equal(await page.locator('nav[aria-label="Primary navigation"]').count(), 0);
  } finally { release(); await context.close(); }
});

test('app startup renders Prayer directly without an empty navigation shell or a second document navigation', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release; const pending = new Promise(resolve => { release = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      if (route.request().url().startsWith(base)) {
        // Expose the old redirect gap even on a fast desktop with local assets.
        if (new URL(route.request().url()).pathname.startsWith('/pray')) await new Promise(resolve => setTimeout(resolve, 250));
        return route.continue();
      }
      await pending;
      await route.fulfill({ json: { user: { username: 'tester', prayTime: [] }, inbox: [], updates: [], friends: [] } }).catch(() => {});
    });
    await seed(page, personalPrayers(1));
    await page.addInitScript(() => {
      window.__startup = { emptyShellFrames: Number(sessionStorage.getItem('startup_empty_frames') || 0), frames: 0, session: Math.random() };
      const sample = () => {
        window.__startup.frames++;
        if (document.querySelector('nav[aria-label="Primary navigation"]') && !document.querySelector('textarea')) {
          window.__startup.emptyShellFrames++;
          sessionStorage.setItem('startup_empty_frames', String(window.__startup.emptyShellFrames));
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const prayerDocumentRequests = [];
    page.on('request', request => {
      if (request.isNavigationRequest() && new URL(request.url()).pathname.startsWith('/pray')) prayerDocumentRequests.push(request.url());
    });
    // No service worker or warmed route cache: reproduce a cold app launch.
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Save Note', exact: true }).waitFor();
    await page.getByText('Personal prayer 0', { exact: true }).waitFor();
    const startup = await page.evaluate(() => window.__startup);
    t.diagnostic(`Startup frames with navigation but no Prayer composer: ${startup.emptyShellFrames}`);
    assert.equal(startup.emptyShellFrames, 0);
    assert.equal(new URL(page.url()).pathname, '/');
    assert.deepEqual(prayerDocumentRequests, []);
    const prayTab = page.locator('nav[aria-label="Primary navigation"] a').filter({ hasText: 'Pray' });
    assert.equal(await prayTab.getAttribute('aria-current'), 'page');
    await page.getByRole('textbox').first().fill('Keep this startup draft');
    await prayTab.click();
    await page.waitForTimeout(100);
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.getByRole('textbox').first().inputValue(), 'Keep this startup draft');
    assert.equal(await page.evaluate(() => window.__startup.session), startup.session);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Save Note', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__startup.emptyShellFrames), 0);
  } finally { release(); await context.close(); }
});

test('the native index.html entry keeps Prayer drafts and opens notification targets without reloading', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    await seed(page, [received('launch-target')]);
    await page.goto(base + '/index.html');
    await page.getByRole('button', { name: 'Save Note', exact: true }).waitFor();
    const draft = page.getByRole('textbox').first();
    await draft.fill('Native launch draft');
    await page.locator('nav[aria-label="Primary navigation"] a[aria-current="page"]').filter({ hasText: 'Pray' }).click();
    assert.equal(await draft.inputValue(), 'Native launch draft');
    const href = page.url();
    assert.equal(await page.evaluate(() => !window.dispatchEvent(new CustomEvent('taspe7:open-prayer', {
      detail: { href: '/pray/?notificationType=PRAY_SHARED&shareId=launch-target' }, cancelable: true,
    }))), true);
    await page.locator('[data-prayer-id="received-launch-target"]').getByRole('textbox').waitFor();
    assert.equal(page.url(), href);
    assert.equal(await draft.inputValue(), 'Native launch draft');
  } finally { await context.close(); }
});

test('the direct Prayer entry still requires sign-in before mounting the app', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    await page.goto(base + '/');
    await page.locator('input[type="email"]').waitFor();
    assert.equal(await page.locator('nav[aria-label="Primary navigation"]').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Save Note', exact: true }).count(), 0);
  } finally { await context.close(); }
});

test('large prayer lists defer offscreen controls while keyboard access, saving and deletion still work', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    page.on('dialog', dialog => dialog.accept());
    await seed(page, personalPrayers(200)); await page.goto(base + '/pray/');
    const first = page.locator('[data-prayer-id="personal-0"]');
    await first.getByText('Personal prayer 0', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-prayer-row]').count(), 200);
    assert.ok(await page.locator('[data-prayer-id]').count() < 30);
    await page.locator('[data-prayer-placeholder="personal-199"]').focus();
    await page.locator('[data-prayer-id="personal-199"]').getByText('Personal prayer 199', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit Note', exact: true }).count(), 0);
    await page.getByRole('textbox').first().fill('New prayer from the latest draft');
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    const created = page.locator('[data-prayer-id]').filter({ hasText: 'New prayer from the latest draft' });
    await created.waitFor();
    await created.getByRole('button', { name: 'Delete Note', exact: true }).click();
    await created.waitFor({ state: 'detached' });
    assert.equal(await first.getByRole('button', { name: 'Delete Note', exact: true }).count(), 0, 'older personal prayers cannot be deleted');
  } finally { await context.close(); }
});

test('personal prayer delete buttons expire one minute after saving and stay hidden after reload', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-10-24T11:59:00Z') });
    await page.clock.pauseAt(new Date('2026-10-24T12:00:00Z'));
    await page.route('**/*', route => mockPrayerApi(route, base));
    await seed(page, [
      { _id: 'fresh', words: 'Just saved personal prayer', date: '2026-10-24T12:00:00Z' },
      { _id: 'older', words: 'Older personal prayer', date: '2026-10-24T11:58:00Z' },
      received('shared-delete'),
    ]);
    await page.goto(base + '/pray/');
    const fresh = page.locator('[data-prayer-id="fresh"]');
    const older = page.locator('[data-prayer-id="older"]');
    await fresh.getByRole('button', { name: 'Delete Note', exact: true }).waitFor();
    assert.equal(await older.getByRole('button', { name: 'Delete Note', exact: true }).count(), 0);
    await page.clock.fastForward(59_999);
    assert.equal(await fresh.getByRole('button', { name: 'Delete Note', exact: true }).count(), 1);
    await page.clock.fastForward(1);
    await fresh.getByRole('button', { name: 'Delete Note', exact: true }).waitFor({ state: 'detached' });
    await page.reload();
    await fresh.getByText('Just saved personal prayer', { exact: true }).waitFor();
    assert.equal(await fresh.getByRole('button', { name: 'Delete Note', exact: true }).count(), 0);
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    const receivedCard = page.locator('[data-prayer-id="received-shared-delete"]');
    await receivedCard.waitFor();
    assert.equal(await receivedCard.getByRole('button', { name: 'Delete Note', exact: true }).count(), 0);
  } finally { await context.close(); }
});

test('sent prayer delete buttons expire after one minute; received prayers never show delete', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-10-24T11:59:00Z') });
    await page.clock.pauseAt(new Date('2026-10-24T12:00:00Z'));
    await page.route('**/*', route => mockPrayerApi(route, base));
    await seed(page, [{ ...sent, date: '2026-10-24T12:00:00Z' }, received('read-only')]);
    await page.goto(base + '/pray/');
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    const sentCard = page.locator('[data-prayer-id="sent-789"]');
    await sentCard.getByRole('button', { name: 'Delete Note', exact: true }).waitFor();
    assert.equal(await page.locator('[data-prayer-id="received-read-only"]').getByRole('button', { name: 'Delete Note', exact: true }).count(), 0);
    await page.clock.fastForward(59_999);
    assert.equal(await sentCard.getByRole('button', { name: 'Delete Note', exact: true }).count(), 1);
    await page.clock.fastForward(1);
    await sentCard.getByRole('button', { name: 'Delete Note', exact: true }).waitFor({ state: 'detached' });
    await page.reload();
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    await sentCard.waitFor();
    assert.equal(await sentCard.getByRole('button', { name: 'Delete Note', exact: true }).count(), 0);
  } finally { await context.close(); }
});

test('deleting a sent prayer removes both device copies after reconnect; failed requests keep both copies', async () => {
  const sender = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const receiver = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let deleted = false, attempts = 0;
  const deletedAt = new Date().toISOString();
  try {
    const senderPage = await sender.newPage(), receiverPage = await receiver.newPage();
    for (const [page, recipient] of [[senderPage, false], [receiverPage, true]]) {
      page.on('dialog', dialog => dialog.accept());
      await page.route('**/*', route => {
        const request = route.request();
        if (request.url().startsWith(base)) return route.continue();
        const url = new URL(request.url());
        if (url.pathname.endsWith('/pray-time/share/live') && request.method() === 'DELETE') {
          attempts++;
          if (attempts === 1) return route.fulfill({ json: { success: false, msg: 'Deletion not accepted' } });
          deleted = true;
          return route.fulfill({ json: { success: true, shareId: 'live' } });
        }
        if (url.pathname.endsWith('/pray-time/inbox')) return route.fulfill({ json: { inbox: [], deletedShareIds: recipient && deleted ? ['live'] : [], deletionCursor: recipient && deleted ? deletedAt : null } });
        return mockPrayerApi(route, base);
      });
      await seed(page, [recipient ? { ...received('live'), words: 'Shared private prayer' }
        : { ...sent, _id: 'sent-live', date: new Date().toISOString(), sharedWith: { ...sent.sharedWith, shareId: 'live' } }]);
      if (recipient) await page.evaluate(() => { localStorage.setItem('user_Taspe7_ID', 'friend'); localStorage.setItem('user_Taspe7_Username', 'friend'); });
      await page.goto(base + '/pray/');
      await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    }
    const sentCard = senderPage.locator('[data-prayer-id="sent-live"]');
    const receivedCard = receiverPage.locator('[data-prayer-id="received-live"]');
    assert.equal(await receivedCard.getByRole('button', { name: 'Delete Note', exact: true }).count(), 0);
    await receiver.setOffline(true);
    await sentCard.getByRole('button', { name: 'Delete Note', exact: true }).click();
    await sentCard.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal(deleted, false); assert.equal(await sentCard.count(), 1); assert.equal(await receivedCard.count(), 1);
    const acknowledged = senderPage.waitForResponse(response => response.url().endsWith('/pray-time/share/live') && response.request().method() === 'DELETE');
    await sentCard.getByRole('button', { name: 'Retry', exact: true }).click();
    await acknowledged;
    await sentCard.waitFor({ state: 'detached' });
    assert.equal(deleted, true); assert.equal(await receivedCard.count(), 1, 'an offline device reconciles on reconnect');
    await receiver.setOffline(false);
    await receiverPage.evaluate(() => window.dispatchEvent(new Event('online')));
    await receivedCard.waitFor({ state: 'detached' });
    await receiverPage.reload();
    await receiverPage.getByRole('button', { name: /^Prayer Circle/ }).click();
    assert.equal(await receivedCard.count(), 0);
    assert.equal(attempts, 2);
  } finally { await sender.close(); await receiver.close(); }
});

test('deep notification targets render immediately in a long list even while the backend is stalled', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release; const pending = new Promise(resolve => { release = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      if (route.request().url().startsWith(base)) return route.continue();
      await pending; await route.fulfill({ json: {} }).catch(() => {});
    });
    await seed(page, Array.from({ length: 300 }, (_, i) => ({ ...received(String(i)), date: '2026-10-01T00:00:00.000Z' })));
    await page.goto(base + '/pray/?notificationType=PRAY_SHARED&shareId=299', { waitUntil: 'domcontentloaded' });
    const card = page.locator('[data-prayer-id="received-299"]');
    await card.getByText('Prayer 299', { exact: true }).waitFor();
    assert.ok(await page.locator('[data-prayer-id]').count() < 40);
    await page.waitForFunction(() => {
      const rect = document.querySelector('[data-prayer-id="received-299"]')?.getBoundingClientRect();
      return rect && rect.top < innerHeight && rect.bottom > 0;
    });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('taspe7:open-prayer', { detail: { href: '/pray/?notificationType=PRAY_SHARED&shareId=150' }, cancelable: true })));
    await page.locator('[data-prayer-id="received-150"]').getByText('Prayer 150', { exact: true }).waitFor();
    assert.equal(await card.count(), 1, 'Previously opened cards stay mounted after a new notification target');
  } finally { release(); await context.close(); }
});

test('saved-card actions use the latest reply text after other cards and composer state change', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let posted;
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      if (route.request().url().includes('/confirm-share')) { posted = route.request().postDataJSON(); return route.fulfill({ json: { success: true } }); }
      return mockPrayerApi(route, base);
    });
    await seed(page, [received('first'), received('second')]);
    await page.goto(base + '/pray/?notificationType=PRAY_SHARED&shareId=first');
    const card = page.locator('[data-prayer-id="received-first"]');
    await card.getByRole('textbox').fill('Old reply');
    await page.getByRole('textbox').first().fill('Unrelated composer draft');
    await card.getByRole('textbox').fill('Latest reply');
    await card.getByRole('button', { name: 'Send reply', exact: true }).click();
    await card.getByRole('textbox').waitFor({ state: 'detached' });
    await card.getByText('Latest reply', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="received-first"] [role="status"]') === null);
    assert.equal(posted.shareId, 'first'); assert.equal(posted.responseWords, 'Latest reply');
    assert.equal(await page.getByRole('textbox').first().inputValue(), 'Unrelated composer draft');
  } finally { await context.close(); }
});

test('large prayer lists remain accessible when IntersectionObserver is unavailable', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    await page.addInitScript(() => { window.IntersectionObserver = undefined; });
    await seed(page, personalPrayers(40)); await page.goto(base + '/pray/');
    await page.waitForFunction(() => document.querySelectorAll('[data-prayer-id]').length === 40);
    await page.locator('[data-prayer-id="personal-39"]').scrollIntoViewIfNeeded();
    await page.locator('[data-prayer-id="personal-39"]').getByText('Personal prayer 39', { exact: true }).waitFor();
  } finally { await context.close(); }
});

test('recording starts, pauses and cancels while waveform code is still loading', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release; const pending = new Promise(resolve => { release = resolve; });
  let seen; const started = new Promise(resolve => { seen = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    const chunkDir = path.join(root, '_next/static/chunks');
    const chunks = new Set(fs.readdirSync(chunkDir).filter(name => name.endsWith('.js') && fs.readFileSync(path.join(chunkDir, name), 'utf8').includes('continuousWaveformDuration')));
    assert.ok(chunks.size > 0);
    await page.route('**/_next/static/chunks/*.js', async route => {
      if (chunks.has(path.basename(new URL(route.request().url()).pathname))) { seen(); await pending; }
      await route.continue().catch(() => {});
    });
    await page.addInitScript(() => {
      window.__micCalls = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        window.__micCalls++;
        const audio = new AudioContext(), tone = audio.createOscillator(), destination = audio.createMediaStreamDestination();
        tone.connect(destination); tone.start(); await audio.resume();
        window.__fakeMicStream = destination.stream;
        return destination.stream;
      };
      const Recorder = window.MediaRecorder;
      window.MediaRecorder = class extends Recorder {
        constructor(...args) { super(...args); window.__prayerRecorder = this; }
      };
    });
    await seed(page, []); await page.goto(base + '/');
    await page.getByRole('button', { name: 'Record voice', exact: true }).click();
    await started;
    assert.equal(await page.evaluate(() => window.__prayerRecorder.state), 'recording');
    await page.getByRole('button', { name: 'Pause recording', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__prayerRecorder.state), 'paused');
    await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
    await page.waitForFunction(() => window.__prayerRecorder.state === 'inactive' && window.__fakeMicStream.getTracks().every(track => track.readyState === 'ended'));
    release();
    await page.getByRole('button', { name: 'Record voice', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__micCalls), 1);
  } finally { release(); await context.close(); }
});

test('a live microphone recording survives composer updates and offscreen-card loading', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext();
        const tone = context.createOscillator(), destination = context.createMediaStreamDestination();
        tone.connect(destination); tone.start(); await context.resume();
        window.__fakeMicStream = destination.stream;
        return destination.stream;
      };
      const Recorder = window.MediaRecorder;
      window.MediaRecorder = class extends Recorder {
        constructor(...args) { super(...args); window.__prayerRecorder = this; }
      };
    });
    await seed(page, personalPrayers(200)); await page.goto(base + '/pray/');
    await page.getByRole('button', { name: 'Record voice', exact: true }).click();
    await page.getByRole('button', { name: 'Discard recording', exact: true }).waitFor();
    await page.getByRole('textbox').first().fill('Draft written while recording');
    // A trusted user scroll remains allowed while typing; the app intentionally
    // blocks programmatic scroll jumps while the prayer input is focused.
    await page.mouse.wheel(0, 100000);
    await page.locator('[data-prayer-id="personal-199"]').getByText('Personal prayer 199', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__prayerRecorder.state), 'recording');
    await page.getByRole('button', { name: 'Pause recording', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__prayerRecorder.state), 'paused');
    await page.getByRole('button', { name: 'Resume recording', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__prayerRecorder.state), 'recording');
    await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
    await page.waitForFunction(() => window.__prayerRecorder.state === 'inactive' && window.__fakeMicStream.getTracks().every(track => track.readyState === 'ended'));
  } finally { await context.close(); }
});

test('long prayer lists retain audio playback while offscreen and while the composer changes', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue()
      : route.fulfill({ json: { user: { username: 'tester', prayTime: [] }, inbox: [], updates: [], friends: [] } }));
    const prayers = personalPrayers(200);
    await seed(page, prayers);
    await page.evaluate(async () => {
      const bytes = new ArrayBuffer(44 + 8000 * 60 * 2), view = new DataView(bytes);
      const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
      const db = await new Promise(resolve => { const req = indexedDB.open('my_prays', 2); req.onsuccess = () => resolve(req.result); });
      const index = await new Promise(resolve => { const req = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get('index'); req.onsuccess = () => resolve(req.result); });
      index.recordings['personal-0'] = [{ id: 'test-audio', ext: 'wav', mimeType: 'audio/wav', duration: 60, blockType: 'general', sectionIndex: 0 }];
      await new Promise(resolve => { const tx = db.transaction('keyvaluepairs', 'readwrite'); const store = tx.objectStore('keyvaluepairs'); store.put(index, 'index'); store.put(new Blob([bytes], { type: 'audio/wav' }), 'audio_test-audio'); tx.oncomplete = resolve; });
      db.close();
    });
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { window.__playingPrayerAudio = this; return play.call(this); };
    });
    await page.goto(base + '/pray/');
    const first = page.locator('[data-prayer-id="personal-0"]');
    await page.locator('[data-prayer-row="personal-0"]').scrollIntoViewIfNeeded();
    await first.getByRole('button', { name: 'Play', exact: true }).click();
    await first.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.evaluate(() => { window.__firstPrayerCard = document.querySelector('[data-prayer-id="personal-0"]'); window.scrollTo(0, document.documentElement.scrollHeight); });
    await page.locator('[data-prayer-id="personal-199"]').getByText('Personal prayer 199', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__firstPrayerCard.isConnected && !window.__playingPrayerAudio.paused), true);
    await page.getByRole('textbox').first().fill('Composer draft stays separate');
    assert.equal(await page.evaluate(() => window.__firstPrayerCard === document.querySelector('[data-prayer-id="personal-0"]') && !window.__playingPrayerAudio.paused), true);
    await first.scrollIntoViewIfNeeded();
    await first.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForFunction(() => window.__playingPrayerAudio.paused);
  } finally { await context.close(); }
});

test('prayer circle orders latest activity, distinguishes new replies, and persists read state', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => mockPrayerApi(route, base));
    const oldPending = { ...received('old'), date: '2026-10-01T10:00:00Z' };
    const newPrayer = { ...received('new'), date: '2026-10-20T10:00:00Z' };
    const reply = { ...sent, date: '2026-09-01T10:00:00Z', sharedWith: { ...sent.sharedWith, status: 'confirmed', respondedAt: '2026-10-22T10:00:00Z', responseWords: 'Praying with you today', seenActivityBy: {} } };
    await seed(page, [oldPending, reply, newPrayer]);
    await page.goto(base + '/pray/');
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    assert.deepEqual(await page.locator('[data-prayer-row]').evaluateAll(rows => rows.map(row => row.dataset.prayerRow)), ['sent-789', 'received-new', 'received-old']);
    const card = page.locator('[data-prayer-id="sent-789"]');
    await card.getByText('New reply', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit Note', exact: true }).count(), 0);
    assert.equal(await card.locator('time').getAttribute('datetime'), '2026-09-01T10:00:00.000Z');
    await card.getByText('Sent to @friend', { exact: true }).click();
    await card.getByText('Praying with you today', { exact: true }).last().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="sent-789"]')?.dataset.prayerUnread === 'false');
    const filters = page.getByRole('group', { name: 'Prayer Circle' });
    await filters.getByRole('button', { name: /^Unread/ }).click();
    const incoming = page.locator('[data-prayer-id="received-new"]');
    await incoming.getByText('New prayer', { exact: true }).waitFor();
    await incoming.getByText('@friend', { exact: true }).click();
    await incoming.getByRole('textbox').fill('My reply draft');
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="received-new"]')?.dataset.prayerUnread === 'false');
    assert.equal(await incoming.getByRole('textbox').inputValue(), 'My reply draft', 'reading an Unread result must not remove the reply composer');
    assert.equal(await incoming.getByText('Awaiting your reply', { exact: true }).count(), 0);
    assert.equal(await incoming.locator('time').count(), 1);
    assert.equal(await incoming.locator('time').getAttribute('datetime'), '2026-10-20T10:00:00.000Z');
    assert.equal(await incoming.getByText(/Original prayer/).count(), 0);
    await page.reload();
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    assert.equal(await page.locator('[data-prayer-id="sent-789"]').getAttribute('data-prayer-unread'), 'false');
    assert.equal(await page.locator('[data-prayer-id="received-new"]').getAttribute('data-prayer-unread'), 'false');
    assert.equal(await page.locator('[data-prayer-id="received-old"]').getAttribute('data-prayer-unread'), 'true');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('prayer circle defers new activity while typing on a throttled CPU and keeps offscreen cards lightweight', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let inbox = [];
  try {
    const page = await context.newPage();
    await page.route('**/*', route => route.request().url().endsWith('/pray-time/inbox') ? route.fulfill({ json: { inbox } }) : mockPrayerApi(route, base));
    await seed(page, Array.from({ length: 300 }, (_, i) => ({ ...received(String(i)), date: '2026-10-01T10:00:00Z' })));
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.goto(base + '/pray/');
    await page.getByRole('button', { name: /^Prayer Circle/ }).click();
    assert.equal(await page.locator('[data-prayer-row]').count(), 300);
    t.diagnostic(`300 prayers at 6× CPU throttling: ${await page.locator('[data-prayer-id]').count()} mounted cards initially`);
    assert.ok(await page.locator('[data-prayer-id]').count() < 30);
    const first = page.locator('[data-prayer-id="received-0"]');
    await first.getByText('@friend', { exact: true }).click();
    await first.getByRole('textbox').fill('Keep this response while new prayers arrive');
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="received-0"]')?.dataset.prayerUnread === 'false');
    await page.evaluate(() => { window.__existingPrayer = document.querySelector('[data-prayer-id="received-0"]'); window.__beforeUpdateScroll = scrollY; });
    inbox = [{ shareId: 'live', words: 'Newly delivered prayer', senderUsername: 'mary', date: '2026-10-23T10:00:00Z' }];
    await page.evaluate(() => window.dispatchEvent(new Event('taspe7:prayer-push')));
    const updates = page.getByRole('button', { name: 'View new updates: 1', exact: true });
    await updates.waitFor();
    assert.equal(await page.locator('[data-prayer-row="received-live"]').count(), 0);
    assert.equal(await first.getByRole('textbox').inputValue(), 'Keep this response while new prayers arrive');
    assert.equal(await page.evaluate(() => window.__existingPrayer === document.querySelector('[data-prayer-id="received-0"]')), true);
    assert.ok(await page.evaluate(() => Math.abs(scrollY - window.__beforeUpdateScroll)) < 3, 'background activity must preserve scroll position');
    await updates.click();
    await page.locator('[data-prayer-id="received-live"]').getByText('New prayer', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-prayer-row]').first().getAttribute('data-prayer-row'), 'received-live');
    assert.equal(await first.getByRole('textbox').inputValue(), 'Keep this response while new prayers arrive');
    await page.evaluate(() => {
      window.__circleMutations = 0; window.__indexWrites = 0;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) { if (this.transaction.db.name === 'my_prays' && args[1] === 'index') window.__indexWrites++; return put.apply(this, args); };
      new MutationObserver(records => { window.__circleMutations += records.length; }).observe(document.querySelector('[data-prayer-id="received-0"]'), { childList: true, subtree: true, attributes: true, characterData: true });
    });
    await page.evaluate(() => window.dispatchEvent(new Event('taspe7:prayer-push')));
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.__indexWrites), 0, 'duplicate delivery must not rewrite the prayer index');
    assert.equal(await page.evaluate(() => window.__circleMutations), 0, 'unchanged cards must not mutate during duplicate sync');
  } finally { await context.close(); }
});

test('prayer circle reply notification waits for its payload before opening the sent prayer', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let release, requested, waitForReply = false;
  const payload = new Promise(resolve => { release = resolve; });
  const requestStarted = new Promise(resolve => { requested = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*', async route => {
      if (route.request().url().endsWith('/pray-time/sent-updates') && waitForReply) {
        requested(); await payload;
        return route.fulfill({ json: { updates: [{ shareId: '789', recipientId: 'friend', responseWords: 'Delayed reply', respondedAt: '2026-10-23T10:00:00Z' }] } });
      }
      return mockPrayerApi(route, base);
    });
    await seed(page, [{ ...sent, date: '2026-10-01T10:00:00Z' }]);
    await page.goto(base + '/pray/');
    await page.getByRole('button', { name: 'Save Note', exact: true }).waitFor();
    waitForReply = true;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('taspe7:open-prayer', { detail: { href: '/pray/?notificationType=PRAY_CONFIRMED&shareId=789' }, cancelable: true })));
    await requestStarted;
    const card = page.locator('[data-prayer-id="sent-789"]');
    assert.equal(await card.getByText('Sent prayer', { exact: true }).count(), 0, 'old content stays closed while the reply is loading');
    release();
    await card.getByText('Delayed reply', { exact: true }).last().waitFor();
    await card.getByText('Delayed reply', { exact: true }).last().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="sent-789"]')?.dataset.prayerUnread === 'false');
  } finally { release(); await context.close(); }
});

test('prayer circle retains playing audio when updates are revealed and cards reorder', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let inbox = [];
  try {
    const page = await context.newPage();
    await page.route('**/*', route => route.request().url().endsWith('/pray-time/inbox') ? route.fulfill({ json: { inbox } }) : mockPrayerApi(route, base));
    await seed(page, [{ ...received('audio'), date: '2026-10-01T10:00:00Z' }]);
    await page.evaluate(async () => {
      const bytes = new ArrayBuffer(44 + 8000 * 60 * 2), view = new DataView(bytes);
      const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
      const db = await new Promise(resolve => { const req = indexedDB.open('my_prays', 2); req.onsuccess = () => resolve(req.result); });
      const index = await new Promise(resolve => { const req = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get('index'); req.onsuccess = () => resolve(req.result); });
      index.recordings['received-audio'] = [{ id: 'circle-audio', ext: 'wav', mimeType: 'audio/wav', duration: 60, blockType: 'general', sectionIndex: 0 }];
      await new Promise(resolve => { const tx = db.transaction('keyvaluepairs', 'readwrite'); const store = tx.objectStore('keyvaluepairs'); store.put(index, 'index'); store.put(new Blob([bytes], { type: 'audio/wav' }), 'audio_circle-audio'); tx.oncomplete = resolve; });
      db.close();
    });
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { window.__circleAudio = this; return play.call(this); };
    });
    await page.goto(base + '/pray/?notificationType=PRAY_SHARED&shareId=audio');
    const first = page.locator('[data-prayer-id="received-audio"]');
    await first.getByRole('button', { name: 'Play', exact: true }).click();
    await first.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[data-prayer-id="received-audio"]')?.dataset.prayerUnread === 'false');
    await page.evaluate(() => { window.__audioCard = document.querySelector('[data-prayer-id="received-audio"]'); });
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(16000, 40);
    inbox = [{ shareId: 'newer', words: 'New prayer while listening', senderUsername: 'mary', date: '2026-10-23T10:00:00Z',
      recordings: [{ id: 'incoming-clip', mimeType: 'audio/wav', ext: 'wav', duration: 1, data: wav.toString('base64') }] }];
    await page.evaluate(() => window.dispatchEvent(new Event('taspe7:prayer-push')));
    await page.getByRole('button', { name: 'View new updates: 1', exact: true }).click();
    await page.locator('[data-prayer-id="received-newer"]').waitFor();
    await page.locator('[data-prayer-id="received-newer"]').getByText('@mary', { exact: true }).click();
    await page.locator('[data-prayer-id="received-newer"]').getByRole('button', { name: 'Play', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => !window.__circleAudio.paused && window.__audioCard === document.querySelector('[data-prayer-id="received-audio"]')), true);
    assert.equal(await page.locator('[data-prayer-row]').first().getAttribute('data-prayer-row'), 'received-newer');
  } finally { await context.close(); }
});

test('prayer circle labels and cards fit narrow screens in light/dark English and Arabic', async t => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    await seed(page, [received('layout'), { ...sent, sharedWith: { ...sent.sharedWith, status: 'confirmed', respondedAt: '2026-10-23T10:00:00Z', responseWords: 'May God give you peace today', seenActivityBy: {} } }]);
    for (const theme of ['light', 'dark']) for (const language of ['en', 'ar']) {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.evaluate(({ theme, language }) => { localStorage.setItem('taspe7_theme', theme); localStorage.setItem('app-language', language); }, { theme, language });
      await page.goto(base + '/pray/');
      await page.getByRole('button', { name: language === 'ar' ? /دائرة الصلاة/ : /^Prayer Circle/ }).click();
      const filters = page.getByRole('group', { name: language === 'ar' ? 'دائرة الصلاة' : 'Prayer Circle' });
      await filters.waitFor();
      await filters.evaluate(el => el.scrollIntoView({ block: 'start' }));
      const screenshot = path.join(require('node:os').tmpdir(), `wasla-prayer-circle-${theme}-${language}.png`);
      await page.screenshot({ path: screenshot });
      t.diagnostic(screenshot);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('[data-prayer-id]').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth)), true);
      for (const width of [280, 320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 740 });
        assert.equal(await filters.evaluate(el => {
          const bounds = el.getBoundingClientRect();
          return el.scrollWidth <= el.clientWidth && Array.from(el.querySelectorAll('button')).every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
          });
        }), true, `All filters must fit without horizontal scrolling at ${width}px (${theme}, ${language})`);
      }
    }
  } finally { await context.close(); }
});

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
    const wifi = page.getByRole('checkbox', { name: 'Wi-Fi only' });
    await wifi.uncheck();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('my_prays_schedule_tester')).wifiOnly === false);
    await wifi.check();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('my_prays_schedule_tester')).wifiOnly === true);
    await page.getByRole('button', { name: 'Backup', exact: true }).click();
    await page.waitForFunction(() => window.backupCalls.some(call => call.method === 'runNow'));
    await page.getByText('57%', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'close', exact: true }).click();
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
    await page.locator('[data-prayer-id="sent-789"]').getByText('New reply', { exact: true }).last().waitFor({ state: 'visible', timeout: 5000 });
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
    // Ensure this test exercises an in-flight refresh rather than the short
    // cache reuse window for an ordinary tab visit.
    await page.evaluate(() => localStorage.setItem('taspe7_friends_dirty_tester', '1'));
    await page.goto(base + '/friends/', { waitUntil: 'domcontentloaded' });
    await first;
    await page.locator('[data-friend-id="alice"]').getByRole('button', { name: 'Accept', exact: true }).click();
    await page.getByText('No pending incoming requests', { exact: true }).waitFor({ state: 'visible' });
    await page.evaluate(() => {
      window.requestRestored = false;
      new MutationObserver(() => { if (document.querySelector('[data-friend-id="alice"]')) window.requestRestored = true; })
        .observe(document.body, { childList: true, subtree: true });
    });
    release(); await Promise.race([second, new Promise((_, reject) => setTimeout(() => reject(new Error('Action refresh was not immediate')), 5000))]);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.requestRestored), false);
    await page.getByRole('button', { name: /My Friends/ }).click();
    await page.locator('[data-friend-id="alice"]').getByText('Alice', { exact: true }).waitFor({ state: 'visible' });
  } finally { release(); await context.close(); }
});

for (const theme of ['light', 'dark']) {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 1280, height: 800 }]) {
    test(`backup dialog stays above cards and navigation in ${theme} mode at ${viewport.width}x${viewport.height}`, async () => {
      const context = await browser.newContext({ viewport });
      try {
        const page = await context.newPage();
        const accounts = Array.from({ length: 8 }, (_, index) => ({ email: `long.backup.account.${index}@example.com`, isDefault: index === 0 }));
        await page.route('**/*', route => {
          if (route.request().url().startsWith(base)) return route.continue();
          if (route.request().url().includes('/backup/drive-accounts')) return route.fulfill({ json: { accounts } });
          return mockPrayerApi(route, base);
        });
        await seed(page, personalPrayers(3));
        await page.evaluate(theme => localStorage.setItem('taspe7_theme', theme), theme);
        await page.goto(base + '/pray/');
        const trigger = page.getByRole('button', { name: 'Settings', exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'My Prays Backup' });
        const account = dialog.getByRole('button', { name: 'Change Drive Email: ' + accounts[0].email, exact: true });
        await account.waitFor();
        assert.equal(await dialog.evaluate(el => el.matches(':modal')), true);
        assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
        assert.equal(await dialog.getByRole('combobox', { name: 'Automatic backup' }).count(), 1);
        assert.equal(await dialog.getByRole('combobox').isDisabled(), true);
        assert.equal(await dialog.getByRole('checkbox', { name: 'Wi-Fi only' }).count(), 1);
        assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
        const background = await dialog.evaluate(el => getComputedStyle(el).backgroundColor);
        assert.equal(background, theme === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)');
        await account.click();
        await dialog.getByText('Connected Google Accounts', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Disconnect ' + accounts[7].email, exact: true }).scrollIntoViewIfNeeded();
        assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 15 && bounds.y >= 15);
        assert.ok(bounds.x + bounds.width <= viewport.width - 15 && bounds.y + bounds.height <= viewport.height - 15);
        const disconnect = dialog.getByRole('button', { name: 'Disconnect ' + accounts[7].email, exact: true });
        assert.equal(await disconnect.evaluate(el => {
          const rect = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        }), true, 'expanded accounts cannot be covered by cards or navigation');
        await page.keyboard.press('Tab');
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        await trigger.click();
        await dialog.waitFor();
        assert.equal(await dialog.getByText('Connected Google Accounts', { exact: true }).count(), 0);
        await page.mouse.click(4, 4);
        await dialog.waitFor({ state: 'detached' });
      } finally { await context.close(); }
    });
  }
}

test('mobile prayer typing keeps the page position through keyboard viewport changes', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.route('**/*', route => mockPrayerApi(route, base));
    await seed(page, personalPrayers(3));
    await page.goto(base + '/pray/');
    const input = page.getByRole('textbox').first();
    await input.waitFor();
    await page.waitForFunction(() => document.documentElement.classList.contains('manual-input-scroll'));
    const baseline = await page.evaluate(() => scrollY);
    await input.tap();
    assert.equal(await input.evaluate(el => getComputedStyle(el).fontSize), '16px');
    await input.fill('Typing a prayer without moving the page');
    await page.setViewportSize({ width: 390, height: 480 });
    await page.evaluate(() => window.scrollBy({ top: 180, behavior: 'instant' }));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => scrollY), baseline);
    assert.equal(await input.inputValue(), 'Typing a prayer without moving the page');
    await input.evaluate(el => el.blur());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => scrollY), baseline);
  } finally { await context.close(); }
});
