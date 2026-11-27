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
  test(`${engine}: native cold launch reveals the signed-in composer or sign-in screen`, async t => {
    for (const authenticated of [true, false]) {
      const { page } = await setup(t, engine, {
        authenticated, platform: engine === 'webkit' ? 'ios' : 'android',
      });
      await page.waitForFunction(() => window.__launchSignals?.length);
      const signals = await page.evaluate(() => window.__launchSignals);
      assert.equal(signals.length, 1);
      assert.equal(signals[0].header, authenticated);
      assert.equal(signals[0].composer, authenticated);
      if (!authenticated) assert.equal(signals[0].signIn, true);
    }
  });

  test(`${engine}: Friends and Profile keep their fitted note text throughout the swipe`, async t => {
    const { page } = await setup(t, engine, { href: '/friends/', beforeNavigate: async page => {
      await page.route('**/users/testimonies', route => route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: { items: [{ _id: 'feed-note', title: 'Friend note', body: 'A long prayer. '.repeat(30),
          author: { _id: 'friend', Name: 'Friend' }, createdAt: new Date().toISOString(),
          feedExpiresAt: new Date(Date.now() + 86400000).toISOString() }] },
      }));
      await page.route('**/users/testimonies/profile/tester*', route => route.fulfill({
        headers: { 'access-control-allow-origin': '*' },
        json: { notesVersion: 1, user: { _id: 'tester', Name: 'Tester' },
          items: [{ _id: 'sample-note', title: 'Archived note', body: 'A longer note. '.repeat(30) }] },
      }));
    } });
    const noteSize = route => panel(page, route).locator('[data-note-surface] h3')
      .evaluate(node => getComputedStyle(node).fontSize);
    await panel(page, '/normal_UserProfile').locator('[data-note-surface] h3').waitFor({ state: 'attached' });
    await panel(page, '/friends').locator('[data-note-surface] h3').waitFor({ state: 'attached' });
    await frame(page);
    for (const [from, to, startX, endX] of [
      ['/friends', '/normal_UserProfile', 280, 140],
      ['/normal_UserProfile', '/friends', 80, 220],
    ]) {
      assert.equal(await noteSize(from), '8px');
      assert.equal(await noteSize(to), '8px', 'neighbor must already have its final size');
      await touch(page, 'touchstart', startX);
      await touch(page, 'touchmove', endX);
      await frame(page);
      assert.equal(await noteSize(to), '8px', 'partial swipe exposes the final size');
      await touch(page, 'touchend', endX);
      await page.waitForURL(base + to + '/');
      await frame(page);
      assert.equal(await noteSize(to), '8px');
    }
  });

  test(`${engine}: cold neighbors stay lightweight during a held gesture and load after navigation`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/friends/', deferIdle: true });
    const preview = panel(page, '/normal_UserProfile');
    assert.equal(await preview.getAttribute('data-tab-ready'), 'false');
    await touch(page, 'touchstart', 280); await touch(page, 'touchmove', 170); await frame(page);
    await page.waitForTimeout(400);
    assert.equal(await preview.getAttribute('data-tab-ready'), 'false', 'touch must not mount a cold full page');
    assert.equal(await preview.locator('[data-page-skeleton]').count(), 1);
    assert.ok(await preview.evaluate(node => node.getBoundingClientRect().left >= innerWidth - 1), 'cold placeholder stays offscreen throughout drag');
    const historyLength = await page.evaluate(() => history.length);
    await touch(page, 'touchend', 20);
    await page.waitForFunction(() => {
      const incoming = document.querySelector('[data-tab-pager][data-settling] [data-tab-index="3"]');
      const left = incoming?.getBoundingClientRect().left;
      return left > 1 && left < innerWidth - 1;
    });
    await page.waitForURL(base + '/normal_UserProfile/');
    await preview.getByText('iOS Tester', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => history.length), historyLength + 1);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: readiness arriving during a drag uses the current offset and cancels smoothly`, async t => {
    const { page, context } = await setup(t, engine, { href: '/friends/' });
    const preview = panel(page, '/normal_UserProfile');
    const marker = preview.locator('[data-preview-content]').first();
    await marker.waitFor({ state: 'attached' });
    if (engine === 'chromium') {
      const client = await context.newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    // Control when the previously mounted destination publishes its readiness.
    const handle = await marker.elementHandle();
    const value = await handle.getAttribute('data-preview-content');
    await handle.evaluate(node => node.removeAttribute('data-preview-content'));
    await touch(page, 'touchstart', 280);
    await touch(page, 'touchmove', 190);
    await frame(page);
    assert.ok(await preview.evaluate(node => node.getBoundingClientRect().left >= innerWidth - 1));
    assert.equal(await page.locator('nav a[aria-current="page"]').getAttribute('href'), '/friends/');
    await handle.evaluate((node, value) => node.setAttribute('data-preview-content', value), value);
    await frame(page);
    assert.ok(await preview.evaluate(node => Math.abs(node.getBoundingClientRect().left - (innerWidth - 74)) < 2));
    const before = await page.evaluate(() => history.length);
    await touch(page, 'touchcancel', 190, 350, { cancel: true });
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('nav a[aria-current="page"]').getAttribute('href'), '/friends/');
    assert.equal(await page.evaluate(() => history.length), before);
    assert.equal(new URL(page.url()).pathname, '/friends/');
  });

  test(`${engine}: repeated cancellations reuse the prepared page and keep it inactive`, async t => {
    const { page, state, errors } = await setup(t, engine, { href: '/friends/' });
    const preview = panel(page, '/normal_UserProfile');
    await preview.locator('[data-preview-content]').first().waitFor({ state: 'attached' });
    await preview.locator('[data-preview-content]').first().evaluate(node => { node.__mountProof = 'retained'; });
    const requests = state.profiles;
    for (let attempt = 0; attempt < 3; attempt++) {
      await drag(page, 280, 150, { cancel: true });
      await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
      assert.equal(await preview.locator('[data-preview-content]').first().evaluate(node => node.__mountProof), 'retained');
      assert.equal(await preview.getAttribute('inert'), '');
      assert.equal(await preview.getAttribute('data-tab-active'), 'false');
    }
    assert.equal(state.profiles, requests, 'canceling must not repeat Profile loads');
    assert.deepEqual(errors, []);
  });

  test(`${engine}: a held drag reveals the real Profile page proportionally, then commits without reloading`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/friends/' });
    await panel(page, '/friends').locator('[data-page-skeleton]').waitFor({ state: 'detached' });
    await panel(page, '/normal_UserProfile').locator('[data-preview-content]').first().waitFor({ state: 'attached' });
    const documentId = await page.evaluate(() => window.__documentId);
    await touch(page, 'touchstart', 280);
    await touch(page, 'touchmove', 200);
    await panel(page, '/normal_UserProfile').locator('[data-preview-content]').first().waitFor();
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
    await touch(page, 'touchend', 20);
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
    await touch(page, 'touchstart', 250); await page.waitForTimeout(160); await touch(page, 'touchmove', 225); await frame(page);
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
    await drag(page, 60, 330); await page.waitForURL(base + '/friends/');
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
    const selector = 'nav[aria-label="Primary navigation"] a[href^="/friends"]';
    await touch(page, 'touchstart', 195, 800, { selector });
    await touch(page, 'touchmove', 55, 800); await frame(page);
    assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), 'true');
    await touch(page, 'touchend', 55, 800);
    await page.evaluate(selector => document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })), selector);
    await page.waitForURL(base + '/bible_form/');
    assert.deepEqual(errors, []);
  });
}

test('Android restores card backdrops after a cancelled swipe and phone web keeps them throughout', async t => {
  for (const platform of ['android', 'web']) {
    const { page } = await setup(t, 'chromium', { platform, href: '/friends/' });
    const card = panel(page, '/normal_UserProfile').getByTestId('profile-header-card');
    await page.locator('nav a[href^="/normal_UserProfile"]').click();
    await page.waitForURL(base + '/normal_UserProfile/');
    await card.getByText('iOS Tester', { exact: true }).waitFor();
    const backdrop = () => card.evaluate(node => getComputedStyle(node).backdropFilter);
    const atRest = await backdrop();
    assert.notEqual(atRest, 'none');
    await touch(page, 'touchstart', 80);
    await touch(page, 'touchmove', 160);
    await page.locator('[data-tab-active="true"][data-swipe-moving]').waitFor();
    assert.equal(await backdrop(), platform === 'android' ? 'none' : atRest);
    await touch(page, 'touchcancel', 160, 350, { cancel: true });
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await backdrop(), atRest);
  }
});

test('trusted mobile drag follows the finger before navigating to the next tab', async t => {
  const { page, context, errors } = await setup(t, 'chromium', { href: '/friends/' });
  await panel(page, '/friends').locator('[data-page-skeleton]').waitFor({ state: 'detached' });
  await panel(page, '/normal_UserProfile').locator('[data-preview-content]').first().waitFor({ state: 'attached' });
  // Anchor the finger on the heading. A fixed screen coordinate can land on
  // the horizontally scrollable notes strip, which owns its own gesture.
  const heading = await panel(page, '/friends').getByRole('heading', { name: 'Friends activity' }).boundingBox();
  const y = heading.y + heading.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y }] });
  // Let Chromium present each trusted move before dispatching the next one.
  // A burst of CDP moves can be coalesced after the assertion/touchEnd.
  for (const x of [260, 230, 190, 140]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await frame(page);
  }
  await frame(page);
  // CDP completion/rAF do not guarantee the compositor has presented the final
  // trusted move. Observe the held position before releasing the finger.
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-tab-panel="/normal_UserProfile"]');
    const left = node?.getBoundingClientRect().left;
    return left > 180 && left < 310;
  }, null, { timeout: 2000 });
  const left = await panel(page, '/normal_UserProfile').evaluate(node => node.getBoundingClientRect().left);
  assert.ok(left > 180 && left < 310, `neighbor follows held finger at ${left}`);
  assert.equal(new URL(page.url()).pathname, '/friends/');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 20, y }] });
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
  const { page, errors } = await setup(t, 'chromium', { waitForPrayReads: false });
  await page.evaluate(() => localStorage.setItem('taspe7_category_hymns_tour_done', '1'));
  const hrefs = ['/pray', '/bible_form', '/friends', '/normal_UserProfile'];
  for (const href of hrefs.slice(1)) {
    await drag(page, 310, 40);
    await page.waitForURL(base + href + '/');
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await panel(page, href).getAttribute('data-tab-active'), 'true');
    assert.ok(await page.locator('[data-tab-panel]').count() <= 3, 'only the active page and neighbors may be mounted');
  }
  for (const href of hrefs.slice(0, -1).reverse()) {
    await drag(page, 60, 330);
    await page.waitForURL(base + href + '/');
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await panel(page, href).getAttribute('data-tab-active'), 'true');
  }
  assert.ok(await page.locator('[data-tab-panel]').count() <= 4);
  assert.equal(await page.locator('[data-tab-active="true"]').count(), 1);
  assert.deepEqual(errors, []);
});

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: a short slow drag eases back and a short flick commits`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/friends/' });
    await panel(page, '/normal_UserProfile').locator('[data-preview-content]').first().waitFor({ state: 'attached' });
    // Keep automation round trips out of the velocity samples.
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
    await touch(page,'touchstart',280); await page.clock.runFor(200);
    await touch(page,'touchmove',260); await page.clock.runFor(200);
    await touch(page,'touchend',244);
    const duration = await panel(page,'/friends').evaluate(node => parseFloat(getComputedStyle(node).transitionDuration));
    assert.ok(duration >= 0.36 && duration <= 0.39);
    await page.clock.runFor(100);
    const offset = await panel(page,'/friends').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m41);
    assert.ok(offset <= 0 && offset >= -36);
    await page.clock.runFor(350);
    assert.equal(await panel(page,'/friends').getAttribute('data-tab-active'),'true');
    await touch(page,'touchstart',280); await page.clock.runFor(20);
    await touch(page,'touchmove',260); await page.clock.runFor(20);
    await touch(page,'touchend',244); await page.clock.runFor(500);
    await page.waitForURL(base + '/normal_UserProfile/');
    assert.deepEqual(errors,[]);
  });
}

