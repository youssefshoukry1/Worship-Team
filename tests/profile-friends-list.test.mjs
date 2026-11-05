// Run against a local Next server: node --test tests/profile-friendship-optimistic.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const viewerId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const targetId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function setup(t, { initial = 'none', failure = false, accepted = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, serviceWorkers: 'block' });
  const gate = deferred();
  t.after(async () => { gate.resolve(); await context.close(); });
  const page = await context.newPage();
  const calls = [];
  const errors = [];
  let serverRelationship = initial;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ viewerId }) => {
    for (const [key, value] of Object.entries({
      wasla_splash_version: '1.0.6', user_Taspe7_Token: 'optimistic-test',
      user_Taspe7_ID: viewerId, user_Taspe7_Username: 'viewer', user_Taspe7_GlobalRole: 'USER',
    })) localStorage.setItem(key, value);
  }, { viewerId });
  await page.route('**/version.json?*', route => route.fulfill({ json: { version: '1.0.6' } }));
  await page.route(/\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (json, status = 200) => route.fulfill({
      json, status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
    });
    if (route.request().method() === 'OPTIONS') return reply({});
    if ((route.request().method() === 'POST' && path.includes('/friend-request/'))
      || (route.request().method() === 'DELETE' && path.endsWith(`/friends/${targetId}`))) {
      const action = route.request().method() === 'DELETE' ? 'remove' : path.includes('/cancel/') ? 'cancel' : 'add';
      calls.push(action);
      await gate.promise;
      if (failure) return reply({ message: 'Could not save request.' }, 503);
      serverRelationship = action !== 'add' ? 'none' : accepted ? 'friends' : 'outgoing';
      return reply({ status: accepted ? 'accepted' : 'pending' });
    }
    if (path.endsWith('/users/friends')) return reply({ friends: serverRelationship === 'friends' ? [{ _id: targetId }] : [] });
    if (path.endsWith('/friend-requests')) return reply({ incoming: [], outgoing: serverRelationship === 'outgoing' ? [{ to: targetId }] : [] });
    if (path.endsWith('/friends') && path.includes('/profile/')) {
      const params = new URL(route.request().url()).searchParams;
      const people = params.get('kind') === 'mutual'
        ? [{ _id: 'dddddddddddddddddddddddd', Name: 'Mutual Person', username: 'mutual', relationship: 'friends' }]
        : [{ _id: 'cccccccccccccccccccccccc', Name: 'A person with a long display name', username: 'new_friend', relationship: 'none' }];
      return reply({ items: params.get('q') === 'missing' ? [] : people, nextCursor: null });
    }
    if (path.includes('/profile/')) return reply({
      user: { _id: targetId, Name: 'Youssef Shoukry', username: 'youssef_shoukry' },
      stats: { friends: initial === 'friends' && serverRelationship !== 'friends' ? 9 : 10, mutualFriends: 0 }, relationship: serverRelationship,
      canViewTestimonies: serverRelationship === 'friends', items: [], manifest: [], notesVersion: 1,
    });
    return reply({ items: [], changes: [], friends: [], incoming: [], outgoing: [], users: [], data: [] });
  });
  const base = process.env.PROFILE_TEST_URL || 'http://localhost:3000/normal_UserProfile';
  await page.goto(`${base}?user=${targetId}`);
  const card = page.getByTestId('profile-header-card');
  const button = name => card.getByRole('button', { name, exact: true });
  await button(initial === 'friends' ? 'Remove friend' : initial === 'outgoing' ? 'Cancel request' : 'Add friend').waitFor();
  return { page, card, button, gate, calls, errors, serverRelationship: () => serverRelationship };
}


test('profile connections open searchable lists, support requests, and fit a 320px screen', async t => {
  const f = await setup(t);
  await f.card.getByRole('button', { name: '10 Friends', exact: true }).click();
  let dialog = f.page.getByRole('dialog', { name: 'Friends', exact: true });
  await dialog.getByRole('link', { name: /A person/ }).waitFor();
  await dialog.getByRole('button', { name: 'Add friend', exact: true }).click();
  f.gate.resolve();
  await dialog.getByRole('button', { name: 'Cancel request', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add friend', exact: true }).waitFor();
  assert.deepEqual(f.calls, ['add', 'cancel']);
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await dialog.getByRole('button', { name: 'Mutual friends', exact: true }).click();
  dialog = f.page.getByRole('dialog', { name: 'Mutual friends', exact: true });
  await dialog.getByRole('link', { name: /Mutual Person/ }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Add friend', exact: true }).count(), 0);
  await dialog.getByRole('searchbox').fill('missing');
  await dialog.getByText('No matching friends.').waitFor();
  await f.page.keyboard.press('Escape');
  assert.equal(await f.page.getByRole('dialog').count(), 0);
  await f.card.getByRole('button', { name: '0 Mutual friends', exact: true }).click();
  await f.page.getByRole('dialog', { name: 'Mutual friends', exact: true }).getByRole('link', { name: /Mutual Person/ }).waitFor();
  assert.deepEqual(f.errors, []);
});
