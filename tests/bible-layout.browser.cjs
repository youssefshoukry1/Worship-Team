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
  for (const input of ['wheel', 'touch']) {
    test(`${engine}: chapter arrows keep bottom navigation hidden until upward ${input} input`, { timeout: 45000 }, async t => {
      const passage = [1, 2, 3].flatMap(chapter => Array.from({ length: 24 }, (_, i) => ({
        _id: `nav-${chapter}-${i + 1}`, bookName: 'Genesis', bookNumber: 1, chapter, verseNumber: i + 1, translation: 'AVD',
        text: `Chapter ${chapter} verse ${i + 1}. ${'A passage to read while scrolling. '.repeat(6)}`,
      })));
      const { page, surface, errors } = await reader(t, engine, { passage, platform: 'web', swipeEnabled: true,
        ...(input === 'wheel' ? { contextOptions: { viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 } } : {}),
      });
      page.setDefaultTimeout(10000);
      const scroll = surface.locator(':scope > [data-lenis-prevent-wheel]');
      const arrows = surface.locator('[data-bible-chapter-navigation] button');
      const hidden = () => page.waitForFunction(() => document.querySelector('.app-bottom-nav').classList.contains('translate-y-full'));
      const shown = () => page.waitForFunction(() => document.querySelector('.app-bottom-nav').classList.contains('translate-y-0'));
      const setScroll = value => scroll.evaluate(async (node, value) => { node.scrollTop = value; await new Promise(requestAnimationFrame); }, value);
      const gesture = async direction => {
        if (input === 'wheel') {
          const box = await scroll.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, direction === 'up' ? -80 : 80);
        } else {
          await scroll.evaluate((node, direction) => {
            const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
            const send = (type, currentY) => {
              const touch = { identifier: 1, target: node, clientX: x, clientY: currentY };
              const event = new Event(type, { bubbles: true });
              Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [touch] }, changedTouches: { value: [touch] } });
              node.dispatchEvent(event);
            };
            send('touchstart', y); send('touchmove', y + (direction === 'up' ? 40 : -40)); send('touchend', y);
          }, direction);
        }
      };
      await surface.locator('[data-bible-verse="nav-1-1"]').waitFor();
      await setScroll(350); await hidden();
      await arrows.last()[input === 'touch' ? 'tap' : 'click']();
      await surface.locator('[data-bible-verse="nav-2-1"]').waitFor();
      assert.equal(await scroll.evaluate(node => node.scrollTop), 0, 'the new chapter resets to the top');
      await hidden();
      await setScroll(200); await setScroll(0); await hidden();
      await gesture('down'); await hidden();
      await gesture('up'); await shown();

      await setScroll(350); await hidden();
      await arrows.first()[input === 'touch' ? 'tap' : 'click']();
      await surface.locator('[data-bible-verse="nav-1-1"]').waitFor();
      await hidden();
      // Adjacent primary tabs stay mounted; leaving Bible must release its hide.
      await page.locator('.app-bottom-nav a[href^="/hymns"]').evaluate(node => node.click());
      await page.waitForURL(/\/hymns\/?$/);
      await shown();
      assert.deepEqual(errors, []);
    });
  }

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
    const { page, surface, errors } = await reader(t, engine, { platform: 'web', swipeEnabled: true });
    for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 650 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      await surface.locator(':scope > [data-lenis-prevent-wheel]').evaluate(node => { node.scrollTop = node.scrollHeight; });
      await page.waitForTimeout(100);
      fillsWindow(await geometry(page));
    }
    assert.deepEqual(errors, []);
  });
}
