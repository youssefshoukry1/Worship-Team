/* eslint-disable @typescript-eslint/no-require-imports -- Node test and benchmark entry points use CommonJS. */
// Build first: npm run build; node scripts/measure-swipe.cjs
// Real Chromium touch input; mocked API/native bridge. Never uses a live account.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { start, stop, setup } = require('../tests/helpers/swipe-browser.cjs');

const entries = field => Array.from({ length: 2000 }, (_, i) => ({
  _id: `${field}-${i}`, verseId: `verse-${i}`, bookName: 'John', chapter: 1, verseNumber: i + 1,
  date: new Date(1700000000000 + i * 60001).toISOString(), text: `Verse ${i}`, [field]: field === 'color' ? 'blue' : `Note ${i}`,
}));
const sum = (events, name) => events.filter(event => event.name === name && event.ph === 'X');
const duration = events => ({ count: events.length, totalMs: +events.reduce((n, event) => n + (event.dur || 0) / 1000, 0).toFixed(2), maxMs: +Math.max(0, ...events.map(event => (event.dur || 0) / 1000)).toFixed(2) });
async function traceResult(cdp) {
  const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await completed;
  let text = '';
  for (;;) {
    const part = await cdp.send('IO.read', { handle: stream });
    text += part.base64Encoded ? Buffer.from(part.data, 'base64').toString() : part.data;
    if (part.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  const { traceEvents } = JSON.parse(text);
  return { style: duration(sum(traceEvents, 'UpdateLayoutTree')), layout: duration(sum(traceEvents, 'Layout')), paint: duration(sum(traceEvents, 'Paint')) };
}
async function measure(page, cdp, state) {
  const beforeRequests = { ...state };
  await page.evaluate(() => {
    window.__swipeSamples = { frames: [], longTasks: [], moving: true, mutations: 0 };
    const sample = window.__swipeSamples;
    new PerformanceObserver(list => { for (const entry of list.getEntries()) sample.longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
    const next = now => { if (sample.previous) sample.frames.push(now - sample.previous); sample.previous = now; if (sample.moving) requestAnimationFrame(next); };
    requestAnimationFrame(next);
    const observer = new MutationObserver(records => { sample.mutations += records.length; });
    observer.observe(document.querySelector('[data-tab-pager]'), { attributes: true, attributeFilter: ['style'] });
    sample.observer = observer; sample.started = performance.now();
  });
  await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReturnAsStream' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y: 180 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 260, y: 180 }] });
  for (let i = 0; i < 24; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 256 - i * 4, y: 180 }] });
    await page.waitForTimeout(12);
  }
  assert.equal(await page.locator('[data-tab-pager]').getAttribute('data-swiping'), 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(240);
  const frames = await page.evaluate(() => {
    const sample = window.__swipeSamples; sample.moving = false; sample.observer.disconnect();
    const gaps = sample.frames.sort((a, b) => a - b);
    return { frames: gaps.length, p95FrameGapMs: gaps[Math.ceil(gaps.length * .95) - 1] || 0, maxFrameGapMs: gaps.at(-1) || 0,
      longTasks: sample.longTasks.filter(task => task.start >= sample.started), inheritedOffsetWrites: sample.mutations };
  });
  const work = await traceResult(cdp);
  return { ...frames, ...work, requests: Object.fromEntries(Object.keys(state).map(key => [key, state[key] - beforeRequests[key]])), mountedPanels: await page.locator('[data-tab-panel][data-tab-ready="true"]').count() };
}

(async () => {
  await start(['chromium']);
  const report = { measuredAt: new Date().toISOString(), environment: { cpu: os.cpus()[0].model, platform: os.platform(), cpuThrottle: 4, browser: 'Playwright Chromium', viewport: 'iPhone 13 emulation' },
    method: 'Friends to Profile. Trusted CDP touch: 26 movement events, then cancel and 240ms settle. 4x desktop CPU simulation. Both a cold neighbor and an idle-prepared real neighbor, with empty or 2000 notes plus 2000 highlights. API and Capacitor mocked; not physical-device or production-network results.', scenarios: [] };
  try {
    for (const populated of [false, true]) for (const cold of [true, false]) {
      const cleanup = [];
      try {
        const { page, context, state, errors } = await setup({ after: callback => cleanup.push(callback) }, 'chromium', {
          href: '/friends/', deferIdle: cold, profile: populated ? { bibleNotes: entries('note'), bibleHighlights: entries('color') } : {},
        });
        if (!cold) await page.locator('[data-tab-panel="/normal_UserProfile"]').getByText('iOS Tester', { exact: true }).waitFor({ state: 'attached' });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.waitForTimeout(1000);
        const first = await measure(page, cdp, state);
        const repeated = await measure(page, cdp, state);
        assert.deepEqual(errors, []);
        report.scenarios.push({ profileEntriesPerSection: populated ? 2000 : 0, neighbor: cold ? 'cold skeleton' : 'prepared page', first, repeated });
      } finally { for (const close of cleanup) await close(); }
    }
    const destination = path.resolve(__dirname, '../performance/swipe-benchmark.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
