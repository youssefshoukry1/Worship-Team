/* eslint-disable @typescript-eslint/no-require-imports -- Node browser test entry point. */
// Build first: node --test tests/bible-layout.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop } = require('./helpers/swipe-browser.cjs');
const { reader } = require('./helpers/bible-settings-browser.cjs');
before(() => start());
after(stop);

async function geometry(page) {
  return page.evaluate(() => {
    const bounds = selector => {
      const node = document.querySelector(selector), box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    };
    const viewportProbe = document.createElement('div');
    viewportProbe.style.cssText = 'position:fixed;height:100dvh;visibility:hidden;pointer-events:none';
    document.body.append(viewportProbe);
    const visibleHeight = viewportProbe.getBoundingClientRect().height;
    viewportProbe.remove();
    return { height: visibleHeight, layoutHeight: innerHeight, visualHeight: visualViewport?.height, documentHeight: document.documentElement.scrollHeight, bodyHeight: document.body.scrollHeight,
      globalFooter: Boolean(document.querySelector('main > footer, body > footer')),
      header: bounds('.app-header'), reader: bounds('[data-feature="bible-reader"].app-page'),
      surface: bounds('.app-reading-surface'), bottomNav: bounds('.app-bottom-nav'),
      chapterNav: bounds('[data-bible-chapter-navigation]') };
  });
}
function fillsWindow(state) {
  assert.equal(state.globalFooter, false);
  assert.ok(state.documentHeight <= state.height + 1, JSON.stringify(state));
  assert.ok(state.bodyHeight <= state.height + 1, JSON.stringify(state));
  assert.ok(Math.abs(state.surface.bottom - state.height) <= 1, `no unused strip below the reader: ${JSON.stringify(state)}`);
  assert.ok(state.surface.top >= state.header.bottom - 1, 'reader must not overlap the header');
  assert.ok(Math.abs(state.reader.bottom - state.height) <= 1);
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: the website Bible fills short/tall windows without a footer gap before and after scrolling`, async t => {
    const { page, surface, errors } = await reader(t, engine, { platform: 'web', contextOptions: {
      viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 Chrome/130.0.0.0',
    } });
    const scroll = surface.locator(':scope > [data-lenis-prevent-wheel]');
    for (const height of [900, 1400, 720, 480]) {
      await page.setViewportSize({ width: 1280, height });
      await scroll.evaluate(node => { node.scrollTop = 0; });
      await page.waitForTimeout(250);
      const before = await geometry(page); fillsWindow(before);
      assert.ok(before.chapterNav.bottom <= before.bottomNav.top - 8, 'chapter controls stay above the fixed navigation');
      await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
      await page.waitForFunction(height => document.querySelector('.app-bottom-nav').getBoundingClientRect().top >= height - 1, height);
      const after = await geometry(page); fillsWindow(after);
      assert.ok(after.bottomNav.top >= height - 1, 'scrolling still hides the navigation');
      assert.equal(await scroll.evaluate(node => node.scrollTop > 0), true, 'verses still scroll inside the reader');
    }
    assert.deepEqual(errors, []);
  });

  test(`${engine}: mobile website and native-sized viewports keep the reader within the visible window`, async t => {
    const { page, surface, errors } = await reader(t, engine, { platform: 'web' });
    for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 650 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await surface.locator(':scope > [data-lenis-prevent-wheel]').evaluate(node => { node.scrollTop = node.scrollHeight; });
      await page.waitForTimeout(100);
      fillsWindow(await geometry(page));
    }
    assert.deepEqual(errors, []);
  });
}
