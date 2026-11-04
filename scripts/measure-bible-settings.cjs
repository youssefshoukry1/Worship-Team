/* eslint-disable @typescript-eslint/no-require-imports -- Node benchmark entry point. */
// Build first, then: node scripts/measure-bible-settings.cjs
// --baseline records the existing export before building a changed implementation.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { start, stop } = require('../tests/helpers/swipe-browser.cjs');
const { reader } = require('../tests/helpers/bible-settings-browser.cjs');

(async () => {
  await start(['chromium']);
  const report = { measuredAt: new Date().toISOString(), cpu: os.cpus()[0].model, cpuThrottle: 4,
    panelPreparation: process.argv.includes('--baseline') ? 'cold first interaction' : 'idle-prepared and retained',
    method: '176 real Arabic verses (Psalm 119), mobile Chromium emulation, mocked backend, 4x CPU. Capture click to first visible/settled animation frame, RAF gaps and long tasks over a 400ms opening window. Then close and count chapter map passes across both operations. Desktop simulation, not physical phone results.', scenarios: [] };
  try {
    for (const mode of ['paragraph', 'list']) {
      const cleanup = [];
      try {
        const { page, context, verseCount } = await reader({ after: callback => cleanup.push(callback) }, 'chromium', { mode, warmSettings: !process.argv.includes('--baseline') });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.waitForTimeout(1000);
        for (let attempt = 0; attempt < 3; attempt++) {
          await page.evaluate(() => {
            const sample = window.__settingsSample = { chapterMaps: window.__chapterMaps, frames: [], longTasks: [], opacities: [], nodesAddedOnOpen: 0 };
            sample.observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.startTime >= sample.started) sample.longTasks.push(entry.duration); });
            sample.observer.observe({ type: 'longtask' });
            document.addEventListener('click', () => {
              sample.started = performance.now();
              sample.domObserver = new MutationObserver(records => {
                for (const record of records) for (const node of record.addedNodes) {
                  if (node.nodeType === 1) sample.nodesAddedOnOpen += 1 + node.querySelectorAll('*').length;
                }
              });
              sample.domObserver.observe(document.querySelector('.app-reading-surface'), { childList: true, subtree: true });
              const next = now => {
                if (sample.previous) sample.frames.push(now - sample.previous);
                sample.previous = now;
                const panel = document.querySelector('[data-bible-settings]') || [...document.querySelectorAll('.app-popover')].find(node => node.querySelector('[title="Decrease font size"]'));
                if (panel) {
                  const style = getComputedStyle(panel);
                  sample.opacities.push(Number(style.opacity));
                  if (!sample.firstVisibleMs && Number(style.opacity) > 0) sample.firstVisibleMs = now - sample.started;
                  if (!sample.settledMs && Number(style.opacity) >= .999) sample.settledMs = now - sample.started;
                }
                if (now - sample.started < 400) requestAnimationFrame(next);
                else { sample.domObserver.disconnect(); sample.complete = true; }
              };
              requestAnimationFrame(next);
            }, { capture: true, once: true });
          });
          await page.getByTitle('Settings', { exact: true }).tap();
          await page.waitForFunction(() => window.__settingsSample.complete);
          const panel = page.locator('[data-bible-settings], .app-popover').filter({ has: page.getByTitle('Decrease font size') });
          const surface = await panel.evaluate(node => {
            const style = getComputedStyle(node);
            return { backdropFilter: style.backdropFilter || style.webkitBackdropFilter, background: style.backgroundColor, shadow: style.boxShadow };
          });
          await panel.getByTitle('Close', { exact: true }).tap();
          await panel.waitFor({ state: 'hidden' });
          const measurement = await page.evaluate(() => {
            const sample = window.__settingsSample; sample.observer.disconnect();
            const frames = sample.frames.sort((a, b) => a - b);
            return { firstVisibleMs: sample.firstVisibleMs, settledMs: sample.settledMs, maxFrameGapMs: frames.at(-1), p95FrameGapMs: frames[Math.ceil(frames.length * .95) - 1], longTasksMs: sample.longTasks, chapterMapPasses: window.__chapterMaps - sample.chapterMaps,
              nodesAddedOnOpen: sample.nodesAddedOnOpen, opacityDrops: sample.opacities.filter((opacity, index, values) => index > 0 && opacity < values[index - 1] - .02).length };
          });
          report.scenarios.push({ mode, attempt: attempt + 1, verseCount, ...surface, ...measurement });
        }
      } finally { for (const close of cleanup) await close(); }
    }
    const file = path.resolve(__dirname, `../performance/bible-settings-${process.argv.includes('--baseline') ? 'before' : process.argv.includes('--flash') ? 'flash-after' : 'after'}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
