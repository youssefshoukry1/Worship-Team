const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, setup } = require('./helpers/swipe-browser.cjs');
before(() => start(['chromium']));
after(stop);

test('a lost touch-end releases the navigation hold within its deadline', async t => {
    const { page, errors } = await setup(t, 'chromium', { platform: 'web', href: '/pray/' });
    await page.clock.install();
    await page.evaluate(() => {
        const target = document.querySelector('[data-tab-active="true"]');
        for (const [type, x] of [['touchstart', 280], ['touchmove', 180]]) {
            const point = { identifier: 5, clientX: x, clientY: 350, target };
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperties(event, { touches: { value: [point] }, changedTouches: { value: [point] } });
            target.dispatchEvent(event);
        }
    });
    await page.locator('[data-tab-pager][data-swiping="true"]').waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('taspe7:prayer-sync', {
        detail: { entry: { _id: 'deadline-prayer', words: 'Released after lost touch', date: '2026-10-01T00:00:00Z' } },
    })));
    assert.equal(await page.locator('[data-prayer-id="deadline-prayer"]').count(), 0);
    await page.clock.fastForward(30001);
    await page.locator('[data-tab-pager][data-swiping]').waitFor({ state: 'detached' });
    await page.getByText('Released after lost touch', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
});

test('leaving immediately after a privacy adjustment flushes the pending preference', async t => {
    const { page, errors } = await setup(t, 'chromium', { platform: 'web', href: '/pray/' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('switch', { name: 'Blur prayer text' }).check();
    // Freeze time: the 150 ms debounce cannot complete before the route exits.
    const clockStart = new Date('2026-11-17T00:00:00Z');
    await page.clock.install({ time: clockStart });
    await page.clock.pauseAt(new Date(clockStart.getTime() + 60_000));
    await page.getByRole('slider', { name: 'Blur strength' }).press('End');
    assert.notEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('taspe7_prayer_privacy') || '{}').strength), 4);
    await page.locator('nav[aria-label="Primary navigation"] a[href^="/friends"]').evaluate(link => link.click());
    await page.locator('[data-tab-panel="/pray"]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('taspe7_prayer_privacy')).strength), 4);
    assert.deepEqual(errors, []);
});
