const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, setup, getBase } = require('./helpers/swipe-browser.cjs');

before(() => start(['chromium']));
after(stop);

test('offline opens reconcile on reconnect and stay read on a second device', async t => {
  const prayerLog = [], openedNotes = new Set();
  const note = { _id: '1'.repeat(24), author: { _id: 'b'.repeat(24), username: 'friend' },
    title: 'Fixture note', body: 'Fixture note', createdAt: new Date().toISOString(), feedExpiresAt: new Date(Date.now() + 3600000).toISOString() };
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  async function device(connected) {
    return setup(t, 'chromium', { href: '/pray/', platform: 'web', beforeNavigate: async page => {
      await page.route('**/users/activity-reads/prayers', route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (!connected()) return route.abort();
        const { after, opened } = route.request().postDataJSON();
        for (const key of opened) if (!prayerLog.includes(key)) prayerLog.push(key);
        return route.fulfill({ headers, json: { after: prayerLog.length, more: false, seen: prayerLog.slice(after) } });
      });
      await page.route('**/users/testimonies/seen', route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (!connected()) return route.abort();
        for (const key of route.request().postDataJSON().opened) openedNotes.add(key);
        return route.fulfill({ status: 204, headers });
      });
      await page.route('**/users/testimonies', route => route.fulfill({ headers, json: {
        items: [note], activeNotes: [{ _id: note._id, authorId: note.author._id, feedExpiresAt: note.feedExpiresAt, seen: openedNotes.has(note._id) }],
      } }));
      await page.evaluate(async () => {
        const db = await new Promise(resolve => {
          const request = indexedDB.open('my_prays', 2);
          request.onupgradeneeded = () => request.result.createObjectStore('keyvaluepairs');
          request.onsuccess = () => resolve(request.result);
        });
        const tx = db.transaction('keyvaluepairs', 'readwrite');
        tx.objectStore('keyvaluepairs').put({ guestPrays: [{ _id: 'received-a', words: 'Fixture', date: '2026-11-19',
          sharedFrom: { shareId: 'a', username: 'friend', status: 'pending', seenActivityBy: {} } }], recordings: {} }, 'index');
        await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
      });
    } });
  }
  let connected = false;
  const { page } = await device(() => connected);
  await page.getByRole('button', { name: /^Prayer Circle/ }).first().click();
  await page.locator('[data-prayer-id="received-a"]').getByText('@friend', { exact: true }).click();
  await page.locator('[data-prayer-unread="false"]').waitFor();
  await page.getByRole('link', { name: 'Friends', exact: true }).evaluate(link => link.click());
  await page.waitForURL('**/friends/');
  await page.getByRole('button', { name: 'Read testimony: Fixture note' }).click();
  assert.equal(openedNotes.size + prayerLog.length, 0);
  connected = true;
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/activity-reads/prayers') && r.ok() && prayerLog.includes('prayer:a')),
    page.waitForResponse(r => r.url().endsWith('/testimonies/seen') && r.ok() && openedNotes.has(note._id)),
    page.evaluate(() => window.dispatchEvent(new Event('online'))),
  ]);
  const { page: second } = await device(() => true);
  await second.getByRole('button', { name: /^Prayer Circle/ }).first().click();
  await second.locator('[data-prayer-id="received-a"][data-prayer-unread="false"]').waitFor();
  await second.goto(getBase() + '/friends/');
  await second.getByRole('button', { name: 'Read testimony: Fixture note' }).waitFor();
  assert.equal(await second.locator('[data-note-surface][data-unread], [data-testid="friends-notes-badge"]').count(), 0);
});