test('cached Profile returns without replacing its ready layout with a skeleton', async t => {
  const { page, errors } = await setup(t, 'chromium', { href: '/normal_UserProfile/' });
  const profile = panel(page, '/normal_UserProfile');
  await profile.getByText('iOS Tester', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Pray', exact: true }).click();
  await profile.waitFor({ state: 'detached' });
  await page.route('**/users/profile-summary', route => route.abort());
  await page.evaluate(() => {
    window.profileFlashes = 0;
    window.profileWatch = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const ready = node.closest('[data-tab-panel="/normal_UserProfile"][data-tab-ready="true"]');
        if (ready && (node.matches('[data-page-skeleton="profile"]') || node.querySelector('[data-page-skeleton="profile"]'))) window.profileFlashes++;
      }
    });
    profileWatch.observe(document.body, { subtree: true, childList: true });
  });
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await profile.getByText('iOS Tester', { exact: true }).waitFor({ state: 'attached' });
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await profile.getByText('iOS Tester', { exact: true }).waitFor();
  assert.equal(await profile.locator('[data-page-skeleton]').count(), 0);
  assert.equal(await page.evaluate(() => { profileWatch.disconnect(); return profileFlashes; }), 0);
  assert.deepEqual(errors, []);
});
test('evicted tabs restore cached verses, reading offset and Friends section without idle warming', async t => {
  const { page } = await setup(t, 'chromium', { href: '/pray/', deferIdle: true, beforeNavigate: async page => {
    await page.evaluate(() => localStorage.setItem('taspe7_bible_translation', 'KEH'));
    await page.evaluate(() => localStorage.setItem('taspe7_bible_last_verses', JSON.stringify({
      bookName: 'Test book', translation: 'KEH', chapter: 1,
      verses: Array.from({ length: 60 }, (_, i) => ({ _id: String(i + 1), verseNumber: i + 1, text: 'Saved verse ' + i })),
    })));
  } });
  const visit = async href => {
    await page.locator('nav a[href^="' + href + '"]').evaluate(link => link.click());
    await page.waitForURL(base + href + '/');
  };
  await visit('/bible_form');
  const bible = panel(page, '/bible_form');
  const reader = bible.locator('[data-preview-content="bible"]');
  await reader.getByText('Saved verse 30', { exact: true }).waitFor({ state: 'attached' });
  const scroller = bible.locator('.custom-scrollbar-thin[data-lenis-prevent-wheel]').first();
  await frame(page); await frame(page);
  await scroller.evaluate(el => { el.scrollTo({ top: 320, behavior: 'instant' }); el.dispatchEvent(new Event('scroll')); });
  assert.equal(await scroller.evaluate(el => el.scrollTop), 320);
  await visit('/friends');
  await panel(page, '/friends').getByRole('button', { name: 'My Friends', exact: true }).click();
  await visit('/normal_UserProfile');
  assert.equal(await bible.count(), 0);
  await page.route(/\/api\//, route => route.abort('internetdisconnected'));
  const cdp = await page.context().newCDPSession(page);
  for (let cycle = 0; cycle < 3; cycle++) {
    await visit('/friends');
    await reader.getByText('Saved verse 30', { exact: true }).waitFor({ state: 'attached' });
    assert.equal(await scroller.evaluate(el => el.scrollTop), 320);
    const historyLength = await page.evaluate(() => history.length);
    await touch(page, 'touchstart', 80);
    await touch(page, 'touchmove', 185);
    await frame(page);
    const preview = await bible.evaluate(node => ({
      left: node.getBoundingClientRect().left,
      skeletons: node.querySelectorAll('[data-page-skeleton]').length,
      width: innerWidth,
    }));
    assert.ok(preview.left < 0 && preview.left > -preview.width);
    assert.equal(preview.skeletons, 0);
    await touch(page, 'touchend', 185, 350, { cancel: true });
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => history.length), historyLength);
    await visit('/pray');
    assert.equal(await panel(page, '/friends').count(), 0);
    await visit('/bible_form');
    await panel(page, '/friends').locator('button').filter({ hasText: /^My Friends$/ }).locator('div').waitFor({ state: 'attached' });
    assert.ok(await page.locator('[data-tab-panel]').count() <= 3);
    assert.equal(await bible.locator('[data-bible-verse]').count(), 60);
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    t.diagnostic('Cycle ' + (cycle + 1) + ' used JS heap: ' + (heap.usedSize / 1048576).toFixed(1) + ' MiB');
    await visit('/normal_UserProfile');
  }
});
test('tapping the current tab cancels a cold swipe before its delayed route commit', async t => {
  const { page } = await setup(t, 'chromium', { href: '/friends/', deferIdle: true });
  const length = await page.evaluate(() => history.length);
  await touch(page, 'touchstart', 280);
  await touch(page, 'touchmove', 100);
  await frame(page);
  await page.evaluate(() => {
    const target = window.__dragTarget;
    const end = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperties(end, { touches: { value: [] }, changedTouches: { value: [{ identifier: 10, clientX: 60, clientY: 350, target }] } });
    target.dispatchEvent(end);
    document.querySelector('nav a[href^="/friends"]').click();
  });
  await page.waitForTimeout(1300);
  assert.equal(new URL(page.url()).pathname, '/friends/');
  assert.equal(await page.evaluate(() => history.length), length);
  assert.equal(await page.locator('nav a[aria-current="page"]').getAttribute('href'), '/friends/');
  assert.equal(await page.locator('[data-tab-pager][data-swiping]').count(), 0);
});

