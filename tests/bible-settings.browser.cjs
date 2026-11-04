/* eslint-disable @typescript-eslint/no-require-imports -- Node browser test entry point. */
// Run after npm run build: node --test tests/bible-settings.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop } = require('./helpers/swipe-browser.cjs');
const { reader } = require('./helpers/bible-settings-browser.cjs');
before(() => start());
after(stop);
const settled = panel => panel.evaluate(async node => {
  await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {})));
});

for (const engine of ['chromium', 'webkit']) {
  for (const mode of ['paragraph', 'list']) {
    test(`${engine}: ${mode} settings opening/closing skips chapter rendering and preserves scrolling and selection`, async t => {
      const { page, surface, errors, verseCount } = await reader(t, engine, { mode });
      assert.equal(verseCount, 176);
      assert.equal(await surface.locator('[data-bible-verse]').count(), 176);
      const trigger = surface.getByTitle('Settings', { exact: true });
      const chapterMaps = await page.evaluate(() => window.__chapterMaps);
      const retained = surface.locator('[data-bible-settings]');
      await retained.waitFor({ state: 'hidden' });
      assert.equal(await retained.getAttribute('inert'), '');
      await retained.evaluate(node => { node.__mountedProof = 'same-panel'; });
      await trigger.tap();
      const panel = page.getByRole('dialog', { name: 'Settings', exact: true });
      await panel.waitFor(); await settled(panel);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => window.__chapterMaps), chapterMaps, 'opening must not map the chapter again');
      const appearance = await panel.evaluate(node => {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return { filter: style.backdropFilter || style.webkitBackdropFilter, background: style.backgroundColor, transform: style.transform, left: rect.left, bottom: rect.bottom, right: rect.right };
      });
      assert.equal(appearance.filter, 'none');
      assert.match(appearance.background, /^rgb\(/, 'panel background is opaque');
      assert.ok(appearance.left >= 0 && appearance.right <= 391 && appearance.bottom <= 844);
      assert.ok(['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(appearance.transform));
      await panel.getByTitle('Close', { exact: true }).tap();
      await retained.waitFor({ state: 'hidden' });
      assert.equal(await retained.evaluate(node => node.__mountedProof), 'same-panel');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => window.__chapterMaps), chapterMaps, 'closing must not map the chapter again');
      await trigger.tap(); await panel.waitFor(); await settled(panel);
      await page.keyboard.press('Escape'); await retained.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
      assert.equal(await page.evaluate(() => window.__chapterMaps), chapterMaps);
      await trigger.tap(); await panel.waitFor(); await settled(panel);
      await page.touchscreen.tap(300, 300); // Outside the floating panel.
      await retained.waitFor({ state: 'hidden' });
      assert.equal(await surface.locator('[data-bible-verse][data-selected="true"]').count(), 0, 'dismissal must not select a verse');
      await page.waitForTimeout(410);
      const verse = surface.locator('[data-bible-verse]').first();
      await verse.tap();
      await page.waitForFunction(() => document.querySelector('[data-bible-verse][data-selected="true"]'));
      assert.deepEqual(errors, []);
    });
  }

  test(`${engine}: font, spacing, gap, mode and selection controls still update and persist without layout animations`, async t => {
    const { page, surface, errors } = await reader(t, engine);
    await surface.getByTitle('Settings', { exact: true }).tap();
    const panel = page.getByRole('dialog', { name: 'Settings', exact: true });
    await panel.waitFor(); await settled(panel);
    const verse = surface.locator('[data-bible-verse]').first();
    const fontBefore = await verse.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    await panel.getByTitle('Increase font size').tap();
    await page.waitForFunction(font => Number(localStorage.getItem('taspe7_bible_verse_font_size')) === font, fontBefore + 2);
    assert.equal(await verse.evaluate(node => parseFloat(getComputedStyle(node).fontSize)), fontBefore + 2);
    await panel.getByTitle('Increase spacing').tap();
    await page.waitForFunction(() => Number(localStorage.getItem('taspe7_bible_verse_spacing')) > 16);
    await panel.getByRole('button', { name: 'Increase verse gap', exact: true }).tap();
    const gap = await panel.getByRole('group', { name: 'Verse gap', exact: true }).locator('output').textContent();
    assert.ok(gap.endsWith('px'));
    const properties = await surface.locator('[data-bible-verse]').evaluateAll(nodes => nodes.flatMap(node => {
      const transition = element => {
        const style = getComputedStyle(element);
        return style.transitionDuration.split(',').some(duration => parseFloat(duration) > 0) ? [style.transitionProperty] : [];
      };
      const text = node.querySelector('p');
      return [...transition(node), ...transition(text || node.parentElement)];
    }));
    assert.ok(properties.every(property => !/\ball\b|font-size|line-height|margin/.test(property)), 'font and spacing must apply immediately, without per-frame layout');
    await panel.getByRole('button', { name: 'Select All', exact: true }).tap();
    assert.equal(await surface.locator('[data-bible-verse][data-selected="true"]').count(), 176);
    await panel.getByRole('button', { name: 'Deselect All', exact: true }).tap();
    await page.waitForFunction(() => document.querySelectorAll('[data-bible-verse][data-selected="true"]').length === 0);
    assert.equal(await surface.locator('[data-bible-verse][data-selected="true"]').count(), 0);
    await panel.getByRole('button', { name: 'Vertical', exact: true }).tap();
    assert.equal(await surface.locator('.bible-verse').count(), 176);
    assert.equal(await panel.isVisible(), true, 'changing mode must keep settings open');
    await page.reload();
    await surface.getByTitle('Settings', { exact: true }).waitFor();
    assert.equal(await surface.locator('.bible-verse').count(), 176);
    assert.equal(await surface.locator('.bible-verse p').first().evaluate(node => parseFloat(getComputedStyle(node).fontSize)), fontBefore + 2);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: Arabic settings fit a narrow screen and reduced motion removes movement`, async t => {
    const { page, surface, errors } = await reader(t, engine, { reducedMotion: true, language: 'ar' });
    await page.setViewportSize({ width: 320, height: 568 });
    const trigger = surface.getByTitle('\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a', { exact: true });
    await trigger.tap();
    const panel = page.getByRole('dialog', { name: '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a', exact: true });
    await panel.waitFor();
    const state = await panel.evaluate(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return { direction: style.direction, transform: style.transform, animations: node.getAnimations().length, left: rect.left, right: rect.right, bottom: rect.bottom };
    });
    assert.equal(state.direction, 'rtl'); assert.equal(state.transform, 'none'); assert.equal(state.animations, 0);
    assert.ok(state.left >= 0 && state.right <= 320 && state.bottom <= 568);
    await panel.getByTitle('Close', { exact: true }).tap();
    await surface.locator('[data-bible-settings]').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
  });
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: the first opening before preparation commits an invisible panel before animating`, async t => {
    const { page, surface, errors } = await reader(t, engine, { warmSettings: false });
    await surface.evaluate(node => {
      const observer = new MutationObserver(records => {
        for (const record of records) for (const added of record.addedNodes) {
          if (added.nodeType !== 1 || !added.matches('[data-bible-settings]')) continue;
          window.__initialSettingsPaint = { opacity: getComputedStyle(added).opacity, state: added.dataset.state };
          observer.disconnect();
        }
      });
      observer.observe(node, { childList: true });
    });
    await surface.getByTitle('Settings', { exact: true }).tap();
    const panel = page.getByRole('dialog', { name: 'Settings', exact: true });
    await panel.waitFor(); await settled(panel);
    assert.deepEqual(await page.evaluate(() => window.__initialSettingsPaint), { opacity: '0', state: 'closed' });
    assert.equal(await panel.getAttribute('data-state'), 'open');
    assert.deepEqual(errors, []);
  });

  test(`${engine}: a tap before idle preparation starts hidden and rapid toggles cannot flash or reopen a dismissed panel`, async t => {
    const { page, surface, errors } = await reader(t, engine, { warmSettings: false });
    const trigger = surface.getByTitle('Settings', { exact: true });
    const retained = surface.locator('[data-bible-settings]');
    assert.equal(await retained.count(), 0, 'idle has not prepared this panel');
    await trigger.evaluate(node => { node.click(); node.click(); });
    await page.waitForTimeout(200);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await retained.waitFor({ state: 'hidden' });
    await trigger.click();
    await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
    await settled(retained);
    await trigger.evaluate(node => { node.click(); node.click(); node.click(); });
    await retained.waitFor({ state: 'hidden' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await retained.getAttribute('aria-hidden'), 'true');
    assert.equal(await retained.getAttribute('inert'), '');
    assert.deepEqual(errors, []);
  });
}
