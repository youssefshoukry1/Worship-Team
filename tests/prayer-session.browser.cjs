// Run against a fresh production export. All data/network are disposable fixtures.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, setup } = require('./helpers/swipe-browser.cjs');
before(() => start(['chromium']));
after(stop);
async function prepare(page, audio = false) {
    await page.route('**/billing/**', route => route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, json: { message: 'Billing unavailable in fixture' } }));
    await page.evaluate(async audio => {
        const index = { guestPrays: [
            { _id: 'personal', words: 'Personal prayer', date: '2026-10-01T00:00:00Z' },
            { _id: 'received', words: 'Prayer from a friend', date: '2026-10-01T00:00:00Z', sharedFrom: { userId: 'friend', username: 'friend', shareId: 'share-one', status: 'pending', seenActivityBy: {} } },
        ], recordings: {} };
        const db = await new Promise(resolve => { const r = indexedDB.open('my_prays', 2); r.onupgradeneeded = () => r.result.createObjectStore('keyvaluepairs'); r.onsuccess = () => resolve(r.result); });
        const bytes = new ArrayBuffer(44 + 8000 * 60 * 2), v = new DataView(bytes);
        const text = (offset, value) => [...value].forEach((char, i) => v.setUint8(offset + i, char.charCodeAt(0)));
        text(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, bytes.byteLength - 44, true);
        if (audio) index.recordings.personal = [{ id: 'session-audio', ext: 'wav', mimeType: 'audio/wav', duration: 60, blockType: 'general', sectionIndex: 0 }];
        await new Promise(resolve => { const tx = db.transaction('keyvaluepairs', 'readwrite'), store = tx.objectStore('keyvaluepairs'); store.put(index, 'index'); if (audio) store.put(new Blob([bytes], { type: 'audio/wav' }), 'audio_session-audio'); tx.oncomplete = resolve; }); db.close();
    }, audio);
}
async function leavePrayer(page) {
    await page.locator('textarea').evaluateAll(nodes => nodes.forEach(node => node.blur()));
    await page.evaluate(() => scrollTo(0, 0));
    await page.mouse.wheel(0, -1000);
    await page.locator('nav[aria-label="Primary navigation"] a[href^="/normal_UserProfile"]').click();
    await page.getByRole('button', { name: 'Plans & subscription', exact: true }).click();
    await page.waitForURL('**/plans/');
    await page.locator('[data-prayer-row]').waitFor({ state: 'detached' });
}