test('a released swipe supersedes a bottom tap waiting for worker control', async t => {
  const { page } = await setup(t, 'chromium', { href: '/friends/', deferIdle: true });
  const historyLength = await page.evaluate(() => {
    const worker = navigator.serviceWorker;
    const controller = worker.controller;
    Object.defineProperty(worker, 'controller', { configurable: true, value: null });
    worker.register = () => new Promise(() => {});
    window.releaseTabWorker = () => {
      Object.defineProperty(worker, 'controller', { configurable: true, value: controller });
      worker.dispatchEvent(new Event('controllerchange'));
    };
    document.querySelector('nav a[href^="/pray"]').click();
    return history.length;
  });
  await drag(page, 310, 40);
  await page.locator('nav a[href^="/normal_UserProfile"][aria-current="page"]').waitFor();
  assert.equal(new URL(page.url()).pathname, '/friends/', 'the highlight updates before routing is ready');
  await page.evaluate(() => window.releaseTabWorker());
  await page.waitForURL(base + '/normal_UserProfile/');
  assert.equal(await page.locator('nav a[aria-current="page"]').getAttribute('href'), '/normal_UserProfile/');
  assert.equal(await page.evaluate(() => history.length), historyLength + 1);
});

test('a different bottom tab takes the highlight from an accepted swipe', async t => {
  const { page } = await setup(t, 'webkit', { href: '/friends/', deferIdle: true });
  const length = await page.evaluate(() => history.length);
  await drag(page, 310, 40);
  await page.locator('nav a[href^="/normal_UserProfile"][aria-current="page"]').waitFor();
  await page.locator('nav a[href^="/bible_form"]').tap();
  await page.locator('nav a[href^="/bible_form"][aria-current="page"]').waitFor();
  await page.waitForURL(base + '/bible_form/');
  assert.equal(await page.evaluate(() => history.length), length + 1);
});

