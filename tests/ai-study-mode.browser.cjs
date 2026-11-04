/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression suite. */
// Build first: node --test tests/ai-study-mode.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { start, stop, setup, getBase } = require('./helpers/swipe-browser.cjs');
const { reader } = require('./helpers/bible-settings-browser.cjs');
before(() => start());
after(stop);

for (const engine of ['chromium', 'webkit']) {
  for (const language of ['en', 'ar']) test(`${engine}: ${language} Profile mode defaults to normal and persists without saving to the server`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/normal_UserProfile/', platform: 'web', beforeNavigate: async page => {
      await page.evaluate(language => localStorage.setItem('app-language', language), language);
    } });
    const section = page.locator('section[aria-labelledby="ai-study-mode-title"]');
    await section.waitFor();
    const normal = section.locator('input[value="normal"]');
    const oldMan = section.locator('input[value="old_man"]');
    assert.equal(await normal.isChecked(), true);
    const mutations = [];
    page.on('request', request => { if (!['GET', 'OPTIONS'].includes(request.method())) mutations.push(request.url()); });
    await section.getByText(language === 'ar' ? 'الرجل الحكيم' : 'Old Man', { exact: true }).click();
    assert.equal(await oldMan.isChecked(), true);
    assert.deepEqual(mutations, []);
    assert.equal(await page.evaluate(() => localStorage.getItem('wasla_ai_study_mode_v1:tester')), 'old_man');
    await page.reload();
    await section.waitFor();
    assert.equal(await oldMan.isChecked(), true);
    await section.getByText(language === 'ar' ? 'العادي' : 'Normal', { exact: true }).click();
    assert.equal(await normal.isChecked(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    if (process.env.AI_MODE_SCREENSHOT_DIR) {
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.AI_MODE_SCREENSHOT_DIR, `wasla-ai-mode-${engine}-${language}.png`) });
    }
  });

  test(`${engine}: selected mode reaches all three AI requests and long answers stay scrollable`, async t => {
    const { page, surface, errors } = await reader(t, engine, { mode: 'list', platform: 'web' });
    const requests = [];
    const longAnswer = Array.from({ length: 10 }, (_, index) => `السطر ${index + 1}: سياق المقطع والأماكن ومعنى الكلمة الأصلية بالعربية مع توضيح موجز لما يذكره النص.`).join('\n');
    await page.route('**/ai/analyze-verse', route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      requests.push(route.request().postDataJSON());
      return route.fulfill({ headers, json: { explanation: longAnswer } });
    });
    await page.goto(`${getBase()}/normal_UserProfile/`);
    const section = page.locator('section[aria-labelledby="ai-study-mode-title"]');
    await section.getByText('Old Man', { exact: true }).click();
    await page.goto(`${getBase()}/bible_form/`);
    await surface.locator('[data-bible-verse]').first().click();
    const card = page.locator('[data-bible-selection-panel]');
    for (const [label, type] of [['تفسير', 'explain'], ['مراجع', 'cross_reference'], ['تطبيق', 'practical']]) {
      const received = page.waitForResponse(response => response.url().includes('/ai/analyze-verse') && response.request().method() === 'POST');
      await card.getByRole('button', { name: 'AI', exact: true }).click();
      await card.getByRole('button', { name: label, exact: true }).click();
      await received;
      const response = card.locator('[data-ai-response-scroll]');
      await response.waitFor();
      assert.equal(requests.at(-1).studyMode, 'old_man');
      assert.equal(requests.at(-1).analysisType, type);
      assert.equal(await response.evaluate(element => element.scrollHeight > element.clientHeight), true);
      await response.evaluate(element => { element.scrollTop = element.scrollHeight; });
      assert.equal(await response.evaluate(element => element.scrollTop > 0), true);
    }
    await page.goto(`${getBase()}/normal_UserProfile/`);
    await section.getByText('Normal', { exact: true }).click();
    await page.goto(`${getBase()}/bible_form/`);
    if (!await card.isVisible()) await surface.locator('[data-bible-verse]').first().click();
    const received = page.waitForResponse(response => response.url().includes('/ai/analyze-verse') && response.request().method() === 'POST');
    await card.getByRole('button', { name: 'AI', exact: true }).click();
    await card.getByRole('button', { name: 'تفسير', exact: true }).click();
    await received;
    assert.equal(requests.at(-1).studyMode, 'normal');
    assert.equal(requests.length, 4);
    assert.deepEqual(errors, []);
  });
}
