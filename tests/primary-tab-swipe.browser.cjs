/* eslint-disable @typescript-eslint/no-require-imports -- Node test and benchmark entry points use CommonJS. */
// Run after npm run build: node --test tests/primary-tab-swipe.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, setup, getBase } = require('./helpers/swipe-browser.cjs');
let base;
before(async () => { await start(); base = getBase(); });
after(stop);

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
  test(`${engine}: cold neighbors stay lightweight during a held gesture and load after navigation`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/friends/', deferIdle: true });
    const preview = panel(page, '/normal_UserProfile');
    assert.equal(await preview.getAttribute('data-tab-ready'), 'false');
    await touch(page, 'touchstart', 280); await touch(page, 'touchmove', 170); await frame(page);
    await page.waitForTimeout(400);
    assert.equal(await preview.getAttribute('data-tab-ready'), 'false', 'touch must not mount a cold full page');
    assert.equal(await preview.locator('[data-page-skeleton]').count(), 1);
    await touch(page, 'touchend', 60);
    await page.waitForURL(base + '/normal_UserProfile/');
    await preview.getByText('iOS Tester', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  });

  test(`${engine}: repeated cancellations reuse the prepared page and keep it inactive`, async t => {
    const { page, state, errors } = await setup(t, engine, { href: '/friends/' });
    const preview = panel(page, '/normal_UserProfile');
    await preview.getByText('iOS Tester', { exact: true }).waitFor({ state: 'attached' });
    await preview.getByText('iOS Tester', { exact: true }).evaluate(node => { node.__mountProof = 'retained'; });
    const requests = state.profiles;
    for (let attempt = 0; attempt < 3; attempt++) {
      await drag(page, 280, 150, { cancel: true });
      await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
      assert.equal(await preview.getByText('iOS Tester', { exact: true }).evaluate(node => node.__mountProof), 'retained');
      assert.equal(await preview.getAttribute('inert'), '');
      assert.equal(await preview.getAttribute('data-tab-active'), 'false');
    }
    assert.equal(state.profiles, requests, 'canceling must not repeat Profile loads');
    assert.deepEqual(errors, []);
  });

  test(`${engine}: a held drag reveals the real Profile page proportionally, then commits without reloading`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/friends/' });
    await panel(page, '/friends').locator('[data-page-skeleton]').waitFor({ state: 'detached' });
    await panel(page, '/normal_UserProfile').getByText('iOS Tester', { exact: true }).waitFor({ state: 'attached' });
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
    assert.ok(await page.locator('[data-tab-panel]').count() <= 3);
    assert.equal(await page.locator('[data-tab-active="true"]').count(), 1);
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
    assert.ok(await page.locator('[data-tab-panel]').count() <= 3);
    assert.equal(await page.locator('[data-tab-active="true"]').count(), 1);
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

  test(`${engine}: vertical scrolling, horizontal galleries and tab boundaries do not start a page drag`, async t => {
    const { page, errors } = await setup(t, engine);
    const root = page.locator('[data-tab-pager]');
    await touch(page, 'touchstart', 160, 400); await touch(page, 'touchmove', 165, 200); await touch(page, 'touchend', 165, 150);
    assert.equal(await root.getAttribute('data-swiping'), null);
    await drag(page, 150, 300); // no previous tab before Pray
    assert.equal(await root.getAttribute('data-swiping'), null);
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

  test(`${engine}: horizontal drags start in the center of the prayer editor while typing and vertical scrolling still work`, async t => {
    const { page, errors } = await setup(t, engine);
    const draft = page.locator('textarea').first();
    await draft.tap(); await draft.fill('Keep typing and keep my draft');
    assert.equal(await draft.evaluate(node => document.activeElement === node), true);
    await touch(page, 'touchstart', 195, 300, { selector: 'textarea' });
    await touch(page, 'touchmove', 190, 180);
    assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), null);
    await touch(page, 'touchend', 190, 180);
    await touch(page, 'touchstart', 195, 300, { selector: 'textarea' });
    await touch(page, 'touchmove', 120, 300); await frame(page);
    assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), 'true');
    await touch(page, 'touchend', 120, 300, { cancel: true });
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await draft.inputValue(), 'Keep typing and keep my draft');
    assert.equal(new URL(page.url()).pathname, '/');
    assert.deepEqual(errors, []);
  });

  test(`${engine}: cards that stop propagation can start center swipes without activating their button`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/friends/' });
    await page.evaluate(() => {
      const button = document.createElement('button'); button.id = 'center-card'; button.textContent = 'Full-width card';
      window.__cardClicks = 0;
      button.onclick = () => window.__cardClicks++;
      button.addEventListener('touchstart', event => event.stopPropagation());
      button.addEventListener('touchmove', event => event.stopPropagation());
      document.querySelector('[data-tab-active="true"]').appendChild(button);
    });
    await touch(page, 'touchstart', 195, 350, { selector: '#center-card' });
    await touch(page, 'touchmove', 193, 359); // Initial diagonal jitter must not discard the gesture.
    await touch(page, 'touchmove', 100, 350); await frame(page);
    assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), 'true');
    await touch(page, 'touchend', 100, 350, { cancel: true });
    await page.evaluate(() => document.querySelector('#center-card').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })));
    assert.equal(await page.evaluate(() => window.__cardClicks), 0);
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    // A fresh tap is still a click, even immediately after a cancelled drag.
    await touch(page, 'touchstart', 195, 350, { selector: '#center-card' }); await touch(page, 'touchend', 195, 350);
    await page.evaluate(() => document.querySelector('#center-card').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })));
    assert.equal(await page.evaluate(() => window.__cardClicks), 1);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: swipes can start on the center navigation link without selecting that link`, async t => {
    const { page, errors } = await setup(t, engine);
    const selector = 'nav[aria-label="Primary navigation"] a[href^="/hymns"]';
    await touch(page, 'touchstart', 195, 800, { selector });
    await touch(page, 'touchmove', 55, 800); await frame(page);
    assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), 'true');
    await touch(page, 'touchend', 55, 800);
    await page.evaluate(selector => document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })), selector);
    await page.waitForURL(base + '/bible_form/');
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

test('trusted touch starts on the center of the prayer textarea and reveals the neighboring page', async t => {
  const { page, context, errors } = await setup(t, 'chromium');
  const draft = page.locator('textarea').first(); await draft.fill('A prayer to keep'); await draft.blur();
  const bounds = await draft.boundingBox();
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const delta of [15, 35, 70, 100, 130]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - delta, y }] });
  await frame(page);
  assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), 'true');
  assert.equal(new URL(page.url()).pathname, '/');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
  assert.equal(await draft.inputValue(), 'A prayer to keep');
  assert.deepEqual(errors, []);
});

test('trusted touch on a real settings switch begins a drag without toggling it, and a later tap still works', async t => {
  const { page, context, errors } = await setup(t, 'chromium', { href: '/normal_UserProfile/' });
  const toggle = page.getByRole('switch', { name: 'Toggle Theme', exact: true });
  await toggle.scrollIntoViewIfNeeded();
  const checked = await toggle.getAttribute('aria-checked');
  const bounds = await toggle.boundingBox();
  const x = bounds.x + 5, y = bounds.y + bounds.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const delta of [10, 20, 30]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + delta, y }] });
  await frame(page);
  assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
  assert.equal(await toggle.getAttribute('aria-checked'), checked);
  await toggle.tap();
  assert.notEqual(await toggle.getAttribute('aria-checked'), checked);
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
    assert.ok(await page.locator('[data-tab-panel]').count() <= 3, 'page cache must stay bounded');
  }
  for (const href of hrefs.slice(0, -1).reverse()) {
    await drag(page, 90, 310);
    await page.waitForURL(base + href + '/');
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await panel(page, href).getAttribute('data-tab-active'), 'true');
  }
  assert.ok(await page.locator('[data-tab-panel]').count() <= 3);
  assert.equal(await page.locator('[data-tab-active="true"]').count(), 1);
  assert.deepEqual(errors, []);
});

