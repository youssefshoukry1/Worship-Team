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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
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

for (const initial of ['none', 'outgoing']) {
  const adding = initial === 'none';
  const from = adding ? 'Add friend' : 'Cancel request';
  const to = adding ? 'Cancel request' : 'Add friend';
  test(`${from} updates immediately while saving in the background`, async t => {
    const f = await setup(t, { initial });
    await f.button(from).click();
    await f.button(to).waitFor();
    assert.equal(await f.button(to).isEnabled(), true);
    assert.equal(await f.button(to).locator('svg[class*="spin"]').count(), 0);
    assert.equal(f.serverRelationship(), initial, 'server response is still pending');
    // Background refresh events must preserve the optimistic button.
    await f.page.evaluate(() => window.dispatchEvent(new Event('taspe7:friends-push')));
    assert.equal(await f.button(to).isVisible(), true);
    const saved = f.page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/friend-request/'));
    f.gate.resolve();
    await saved;
    assert.equal(f.serverRelationship(), adding ? 'outgoing' : 'none');
    assert.deepEqual(f.errors, []);
  });

  test(`${from} restores the confirmed state if saving fails`, async t => {
    const f = await setup(t, { initial, failure: true });
    await f.button(from).click();
    await f.button(to).waitFor();
    f.gate.resolve();
    await f.card.getByRole('alert').filter({ hasText: 'Could not save request.' }).waitFor();
    await f.button(from).waitFor();
    assert.equal(await f.card.getByText(adding ? 'Friend request sent.' : 'Friend request cancelled.', { exact: true }).count(), 0);
    assert.deepEqual(f.errors, []);
  });
}

test('rapid add/cancel/add clicks save in order and keep the latest button', async t => {
  const f = await setup(t);
  await f.button('Add friend').click();
  await f.button('Cancel request').click();
  await f.button('Add friend').click();
  await f.button('Cancel request').waitFor();
  assert.deepEqual(f.calls, ['add'], 'later saves wait for the first request');
  const finalRead = f.page.waitForResponse(r => r.url().includes('/users/friend-requests'));
  f.gate.resolve();
  await finalRead;
  assert.deepEqual(f.calls, ['add', 'cancel', 'add']);
  assert.equal(f.serverRelationship(), 'outgoing');
  assert.equal(await f.button('Cancel request').isVisible(), true);
  assert.deepEqual(f.errors, []);
});

test('a request accepted immediately by the server shows the friends controls', async t => {
  const f = await setup(t, { accepted: true });
  await f.button('Add friend').click();
  await f.button('Cancel request').waitFor();
  f.gate.resolve();
  await f.button('Remove friend').waitFor();
  assert.equal(await f.card.getByText('You are now friends.', { exact: true }).isVisible(), true);
  assert.deepEqual(f.errors, []);
});

async function confirmRemoval(f) {
  await f.button('Remove friend').click();
  const dialog = f.page.getByRole('dialog', { name: 'Remove friend?' });
  await dialog.getByRole('button', { name: 'Remove friend', exact: true }).click();
  await f.button('Add friend').waitFor();
  assert.equal(await dialog.count(), 0, 'confirmation closes before saving finishes');
  assert.equal(await f.button('Add friend').isEnabled(), true);
  assert.equal(await f.button('Add friend').locator('svg[class*="spin"]').count(), 0);
  assert.equal(f.serverRelationship(), 'friends', 'removal has not saved yet');
  assert.equal(await f.card.locator('dl dd').first().innerText(), '9', 'friend count decreases immediately');
  assert.equal(await f.page.getByText('Shared with friends', { exact: true }).isVisible(), true);
}

test('removing a friend closes the dialog and updates the profile before saving', async t => {
  const f = await setup(t, { initial: 'friends' });
  await confirmRemoval(f);
  const finalRead = f.page.waitForResponse(r => r.url().includes('/users/friend-requests'));
  f.gate.resolve();
  await finalRead;
  assert.equal(f.serverRelationship(), 'none');
  assert.equal(await f.button('Add friend').isVisible(), true);
  assert.deepEqual(f.calls, ['remove']);
  assert.deepEqual(f.errors, []);
});

test('failed removal restores the friendship, friend count, and testimony access', async t => {
  const f = await setup(t, { initial: 'friends', failure: true });
  await confirmRemoval(f);
  f.gate.resolve();
  await f.card.getByRole('alert').filter({ hasText: 'Could not save request.' }).waitFor();
  await f.button('Remove friend').waitFor();
  assert.equal(await f.card.locator('dl dd').first().innerText(), '10');
  assert.equal(await f.page.getByText('Shared with friends', { exact: true }).count(), 0);
  assert.equal(await f.card.getByText('Friend removed.', { exact: true }).count(), 0);
  assert.deepEqual(f.errors, []);
});

test('adding again during removal saves both actions in order', async t => {
  const f = await setup(t, { initial: 'friends' });
  await confirmRemoval(f);
  await f.button('Add friend').click();
  await f.button('Cancel request').waitFor();
  assert.deepEqual(f.calls, ['remove']);
  const finalRead = f.page.waitForResponse(r => r.url().includes('/users/friend-requests'));
  f.gate.resolve();
  await finalRead;
  assert.deepEqual(f.calls, ['remove', 'add']);
  assert.equal(f.serverRelationship(), 'outgoing');
  assert.equal(await f.button('Cancel request').isVisible(), true);
  assert.deepEqual(f.errors, []);
});
