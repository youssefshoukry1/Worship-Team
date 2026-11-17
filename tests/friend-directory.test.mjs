import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
let chrome, safari;
before(async () => { chrome = await chromium.launch(); safari = await webkit.launch(); });
after(async () => { await chrome?.close(); await safari?.close(); });
const rows = Array.from({ length: 1250 }, (_, i) => ({ _id: (i + 100).toString(16).padStart(24, '0'), Name: `Person ${i}`, username: `person${i}`, relationship: 'friends', revision: 1 }));
async function setup(t, mobile) {
  const directory = { people: [...rows], version: 1, offline: false, failRemove: false };
  const context = await (mobile ? safari : chrome).newContext({ ...(mobile ? devices['iPhone 13'] : { viewport: { width: 390, height: 844 } }), serviceWorkers: 'block' });
  t.after(() => context.close()); const page = await context.newPage(), calls = [], errors = [];
  page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(A => {
    for (const [key, value] of Object.entries({ wasla_splash_version: '1.0.6', user_Taspe7_Token: 'pagination-test', user_Taspe7_ID: A, user_Taspe7_Username: 'viewer', user_Taspe7_GlobalRole: 'USER', 'app-language': 'en' })) localStorage.setItem(key, value);
  }, A);
  await page.route('**/version.json?*', route => route.fulfill({ json: { version: '1.0.6' } }));
  await page.route(/\/api\//, route => {
    const url = new URL(route.request().url()), path = url.pathname, params = url.searchParams;
    const reply = (json, status = 200) => route.fulfill({ json, status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (route.request().method() === 'OPTIONS') return reply({});
    calls.push(path + url.search);
    const slice = people => {
      const start = Number(params.get('cursor') || 0);
      return { items: people.slice(start, start + 10), total: people.length, nextCursor: start + 10 < people.length ? String(start + 10) : null };
    };
    if (path.includes('/friends-directory')) {
      if (directory.offline) return route.abort('internetdisconnected');
      if (path.endsWith('/snapshot')) {
        const after = params.get('after'); const people = directory.people.filter(person => !after || person._id > after);
        return reply({ items: people.slice(0, 200), next: people.length > 200 ? people[199]._id : null, cursor: params.get('cursor') || String(directory.version) });
      }
      const removed = rows.filter(person => !directory.people.some(current => current._id === person._id));
      return reply({ changes: Number(params.get('cursor')) === directory.version ? [] : removed.map(person => ({ type: 'remove', id: person._id })), cursor: String(directory.version), hasMore: false });
    }
    if (route.request().method() === 'DELETE' && path.includes('/friends/')) {
      if (directory.failRemove) return reply({ message: 'Removal failed.' }, 503);
      directory.people = directory.people.filter(person => person._id !== path.split('/').pop()); directory.version++;
      return reply({ success: true });
    }
    if (path.endsWith('/friends-summary')) return reply({ friends: directory.people.length, incoming: 25, outgoing: 25 });
    if (path.endsWith('/friend-requests')) return reply(slice(rows.map((person, i) => ({ _id: `request${i}`, [params.get('kind') === 'incoming' ? 'from' : 'to']: person }))));
    if (path.endsWith('/friend-suggestions')) return reply(slice(rows.map(person => ({ ...person, relationship: 'none', mutualFriendCount: 3 }))));
    if (path.endsWith('/friends')) return reply(slice(params.get('q') ? rows.filter(person => person.username.includes(params.get('q'))) : rows));
    if (path.endsWith('/people-search')) return reply(slice(rows.filter(person => person.username.includes(params.get('q') || ''))));
    if (path.includes('/friendship/')) return reply({ relationship: 'friends' });
    if (path.includes('/testimonies/profile/')) return reply({ user: { _id: path.split('/profile/')[1], Name: 'Viewer', username: 'viewer' }, stats: { friends: directory.people.length, mutualFriends: 25 }, items: [], activeNotes: [], manifest: [], notesVersion: 1, relationship: 'friends', canViewTestimonies: true });
    if (path.endsWith('/my-profile')) return reply({ user: { _id: A, Name: 'Viewer', username: 'viewer', role: 'USER' } });
    if (path.endsWith('/testimonies')) return reply({ items: [], activeNotes: [], publishing: { canPublish: true }, nextCursor: null });
    return reply({ items: [], changes: [], friends: [], incoming: [], outgoing: [], users: [], data: [] });
  });
  return { page, calls, errors, directory };
}

async function waitSaved(page, count) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const complete = await page.evaluate(async ({ A, count }) => {
    const db = await new Promise(resolve => { const req = indexedDB.open('wasla_friend_directory_v1'); req.onupgradeneeded = () => req.transaction.abort(); req.onerror = () => resolve(null); req.onsuccess = () => resolve(req.result); });
    if (!db) return false;
    try {
      if (!db.objectStoreNames.contains('checkpoints')) return false;
      return await new Promise(resolve => { const req = db.transaction('checkpoints').objectStore('checkpoints').get(A); req.onsuccess = () => resolve(req.result?.complete && req.result.ids.length === count); });
    } finally { db.close(); }
    }, { A, count });
    if (complete === true) return;
    await page.waitForTimeout(50);
  }
  assert.fail('Directory checkpoint was not saved');
}
for (const mobile of [false, true]) test(`1,250 friends search offline after restart without search requests (${mobile ? 'Safari' : 'Chromium'})`, async t => {
  const { page, calls, errors, directory } = await setup(t, mobile);
  await page.goto('http://localhost:3000/friends/');
  await waitSaved(page, 1250);
  await page.getByRole('button', { name: 'My Friends', exact: true }).click();
  await page.getByText('1250 friends', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open Person 0 profile', exact: true }).waitFor();
  assert.ok(await page.locator('[data-friend-id]').count() <= 20, 'the full directory is not rendered as cards');
  await page.getByRole('button', { name: 'Search friends', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search friends by username' });
  const before = calls.filter(path => /people-search|friends\?q=/.test(path)).length;
  directory.offline = true;
  await input.fill('person1249');
  await page.getByRole('button', { name: 'Open Person 1249 profile', exact: true }).waitFor();
  assert.equal(calls.filter(path => /people-search|friends\?q=/.test(path)).length, before);
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.getByRole('button', { name: 'My Friends', exact: true }).click();
  await page.getByRole('button', { name: 'Open Person 0 profile', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Search friends', exact: true }).click();
  await input.fill('person1249');
  await page.getByRole('button', { name: 'Open Person 1249 profile', exact: true }).waitFor();
  // The friend removes this viewer. Reconnect must delete the cached name.
  directory.people = directory.people.filter(person => person.username !== 'person1249'); directory.version++; directory.offline = false;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('taspe7:friends-push', { detail: { notesHandled: true } })));
  await page.getByRole('button', { name: 'Open Person 1249 profile', exact: true }).waitFor({ state: 'hidden' });
  await waitSaved(page, 1249);
  await input.fill('user-that-does-not-exist');
  assert.equal(calls.filter(path => /people-search|friends\?q=/.test(path)).length, before);
  assert.deepEqual(errors, []);
});
test('own Profile and Pray use local search; remote removal clears immediately and failed local removal restores', async t => {
  const { page, calls, errors, directory } = await setup(t, false);
  await page.goto('http://localhost:3000/normal_UserProfile/'); await waitSaved(page, 1250);
  await page.getByRole('button', { name: '1,250 Friends', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Friends', exact: true });
  await dialog.getByRole('searchbox').fill('person1249');
  await dialog.getByRole('link', { name: /Person 1249/ }).waitFor();
  assert.equal(calls.some(path => path.includes(`/profile/${A}/friends`)), false);
  await page.keyboard.press('Escape');
  await page.goto('http://localhost:3000/pray/');
  await page.getByRole('button', { name: /Share with friend/ }).click();
  await page.getByPlaceholder('Search by @username...').fill('person1249');
  await page.getByText('@person1249', { exact: true }).waitFor();
  assert.equal(calls.some(path => path.includes('/people-search')), false);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.goto('http://localhost:3000/friends/');
  await page.getByRole('button', { name: 'My Friends', exact: true }).click();
  await page.getByRole('button', { name: 'Open Person 0 profile', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Search friends', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search friends by username' }).fill('person1249');
  const card = page.locator(`[data-friend-id="${rows.at(-1)._id}"]`);
  await card.waitFor(); directory.failRemove = true;
  await card.getByRole('button', { name: /Remove/ }).click();
  await card.waitFor();
  directory.offline = true;
  await page.evaluate(id => window.dispatchEvent(new CustomEvent('taspe7:friends-push', { detail: { notesHandled: true, removedFriendId: id } })), rows.at(-1)._id);
  await card.waitFor({ state: 'hidden' });
  await page.waitForFunction(async ({ A, id }) => {
    const db = await new Promise(resolve => { const req = indexedDB.open('wasla_friend_directory_v1'); req.onupgradeneeded = () => req.transaction.abort(); req.onerror = () => resolve(null); req.onsuccess = () => resolve(req.result); });
    try { return await new Promise(resolve => { const req = db.transaction('people').objectStore('people').get([A, id]); req.onsuccess = () => resolve(!req.result); }); }
    finally { db.close(); }
  }, { A, id: rows.at(-1)._id });
  assert.deepEqual(errors, []);
});
