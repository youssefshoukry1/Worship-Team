// Run against a local Next server: node --test tests/google-username-webkit.test.mjs
// Install the browser first with: npx playwright install webkit
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { webkit, devices } from 'playwright';

let browser;
before(async () => { browser = await webkit.launch(); });
after(async () => { await browser?.close(); });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error('Timed out waiting for UI state');
}

async function setup(t, { check, save, native = false, desktop = false } = {}) {
  const context = await browser.newContext({ ...(desktop ? devices['Desktop Safari'] : devices['iPhone 13']), serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.addInitScript((native) => {
    localStorage.setItem('wasla_splash_version', 'test');
    if (!native) return;
    window.CapacitorCustomPlatform = { name: 'ios' };
    window.Capacitor = {
      PluginHeaders: [{ name: 'GoogleSignIn', methods: [
        { name: 'initialize', rtype: 'promise' },
        { name: 'signIn', rtype: 'promise' },
      ] }],
      nativePromise: async (plugin, method) => {
        if (plugin === 'GoogleSignIn' && method === 'signIn') return { idToken: 'google-id-token' };
        return {};
      },
    };
  }, native);
  if (!native) {
    // Exercise the web GIS script, button, and credential callback without
    // signing in to a real Google account or creating a production account.
    await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
      contentType: 'application/javascript',
      body: `window.google = { accounts: { id: {
        initialize: function(options) { window.__googleOptions = options; },
        renderButton: function(container) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Continue with Google';
          button.onclick = function() { window.__googleOptions.callback({ credential: 'google-id-token' }); };
          container.appendChild(button);
        }
      } } };`,
    }));
  }
  await page.route('**/version.json?*', route => route.fulfill({ json: { version: 'test' } }));
  await page.route(/\/users\//, async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      } });
    }
    const reply = (json, status = 200) => route.fulfill({
      status, json, headers: { 'access-control-allow-origin': '*' },
    });
    if (url.pathname.endsWith('/google-auth')) {
      assert.equal(route.request().postDataJSON().credential, 'google-id-token');
      return reply({ needsUsername: true, token: 'onboarding-token', suggestedUsername: 'Test User' });
    }
    if (url.pathname.endsWith('/check-username')) {
      const name = url.searchParams.get('q');
      return check ? check(name, reply) : reply({ available: true, username: name });
    }
    if (url.pathname.endsWith('/set-username')) {
      assert.equal(route.request().headers().authorization, 'Bearer onboarding-token');
      const { username } = route.request().postDataJSON();
      return save ? save(username, reply) : reply({
        token: 'session-token', username,
        user: { id: 'test-user-id', username, email: 'test@example.com', teams: [], global_role: 'USER' },
      });
    }
    return reply({ user: {}, teams: [], data: [] });
  });
  await page.goto(process.env.AUTH_TEST_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  assert.equal(await page.evaluate(() => window.Capacitor.getPlatform()), native ? 'ios' : 'web');
  const input = page.getByLabel('Username', { exact: true });
  try {
    await input.waitFor({ timeout: 10000 });
  } catch (error) {
    t.diagnostic(await page.locator('body').innerText());
    throw error;
  }
  const confirm = page.getByRole('button', { name: 'Confirm @username' });
  await waitFor(() => confirm.isEnabled());
  return { page, input, confirm };
}

for (const native of [false, true]) {
const mode = native ? 'native iOS' : 'iPhone Safari web';
test(`${mode} completes Google onboarding and persists the full session after reload`, async t => {
  const { page, input, confirm } = await setup(t, { native });
  assert.equal(await input.getAttribute('autocapitalize'), 'none');
  assert.equal(await input.getAttribute('autocorrect'), 'off');
  assert.equal(await input.getAttribute('spellcheck'), 'false');
  await input.fill('IOS_User');
  await waitFor(() => confirm.isEnabled());
  await confirm.click();
  await waitFor(() => page.evaluate(() => localStorage.getItem('user_Taspe7_ID') === 'test-user-id'));
  const session = await page.evaluate(() => ({
    token: localStorage.getItem('user_Taspe7_Token'),
    username: localStorage.getItem('user_Taspe7_Username'),
  }));
  assert.deepEqual(session, { token: 'session-token', username: 'ios_user' });
  await waitFor(async () => !(await input.count()));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
  assert.equal(await input.count(), 0);
});

test(`${mode}: a delayed taken result cannot disable the current username`, async t => {
  let oldRequestStarted = false;
  const { page, input, confirm } = await setup(t, { native, check: async (name, reply) => {
    if (name === 'old_name') {
      oldRequestStarted = true;
      await sleep(1200);
      // The browser may already have canceled this obsolete request.
      return reply({ available: false }).catch(() => {});
    }
    return reply({ available: true });
  } });
  await input.fill('old_name');
  await waitFor(() => oldRequestStarted);
  await input.fill('new_name');
  await waitFor(() => confirm.isEnabled());
  await sleep(1400);
  assert.equal(await confirm.isEnabled(), true);
  assert.equal(await page.getByText('@new_name is available!', { exact: true }).count(), 1);
});

test(`${mode}: a temporary save failure allows retrying the same username`, async t => {
  let attempts = 0;
  const { page, input, confirm } = await setup(t, { native, save: (username, reply) => {
    attempts++;
    if (attempts === 1) return reply({ msg: 'Temporary server failure' }, 500);
    return reply({ token: 'session-token', username, user: { id: 'test-user-id', username, teams: [] } });
  } });
  await confirm.click();
  await page.getByRole('alert').filter({ hasText: 'Temporary server failure' }).waitFor();
  assert.equal(await confirm.isEnabled(), true);
  await confirm.click();
  await waitFor(async () => !(await input.count()));
  assert.equal(attempts, 2);
});

test(`${mode}: availability network errors offer retry`, async t => {
  let attempts = 0;
  const { page, confirm } = await setup(t, { native });
  // Override after the initial successful check.
  await page.route('**/users/check-username?*', route => {
    attempts++;
    return route.fulfill({ status: attempts === 1 ? 503 : 200,
      json: attempts === 1 ? {} : { available: true },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.getByLabel('Username', { exact: true }).fill('retry_name');
  const retry = page.getByRole('button', { name: 'Retry availability check' });
  await retry.waitFor();
  assert.equal(await confirm.isEnabled(), false);
  await retry.click();
  await waitFor(() => confirm.isEnabled());
  assert.equal(attempts, 2);
});
}

test('desktop Safari web completes username setup through the Google web callback', async t => {
  const { page, input, confirm } = await setup(t, { desktop: true });
  await input.fill('safari_desktop');
  await waitFor(() => confirm.isEnabled());
  await confirm.click();
  await waitFor(() => page.evaluate(() => localStorage.getItem('user_Taspe7_ID') === 'test-user-id'));
  assert.equal(await page.evaluate(() => localStorage.getItem('user_Taspe7_Username')), 'safari_desktop');
});