test('Back during a committed swipe restores the preceding tab and its draft', async t => {
  const { page } = await setup(t, 'chromium');
  await page.locator('textarea').first().fill('Before Back');
  await page.locator('textarea').first().blur();
  await page.locator('nav a[href^="/friends"]').click();
  await page.waitForURL(base + '/friends/');
  await panel(page, '/normal_UserProfile').locator('[data-preview-content]').waitFor({ state: 'attached' });
  await drag(page, 310, 40);
  await page.evaluate(() => history.back());
  await page.waitForURL(base + '/');
  await page.waitForTimeout(400);
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await panel(page, '/pray').locator('textarea').first().inputValue(), 'Before Back');
  assert.equal(await page.locator('[data-swiping]').count(), 0);
  assert.equal(await page.locator('nav a[aria-current="page"]').getAttribute('href'), '/pray/');
});
test('packaged Pray opens with APIs unavailable and a swipe round trip preserves its draft', async t => {
  const { page } = await setup(t, 'chromium', { href: '/pray/', beforeNavigate: async p => {
    await p.route(/\/api\//, route => route.fulfill({ status: 503, json: { message: 'Offline' } }));
  } });
  const draft = panel(page, '/pray').locator('textarea').first();
  await draft.fill('Offline draft'); await draft.blur();
  await drag(page, 310, 40); await page.waitForURL(base + '/bible_form/');
  await page.waitForSelector('[data-swiping]', { state: 'detached' });
  await drag(page, 60, 330); await page.waitForURL(base + '/pray/');
  assert.equal(await draft.inputValue(), 'Offline draft');
  assert.equal(await page.locator('nav a[aria-current="page"]').getAttribute('href'), '/pray/');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('[inert]')), false);
});

