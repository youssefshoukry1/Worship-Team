/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression suite. */
// Build first: node --test tests/ai-study-mode.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { start, stop, setup, getBase } = require('./helpers/swipe-browser.cjs');
const { reader } = require('./helpers/bible-settings-browser.cjs');
before(() => start());
after(stop);
const journeyVerses = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/Taspe7.bibles.json'), 'utf8'))
  .filter(verse => verse.bookNumber === 43 && verse.chapter === 4 && verse.verseNumber <= 6)
  .sort((a, b) => a.verseNumber - b.verseNumber)
  .map(verse => ({ ...verse, _id: `journey-${verse.verseNumber}`, translation: 'AVD' }));

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: AI token balances update from the response without an extra request`, async t => {
    const { page, surface, errors } = await reader(t, engine, { mode: 'list', platform: 'web', language: 'en' });
    let posts = 0;
    await page.route('**/ai/analyze-verse', route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      posts++;
      const quota = { unit: 'tokens', plan: 'free', limit: 14000, used: posts === 1 ? 1600 : 12500,
        remaining: posts === 1 ? 12400 : 1500, resetsAt: '2026-11-08T12:00:00Z' };
      return posts === 1 ? route.fulfill({ headers, json: { success: true, explanation: 'يوضح المقطع أهمية حفظ الوصية في الحياة اليومية.', quota } })
        : route.fulfill({ status: 429, headers, json: { success: false, code: 'AI_TOKEN_BUDGET', message: 'رصيد التوكنز لا يكفي لهذا المقطع.', quota } });
    });
    await surface.locator('[data-bible-verse]').first().click();
    const card = page.locator('[data-bible-selection-panel]');
    await card.getByRole('button', { name: 'AI', exact: true }).click();
    await card.getByRole('button', { name: 'تفسير', exact: true }).click();
    const balance = card.locator('[data-ai-token-balance]');
    await balance.getByText('12,400 of 14,000 tokens remaining', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Close AI response', exact: true }).click();
    await card.getByRole('button', { name: 'AI', exact: true }).click();
    await card.getByRole('button', { name: 'مراجع', exact: true }).click();
    await balance.getByText('1,500 of 14,000 tokens remaining', { exact: true }).waitFor();
    assert.match(await card.getByRole('alert').textContent(), /التوكنز/);
    assert.equal(posts, 2);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });

  test(`${engine}: a dismissed request cannot overwrite newer references with its late error`, async t => {
    const { page, surface, errors } = await reader(t, engine, { mode: 'list', platform: 'web' });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const requests = [];
    t.after(() => release());
    await page.route('**/ai/analyze-verse', async route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const body = route.request().postDataJSON();
      requests.push(body);
      if (body.analysisType === 'explain') {
        await gate;
        return route.fulfill({ status: 503, headers, json: { code: 'AI_PROVIDER_BUSY', message: 'OLD_PROVIDER_ERROR' } });
      }
      return route.fulfill({ headers, json: { success: true, explanation: '• تثنية 6:5 — محبة الرب من القلب.' } });
    });
    await surface.locator('[data-bible-verse]').first().click();
    const card = page.locator('[data-bible-selection-panel]');
    const posted = page.waitForRequest(request => request.url().includes('/ai/analyze-verse') && request.method() === 'POST');
    await card.getByRole('button', { name: 'AI', exact: true }).click();
    await card.getByRole('button', { name: 'تفسير', exact: true }).click();
    await posted;
    assert.equal(await card.getByRole('button', { name: 'AI', exact: true }).isDisabled(), true);
    await card.getByRole('button', { name: 'Close AI response', exact: true }).click();
    await card.getByRole('button', { name: 'AI', exact: true }).click();
    await card.getByRole('button', { name: 'مراجع', exact: true }).click();
    const text = card.locator('[data-ai-response-scroll]');
    await text.waitFor();
    assert.match(await text.textContent(), /تثنية 6:5/);
    const oldResponse = page.waitForResponse(response => response.url().includes('/ai/analyze-verse')
      && response.request().method() === 'POST' && response.request().postDataJSON().analysisType === 'explain');
    release();
    await oldResponse;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.match(await text.textContent(), /تثنية 6:5/);
    assert.equal(await card.getByText('OLD_PROVIDER_ERROR').count(), 0);
    assert.equal(requests.length, 2);
    assert.deepEqual(errors, []);
  });

  for (const language of ['en', 'ar']) test(`${engine}: ${language} Profile mode defaults to normal and persists without saving to the server`, async t => {
    const { page, errors } = await setup(t, engine, { href: '/normal_UserProfile/#bible_settings', platform: 'web', beforeNavigate: async page => {
      await page.evaluate(language => localStorage.setItem('app-language', language), language);
    } });
    const section = page.locator('section[aria-labelledby="ai-study-mode-title"]');
    await section.waitFor();
    assert.equal(await section.getByText(language === 'ar' ? 'متوسط' : 'Medium', { exact: true }).count(), 1);
    const normal = section.locator('input[value="normal"]');
    const oldMan = section.locator('input[value="old_man"]');
    assert.equal(await normal.isChecked(), true);
    const mutations = [];
    page.on('request', request => { if (!['GET', 'OPTIONS'].includes(request.method())) mutations.push(request.url()); });
    await section.locator('label:has(input[value="old_man"])').click();
    assert.equal(await oldMan.isChecked(), true);
    assert.deepEqual(mutations, []);
    assert.equal(await page.evaluate(() => localStorage.getItem('wasla_ai_study_mode_v1:tester')), 'old_man');
    await page.reload();
    await section.waitFor();
    assert.equal(await oldMan.isChecked(), true);
    await section.locator('label:has(input[value="normal"])').click();
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
    await page.goto(`${getBase()}/normal_UserProfile/#bible_settings`);
    const section = page.locator('section[aria-labelledby="ai-study-mode-title"]');
    await section.locator('label:has(input[value="old_man"])').click();
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
    await page.goto(`${getBase()}/normal_UserProfile/#bible_settings`);
    await section.locator('label:has(input[value="normal"])').click();
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

  test(`${engine}: needed word is blue with its original and Arabic explanation only in Old Man`, async t => {
    const { page, surface, errors } = await reader(t, engine, { mode: 'list', platform: 'web' });
    await page.evaluate(() => localStorage.setItem('wasla_ai_study_mode_v1:tester', 'old_man'));
    const study = { word: 'شريعة', original: 'תּוֹרָה', language: 'hebrew', meaning: 'تعليم وإرشاد يوجهان الحياة' };
    const explained = `تربط الآية السلوك المستقيم باتباع شريعة (بالعبرية: ${study.original} — ${study.meaning}) الرب.\nالمقصود حياة تتشكل بكلام الله، لا مجرد معرفة التعليم.`;
    let payload = { explanation: explained, wordStudies: [study] };
    const modes = [];
    await page.route('**/ai/analyze-verse', route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      modes.push(route.request().postDataJSON().studyMode);
      return route.fulfill({ headers, json: payload });
    });
    const verse = surface.locator('[data-bible-verse]').first();
    const verseText = await verse.innerText();
    await verse.click();
    const card = page.locator('[data-bible-selection-panel]');
    const request = async () => {
      await card.getByRole('button', { name: 'AI', exact: true }).click();
      await card.getByRole('button', { name: 'تفسير', exact: true }).click();
      await card.locator('[data-ai-response-scroll]').waitFor();
    };
    await request();
    const word = card.locator('[data-ai-study-word]');
    assert.equal(await word.count(), 1);
    assert.equal(await word.innerText(), study.word);
    assert.equal(await card.locator('bdi[lang="he"][dir="rtl"]').innerText(), study.original);
    assert.equal((await card.locator('[data-ai-response-scroll]').innerText()).includes(study.meaning), true);
    const color = await word.evaluate(element => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });
    assert.ok(color[2] > color[0] && color[2] > color[1], `The word should be blue: ${color}`);
    assert.equal(await verse.innerText(), verseText);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.AI_MODE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.AI_MODE_SCREENSHOT_DIR, `wasla-ai-word-${engine}.png`) });
    payload = { explanation: 'شرح مباشر للمقطع، دون حاجة إلى توضيح كلمة أصلية.', wordStudies: [] };
    await request();
    assert.equal(await word.count(), 0);
    await page.evaluate(() => localStorage.setItem('wasla_ai_study_mode_v1:tester', 'normal'));
    payload = { explanation: explained, wordStudies: [study] };
    await request();
    assert.equal(await word.count(), 0, 'Normal ignores formatting metadata even if a response includes it');
    assert.deepEqual(modes, ['old_man', 'old_man', 'normal']);
    assert.deepEqual(errors, []);
  });

  test(`${engine}: optional schematic route stays in the response and is absent in Normal or without a journey`, async t => {
    const { page, surface, errors } = await reader(t, engine, { mode: 'list', platform: 'web', language: 'ar', passage: journeyVerses });
    await page.evaluate(() => localStorage.setItem('wasla_ai_study_mode_v1:tester', 'old_man'));
    const journey = { stops: [
      { place: 'اليهودية', description: 'غادرها متجهاً إلى الجليل', reference: 'يوحنا 4:3', kind: 'stop' },
      { place: 'السامرة', description: 'في طريقه عبرها', reference: 'يوحنا 4:4', kind: 'stop' },
      { place: 'الجليل', description: 'الوجهة المذكورة في المقطع', reference: 'يوحنا 4:3', kind: 'destination' }
    ] };
    let payload = { explanation: 'يوضح المقطع انتقال يسوع من اليهودية باتجاه الجليل، عبر السامرة.\nالمخطط يوضح تسلسل الطريق في سياق الآيات.', journey, wordStudies: [] };
    const requests = [], mapRequests = [];
    page.on('request', request => { if (/mapbox|maps\.google|nominatim|\.tile\./i.test(request.url())) mapRequests.push(request.url()); });
    await page.route('**/ai/analyze-verse', route => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      requests.push(route.request().postDataJSON());
      return route.fulfill({ headers, json: payload });
    });
    await surface.locator('[data-bible-verse="journey-4"]').click();
    const card = page.locator('[data-bible-selection-panel]');
    const request = async () => {
      await card.getByRole('button', { name: 'ذكاء اصطناعي', exact: true }).click();
      await card.getByRole('button', { name: 'تفسير', exact: true }).click();
      await card.locator('[data-ai-response-scroll]').waitFor();
    };
    await request();
    const map = card.locator('[data-ai-journey]');
    await map.waitFor();
    assert.equal(await map.locator('li').count(), 3);
    assert.equal(await map.locator('svg').count(), 3);
    assert.equal(await map.locator('[data-ai-journey-scrollbar]').count(), 0, 'A route that fits needs no horizontal scrollbar');
    assert.equal(await map.locator('figcaption').count(), 0);
    const mapText = await map.innerText();
    for (const removed of ['Journey', 'In passage order', 'A schematic sequence', 'مسار الرحلة', 'حسب تسلسل المقطع', 'دون مقياس']) assert.equal(mapText.includes(removed), false);
    const stations = await map.locator('li').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y };
    }));
    assert.ok(stations.every(station => Math.abs(station.y - stations[0].y) < 1));
    assert.ok(stations[0].x > stations[1].x && stations[1].x > stations[2].x, 'Stations run right to left in one row');
    assert.equal(await map.getByText('الوجهة المذكورة', { exact: true }).count(), 0);
    assert.equal(await map.getByText('Stated destination', { exact: true }).count(), 0);
    assert.equal(/يوحنا 4:\d/u.test(mapText), false);
    assert.equal(await map.getByText('السامرة', { exact: true }).count(), 1);
    assert.equal(requests[0].nearbyVerses.length, 4);
    assert.equal(requests[0].nearbyVerses.some(verse => verse.verseNumber === 4), false);
    const scroller = card.locator('[data-ai-response-scroll]');
    await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await map.getByText('الجليل', { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await map.getByText('الجليل', { exact: true }).isVisible(), true);
    const horizontal = await map.locator('[data-ai-journey-scroll]').evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth, left: element.scrollLeft, page: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(horizontal.content <= horizontal.width || Math.abs(horizontal.left) > 0, `Overflow stays inside the horizontal route: ${JSON.stringify(horizontal)}`);
    const size = await card.boundingBox();
    assert.ok(size.y >= 0 && size.y + size.height <= (await page.viewportSize()).height + 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.AI_MODE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.AI_MODE_SCREENSHOT_DIR, `wasla-ai-journey-${engine}.png`) });
    payload = { ...payload, journey: { stops: [journey.stops[0], journey.stops[1],
      { place: 'سوخار', description: 'وصل إلى المدينة', reference: 'يوحنا 4:5', kind: 'stop' },
      { place: 'بئر يعقوب', description: 'جلس عند البئر', reference: 'يوحنا 4:6', kind: 'stop' }, journey.stops[2]] } };
    await request();
    assert.equal(await map.locator('li').count(), 5);
    const horizontalBar = map.locator('[data-ai-journey-scrollbar]');
    await horizontalBar.waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await horizontalBar.evaluate(element => Number(getComputedStyle(element).opacity)), 1, 'Overflow hint remains visible until the user scrolls');
    const initialThumb = await horizontalBar.boundingBox();
    if (process.env.AI_MODE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.AI_MODE_SCREENSHOT_DIR, `wasla-ai-journey-scrollbar-${engine}.png`) });
    if (engine === 'chromium') {
      const session = await page.context().newCDPSession(page);
      const bounds = await map.locator('[data-ai-journey-scroll]').boundingBox();
      const x = bounds.x + bounds.width * 0.3, y = bounds.y + 20;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 12, y }] });
        await page.waitForTimeout(20);
      }
      await page.waitForTimeout(1000);
      assert.equal(await horizontalBar.evaluate(element => Number(getComputedStyle(element).opacity)), 1, 'The bar must not hide while the finger is held down');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => Math.abs(document.querySelector('[data-ai-journey-scroll]').scrollLeft) > 3);
      await session.detach();
      assert.equal(await card.isVisible(), true, 'Swiping the route must not dismiss the response');
    } else {
      const routeScroll = map.locator('[data-ai-journey-scroll]');
      await routeScroll.evaluate(element => element.dispatchEvent(new TouchEvent('touchstart')));
      await routeScroll.evaluate(element => { element.scrollLeft = -72; });
      await page.waitForTimeout(1000);
      assert.equal(await horizontalBar.evaluate(element => Number(getComputedStyle(element).opacity)), 1, 'Holding the route keeps its scrollbar visible');
      await routeScroll.evaluate(element => element.dispatchEvent(new TouchEvent('touchcancel')));
    }
    assert.ok((await horizontalBar.boundingBox()).x < initialThumb.x, 'The thumb follows the RTL scroll position');
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-ai-journey-scrollbar]')).opacity) < 0.05);
    await map.locator('[data-ai-journey-scroll]').evaluate(element => { element.scrollLeft = 0; });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-ai-journey-scrollbar]')).opacity) > 0.95);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-ai-journey-scrollbar]')).opacity) < 0.05);
    await map.getByText('الجليل', { exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await map.locator('[data-ai-journey-scroll]').evaluate(element => element.scrollWidth > element.clientWidth && Math.abs(element.scrollLeft) > 0), 'A longer route scrolls sideways within the card');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    payload = { explanation: 'شرح مباشر دون رحلة تتطلب مخططاً.', journey: null, wordStudies: [] };
    await request(); assert.equal(await map.count(), 0);
    await page.evaluate(() => localStorage.setItem('wasla_ai_study_mode_v1:tester', 'normal'));
    payload = { explanation: 'شرح مباشر للمقطع.', journey };
    await request(); assert.equal(await map.count(), 0);
    assert.equal(requests[3].nearbyVerses, undefined);
    assert.equal(requests.length, 4);
    assert.deepEqual(mapRequests, []);
    assert.deepEqual(errors, []);
  });
}
