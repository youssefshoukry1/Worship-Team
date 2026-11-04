/* eslint-disable @typescript-eslint/no-require-imports -- Node browser regression suite. */
// Build first: node --test tests/swipe-layout.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop } = require('./helpers/swipe-browser.cjs');
const { reader } = require('./helpers/bible-settings-browser.cjs');
before(() => start());
after(stop);

const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const panel = (page, tab) => page.locator(`[data-tab-panel="${tab}"]`);
async function touch(page, type, x, y = 320, selector = '[data-tab-active="true"]') {
  return page.evaluate(({ type, x, y, selector }) => {
    if (type === 'touchstart') window.__layoutTouchTarget = document.querySelector(selector);
    const target = window.__layoutTouchTarget;
    const point = { identifier: 71, clientX: x, clientY: y, target };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: ['touchend', 'touchcancel'].includes(type) ? [] : [point] },
      changedTouches: { value: [point] },
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { type, x, y, selector });
}
async function idle(page) {
  await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
}
async function geometry(page) {
  return page.evaluate(() => {
    const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;height:100dvh;visibility:hidden'; document.body.append(probe);
    const height = probe.getBoundingClientRect().height; probe.remove();
    return { height, documentHeight: document.documentElement.scrollHeight, width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      y: scrollY, pager: bounds('[data-tab-pager]'), active: bounds('[data-tab-active="true"]'),
      previews: [...document.querySelectorAll('[data-tab-active="false"]')].map(n => ({ height: n.clientHeight, tab: n.dataset.tabPanel })) };
  });
}
async function fullLibrary(page) {
  await page.waitForFunction(() => document.querySelector('[data-tab-panel="/hymns"] #Category_Humns')?.clientHeight > 100000);
  const count = await panel(page, '/hymns').locator('[data-item-index]').count();
  assert.ok(count > 0 && count < 100, `the real offline library stays virtualized: ${count} rows`);
}
function contained(state) {
  assert.equal(state.y, 0);
  assert.ok(state.documentHeight <= state.height + 1, JSON.stringify(state));
  assert.ok(state.documentWidth <= state.width + 1, JSON.stringify(state));
  assert.ok(Math.abs(state.active.bottom - state.height) <= 1, JSON.stringify(state));
  for (const preview of state.previews) assert.ok(preview.height <= state.height - 79, JSON.stringify(state));
}

for (const engine of ['chromium', 'webkit']) {
  const platform = engine === 'chromium' ? 'android' : 'ios';
  test(`${engine}: prepared offline Hymns never extend the Bible document, including repeated held/cancelled swipes`, async t => {
    const { page, errors } = await reader(t, engine, { platform, swipeEnabled: true });
    await fullLibrary(page);
    const before = await geometry(page); contained(before);
    await page.evaluate(() => window.scrollTo({ top: 300000, behavior: 'instant' }));
    contained(await geometry(page));
    for (const [from, to] of [[280, 180], [90, 190], [280, 180]]) {
      await touch(page, 'touchstart', from); await touch(page, 'touchmove', to); await frame(page);
      contained(await geometry(page));
      await touch(page, 'touchcancel', to); await idle(page);
      assert.equal((await geometry(page)).documentHeight, before.documentHeight);
      contained(await geometry(page));
    }
    assert.deepEqual(errors, []);
  });

  test(`${engine}: a long scrolled source keeps its document height, visible content and scroll position through cancellation and navigation`, async t => {
    const { page, context, errors } = await reader(t, engine, { platform, swipeEnabled: true });
    await fullLibrary(page);
    await page.getByRole('link', { name: 'Hymns', exact: true }).click();
    await page.waitForURL(/\/hymns\/?$/); await idle(page);
    await page.evaluate(() => window.scrollTo({ top: 1600, behavior: 'instant' }));
    await page.waitForFunction(() => scrollY > 1500);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-tab-active="true"] [data-item-index]')].some(n => { const top = n.getBoundingClientRect().top; return top >= 80 && top < 400; }));
    const before = await geometry(page);
    const rowBefore = await panel(page, '/hymns').locator('[data-item-index]').evaluateAll(nodes => nodes.map(n => ({ index: n.dataset.itemIndex, top: n.getBoundingClientRect().top })).filter(n => n.top >= 80 && n.top < 400)[0]);
    assert.ok(rowBefore, 'a real hymn row is visible at the saved scroll position');
    let layers = [];
    if (engine === 'chromium') {
      const cdp = await context.newCDPSession(page);
      cdp.on('LayerTree.layerTreeDidChange', event => { layers = event.layers || []; });
      await cdp.send('LayerTree.enable');
    }
    await touch(page, 'touchstart', 90); await touch(page, 'touchmove', 185); await frame(page);
    const held = await geometry(page);
    assert.equal(held.y, before.y);
    assert.ok(Math.abs(held.documentHeight - before.documentHeight) <= 1, JSON.stringify({ before, held }));
    assert.ok(held.active.height <= held.height - 79, 'the moving source is only a screen-sized frame');
    if (engine === 'chromium') {
      assert.ok(layers.length > 0);
      assert.ok(layers.filter(n => n.drawsContent).every(n => n.height < 100000), 'a held swipe must not create a million-pixel painted layer');
    }
    const top = await panel(page, '/hymns').locator(`[data-item-index="${rowBefore.index}"]`).evaluate(n => n.getBoundingClientRect().top);
    assert.ok(Math.abs(top - rowBefore.top) <= 1, 'cropping must not move the visible source content');
    await touch(page, 'touchcancel', 185); await idle(page);
    assert.equal((await geometry(page)).y, before.y);
    await touch(page, 'touchstart', 90); await touch(page, 'touchmove', 300); await frame(page);
    await touch(page, 'touchend', 300); await page.waitForURL(/\/bible_form\/?$/); await idle(page);
    contained(await geometry(page));
    await page.setViewportSize({ width: 844, height: 390 });
    await frame(page); contained(await geometry(page));
    assert.deepEqual(errors, []);
  });

  test(`${engine}: verse-panel gestures cannot pan the document or start a page swipe, and pull-down dismissal still works`, async t => {
    const { page, surface, errors } = await reader(t, engine, { platform, swipeEnabled: true });
    await fullLibrary(page);
    await surface.locator('[data-bible-verse]').first().tap();
    const card = page.locator('[data-bible-selection-panel]'); await card.waitFor();
    await page.waitForTimeout(300);
    const bounds = await card.boundingBox(), x = bounds.x + bounds.width / 2, y = bounds.y + 16;
    const selector = '[data-bible-selection-panel]';
    await touch(page, 'touchstart', x, y, selector);
    assert.equal(await touch(page, 'touchmove', x, y - 100), true, 'upward movement must be cancelled before it pans the document');
    await touch(page, 'touchend', x, y - 100); await frame(page);
    contained(await geometry(page)); assert.equal(await card.count(), 1);
    await touch(page, 'touchstart', x, y, selector); await touch(page, 'touchmove', x - 130, y);
    assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), null);
    await touch(page, 'touchcancel', x - 130, y);
    await touch(page, 'touchstart', x, y, selector); await touch(page, 'touchmove', x, y + 60); await touch(page, 'touchend', x, y + 60);
    await card.waitFor({ state: 'detached' }); contained(await geometry(page));
    assert.deepEqual(errors, []);
  });
}