test('cold launch opens the composer while saved prayer cards wait for device storage', async t => {
    let release;
    const index = new Promise(resolve => { release = resolve; });
    const { page, errors } = await setup(t, 'chromium', {
        platform: 'android', href: '/pray/', waitForPrayReads: false,
        beforeNavigate: page => page.exposeFunction('__readPrayerIndexFixture', () => index),
    });
    try {
        await page.waitForFunction(() => window.__launchSignals?.some(signal => signal.header && signal.composer));
        await page.getByRole('status', { name: 'Loading saved prayers' }).waitFor();
        const editor = await page.locator('textarea[data-preview-content="pray"]').elementHandle();
        await editor.fill('Writing while history loads');
        const saved = { _id: 'cold-prayer', words: 'Prayer from local storage', date: '2026-10-01T00:00:00Z' };
        release(JSON.stringify({ guestPrays: [saved], recordings: {} }));
        await page.getByText(saved.words, { exact: true }).waitFor();
        assert.equal(await page.locator('[data-prayer-cards-loading]').count(), 0);
        assert.equal(await editor.evaluate(node => node === document.activeElement && node.value === 'Writing while history loads'), true);
        assert.deepEqual(errors, []);
    } finally {
        release(JSON.stringify({ guestPrays: [], recordings: {} }));
    }
});
async function returnToPrayer(page) {
    await page.goBack();
    await page.evaluate(() => scrollTo(0, 0));
    await page.mouse.wheel(0, -1000);
    await page.locator('nav[aria-label="Primary navigation"] a[href^="/pray"]').click();
    await page.locator('[data-prayer-id]').first().waitFor({ state: 'attached' });
}
test('composer, reply, filter and final privacy setting survive actual Pray unmount', async t => {
    const { page, errors } = await setup(t, 'chromium', { platform: 'web', href: '/pray/', beforeNavigate: page => prepare(page) });
    const composer = page.getByPlaceholder('Write your general prayer words here...');
    await composer.fill('Keep this unsaved draft');
    await page.getByRole('button', { name: /Prayer Circle/ }).click();
    await page.locator('[data-prayer-id="received"]').click();
    await page.getByPlaceholder('Write prayer response to @friend...').fill('Keep my reply too');
    await page.locator('textarea').evaluateAll(nodes => nodes.forEach(node => node.blur()));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('switch', { name: 'Blur prayer text' }).check();
    await page.getByRole('slider', { name: 'Blur strength' }).press('End');
    await page.keyboard.press('Escape');
    await leavePrayer(page); await returnToPrayer(page);
    assert.equal(await composer.inputValue(), 'Keep this unsaved draft');
    assert.equal(await page.getByPlaceholder('Write prayer response to @friend...').inputValue(), 'Keep my reply too');
    assert.equal(await page.locator('section[data-private-writing="true"]').count(), 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('taspe7_prayer_privacy')).strength), 4);
    assert.deepEqual(errors, []);
});
test('recording and unsaved clips survive Pray unmount, save durably, and discard releases the mic', async t => {
    const { page, errors } = await setup(t, 'chromium', { platform: 'web', href: '/pray/', beforeNavigate: async page => {
        await prepare(page);
        await page.addInitScript(() => {
            window.__micCalls = 0;
            navigator.mediaDevices.getUserMedia = async () => {
                window.__micCalls++;
                const audio = new AudioContext(), oscillator = audio.createOscillator(), destination = audio.createMediaStreamDestination();
                oscillator.connect(destination); oscillator.start(); await audio.resume(); window.__micStream = destination.stream; return destination.stream;
            };
            const Recorder = MediaRecorder;
            window.MediaRecorder = class extends Recorder { constructor(...args) { super(...args); window.__recorder = this; } };
        });
    } });
    await page.getByRole('button', { name: 'Record voice', exact: true }).click();
    await page.getByRole('button', { name: 'Discard recording', exact: true }).waitFor();
    await leavePrayer(page);
    assert.equal(await page.evaluate(() => window.__recorder.state), 'recording');
    await returnToPrayer(page);
    await page.getByRole('button', { name: 'Pause recording', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__recorder.state), 'paused');
    await page.getByRole('button', { name: /^Done/ }).click();
    await page.getByRole('button', { name: 'Record another', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__micCalls), 1);
    await leavePrayer(page); await returnToPrayer(page);
    await page.getByRole('button', { name: 'Record another', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await page.waitForFunction(async () => {
        const db = await new Promise(resolve => { const r = indexedDB.open('my_prays', 2); r.onsuccess = () => resolve(r.result); });
        const index = await new Promise(resolve => { const r = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get('index'); r.onsuccess = () => resolve(r.result); }); db.close();
        return index.guestPrays.some(prayer => !prayer._sync && index.recordings[prayer._id]?.length === 1);
    });
    await page.getByRole('button', { name: 'Record voice', exact: true }).click();
    await page.getByRole('button', { name: 'Discard recording', exact: true }).click();
    await page.waitForFunction(() => window.__micStream.getTracks().every(track => track.readyState === 'ended'));
    assert.equal(await page.evaluate(() => window.__micCalls), 2); assert.deepEqual(errors, []);
});
test('saved playback survives row/page unmount and reconnects to the same player', async t => {
    const { page, errors } = await setup(t, 'chromium', { platform: 'web', href: '/pray/', beforeNavigate: async page => {
        await prepare(page, true);
        await page.addInitScript(() => { const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function() { window.__playingMedia = this; return play.call(this); }; });
    } });
    await page.locator('[data-prayer-id="personal"]').getByRole('button', { name: 'Play', exact: true }).click();
    await page.evaluate(() => { window.__originalMedia = window.__playingMedia; });
    await leavePrayer(page);
    assert.equal(await page.evaluate(() => window.__originalMedia.paused), false);
    await returnToPrayer(page);
    const pause = page.locator('[data-prayer-id="personal"]').getByRole('button', { name: 'Pause', exact: true }); await pause.waitFor();
    assert.equal(await page.evaluate(() => window.__originalMedia === window.__playingMedia), true);
    await pause.click(); assert.equal(await page.evaluate(() => window.__originalMedia.paused), true); assert.deepEqual(errors, []);
});


test('Pray leaves the pager on distant tabs and restores its draft on repeated returns', async t => {
    const { page, errors } = await setup(t, 'chromium', { platform: 'web', href: '/pray/', beforeNavigate: page => prepare(page) });
    const draft = page.getByPlaceholder('Write your general prayer words here...');
    await draft.fill('Session draft without retained UI'); await draft.blur();
    for (let i = 0; i < 3; i++) {
        await page.locator('nav[aria-label="Primary navigation"] a[href^="/friends"]').evaluate(link => link.click());
        await page.waitForURL('**/friends/');
        await page.locator('[data-tab-panel="/pray"]').waitFor({ state: 'detached' });
        assert.ok(await page.locator('[data-tab-panel]').count() <= 3);
        await page.locator('nav[aria-label="Primary navigation"] a[href^="/pray"]').evaluate(link => link.click());
        await draft.waitFor(); assert.equal(await draft.inputValue(), 'Session draft without retained UI');
    }
    assert.deepEqual(errors, []);
});

test('sync UI updates wait during a held swipe and publish the latest prayer after cancellation', async t => {
    const { page, errors } = await setup(t, 'chromium', { platform: 'web', href: '/pray/', beforeNavigate: page => prepare(page) });
    await page.locator('[data-prayer-id="personal"]').waitFor();
    await page.evaluate(() => {
        window.__swipeTarget = document.querySelector('[data-tab-active="true"]');
        window.__touch = (type, x) => {
            const point = { identifier: 5, clientX: x, clientY: 350, target: window.__swipeTarget };
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperties(event, { touches: { value: type === 'touchcancel' ? [] : [point] }, changedTouches: { value: [point] } });
            window.__swipeTarget.dispatchEvent(event);
        };
        window.__touch('touchstart', 280); window.__touch('touchmove', 180);
    });
    await page.locator('[data-tab-pager][data-swiping="true"]').waitFor();
    await page.evaluate(() => {
        for (let i = 0; i < 50; i++) window.dispatchEvent(new CustomEvent('taspe7:prayer-sync', { detail: { entry: { _id: 'personal', words: 'Updated prayer ' + i, date: '2026-10-01T00:00:00Z' } } }));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('[data-prayer-id="personal"]').getByText('Personal prayer', { exact: true }).count(), 1);
    await page.evaluate(() => window.__touch('touchcancel', 180));
    await page.locator('[data-prayer-id="personal"]').getByText('Updated prayer 49', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
});