test('a second signed-in account starts with its own Friends view and Profile identity', async t => {
  const { page } = await setup(t, 'chromium', { href: '/friends/' });
  await page.getByRole('button', { name: 'Sent', exact: true }).click();
  await page.locator('nav a[href^="/normal_UserProfile"]').click();
  await panel(page, '/normal_UserProfile').getByText('iOS Tester', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('taspe7:logout'));
    for (const [key, value] of Object.entries({ Token: 'second-token', ID: 'second', Username: 'second' })) localStorage.setItem('user_Taspe7_' + key, value);
  });
  await page.route('**/users/profile-summary', route => route.fulfill({ json: { user: { _id: 'second', Name: 'Second tester', username: 'second' }, counts: { notes: 0, highlights: 0 } } }));
  await page.goto(base + '/friends/');
  await page.getByText(/Incoming requests \(/).first().waitFor();
  await page.locator('nav a[href^="/normal_UserProfile"]').click();
  await panel(page, '/normal_UserProfile').getByText('Second tester', { exact: true }).waitFor();
  assert.equal(await panel(page, '/normal_UserProfile').getByText('iOS Tester', { exact: true }).count(), 0);
});

for (const engine of ['webkit', 'chromium']) {
  test(`${engine}: Profile settings Back restores the same menu position`, async t => {
    const { page } = await setup(t, engine, { href: '/normal_UserProfile/', beforeNavigate: async page => {
      await page.route('**/billing/catalog', route => route.fulfill({ json: { plans: [], providers: {} } }));
    } });
    const settings = panel(page, '/normal_UserProfile');
    for (const [label, hash] of [[/^Highlights/i, 'highlights'], [/^Notes/i, 'notes'], [/^settings/i, 'bible_settings']]) {
      const row = settings.getByRole('button', { name: label }).first();
      await row.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
      const y = await page.evaluate(() => scrollY);
      assert.ok(y > 50);
      await row.tap();
      await page.waitForURL('**/#' + hash);
      await page.waitForFunction(() => scrollY === 0);
      if (hash === 'notes') {
        await settings.getByRole('button', { name: 'Back', exact: true }).tap();
      } else {
        await drag(page, 70, 85, { cancel: true });
        assert.equal(new URL(page.url()).hash, '#' + hash);
        await drag(page, 70, 255);
      }
      await row.waitFor();
      await page.waitForFunction(top => Math.abs(scrollY - top) <= 2, y);
      assert.equal(new URL(page.url()).hash, '');
    }
    const plans = settings.getByRole('button', { name: /Plans & subscription/i });
    await plans.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const y = await page.evaluate(() => scrollY);
    await plans.tap();
    await page.getByRole('link', { name: 'Subscription terms' }).click();
    const terms = page.getByRole('link', { name: 'Back to plans' });
    await terms.waitFor();
    for (const [type, x] of [['touchstart', 70], ['touchmove', 230], ['touchend', 230]]) {
      await touch(page, type, x, 350, { selector: '.app-page-transition' });
    }
    await page.waitForURL('**/plans/');
    await page.getByRole('link', { name: 'Back to profile' }).click();
    await plans.waitFor();
    await page.waitForFunction(top => Math.abs(scrollY - top) <= 2, y);
    assert.equal((await page.locator('nav [aria-current="page"]').innerText()).trim(), 'Profile');
  });
}
