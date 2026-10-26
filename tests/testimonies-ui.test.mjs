// Run with the local Next dev server on port 3000: node --test tests/testimonies-ui.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const owner = { _id: A, Name: 'Alice', username: 'alice', profilePhoto: null };
const friend = { _id: B, Name: 'Youssef', username: 'youssef', profilePhoto: null };
const base = process.env.TESTIMONY_TEST_URL || 'http://localhost:3000';
const output = resolve('../work/testimonies');
let desktopBrowser, mobileBrowser;
before(async () => { await mkdir(output, { recursive: true }); desktopBrowser = await chromium.launch({ executablePath: chromium.executablePath() }); mobileBrowser = await webkit.launch(); });
after(async () => { await desktopBrowser?.close(); await mobileBrowser?.close(); });

async function setup(t, { startPath = '/friends/', mobile = false, failFirstPublish = false, failFirstLove = false, empty = false, expiresSoon = false, programer = false, cooldownSoon = false, relationship = 'friends', failFriendship = false, friendPhoto = false, omitProfileMetadata = false, profileRelationship = null } = {}) {
  const context = await (mobile ? mobileBrowser : desktopBrowser).newContext({ ...(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 1100 } }), serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`${error.message} (${page.url()}) ${error.stack || ''}`));
  await page.addInitScript(({ A, programer }) => {
    localStorage.setItem('wasla_splash_version', '1.0.6');
    localStorage.setItem('user_Taspe7_Token', 'testimony-test-token');
    localStorage.setItem('user_Taspe7_ID', A);
    localStorage.setItem('user_Taspe7_Username', 'alice');
    localStorage.setItem('user_Taspe7_GlobalRole', programer ? 'PROGRAMER' : 'USER');
    localStorage.setItem('app-language', 'en');
    localStorage.setItem('taspe7_theme', 'dark');
    Object.defineProperty(navigator.serviceWorker, 'controller', { value: { scriptURL: '/sw.js?v=navigation-v2' } });
  }, { A, programer });
  const now = Date.now();
  const post = (id, title, body, style, author, age = 10000) => ({ _id: id, title, body, style, author,
    loved: false, loveCount: 0,
    createdAt: new Date(now - age).toISOString(), updatedAt: new Date(now - age).toISOString(), feedExpiresAt: new Date(now - age + 86400000).toISOString() });
  const state = { posts: empty ? [] : [
    post('111111111111111111111111', 'Peace in the middle of it all', 'This week was full of uncertainty. In a quiet moment of prayer, God reminded me that I don’t have to carry tomorrow today. I’m learning to trust Him one small step at a time.', 'olive', friend, expiresSoon ? 86400000 - 20000 : 10000),
    { ...post('222222222222222222222222', 'A prayer, quietly answered', 'An unexpected conversation brought the encouragement I had been praying for. Sometimes grace arrives through the people beside us.', 'dawn', owner), verse: { reference: 'Matthew 6:34', text: 'Therefore do not worry about tomorrow, for tomorrow will worry about itself.' } },
    post('333333333333333333333333', 'Finding stillness again', 'I put my phone away and spent a little time reading. It was a simple reminder that God is near, even when life feels noisy.', 'still', friend),
    post('444444444444444444444444', 'A story from last week', 'An older testimony remains on my profile for friends to read long after its day on the board.', 'olive', friend, 7 * 86400000),
  ], sent: [], socialReads: [], loveRequests: [], loveNotifications: [], reactorUsers: [], reactorReads: 0, failReactors: false, publishAttempts: 0, denyProfile: false, relationship, failFriendship, friendshipRequests: [], privateProfileReads: 0, alreadyFriendsOnAdd: false, failRelationshipRead: false };
  state.nextPublishAt = cooldownSoon ? now + 20000 : 0;
  const publishing = () => {
    if (programer) return { canPublish: true, unlimited: true, nextPublishAt: null };
    const next = Math.max(state.nextPublishAt, ...state.posts.filter(item => item.author._id === A).map(item => new Date(item.feedExpiresAt).getTime()));
    return { canPublish: next <= Date.now(), unlimited: false, nextPublishAt: next > Date.now() ? new Date(next).toISOString() : null };
  };
  if (expiresSoon || cooldownSoon) await page.clock.install({ time: new Date(now) });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
  state.sockets = new Set();
  state.publishNote = event => { for (const socket of state.sockets) socket.send(`42/testimonies,${JSON.stringify(['note-changed', event])}`); };
  await page.routeWebSocket(/\/socket\.io\//, socket => {
    socket.onMessage(message => {
      if (String(message).startsWith('40/testimonies,')) {
        state.sockets.add(socket);
        socket.send('40/testimonies,{"sid":"notes-test"}');
        socket.send('42/testimonies,["notes-ready"]');
      }
    });
    socket.onClose(() => state.sockets.delete(socket));
    socket.send('0{"sid":"engine-test","upgrades":[],"pingInterval":6000000,"pingTimeout":6000000,"maxPayload":1000000}');
  });
  const viewedFriend = { ...friend, profilePhoto: friendPhoto ? 'https://avatars.example.test/friend.png' : null };
  if (friendPhoto) state.posts = state.posts.map(item => item.author._id === B ? { ...item, author: viewedFriend } : item);
  const avatarImage = await readFile(resolve('public/wasla.jpg'));
  await page.route('https://avatars.example.test/**', route => route.fulfill({ body: avatarImage, contentType: 'image/jpeg', headers: cors }));
  await page.route('**/version.json?*', route => route.fulfill({ json: { version: '1.0.6' } }));
  await page.route(/\/api\//, async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const reply = (json, status = 200) => route.fulfill({ json, status, headers: cors });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (method === 'GET' && /\/(testimonies(?:\/profile\/[a-f\d]+)?|friends|friend-requests)$/.test(path)) state.socialReads.push(path);
    if (path.endsWith('/testimonies') && method === 'GET') {
      const items = state.posts.filter(item => new Date(item.feedExpiresAt).getTime() > Date.now() && (item.author._id === A || state.relationship === 'friends'));
      return reply({ items, activeNotes: items.map(item => ({ _id: item._id, authorId: item.author._id, feedExpiresAt: item.feedExpiresAt })), nextCursor: null, publishing: publishing() });
    }
    if (path.includes('/testimonies/note/')) {
      const item = state.posts.find(item => item._id === path.split('/').pop());
      if (!item) return reply({ message: 'This note is no longer available.' }, 404);
      if (item.author._id !== A && state.relationship !== 'friends') return reply({ message: 'This note is available only to current friends.' }, 403);
      return reply({ item, ...(item.author._id === A ? { publishing: publishing() } : {}) });
    }
    if (path.includes('/testimonies/own/')) {
      const item = state.posts.find(item => item._id === path.split('/').pop() && item.author._id === A);
      return item ? reply({ item }) : reply({ message: 'This note is no longer available.' }, 404);
    }
    if (/\/testimonies\/[a-f\d]{24}\/loves$/.test(path)) {
      state.reactorReads++;
      const item = state.posts.find(item => item._id === path.split('/').at(-2) && item.author._id === A);
      if (!item) return reply({ message: 'This note is no longer available.' }, 404);
      if (state.failReactors) return reply({ message: 'Could not load reactions. Please try again.' }, 500);
      const cursor = url.searchParams.get('cursor');
      const start = cursor ? state.reactorUsers.findIndex(user => user._id === cursor) + 1 : 0;
      const users = state.reactorUsers.slice(start, start + 20);
      return reply({ users, nextCursor: start + 20 < state.reactorUsers.length ? users.at(-1)._id : null });
    }
    if (/\/testimonies\/[a-f\d]{24}\/love$/.test(path)) {
      const item = state.posts.find(item => item._id === path.split('/').at(-2));
      state.loveRequests.push({ path, method });
      if (state.loveGate) await state.loveGate;
      if (failFirstLove && state.loveRequests.length === 1) return reply({ message: 'Could not save your reaction. Please try again.' }, 500);
      if (!item) return reply({ message: 'This note is no longer available.' }, 404);
      const loved = method === 'PUT';
      if (loved !== item.loved) item.loveCount += loved ? 1 : -1;
      item.loved = loved;
      if (loved && !state.loveNotifications.includes(item._id)) state.loveNotifications.push(item._id);
      return reply({ reaction: { loved, loveCount: item.loveCount } });
    }
    if (path.includes('/testimonies/profile/')) {
      if (state.denyProfile) return reply({ message: 'This profile is available only to current friends.' }, 403);
      const id = path.split('/').pop();
      const isOwner = id === A, canViewTestimonies = isOwner || state.relationship === 'friends';
      const items = state.posts.filter(item => item.author._id === id);
      if (omitProfileMetadata) return reply({ user: isOwner ? owner : viewedFriend, isOwner, items: canViewTestimonies ? items : [], nextCursor: null, ...(isOwner ? { publishing: publishing() } : {}) });
      return reply({ user: isOwner ? owner : viewedFriend, isOwner, relationship: isOwner ? 'self' : profileRelationship || state.relationship,
        canViewTestimonies, stats: { friends: state.relationship === 'friends' ? 3 : 2, mutualFriends: 1, testimonies: canViewTestimonies ? items.length : null },
        items: canViewTestimonies ? items : [], nextCursor: null, ...(isOwner ? { publishing: publishing() } : {}) });
    }
    if (path.endsWith('/testimonies') && method === 'POST') {
      state.publishAttempts++;
      const body = request.postDataJSON(); state.sent.push(body);
      if (!publishing().canPublish) return reply({ message: 'You already have an active note. You can share again after it expires.', code: 'TESTIMONY_ACTIVE', publishing: publishing() }, 409);
      if (failFirstPublish && state.publishAttempts === 1) return reply({ message: 'Could not publish. Your draft is safe; please try again.' }, 500);
      const item = post('555555555555555555555555', body.title, body.body, body.style, owner, 0);
      if (body.verse) item.verse = body.verse;
      state.posts = [item, ...state.posts.filter(old => old._id !== item._id)];
      state.nextPublishAt = Date.now() + 86400000;
      return reply({ item, publishing: publishing() }, 201);
    }
    if (/\/testimonies\/[a-f\d]{24}$/.test(path)) {
      const id = path.split('/').pop();
      if (method === 'DELETE') { state.nextPublishAt = Math.max(state.nextPublishAt, new Date(state.posts.find(item => item._id === id)?.feedExpiresAt || 0).getTime()); state.posts = state.posts.filter(item => item._id !== id); return reply({ success: true }); }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        state.posts = state.posts.map(item => item._id === id ? { ...item, ...body, verse: body.verse || undefined } : item);
        return reply({ item: state.posts.find(item => item._id === id) });
      }
    }
    if (path.endsWith('/my-profile')) {
      state.privateProfileReads++;
      return reply({ user: { ...owner, bibleNotes: [{ _id: 'private-note', verseId: 'verse2', bookName: 'John', chapter: 1, verseNumber: 1, text: 'A private saved verse.', note: 'A private reflection only Alice should see.' }], prayTime: [], bibleHighlights: [{ _id: 'highlight1', verseId: 'verse1', bookName: 'Matthew', chapter: 6, verseNumber: 34, text: 'Do not worry about tomorrow.', color: '#aacc88' }] } });
    }
    if ((path.includes('/friend-request/') || (path.endsWith(`/friends/${B}`) && method === 'DELETE')) && method !== 'GET') {
      state.friendshipRequests.push({ path, method });
      if (state.alreadyFriendsOnAdd && path.endsWith(`/friend-request/${B}`)) {
        state.relationship = 'friends';
        return reply({ msg: 'Already friends' }, 400);
      }
      if (state.failFriendship) { state.failFriendship = false; return reply({ msg: 'Could not update friendship. Please try again.' }, 500); }
      if (method === 'DELETE' || path.includes('/cancel/')) state.relationship = 'none';
      else if (path.includes('/accept/') || state.relationship === 'incoming') state.relationship = 'friends';
      else state.relationship = 'outgoing';
      return reply({ success: true, status: state.relationship === 'friends' ? 'accepted' : 'pending' });
    }
    if (path.endsWith('/friends')) return state.failRelationshipRead ? reply({ message: 'Could not check friendship.' }, 503) : reply({ friends: state.relationship === 'friends' ? [friend] : [] });
    if (path.endsWith('/friend-requests')) return reply({ incoming: state.relationship === 'incoming' ? [{ from: friend }] : [], outgoing: state.relationship === 'outgoing' ? [{ to: friend }] : [] });
    if (path.endsWith('/search-username')) return reply([friend]);
    if (path.endsWith('/my-teams')) return reply({ teams: [] });
    return reply({ friends: [], incoming: [], outgoing: [], users: [], data: [] });
  });
  const initialFriends = startPath === '/friends/' ? Promise.all(['friends', 'friend-requests'].map(name =>
    page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/users/${name}`) && response.request().method() === 'GET')
      .then(response => response.finished()))) : Promise.resolve();
  const initialFeed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/users/testimonies') && response.request().method() === 'GET').then(response => response.finished());
  // Finish the offline avatar download before navigating away from this document.
  const initialAvatar = friendPhoto && !empty ? page.waitForResponse(response => response.url() === viewedFriend.profilePhoto && response.request().resourceType() === 'fetch').then(response => response.finished()) : Promise.resolve();
  await page.goto(`${base}${startPath}`, { waitUntil: 'domcontentloaded' });
  await Promise.all([initialFriends, initialAvatar, initialFeed]);
  await page.getByRole('button', { name: 'Share your testimony', exact: true }).waitFor();
  await page.getByRole('status', { name: 'Loading testimonies' }).waitFor({ state: 'hidden' });
  return { page, state, errors };
}

test('compact dark notes, full reader, name navigation, and permanent friend collection', async t => {
  const { page, errors } = await setup(t, { friendPhoto: true });
  assert.equal(await page.getByTestId('testimony-cards').getByRole('article').count(), 3);
  assert.ok((await page.getByRole('region', { name: 'Friends testimony highlights' }).boundingBox()).height < 160);
  await page.screenshot({ path: resolve(output, 'friends-desktop.png'), fullPage: true });
  assert.equal(await page.getByTestId('testimony-cards').getByRole('link').count(), 0);
  // The compact name/photo area opens the note, rather than navigating away.
  await page.getByRole('button', { name: /^Read testimony:/ }).first().click({ position: { x: 40, y: 13 } });
  const reader = page.getByRole('dialog');
  await reader.getByText('I’m learning to trust Him one small step at a time.', { exact: false }).waitFor();
  assert.equal(await reader.getByRole('button', { name: 'Edit testimony' }).count(), 0);
  const expanded = await reader.getByTestId('expanded-testimony-note').boundingBox();
  assert.ok(Math.abs(expanded.width - expanded.height) < 1);
  assert.equal(await reader.getByText('A moment of faith', { exact: true }).count(), 0);
  await page.screenshot({ path: resolve(output, 'reader-desktop.png'), animations: 'disabled' });
  await reader.getByRole('link', { name: 'Visit Youssef profile', exact: true }).click();
  await page.getByRole('heading', { name: 'Youssef', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'A story from last week', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'friend-profile-desktop.png'), fullPage: true });
  assert.deepEqual(errors, []);
});

test('writing directly on a dark note restores drafts, retries, edits, and deletes', async t => {
  const { page, state, errors } = await setup(t, { failFirstPublish: true, programer: true });
  await page.getByRole('button', { name: 'Share your testimony', exact: true }).click();
  let dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('button', { name: 'Share', exact: true }).isDisabled(), true);
  assert.equal(await dialog.locator('input').count(), 0);
  assert.equal(await dialog.getByRole('textbox').count(), 1);
  const story = 'A friend called at just the right moment. Through that conversation, God reminded me that I was not alone.';
  await dialog.getByRole('textbox', { name: 'Your testimony', exact: true }).fill(story);
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Share your testimony', exact: true }).click();
  dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('textbox', { name: 'Your testimony', exact: true }).inputValue(), story);
  await page.screenshot({ path: resolve(output, 'composer-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /Your draft is safe/);
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(state.publishAttempts, 2);
  assert.equal(state.sent[0].clientId, state.sent[1].clientId);
  assert.equal(state.sent[1].verse, null);
  assert.equal(state.sent[1].body, story);
  assert.equal(state.sent[1].title, story.slice(0, 80));
  assert.equal(await page.evaluate(A => localStorage.getItem(`taspe7_testimony_draft_v1:${A}:new`), A), null);
  await page.getByRole('button', { name: `Read testimony: ${state.sent[1].title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Edit testimony', exact: true }).click();
  const editedStory = 'Grace through a friend helped me take a small step forward.';
  await page.getByRole('textbox', { name: 'Your testimony', exact: true }).fill(editedStory);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: `Read testimony: ${editedStory}`, exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove testimony', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(state.posts.some(item => item.body === editedStory), false);
  assert.deepEqual(errors, []);
});

test('iPhone Safari note editor fits the screen, supports Arabic, and restores focus', async t => {
  const { page, state, errors } = await setup(t, { mobile: true, programer: true, friendPhoto: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: resolve(output, 'friends-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Share your testimony', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const writing = dialog.getByRole('textbox', { name: 'Your testimony', exact: true });
  await writing.fill('في وسط القلق، افتكرت إن ربنا معايا. كلمة بسيطة من صديق رجعت لي السلام وشجعتني أكمل اليوم بإيمان.');
  assert.ok(parseFloat(await writing.evaluate(element => getComputedStyle(element).fontSize)) >= 16);
  assert.equal(await writing.evaluate(element => getComputedStyle(element).borderTopWidth), '0px');
  assert.equal(await writing.evaluate(element => getComputedStyle(element).direction), 'rtl');
  assert.notEqual(await dialog.evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: resolve(output, 'composer-mobile-write.png'), fullPage: true, animations: 'disabled' });
  assert.equal(await dialog.getByRole('button', { name: 'Preview', exact: true }).count(), 0);
  const box = await dialog.boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height);
  assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Share your testimony', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.getByRole('button', { name: 'Share your testimony', exact: true }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: `Read testimony: ${state.sent[0].title}`, exact: true }).click();
  const enlarged = page.getByTestId('expanded-testimony-note');
  const enlargedBox = await enlarged.boundingBox();
  assert.ok(Math.abs(enlargedBox.width - enlargedBox.height) < 1);
  assert.ok(enlargedBox.width > 250 && enlargedBox.width < page.viewportSize().width);
  assert.equal(await enlarged.getByRole('heading').count(), 0);
  await page.screenshot({ path: resolve(output, 'reader-mobile.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
});

test('client expiry removes a card while profile retains it; denied access clears shared content', async t => {
  const { page, state, errors } = await setup(t, { expiresSoon: true });
  const reads = state.socialReads.length;
  await page.clock.fastForward(31000);
  await page.getByRole('heading', { name: 'Peace in the middle of it all', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('heading', { name: 'Peace in the middle of it all', exact: true }).count(), 0);
  assert.equal(state.socialReads.length, reads, 'expiring a note must not call the server');
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('heading', { name: 'Peace in the middle of it all', exact: true }).waitFor();
  state.denyProfile = true;
  await page.evaluate(() => window.dispatchEvent(new Event('taspe7:testimonies-changed')));
  await page.getByText('This profile is available only to current friends.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Peace in the middle of it all', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});

test('empty state is only a small pinned plus tile, positioned immediately above profile settings', async t => {
  const { page, errors } = await setup(t, { empty: true, mobile: true });
  const tile = await page.getByRole('button', { name: 'Share your testimony', exact: true }).boundingBox();
  assert.ok(Math.abs(tile.width - tile.height) < 1);
  assert.ok(tile.width <= 90);
  await page.screenshot({ path: resolve(output, 'friends-empty-mobile.png'), fullPage: true });
  await page.goto(`${base}/normal_UserProfile/`);
  await page.getByRole('heading', { name: 'Your testimony highlights', exact: true }).waitFor();
  const gap = await page.getByRole('button', { name: /Bible Highlights/ }).evaluate(settings => {
    const tile = document.querySelector('[aria-label="Share your testimony"]');
    return settings.getBoundingClientRect().top - tile.getBoundingClientRect().top;
  });
  assert.ok(gap > 0 && gap < 230);
  await page.screenshot({ path: resolve(output, 'profile-compact-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
});

test('friend profile confirms removal, locks testimonies, and supports sending and cancelling requests', async t => {
  const { page, state, errors } = await setup(t);
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  assert.equal(await page.locator('dl > div').first().locator('dd').textContent(), '3');
  assert.equal(await page.locator('dl > div').nth(1).locator('dd').textContent(), '1');
  await page.getByRole('button', { name: 'Remove friend', exact: true }).click();
  await page.getByRole('button', { name: 'Keep friend', exact: true }).click();
  assert.equal(state.friendshipRequests.length, 0);
  await page.getByRole('button', { name: 'Remove friend', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove friend', exact: true }).click();
  await page.getByRole('button', { name: 'Add friend', exact: true }).waitFor();
  await page.getByText('Become friends to read each other’s testimonies.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Read testimony:/ }).count(), 0);
  assert.equal(await page.locator('dl > div').first().locator('dd').textContent(), '2');
  await page.screenshot({ path: resolve(output, 'profile-add-friend-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Add friend', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'profile-request-sent-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await page.getByRole('button', { name: 'Add friend', exact: true }).waitFor();
  assert.deepEqual(state.friendshipRequests.map(request => request.method), ['DELETE', 'POST', 'POST']);
  assert.ok(await page.evaluate(A => Number(localStorage.getItem(`taspe7_friends_dirty_${A}`)) > 0, A));
  await page.goto(`${base}/friends/`);
  await page.getByRole('button', { name: 'My Friends' }).click();
  await page.getByText('No friends yet', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('incoming requests can be declined or accepted on iPhone, revealing posts and updated counts', async t => {
  const { page, state, errors } = await setup(t, { mobile: true, relationship: 'incoming' });
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Accept request', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Read testimony:/ }).count(), 0);
  await page.screenshot({ path: resolve(output, 'profile-incoming-mobile.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.getByRole('button', { name: 'Add friend', exact: true }).waitFor();
  state.relationship = 'incoming';
  await page.evaluate(() => window.dispatchEvent(new Event('taspe7:friends-push')));
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'A story from last week', exact: true }).waitFor();
  assert.equal(await page.locator('dl > div').first().locator('dd').textContent(), '3');
  assert.equal(await page.locator('dl > div').nth(2).locator('dd').textContent(), '3');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: resolve(output, 'friend-profile-mobile.png'), animations: 'disabled' });
  await page.goto(`${base}/friends/`);
  await page.getByRole('button', { name: 'My Friends' }).click();
  await page.getByRole('button', { name: 'Open Youssef profile', exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('search opens nonfriend profiles, failed requests keep the right state, and own profiles have no friend actions', async t => {
  const { page, state, errors } = await setup(t, { relationship: 'none', failFriendship: true });
  await page.getByPlaceholder('Search by @username...').fill('youssef');
  await page.getByRole('button', { name: 'Open Youssef profile', exact: true }).click();
  await page.getByRole('button', { name: 'Add friend', exact: true }).click();
  await page.getByRole('alert').getByText('Could not update friendship. Please try again.', { exact: true }).waitFor();
  assert.equal(state.relationship, 'none');
  assert.equal(await page.getByRole('button', { name: /^Read testimony:/ }).count(), 0);
  await page.getByRole('button', { name: 'Add friend', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel request', exact: true }).waitFor();
  await page.goto(`${base}/normal_UserProfile/?user=${A}`);
  await page.getByRole('heading', { name: 'Alice', exact: true }).waitFor();
  await page.getByTitle('Edit Name', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Bible Notes/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add friend', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Remove friend', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});

test('the main normal profile hides private data and owner controls, including in the photo viewer, when another user visits', async t => {
  const { page, state, errors } = await setup(t, { mobile: true, friendPhoto: true });
  await page.goto(`${base}/normal_UserProfile/`);
  await page.getByRole('heading', { name: 'Alice', exact: true }).waitFor();
  const ownerHeader = page.getByTestId('profile-header-card');
  const ownerClass = await ownerHeader.getAttribute('class');
  const ownerWidth = (await ownerHeader.boundingBox()).width;
  assert.equal(await ownerHeader.getByTitle('Edit Name', { exact: true }).count(), 1);
  await page.getByRole('button', { name: /Bible Notes/ }).click();
  await page.getByText('A private reflection only Alice should see.', { exact: true }).waitFor();
  const privateReads = state.privateProfileReads;
  await page.goto(`${base}/normal_UserProfile/?user=${B}#notes`);
  await page.getByRole('heading', { name: 'Youssef', exact: true }).waitFor();
  const visitorHeader = page.getByTestId('profile-header-card');
  assert.equal(await visitorHeader.getAttribute('class'), ownerClass);
  assert.equal((await visitorHeader.boundingBox()).width, ownerWidth);
  assert.equal(await visitorHeader.getByTitle('Edit Name', { exact: true }).count(), 0);
  assert.equal(await page.getByTitle('Edit Username', { exact: true }).count(), 0);
  assert.equal(await page.getByTitle('Change Photo', { exact: true }).count(), 0);
  assert.equal(await page.locator('input[type=file]').count(), 0);
  assert.equal(await page.getByRole('button', { name: /Bible Notes|Bible Highlights|General Preferences/ }).count(), 0);
  assert.equal(await page.getByText('A private reflection only Alice should see.', { exact: true }).count(), 0);
  assert.equal(state.privateProfileReads, privateReads);
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'unified-profile-visitor-mobile.png'), animations: 'disabled' });
  await visitorHeader.getByRole('img', { name: 'Profile', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('img[alt="Profile"]').length === 2);
  assert.equal(await page.getByTitle('Change Photo', { exact: true }).count(), 0);
  assert.equal(await page.getByTitle('Remove Photo', { exact: true }).count(), 0);
  await page.mouse.click(5, 400);
  await page.waitForFunction(() => document.querySelectorAll('img[alt="Profile"]').length === 1);
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Profile', exact: true }).click();
  await page.waitForURL(/\/normal_UserProfile\/?$/);
  await page.getByRole('heading', { name: 'Alice', exact: true }).waitFor();
  await page.getByRole('button', { name: /Bible Notes/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Remove friend', exact: true }).count(), 0);
  await page.screenshot({ path: resolve(output, 'unified-profile-owner-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
});

test('the separate friend-profile page is removed', async t => {
  const { page, errors } = await setup(t);
  const response = await page.goto(`${base}/friend-profile/?user=${B}`);
  assert.equal(response.status(), 404);
  assert.deepEqual(errors, []);
});

test('accepted friends never show Add friend when profile friendship metadata is missing', async t => {
  const { page, state, errors } = await setup(t, { mobile: true, omitProfileMetadata: true });
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add friend', exact: true }).count(), 0);
  assert.equal(state.friendshipRequests.length, 0);
  await page.screenshot({ path: resolve(output, 'friendship-status-fixed-mobile.png'), animations: 'disabled' });
  assert.deepEqual(errors, []);
});

test('fresh Friends data overrides stale profile metadata, including after refresh', async t => {
  const { page, state, errors } = await setup(t, { profileRelationship: 'none' });
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('taspe7:friends-push')));
  await page.getByRole('button', { name: 'Remove friend', exact: true }).click();
  await page.getByRole('button', { name: 'Keep friend', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Add friend', exact: true }).count(), 0);
  assert.equal(state.friendshipRequests.length, 0);
  assert.deepEqual(errors, []);
});

test('Already friends from the server corrects the button instead of leaving a red error and Add friend', async t => {
  const { page, state, errors } = await setup(t, { relationship: 'none', profileRelationship: 'none' });
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Add friend', exact: true }).waitFor();
  state.alreadyFriendsOnAdd = true;
  await page.getByRole('button', { name: 'Add friend', exact: true }).click();
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  await page.getByText('You are already friends.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add friend', exact: true }).count(), 0);
  assert.deepEqual(await page.getByTestId('profile-header-card').getByRole('alert').allTextContents(), []);
  assert.equal(state.friendshipRequests.length, 1);
  assert.deepEqual(errors, []);
});

test('a failed friendship lookup offers retry without guessing Add friend', async t => {
  const { page, state, errors } = await setup(t, { omitProfileMetadata: true });
  state.failRelationshipRead = true;
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Retry friendship check', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add friend', exact: true }).count(), 0);
  state.failRelationshipRead = false;
  await page.getByRole('button', { name: 'Retry friendship check', exact: true }).click();
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('active notes disable sharing on Friends and the main profile; editing stays available', async t => {
  const { page, errors } = await setup(t);
  const add = page.getByRole('button', { name: 'Share your testimony', exact: true });
  assert.equal(await add.isDisabled(), true);
  await page.getByText('Note active', { exact: true }).waitFor();
  assert.equal(await page.getByText(/24h left/).count(), 0);
  await page.goto(`${base}/normal_UserProfile/`);
  await page.getByText('Note active', { exact: true }).waitFor();
  assert.equal(await add.isDisabled(), true);
  await page.getByRole('button', { name: 'Read testimony: A prayer, quietly answered', exact: true }).click();
  await page.getByRole('button', { name: 'Edit testimony', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your testimony', exact: true }).fill('I can still improve the note I already shared.');
  assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await add.isDisabled(), true);
  assert.deepEqual(errors, []);
});

test('publishing disables the next note and deleting does not bypass the wait', async t => {
  const { page, errors } = await setup(t, { empty: true, mobile: true });
  const add = page.getByRole('button', { name: 'Share your testimony', exact: true });
  await add.click();
  const story = 'Today a quiet prayer brought peace to my heart.';
  await page.getByRole('textbox', { name: 'Your testimony', exact: true }).fill(story);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByText('Note active', { exact: true }).waitFor();
  assert.equal(await add.isDisabled(), true);
  await page.getByRole('button', { name: `Read testimony: ${story}`, exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove testimony', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Note active', { exact: true }).waitFor();
  assert.equal(await add.isDisabled(), true);
  assert.deepEqual(errors, []);
});

test('sharing enables automatically when the background cooldown expires', async t => {
  const { page, state, errors } = await setup(t, { empty: true, cooldownSoon: true });
  const add = page.getByRole('button', { name: 'Share your testimony', exact: true });
  assert.equal(await add.isDisabled(), true);
  const reads = state.socialReads.length;
  await page.clock.fastForward(21000);
  assert.equal(await add.isEnabled(), true);
  assert.equal(state.socialReads.length, reads, 'unlocking sharing must not call the server');
  await add.click();
  await page.getByRole('textbox', { name: 'Your testimony', exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('PROGRAMER can publish successive notes without waiting', async t => {
  const { page, state, errors } = await setup(t, { empty: true, programer: true });
  for (const story of ['First testimony about faith and hope.', 'Another testimony from this same day.']) {
    await page.getByRole('button', { name: 'Share your testimony', exact: true }).click();
    await page.getByRole('textbox', { name: 'Your testimony', exact: true }).fill(story);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  assert.equal(state.publishAttempts, 2);
  assert.notEqual(state.sent[0].clientId, state.sent[1].clientId);
  assert.deepEqual(errors, []);
});

test('a note published on another device blocks a stale composer and preserves its draft', async t => {
  const { page, state, errors } = await setup(t, { empty: true });
  await page.getByRole('button', { name: 'Share your testimony', exact: true }).click();
  const story = 'Keep this draft even when another device publishes first.';
  await page.getByRole('textbox', { name: 'Your testimony', exact: true }).fill(story);
  state.nextPublishAt = Date.now() + 86400000;
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Share', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('textbox', { name: 'Your testimony', exact: true }).inputValue(), story);
  await page.keyboard.press('Escape');
  assert.equal(JSON.parse(await page.evaluate(A => localStorage.getItem(`taspe7_testimony_draft_v1:${A}:new`), A)).body, story);
  assert.deepEqual(errors, []);
});

test('idle Friends page makes no periodic social requests; manual refresh fetches changes', async t => {
  const { page, state, errors } = await setup(t, { expiresSoon: true });
  const reads = state.socialReads.length;
  const feedReads = state.socialReads.filter(path => path.endsWith('/testimonies')).length;
  await page.clock.fastForward(5 * 60000);
  assert.equal(state.socialReads.length, reads);
  const removed = state.posts.find(item => item._id === '333333333333333333333333');
  state.posts = state.posts.filter(item => item !== removed);
  await page.getByRole('button', { name: 'Refresh testimonies', exact: true }).click();
  await page.getByRole('heading', { name: removed.title, exact: true }).waitFor({ state: 'hidden' });
  assert.equal(state.socialReads.filter(path => path.endsWith('/testimonies')).length, feedReads + 1);
  assert.deepEqual(errors, []);
});

test('idle visitor profile does not poll notes or friendship status', async t => {
  const { page, state, errors } = await setup(t);
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Remove friend', exact: true }).waitFor();
  await page.clock.install();
  const reads = state.socialReads.length;
  await page.clock.fastForward(5 * 60000);
  assert.equal(state.socialReads.length, reads);
  assert.deepEqual(errors, []);
});

test('hidden pages skip refreshes and returning fetches the latest notes and friendships', async t => {
  const { page, state, errors } = await setup(t);
  const reads = state.socialReads.length;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('taspe7:friends-push'));
    window.dispatchEvent(new Event('taspe7:testimonies-changed'));
  });
  assert.equal(state.socialReads.length, reads);
  const removed = state.posts.find(item => item._id === '333333333333333333333333');
  state.posts = state.posts.filter(item => item !== removed);
  const finished = Promise.all(['friends', 'friend-requests', 'testimonies'].map(name => page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/users/${name}`) && response.request().method() === 'GET').then(response => response.finished())));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await finished;
  await page.getByRole('heading', { name: removed.title, exact: true }).waitFor({ state: 'hidden' });
  assert.equal(state.socialReads.length, reads + 3);
  assert.deepEqual(errors, []);
});

test('only the opened note shows a heart, which reacts from its padded area and persists', async t => {
  const { page, state, errors } = await setup(t, { friendPhoto: true });
  const note = page.getByRole('button', { name: 'Read testimony: Peace in the middle of it all', exact: true });
  const card = note.locator('..');
  assert.equal(await card.getByRole('button', { name: 'Love this note', exact: true }).count(), 0);
  await note.click();
  const reader = page.getByRole('dialog', { name: 'Testimony', exact: true });
  await reader.waitFor();
  let heart = reader.getByRole('button', { name: 'Love this note', exact: true });
  const bounds = await reader.getByTestId('expanded-testimony-note').boundingBox(), button = await heart.boundingBox();
  assert.ok(button.width <= 34 && button.height <= 34);
  assert.ok(button.x < bounds.x + 20 && button.y > bounds.y + bounds.height / 2);
  assert.equal(await heart.innerText(), '', 'the reaction displays only the heart icon');
  const reads = state.socialReads.length;
  await page.screenshot({ path: resolve(output, 'love-fixed-desktop.png'), animations: 'disabled' });
  const saved = page.waitForResponse(response => response.url().endsWith('/love') && response.request().method() === 'PUT').then(response => response.finished());
  await heart.click({ position: { x: 3, y: 3 } });
  await reader.getByRole('status', { name: '1 love', exact: true }).waitFor();
  assert.equal(await reader.isVisible(), true);
  assert.equal(state.socialReads.length, reads);
  await saved;
  assert.equal(state.loveRequests.length, 1);
  assert.equal(state.loveNotifications.length, 1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await card.getByRole('button', { name: 'Remove love', exact: true }).count(), 0);
  await note.click();
  heart = reader.getByRole('button', { name: 'Remove love', exact: true });
  assert.equal(await heart.getAttribute('aria-pressed'), 'true');
  const removed = page.waitForResponse(response => response.url().endsWith('/love') && response.request().method() === 'DELETE').then(response => response.finished());
  await heart.click();
  await reader.getByRole('status', { name: '1 love', exact: true }).waitFor({ state: 'hidden' });
  await removed;
  assert.equal(state.loveRequests.at(-1).method, 'DELETE');
  await reader.getByRole('button', { name: 'Love this note', exact: true }).click({ position: { x: 3, y: 3 } });
  await reader.getByRole('status', { name: '1 love', exact: true }).waitFor();
  assert.equal(await reader.isVisible(), true);
  assert.deepEqual(errors, []);
});

test('normal taps still open notes and owners cannot react to themselves', async t => {
  const { page, state, errors } = await setup(t);
  const note = page.getByRole('button', { name: 'Read testimony: Peace in the middle of it all', exact: true });
  await note.click();
  await page.getByRole('dialog', { name: 'Testimony', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const own = page.getByRole('button', { name: 'Read testimony: A prayer, quietly answered', exact: true });
  assert.equal(await own.locator('..').getByRole('button', { name: 'Love this note', exact: true }).count(), 0);
  assert.equal(state.loveRequests.length, 0);
  assert.deepEqual(errors, []);
});

test('iPhone opened-note heart supports touch, keyboard activation, and retry after a failed save', async t => {
  const { page, state, errors } = await setup(t, { mobile: true, failFirstLove: true });
  const note = page.getByRole('button', { name: 'Read testimony: Peace in the middle of it all', exact: true });
  assert.equal(await note.locator('..').getByRole('button', { name: 'Love this note', exact: true }).count(), 0);
  await note.tap();
  const card = page.getByRole('dialog', { name: 'Testimony', exact: true });
  const heart = card.getByRole('button', { name: 'Love this note', exact: true });
  await page.screenshot({ path: resolve(output, 'love-fixed-mobile.png'), animations: 'disabled' });
  await heart.tap({ position: { x: 3, y: 3 } });
  await page.getByText('Could not save your reaction. Please try again.', { exact: true }).waitFor();
  assert.equal(await card.getByRole('status', { name: '1 love', exact: true }).count(), 0);
  assert.equal(await card.isVisible(), true);
  await heart.tap();
  await card.getByRole('status', { name: '1 love', exact: true }).waitFor();
  const unlike = card.getByRole('button', { name: 'Remove love', exact: true });
  await unlike.focus();
  const removed = page.waitForResponse(response => response.url().endsWith('/love') && response.request().method() === 'DELETE').then(response => response.finished());
  await page.keyboard.press('Space');
  await card.getByRole('status', { name: '1 love', exact: true }).waitFor({ state: 'hidden' });
  await removed;
  assert.equal(state.loveRequests.length, 3);
  assert.deepEqual(errors, []);
});

test('an author push refreshes counts and tapping it can open an archived note', async t => {
  const { page, state, errors } = await setup(t);
  const own = state.posts.find(item => item.author._id === A);
  own.loveCount = 1;
  await page.evaluate(A => window.dispatchEvent(new CustomEvent('taspe7:testimony-push', { detail: { authorId: A, title: 'Youssef loved your note' } })), A);
  await page.getByText('Youssef loved your note', { exact: true }).waitFor();
  assert.equal(await page.getByRole('status', { name: '1 love', exact: true }).count(), 0);
  own.createdAt = new Date(Date.now() - 4 * 86400000).toISOString();
  own.feedExpiresAt = new Date(Date.now() - 3 * 86400000).toISOString();
  await page.goto(`${base}/normal_UserProfile/?note=${own._id}`);
  const dialog = page.getByRole('dialog', { name: 'Testimony', exact: true });
  await dialog.waitFor();
  await dialog.getByRole('status', { name: '1 love', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.evaluate(id => {
    const event = new CustomEvent('taspe7:open-testimony', { detail: { href: `/normal_UserProfile/?note=${id}` }, cancelable: true });
    window.dispatchEvent(event);
  }, own._id);
  await dialog.waitFor();
  assert.deepEqual(errors, []);
});

test('authors see reactor names and photos on their opened profile note, with pagination and profile links', async t => {
  const { page, state, errors } = await setup(t, { mobile: true, friendPhoto: true });
  state.posts.find(item => item.author._id === A).loveCount = 21;
  state.reactorUsers = [{ ...friend, profilePhoto: 'https://avatars.example.test/friend.png' }, ...Array.from({ length: 20 }, (_, i) => ({ _id: (i + 1).toString(16).padStart(24, '0'), Name: `Friend ${i + 1}`, username: `friend${i + 1}`, profilePhoto: null }))];
  await page.goto(`${base}/normal_UserProfile/`);
  await page.getByRole('button', { name: 'Read testimony: A prayer, quietly answered', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Testimony', exact: true });
  const who = reader.getByRole('button', { name: 'See who loved this note', exact: true });
  assert.equal((await who.innerText()).trim(), '21');
  assert.equal(state.reactorReads, 0, 'reactor identities load only on demand');
  await who.click();
  const list = reader.getByRole('region', { name: 'People who loved your note', exact: true });
  await list.getByRole('link', { name: 'Visit Youssef profile', exact: true }).waitFor();
  await list.getByRole('img', { name: 'Youssef', exact: true }).waitFor();
  assert.equal(await list.getByRole('link').count(), 20);
  await list.getByRole('button', { name: 'Show more', exact: true }).click();
  await list.getByRole('link', { name: 'Visit Friend 20 profile', exact: true }).waitFor();
  assert.equal(await list.getByRole('link').count(), 21);
  assert.equal(await list.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: resolve(output, 'note-reactors-mobile.png'), animations: 'disabled' });
  await list.getByRole('button', { name: 'Back to note', exact: true }).click();
  await reader.getByLabel('Testimony text', { exact: true }).waitFor();
  await who.click();
  await list.getByRole('link', { name: 'Visit Youssef profile', exact: true }).click();
  await page.getByRole('heading', { name: 'Youssef', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: 'Testimony', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});

test('reaction list handles empty notes and retry; friends cannot open another author reaction list', async t => {
  const { page, state, errors } = await setup(t);
  await page.goto(`${base}/normal_UserProfile/`);
  await page.getByRole('button', { name: 'Read testimony: A prayer, quietly answered', exact: true }).click();
  const reader = page.getByRole('dialog', { name: 'Testimony', exact: true });
  state.failReactors = true;
  await reader.getByRole('button', { name: 'See who loved this note', exact: true }).click();
  await reader.getByRole('button', { name: 'Retry reactions', exact: true }).waitFor();
  state.failReactors = false;
  await reader.getByRole('button', { name: 'Retry reactions', exact: true }).click();
  await reader.getByText('No loves yet.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const reads = state.reactorReads;
  await page.goto(`${base}/normal_UserProfile/?user=${B}`);
  await page.getByRole('button', { name: 'Read testimony: Peace in the middle of it all', exact: true }).click();
  await reader.getByRole('button', { name: 'Love this note', exact: true }).waitFor();
  assert.equal(await reader.getByRole('button', { name: 'See who loved this note', exact: true }).count(), 0);
  assert.equal(state.reactorReads, reads);
  assert.deepEqual(errors, []);
});

test('love appears immediately while saving is delayed and continues after closing and reopening the note', async t => {
  const { page, state, errors } = await setup(t, { mobile: true });
  let finishSave;
  state.loveGate = new Promise(resolve => { finishSave = resolve; });
  t.after(() => finishSave());
  const note = page.getByRole('button', { name: 'Read testimony: Peace in the middle of it all', exact: true });
  await note.tap();
  const reader = page.getByRole('dialog', { name: 'Testimony', exact: true });
  const saving = page.waitForRequest(request => request.url().endsWith('/love') && request.method() === 'PUT');
  const saved = page.waitForResponse(response => response.url().endsWith('/love') && response.request().method() === 'PUT').then(response => response.finished());
  await reader.getByRole('button', { name: 'Love this note', exact: true }).tap();
  await saving;
  const heart = reader.getByRole('button', { name: 'Remove love', exact: true });
  assert.equal(await heart.isEnabled(), true);
  assert.equal(await heart.getAttribute('aria-pressed'), 'true');
  assert.equal(state.posts[0].loved, false, 'the server has not saved yet');
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/users/testimonies') && response.request().method() === 'GET').then(response => response.finished());
  await page.evaluate(() => window.dispatchEvent(new Event('taspe7:friends-push')));
  await refreshed;
  assert.equal(await heart.getAttribute('aria-pressed'), 'true', 'refreshing must not erase a pending reaction');
  await page.keyboard.press('Escape');
  await note.tap();
  assert.equal(await heart.getAttribute('aria-pressed'), 'true');
  finishSave();
  await saved;
  assert.equal(state.posts[0].loved, true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await note.tap();
  await heart.waitFor();
  assert.equal(await heart.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
});

test('live notes arrive off-page, show a nav dot, and are already loaded when Friends opens', async t => {
  const { page, state, errors } = await setup(t, { empty: true, startPath: '/normal_UserProfile/' });
  const item = { _id: '555555555555555555555555', author: friend, title: 'A new moment of faith', body: 'A note shared while I was on another page.', style: 'olive', loved: false, loveCount: 0,
    createdAt: new Date().toISOString(), feedExpiresAt: new Date(Date.now() + 86400000).toISOString() };
  state.posts.unshift(item);
  const arrived = page.waitForResponse(response => response.url().includes(`/testimonies/note/${item._id}`)).then(response => response.finished());
  state.publishNote({ id: item._id, authorId: B, action: 'created' });
  await arrived;
  await page.getByTestId('friends-notes-badge').waitFor();
  await page.screenshot({ path: resolve(output, 'new-notes-nav-dot.png'), animations: 'disabled' });
  const reads = state.socialReads.filter(path => path.endsWith('/testimonies')).length;
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Friends', exact: true }).click();
  await page.getByRole('button', { name: `Read testimony: ${item.title}`, exact: true }).waitFor();
  assert.equal(state.socialReads.filter(path => path.endsWith('/testimonies')).length, reads, 'opening Friends must reuse the prepared feed');
  await page.getByRole('button', { name: `Read testimony: ${item.title}`, exact: true }).click();
  await page.getByTestId('friends-notes-badge').waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  state.posts = [];
  state.publishNote({ id: item._id, authorId: B, action: 'deleted' });
  await page.getByRole('button', { name: `Read testimony: ${item.title}`, exact: true }).waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
});

test('reconnecting catches missed notes and friendship revocation clears a prepared feed', async t => {
  const { page, state, errors } = await setup(t, { empty: true, startPath: '/normal_UserProfile/' });
  const item = { _id: '666666666666666666666666', author: friend, title: 'Shared while disconnected', body: 'A new reflection that arrived during a lost connection.', style: 'olive', loved: false, loveCount: 0,
    createdAt: new Date().toISOString(), feedExpiresAt: new Date(Date.now() + 86400000).toISOString() };
  const sockets = [...state.sockets];
  await Promise.all(sockets.map(socket => socket.close()));
  state.posts.push(item);
  await page.getByTestId('friends-notes-badge').waitFor();
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Friends', exact: true }).click();
  await page.getByRole('button', { name: `Read testimony: ${item.title}`, exact: true }).waitFor();
  state.relationship = 'none';
  state.publishNote({ action: 'access' });
  await page.getByRole('button', { name: `Read testimony: ${item.title}`, exact: true }).waitFor({ state: 'hidden' });
  await page.getByTestId('friends-notes-badge').waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
});