async function nativeDrag(cdp, x, y, dy) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const ratio of [0.08, 0.2, 0.4, 0.65, 1]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * ratio }] });
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('trusted Android-style touches keep the verse panel anchored while AI text scrolls and its boundaries do not pan the page', async t => {
  const { page, surface, context, errors } = await reader(t, 'chromium', { platform: 'android', swipeEnabled: true });
  await fullLibrary(page);
  await page.route('**/ai/analyze-verse', route => route.fulfill({ headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }, json: { explanation: 'A long explanation for scrolling.\n'.repeat(100) } }));
  await surface.locator('[data-bible-verse]').first().tap();
  const card = page.locator('[data-bible-selection-panel]'); await card.waitFor(); await page.waitForTimeout(300);
  const cdp = await context.newCDPSession(page);
  let bounds = await card.boundingBox();
  await nativeDrag(cdp, bounds.x + bounds.width / 2, bounds.y + 12, -150);
  await page.waitForTimeout(200); contained(await geometry(page));
  assert.equal(await card.isVisible(), true);
  await card.getByRole('button', { name: 'AI', exact: true }).click();
  await card.getByRole('button', { name: '\u062a\u0641\u0633\u064a\u0631', exact: true }).click();
  const response = card.locator('[data-ai-response-scroll]'); await response.waitFor();
  bounds = await response.boundingBox();
  await nativeDrag(cdp, bounds.x + bounds.width / 2, bounds.y + bounds.height - 12, -85);
  await page.waitForFunction(() => document.querySelector('[data-ai-response-scroll]').scrollTop > 10);
  contained(await geometry(page)); assert.equal(await card.isVisible(), true);
  await response.evaluate(n => { n.scrollTop = n.scrollHeight - n.clientHeight - 20; });
  bounds = await response.boundingBox();
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const dy of [-15, -30, -45, -30, -15]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy }] });
    await page.waitForTimeout(30);
  }
  assert.equal(await response.evaluate(n => n.scrollTop < n.scrollHeight - n.clientHeight - 5), true, 'reversing the same gesture at the response end must scroll back immediately');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  contained(await geometry(page));
  await response.evaluate(n => { n.scrollTop = n.scrollHeight; });
  bounds = await response.boundingBox();
  await nativeDrag(cdp, bounds.x + bounds.width / 2, bounds.y + bounds.height - 12, -80);
  await page.waitForTimeout(200); contained(await geometry(page));
  assert.equal(await card.isVisible(), true, 'scrolling at the response end must not dismiss the panel');
  await response.evaluate(n => { n.scrollTop = 0; });
  bounds = await response.boundingBox();
  await nativeDrag(cdp, bounds.x + bounds.width / 2, bounds.y + 12, 25);
  assert.equal(await card.isVisible(), true, 'a short response pull keeps the panel open');
  await nativeDrag(cdp, bounds.x + bounds.width / 2, bounds.y + 12, 100);
  await card.waitFor({ state: 'detached' }); contained(await geometry(page));
  assert.deepEqual(errors, []);
});
