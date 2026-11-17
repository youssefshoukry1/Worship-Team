import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
let chrome, safari;
before(async () => { chrome = await chromium.launch(); safari = await webkit.launch(); });
after(async () => { await chrome?.close(); await safari?.close(); });
const rows = Array.from({ length: 25 }, (_, i) => ({ _id: (i + 100).toString(16).padStart(24, '0'), Name: `Person ${i}`, username: `person${i}`, relationship: 'friends' }));
async function setup(t, mobile) {
  const context = await (mobile ? safari : chrome).newContext({ ...(mobile ? devices['iPhone 13'] : { viewport: { width: 390, height: 844 } }), serviceWorkers: 'block' });
  t.after(() => context.close()); const page = await context.newPage(), calls = [], errors = [];
  page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(A => {
    for (const [key, value] of Object.entries({ wasla_splash_version: '1.0.6', user_Taspe7_Token: 'pagination-test', user_Taspe7_ID: A, user_Taspe7_Username: 'viewer', user_Taspe7_GlobalRole: 'USER', 'app-language': 'en' })) localStorage.setItem(key, value);
  }, A);
  await page.route('**/version.json?*', route => route.fulfill({ json: { version: '1.0.6' } }));
  await page.route(/\/api\//, route => {
    const url = new URL(route.request().url()), path = url.pathname, params = url.searchParams;
    const reply = json => route.fulfill({ json, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (route.request().method() === 'OPTIONS') return reply({});
    calls.push(path + url.search);
    const slice = people => {
      const start = Number(params.get('cursor') || 0);
      return { items: people.slice(start, start + 10), total: people.length, nextCursor: start + 10 < people.length ? String(start + 10) : null };
    };
    if (path.endsWith('/friends-directory/snapshot')) return reply({ items: rows, next: null, cursor: '0' });
    if (path.endsWith('/friends-directory/sync')) return reply({ changes: [], cursor: '0', hasMore: false });
    if (path.endsWith('/friends-directory')) return reply({ version: 1, membership: 'test-members', watermark: Date.now(), total: rows.length, ids: rows.map(person => person._id) });
    if (path.endsWith('/friends-directory/changes')) return reply({ items: rows, nextCursor: null });
    if (path.endsWith('/friends-directory/people')) return reply({ items: rows });
    if (path.endsWith('/friends-summary')) return reply({ friends: 25, incoming: 25, outgoing: 25 });
    if (path.endsWith('/friend-requests')) return reply(slice(rows.map((person, i) => ({ _id: `request${i}`, [params.get('kind') === 'incoming' ? 'from' : 'to']: person }))));
    if (path.endsWith('/friend-suggestions')) return reply(slice(rows.map(person => ({ ...person, relationship: 'none', mutualFriendCount: 3 }))));
    if (path.endsWith('/friends')) return reply(slice(params.get('q') ? rows.filter(person => person.username.includes(params.get('q'))) : rows));
    if (path.endsWith('/people-search')) return reply(slice(rows.filter(person => person.username.includes(params.get('q') || ''))));
    if (path.includes('/friendship/')) return reply({ relationship: 'friends' });
    if (path.includes('/testimonies/profile/')) return reply({ user: { _id: path.split('/profile/')[1], Name: 'Viewer', username: 'viewer' }, stats: { friends: 25, mutualFriends: 25 }, items: [], activeNotes: [], manifest: [], notesVersion: 1, relationship: 'friends', canViewTestimonies: true });
    if (path.endsWith('/my-profile')) return reply({ user: { _id: A, Name: 'Viewer', username: 'viewer', role: 'USER' } });
    if (path.endsWith('/testimonies')) return reply({ items: [], activeNotes: [], publishing: { canPublish: true }, nextCursor: null });
    return reply({ items: [], changes: [], friends: [], incoming: [], outgoing: [], users: [], data: [] });
  });
  return { page, calls, errors };
}
for (const mobile of [false, true]) test(`Friends lists load on demand, scroll in pages and keep server counts (${mobile ? 'Safari' : 'Chromium'})`, async t => {
  const { page, calls, errors } = await setup(t, mobile);
  await page.goto('http://localhost:3000/friends/');
  await page.getByText('Incoming requests (25)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open Person 0 profile', exact: true }).first().waitFor();
  assert.equal(calls.some(path => path.includes('kind=outgoing')), false);
  assert.equal(calls.some(path => path.endsWith('/users/friends')), false);
  // Each list appends more only when its bottom approaches the viewport.
  for (let i = 0; i < 6 && !calls.some(path => path.includes('kind=incoming&cursor=20')); i++) { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(250); }
  assert.ok(calls.some(path => path.includes('kind=incoming&cursor=20')));
  await page.getByRole('button', { name: 'My Friends', exact: true }).click();
  await page.getByText('25 friends', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open Person 0 profile', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Sent/ }).click();
  await page.getByText('Sent requests (25)', { exact: true }).waitFor();
  assert.ok(calls.some(path => path.includes('kind=outgoing')));
  assert.deepEqual(errors, []);
});
test('both Profile views page friends and Pray searches recipients beyond the first page', async t => {
  const { page, calls, errors } = await setup(t, false);
  for (const id of [A, B]) {
    await page.goto(`http://localhost:3000/normal_UserProfile/?user=${id}`);
    await page.getByRole('button', { name: '25 Friends', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Friends', exact: true });
    await dialog.getByRole('link', { name: /Person 0/ }).waitFor();
    await dialog.getByRole('searchbox').fill('person24');
    await dialog.getByRole('link', { name: /Person 24/ }).waitFor();
    if (id === B) assert.ok(calls.some(path => path.includes(`/profile/${id}/friends?`) && path.includes('q=person24')));
    await page.keyboard.press('Escape');
  }
  await page.goto('http://localhost:3000/pray/');
  await page.getByRole('button', { name: /Share with friend/ }).click();
  await page.getByPlaceholder('Search by @username...').fill('person24');
  await page.getByText('@person24', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  assert.deepEqual(errors, []);
});
