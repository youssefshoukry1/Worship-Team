/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression suite. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { start, stop, setup } = require('./helpers/swipe-browser.cjs');
before(() => start());
after(stop);
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
const initial = { unit: 'tokens', plan: 'free', limit: 20000, used: 5000, remaining: 15000, unlimited: false, resetsAt: null };

for (const engine of ['chromium', 'webkit']) {
  for (const language of ['en', 'ar']) test(`${engine}: ${language} Profile usage shows server balance and counts down locally`, async t => {
    let reads = 0;
    const now = Date.now();
    const { page, errors } = await setup(t, engine, { href: '/normal_UserProfile/', platform: 'web', contextOptions: { viewport: { width: 320, height: 844 } }, beforeNavigate: async page => {
      await page.evaluate(language => localStorage.setItem('app-language', language), language);
      await page.clock.install({ time: new Date(now) });
      await page.route('**/billing/status', route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        reads++;
        assert.equal(route.request().headers().authorization, 'Bearer test-token');
        return route.fulfill({ headers, json: { quota: { ...initial, resetsAt: new Date(now + 7200000).toISOString() } } });
      });
    } });
    const section = page.locator('[data-ai-usage-settings]');
    const bar = section.getByRole('progressbar');
    await bar.waitFor();
    assert.equal(await bar.getAttribute('aria-valuenow'), '15000');
    assert.equal(await bar.getAttribute('aria-valuemax'), '20000');
    assert.equal(await bar.locator('div').evaluate(el => el.style.width), '75%');
    await page.clock.fastForward(61000);
    assert.match(await section.locator('[data-ai-usage-reset]').textContent(), language === 'ar' ? /١ س ٥٩ د/ : /1h 59m/);
    assert.equal(reads, 1, 'Countdown ticks do not request the server');
    await section.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.AI_USAGE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.AI_USAGE_SCREENSHOT_DIR, `ai-usage-${engine}-${language}.png`) });
    assert.deepEqual(errors, []);
  });

  test(`${engine}: Bible settings handles unused, exhausted and unlimited allowances`, async t => {
    let quota = initial;
    const { page, errors } = await setup(t, engine, { href: '/normal_UserProfile/#bible_settings', platform: 'web', beforeNavigate: async page => {
      await page.route('**/billing/status', route => route.fulfill({ headers, json: { quota } }));
    } });
    const section = page.locator('[data-ai-usage-settings]');
    await section.getByRole('progressbar').waitFor();
    assert.equal(await section.getByText('Resets 24 hours after your first use.').count(), 1);
    quota = { ...initial, plan: 'plus', remaining: 0, limit: 22000, resetsAt: new Date(Date.now() + 3600000).toISOString() };
    await page.evaluate(() => window.dispatchEvent(new Event('wasla:subscription-updated')));
    await page.waitForFunction(() => document.querySelector('[data-ai-usage-settings] [role="progressbar"]')?.getAttribute('aria-valuenow') === '0');
    assert.equal(await section.getByRole('progressbar').getAttribute('aria-valuemax'), '22000');
    assert.equal(await section.getByText('Plus', { exact: true }).count(), 1);
    quota = { ...initial, unlimited: true, remaining: null, limit: null, resetsAt: null };
    await page.evaluate(() => window.dispatchEvent(new Event('wasla:subscription-updated')));
    await section.getByText('Unlimited', { exact: true }).waitFor();
    assert.equal(await section.getByRole('progressbar').count(), 0);
    assert.equal(await section.locator('[data-ai-usage-reset]').count(), 0);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: expired quota refreshes once and network errors have a working retry`, async t => {
    let reads = 0;
    let failure = false;
    const now = Date.now();
    const { page, errors } = await setup(t, engine, { href: '/normal_UserProfile/#bible_settings', platform: 'web', beforeNavigate: async page => {
      await page.clock.install({ time: new Date(now) });
      await page.route('**/billing/status', route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        reads++;
        if (failure) return route.fulfill({ status: 503, headers, json: {} });
        return route.fulfill({ headers, json: { quota: reads === 1 ? { ...initial, remaining: 0, resetsAt: new Date(now + 60000).toISOString() } : { ...initial, limit: 14000, remaining: 14000 } } });
      });
    } });
    const section = page.locator('[data-ai-usage-settings]');
    await section.getByRole('progressbar').waitFor();
    await page.clock.fastForward(61000);
    await page.waitForFunction(() => document.querySelector('[data-ai-usage-settings] [role="progressbar"]')?.getAttribute('aria-valuenow') === '14000');
    await page.clock.fastForward(120000);
    assert.equal(reads, 2, 'One refresh at expiry, no periodic server polling');
    failure = true;
    await page.evaluate(() => window.dispatchEvent(new Event('wasla:subscription-updated')));
    await section.getByRole('button', { name: 'Retry' }).waitFor();
    assert.equal(await section.getByRole('progressbar').count(), 0, 'Unavailable balances are not shown as current');
    failure = false;
    await section.getByRole('button', { name: 'Retry' }).click();
    await section.getByRole('progressbar').waitFor();
    assert.equal(await section.getByRole('progressbar').getAttribute('aria-valuenow'), '14000');
    assert.deepEqual(errors, []);
  });
}
