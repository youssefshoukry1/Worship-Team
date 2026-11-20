// Run against a production export with node --test tests/startup-recovery.browser.cjs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, setup } = require('./helpers/swipe-browser.cjs');

before(() => start(['chromium', 'webkit']));
after(stop);

for (const engine of ['chromium', 'webkit']) {
  test(engine + ': a tap on the first Pray layout focuses the private editor after hydration', async t => {
    const { page } = await setup(t, engine, { waitForPrayReads: false });
    await page.evaluate(() => localStorage.setItem('taspe7_prayer_privacy', JSON.stringify({ enabled: true, strength: 3 })));
    await page.route(url => url.pathname === '/', async route => {
      const response = await route.fetch();
      const html = await response.text();
      const bridge = '<script>Capacitor.Plugins={WaslaLaunch:{ready:()=>Capacitor.nativePromise("WaslaLaunch","ready",{})}}</script>';
      await route.fulfill({ response, body: html.replace('<head>', '<head>' + bridge) });
    });
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/_next/static/chunks/*.js', async route => {
      await held;
      await route.continue().catch(() => {});
    });
    try {
      await page.reload({ waitUntil: 'commit' });
      await page.waitForFunction(() => window.__launchSignals?.length === 1);
      assert.equal(await page.locator('textarea').count(), 0);
      const field = await page.locator('[data-startup-editor]').boundingBox();
      await page.touchscreen.tap(field.x + 12, field.y + 12);
      assert.ok(await page.evaluate(() => window.waslaPrayerPreview.focusRequested));
      release();
      const editor = page.locator('[data-tab-active="true"] textarea[data-preview-content="pray"]');
      await page.waitForFunction(() => document.activeElement?.matches('textarea[data-preview-content="pray"]'));
      assert.equal(await editor.evaluate(el => getComputedStyle(el).color), 'rgba(0, 0, 0, 0)');
      const live = await editor.boundingBox();
      assert.ok(Math.abs(live.y - field.y) <= 2, JSON.stringify({ field, live }));
      await page.keyboard.type('a');
      assert.equal(await editor.inputValue(), 'a');
      assert.equal(await page.locator('[data-startup-shell]').count(), 0);
      assert.equal(await page.evaluate(() => window.__launchSignals.length), 1);
    } finally { release(); }
  });
}

async function recover(t, engine, respond) {
  const { page } = await setup(t, engine, { href: '/pray/', platform: engine === 'webkit' ? 'ios' : 'android', waitForPrayReads: false });
  await page.evaluate(() => localStorage.removeItem('user_Taspe7_Username'));
  await page.route('**/users/my-profile', route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    return respond(route);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  return page;
}

const reply = (route, user, status = 200) => route.fulfill({
  status, headers: { 'access-control-allow-origin': '*' }, json: { user },
});

for (const engine of ['chromium', 'webkit']) {
  test(engine + ': release the cover while account recovery is waiting, then open the real editor', async t => {
    let pending;
    const page = await recover(t, engine, route => { pending = route; });
    await page.waitForFunction(() => window.__launchSignals?.length === 1);
    assert.ok(await page.getByText('Opening your account…').isVisible());
    assert.equal(await page.locator('textarea[data-preview-content="pray"]').count(), 0);
    await reply(pending, { _id: 'tester', username: 'restored' });
    const editor = page.locator('[data-tab-active="true"] textarea[data-preview-content="pray"]');
    await editor.fill('first character');
    assert.equal(await editor.inputValue(), 'first character');
    assert.equal(await page.evaluate(() => localStorage.getItem('user_Taspe7_Username')), 'restored');
  });
}

test('failed lookups allow retry and only a confirmed account without a username opens the claim form', async t => {
  let available = false;
  const page = await recover(t, 'chromium', route => available ? reply(route, { _id: 'tester', username: null }) : route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Try Again' }).waitFor();
  assert.equal(await page.locator('#claim-username, textarea[data-preview-content="pray"]').count(), 0);
  available = true;
  await page.getByRole('button', { name: 'Try Again' }).click();
  await page.locator('#claim-username').waitFor();
  assert.equal(await page.locator('textarea[data-preview-content="pray"]').count(), 0);
});

test('a late profile response after sign-out cannot reopen the journal or write a username', async t => {
  let pending;
  const page = await recover(t, 'chromium', route => { pending = route; });
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign in to Wasla' }).waitFor();
  if (pending) await reply(pending, { _id: 'tester', username: 'stale' }).catch(() => {});
  assert.equal(await page.evaluate(() => localStorage.getItem('user_Taspe7_Username')), null);
  assert.equal(await page.locator('textarea[data-preview-content="pray"]').count(), 0);
});

test('expired sessions offer sign-in', async t => {
  const page = await recover(t, 'chromium', route => reply(route, null, 401));
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign in to Wasla' }).waitFor();
});

test('reconnect retries an outstanding offline recovery', async t => {
  let requests = 0;
  const { page } = await setup(t, 'chromium', { href: '/pray/', waitForPrayReads: false });
  await page.evaluate(() => localStorage.removeItem('user_Taspe7_Username'));
  await page.addInitScript(() => {
    // Keep local assets available just as they are in a packaged WebView.
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  });
  await page.route('**/users/my-profile', route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    requests++;
    return reply(route, { _id: 'tester', username: 'back-online' });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Try Again' }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
  });
  await page.locator('[data-tab-active="true"] textarea[data-preview-content="pray"]').waitFor();
  assert.ok(requests > 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('user_Taspe7_Username')), 'back-online');
});
