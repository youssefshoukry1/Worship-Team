const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/manualInputScroll.js'), 'utf8').replace('export function', 'function');
let browser;
before(async () => { browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}); });
after(async () => { await browser?.close(); });

async function fixture(run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body { margin: 0; min-height: 3000px; } textarea { display:block; width:280px; height:90px; font-size:16px; margin:300px 20px 20px; }
      #pane { margin:20px; height:160px; width:300px; overflow:auto; } #pane textarea { margin:10px; } #pane div { height:600px; }
    </style><textarea id="first"></textarea><div id="pane"><div><textarea id="second"></textarea></div></div>`);
    await page.addScriptTag({ content: source + '\nwindow.disposeInputScroll = preserveManualInputScroll();' });
    await page.evaluate(() => window.scrollTo(0, 120));
    await page.waitForTimeout(50);
    await run(page, context);
  } finally { await context.close(); }
}

async function autoScroll(page, amount = 200) {
  await page.evaluate(amount => window.scrollBy({ top: amount, behavior: 'instant' }), amount);
  await page.waitForTimeout(80);
}

test('focus, keyboard viewport changes and typing do not move the page', () => fixture(async page => {
  const baseline = await page.evaluate(() => scrollY);
  await page.locator('#first').tap();
  await page.setViewportSize({ width: 390, height: 480 });
  await autoScroll(page);
  assert.equal(await page.evaluate(() => scrollY), baseline);
  await page.locator('#first').fill('Prayer text\n'.repeat(40));
  await page.locator('#first').press('End');
  await page.evaluate(() => document.querySelector('#first').scrollTop = 100);
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => scrollY), baseline);
  assert.ok(await page.locator('#first').evaluate(el => el.scrollTop) > 0, 'the textarea can still scroll its own text');
  await page.setViewportSize({ width: 390, height: 844 });
  await autoScroll(page);
  assert.equal(await page.evaluate(() => scrollY), baseline);
}));

test('a real finger swipe and its momentum remain enabled while an input is focused', () => fixture(async (page, context) => {
  await page.locator('#first').tap();
  const baseline = await page.evaluate(() => scrollY);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 355, y: 700 }] });
  for (let y = 680; y >= 350; y -= 30) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 355, y }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1000);
  const afterSwipe = await page.evaluate(() => scrollY);
  assert.ok(afterSwipe > baseline + 100, `finger scrolling should advance the page: ${baseline} -> ${afterSwipe}`);
  await autoScroll(page);
  assert.equal(await page.evaluate(() => scrollY), afterSwipe, 'later automatic movement restores the latest user position');
}));

test('wheel input remains enabled and becomes the new saved position', () => fixture(async page => {
  await page.locator('#first').tap();
  await page.mouse.move(355, 400);
  await page.mouse.wheel(0, 250);
  await page.waitForTimeout(500);
  const position = await page.evaluate(() => scrollY);
  assert.ok(position > 120);
  await autoScroll(page);
  assert.equal(await page.evaluate(() => scrollY), position);
}));

test('switching fields also protects scrollable parents without blocking textarea scrolling', () => fixture(async page => {
  await page.locator('#first').tap();
  await page.locator('#second').tap();
  const before = await page.locator('#pane').evaluate(el => el.scrollTop);
  await page.locator('#pane').evaluate(el => el.scrollTop += 150);
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#pane').evaluate(el => el.scrollTop), before);
  assert.equal(await page.evaluate(() => scrollY), 120);
}));

test('keyboard dismissal keeps position, and cleanup restores normal page behavior', () => fixture(async page => {
  await page.locator('#first').tap();
  await page.locator('#first').evaluate(el => el.blur());
  await autoScroll(page);
  assert.equal(await page.evaluate(() => scrollY), 120);
  await page.evaluate(() => window.disposeInputScroll());
  await autoScroll(page);
  assert.equal(await page.evaluate(() => scrollY), 320);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('manual-input-scroll')), false);
}));

test('a cancelled input tap does not leave the page guarded after the gesture ends', () => fixture(async page => {
  await page.locator('#first').dispatchEvent('pointerdown', { clientX: 40, clientY: 250, pointerType: 'touch' });
  await page.locator('#first').dispatchEvent('pointerup', { clientX: 40, clientY: 250, pointerType: 'touch' });
  await page.waitForTimeout(750);
  await autoScroll(page);
  assert.equal(await page.evaluate(() => scrollY), 320);
}));
