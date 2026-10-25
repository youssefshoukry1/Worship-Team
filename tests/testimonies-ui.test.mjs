// Run with the local Next dev server on port 3000: node --test tests/testimonies-ui.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const owner = { _id: A, Name: 'Alice', username: 'alice', profilePhoto: null };
const friend = { _id: B, Name: 'Youssef', username: 'youssef', profilePhoto: null };
const base = process.env.TESTIMONY_TEST_URL || 'http://localhost:3000';
const output = resolve('../work/testimonies');
let desktopBrowser, mobileBrowser;
before(async () => { await mkdir(output, { recursive: true }); desktopBrowser = await chromium.launch({ executablePath: chromium.executablePath() }); mobileBrowser = await webkit.launch(); });
after(async () => { await desktopBrowser?.close(); await mobileBrowser?.close(); });

async function setup(t, { mobile = false, failFirstPublish = false, empty = false, expiresSoon = false } = {}) {
  const context = await (mobile ? mobileBrowser : desktopBrowser).newContext({ ...(mobile ? devices['iPhone 13'] : { viewport: { width: 1440, height: 1100 } }), serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ A }) => {
    localStorage.setItem('wasla_splash_version', '1.0.6');
    localStorage.setItem('user_Taspe7_Token', 'testimony-test-token');
    localStorage.setItem('user_Taspe7_ID', A);
    localStorage.setItem('user_Taspe7_Username', 'alice');
    localStorage.setItem('user_Taspe7_GlobalRole', 'USER');
    localStorage.setItem('app-language', 'en');
    localStorage.setItem('taspe7_theme', 'dark');
    Object.defineProperty(navigator.serviceWorker, 'controller', { value: { scriptURL: '/sw.js?v=navigation-v2' } });
  }, { A });
  const now = Date.now();
  const post = (id, title, body, style, author, age = 10000) => ({ _id: id, title, body, style, author,
    createdAt: new Date(now - age).toISOString(), updatedAt: new Date(now - age).toISOString(), feedExpiresAt: new Date(now - age + 86400000).toISOString() });
  const state = { posts: empty ? [] : [
    post('111111111111111111111111', 'Peace in the middle of it all', 'This week was full of uncertainty. In a quiet moment of prayer, God reminded me that I don’t have to carry tomorrow today. I’m learning to trust Him one small step at a time.', 'olive', friend, expiresSoon ? 86400000 - 20000 : 10000),
    { ...post('222222222222222222222222', 'A prayer, quietly answered', 'An unexpected conversation brought the encouragement I had been praying for. Sometimes grace arrives through the people beside us.', 'dawn', owner), verse: { reference: 'Matthew 6:34', text: 'Therefore do not worry about tomorrow, for tomorrow will worry about itself.' } },
    post('333333333333333333333333', 'Finding stillness again', 'I put my phone away and spent a little time reading. It was a simple reminder that God is near, even when life feels noisy.', 'still', friend),
    post('444444444444444444444444', 'A story from last week', 'An older testimony remains on my profile for friends to read long after its day on the board.', 'olive', friend, 7 * 86400000),
  ], sent: [], publishAttempts: 0, denyProfile: false };
  if (expiresSoon) await page.clock.install({ time: new Date(now) });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
  await page.route('**/version.json?*', route => route.fulfill({ json: { version: '1.0.6' } }));
  await page.route(/\/api\//, async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const reply = (json, status = 200) => route.fulfill({ json, status, headers: cors });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (path.endsWith('/testimonies') && method === 'GET') return reply({ items: state.posts.filter(item => new Date(item.feedExpiresAt).getTime() > Date.now()), nextCursor: null });
    if (path.includes('/testimonies/profile/')) {
      if (state.denyProfile) return reply({ message: 'This profile is available only to current friends.' }, 403);
      const id = path.split('/').pop();
      return reply({ user: id === A ? owner : friend, isOwner: id === A, items: state.posts.filter(item => item.author._id === id), nextCursor: null });
    }
    if (path.endsWith('/testimonies') && method === 'POST') {
      state.publishAttempts++;
      const body = request.postDataJSON(); state.sent.push(body);
      if (failFirstPublish && state.publishAttempts === 1) return reply({ message: 'Could not publish. Your draft is safe; please try again.' }, 500);
      const item = post('555555555555555555555555', body.title, body.body, body.style, owner, 0);
      if (body.verse) item.verse = body.verse;
      state.posts = [item, ...state.posts.filter(old => old._id !== item._id)];
      return reply({ item }, 201);
    }
    if (/\/testimonies\/[a-f\d]{24}$/.test(path)) {
      const id = path.split('/').pop();
      if (method === 'DELETE') { state.posts = state.posts.filter(item => item._id !== id); return reply({ success: true }); }
      if (method === 'PATCH') {
        const body = request.postDataJSON();
        state.posts = state.posts.map(item => item._id === id ? { ...item, ...body, verse: body.verse || undefined } : item);
        return reply({ item: state.posts.find(item => item._id === id) });
      }
    }
    if (path.endsWith('/my-profile')) return reply({ user: { ...owner, bibleNotes: [], prayTime: [], bibleHighlights: [{ _id: 'highlight1', verseId: 'verse1', bookName: 'Matthew', chapter: 6, verseNumber: 34, text: 'Do not worry about tomorrow.', color: '#aacc88' }] } });
    if (path.endsWith('/friends')) return reply({ friends: [friend] });
    if (path.endsWith('/friend-requests')) return reply({ incoming: [], outgoing: [] });
    if (path.endsWith('/my-teams')) return reply({ teams: [] });
    return reply({ friends: [], incoming: [], outgoing: [], users: [], data: [] });
  });
  await page.goto(`${base}/friends/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Share your testimony', exact: true }).waitFor();
  await page.getByRole('status', { name: 'Loading testimonies' }).waitFor({ state: 'hidden' });
  return { page, state, errors };
}

test('compact dark notes, full reader, name navigation, and permanent friend collection', async t => {
  const { page, errors } = await setup(t);
  assert.equal(await page.getByTestId('testimony-cards').getByRole('article').count(), 3);
  assert.ok((await page.getByRole('region', { name: 'Friends testimony highlights' }).boundingBox()).height < 160);
  await page.screenshot({ path: resolve(output, 'friends-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: /^Read testimony:/ }).first().click();
  const reader = page.getByRole('dialog');
  await reader.getByText('I’m learning to trust Him one small step at a time.', { exact: false }).waitFor();
  assert.equal(await reader.getByRole('button', { name: 'Edit testimony' }).count(), 0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'My Friends' }).click();
  await page.getByRole('button', { name: 'Open Youssef profile' }).click();
  await page.getByRole('heading', { name: 'Youssef', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'A story from last week', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'friend-profile-desktop.png'), fullPage: true });
  assert.deepEqual(errors, []);
});

test('writing directly on a dark note restores drafts, attaches a saved verse, retries, edits, and deletes', async t => {
  const { page, state, errors } = await setup(t, { failFirstPublish: true });
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
  await dialog.getByRole('button', { name: 'Add verse', exact: true }).click();
  await dialog.getByRole('button', { name: /^Matthew 6:34/ }).click();
  await dialog.getByText('Matthew 6:34', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'composer-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.match(await dialog.getByRole('alert').innerText(), /Your draft is safe/);
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(state.publishAttempts, 2);
  assert.equal(state.sent[0].clientId, state.sent[1].clientId);
  assert.deepEqual(state.sent[1].verse, { reference: 'Matthew 6:34', text: 'Do not worry about tomorrow.' });
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
  const { page, errors } = await setup(t, { mobile: true });
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
  assert.deepEqual(errors, []);
});

test('client expiry removes a card while profile retains it; denied access clears shared content', async t => {
  const { page, state, errors } = await setup(t, { expiresSoon: true });
  await page.clock.fastForward(31000);
  await page.getByRole('heading', { name: 'Peace in the middle of it all', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('heading', { name: 'Peace in the middle of it all', exact: true }).count(), 0);
  await page.goto(`${base}/friend-profile/?user=${B}`);
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
  const profileTile = await page.getByRole('button', { name: 'Share your testimony', exact: true }).boundingBox();
  const settings = await page.getByRole('button', { name: /Bible Highlights/ }).boundingBox();
  assert.ok(settings.y > profileTile.y && settings.y - profileTile.y < 230);
  await page.screenshot({ path: resolve(output, 'profile-compact-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
});
