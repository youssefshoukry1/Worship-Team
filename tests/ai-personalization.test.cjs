const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DAY = 24 * 60 * 60 * 1000;
const baseTime = Date.UTC(2026, 9, 23, 12);
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/aiPersonalization.js'), 'utf8').replaceAll('export function', 'function');
const key = id => `wasla_ai_activity_v1:${id}`;
const request = { userId: 'account-1', realName: 'يوسف شكري', bookName: 'تكوين', chapter: 1 };

function setup({ disk = new Map(), blocked = false, locks = false } = {}) {
  let time = baseTime;
  const lockCalls = [];
  const context = {
    Date: class extends Date { static now() { return time; } },
    window: {
      localStorage: {
        getItem: key => disk.get(key) || null,
        setItem: (key, value) => { if (blocked) throw new Error('Storage blocked'); disk.set(key, value); }
      },
      navigator: locks ? { locks: { request: async (key, task) => { lockCalls.push(key); return task(); } } } : {}
    },
    fetch() { throw new Error('Local personalization must never use the network'); }
  };
  vm.runInNewContext(source + ';globalThis.api = { firstRealName, getChapterKey, planActivity, recordLocalAppActivity, prepareLocalAiOpening, completeLocalAiRequest, cancelLocalAiOpening };', context);
  return { api: context.api, disk, lockCalls, setTime: value => { time = value; } };
}

async function answer(fixture, input = request, text = 'رجعت ونورت يا يوسف 🤍') {
  const reservation = await fixture.api.prepareLocalAiOpening(input);
  const opening = await fixture.api.completeLocalAiRequest({ ...input, reservationId: reservation?.id, generatedOpening: text });
  return { reservation, opening };
}

const { api } = setup();

test('only real profile names are used, preserving Arabic compound first names', () => {
  assert.equal(api.firstRealName(' يوسف  شكري '), 'يوسف');
  assert.equal(api.firstRealName('عبد الرحمن محمد'), 'عبد الرحمن');
  assert.equal(api.firstRealName('Youssef Shoukry'), 'Youssef');
  for (const value of [null, '', 'user@example.com', '@youssef', 'youssef_123', 'guest']) assert.equal(api.firstRealName(value), '');
  assert.equal(api.planActivity({ lastActiveAt: baseTime - 8 * DAY }, { username: 'youssef', allowOpening: true }, baseTime).openingContext, null);
});

test('first visits and normal use do not invent an absence', () => {
  assert.equal(api.planActivity({}, { realName: 'يوسف', allowOpening: true }, baseTime).openingContext, null);
  assert.equal(api.planActivity({ lastActiveAt: baseTime - DAY }, { realName: 'يوسف', allowOpening: true }, baseTime).openingContext, null);
});

test('a seven-day return supplies context while the actual wording comes from the AI result', async () => {
  const fixture = setup();
  fixture.disk.set(key(request.userId), JSON.stringify({ lastActiveAt: baseTime - 8 * DAY }));
  await fixture.api.recordLocalAppActivity(request.userId);
  const { reservation, opening } = await answer(fixture, request, 'وحشتنا يا يوسف، نورت 🤍');
  assert.equal(reservation.context.kind, 'return');
  assert.equal(reservation.context.firstName, 'يوسف');
  assert.equal(opening, 'وحشتنا يا يوسف، نورت 🤍');
  assert.equal((await answer(fixture)).reservation, null);
  const stored = JSON.parse(fixture.disk.get(key(request.userId)));
  assert.equal(stored.returnDetectedAt, null);
  assert.deepEqual(stored.recentOpenings, ['وحشتنا يا يوسف، نورت 🤍']);
  assert.equal(Object.hasOwn(stored, 'explanation'), false);
});

test('failed requests release their reservation without consuming a greeting or chapter count', async () => {
  const fixture = setup();
  fixture.disk.set(key(request.userId), JSON.stringify({ lastActiveAt: baseTime - 8 * DAY }));
  const reservation = await fixture.api.prepareLocalAiOpening(request);
  let stored = JSON.parse(fixture.disk.get(key(request.userId)));
  assert.equal(stored.lastOpeningAt, undefined);
  assert.equal(stored.chapterCount, undefined);
  await fixture.api.cancelLocalAiOpening(request.userId, reservation.id);
  stored = JSON.parse(fixture.disk.get(key(request.userId)));
  assert.equal(stored.pendingOpening, undefined);
  assert.equal((await fixture.api.prepareLocalAiOpening(request)).context.kind, 'return');
});

test('the fourth successful chapter response permits an opening followed by a twelve-hour cooldown', async () => {
  const fixture = setup();
  for (let i = 1; i <= 5; i++) {
    fixture.setTime(baseTime + i * 1000);
    const result = await answer(fixture);
    assert.equal(Boolean(result.reservation), i === 4);
    assert.equal(Boolean(result.opening), i === 4);
    if (result.reservation) assert.equal(result.reservation.context.kind, 'chapter');
  }
  fixture.setTime(baseTime + 13 * 60 * 60 * 1000);
  for (let i = 1; i <= 4; i++) assert.equal(Boolean((await answer(fixture)).reservation), i === 4);
});

test('chapter changes, expired chapter windows and stale return welcomes reset eligibility', () => {
  const previous = { chapterKey: 'تكوين:1', chapterWindowAt: baseTime, chapterCount: 3 };
  for (const [chapterKey, time] of [['تكوين:2', baseTime + 1000], ['تكوين:1', baseTime + 31 * 60 * 1000]]) {
    const result = api.planActivity(previous, { realName: 'يوسف', chapterKey, allowOpening: true }, time);
    assert.equal(result.openingContext, null);
    assert.equal(result.next.chapterCount, 1);
  }
  assert.equal(api.planActivity({ lastActiveAt: baseTime, returnDetectedAt: baseTime - 2 * DAY }, { realName: 'يوسف', allowOpening: true }, baseTime).openingContext, null);
  assert.equal(api.getChapterKey(' تكوين ', 1), 'تكوين:1');
  for (const chapter of [null, 0, -1, 1.5, '1', 201]) assert.equal(api.getChapterKey('تكوين', chapter), null);
});

test('only the last three openings are supplied as context to avoid repeated wording', async () => {
  const fixture = setup();
  fixture.disk.set(key(request.userId), JSON.stringify({ lastActiveAt: baseTime - 8 * DAY }));
  for (let i = 0; i < 5; i++) {
    fixture.setTime(baseTime + i * 8 * DAY);
    const result = await answer(fixture, request, `افتتاحية مختلفة يا يوسف ${i}`);
    assert.equal(result.reservation.context.recentOpenings.length, Math.min(i, 3));
    if (i) assert.equal(result.reservation.context.recentOpenings.at(-1), `افتتاحية مختلفة يا يوسف ${i - 1}`);
  }
  assert.equal(JSON.parse(fixture.disk.get(key(request.userId))).recentOpenings.length, 3);
});

test('accounts stay separate and guests do not create records', async () => {
  const fixture = setup();
  fixture.disk.set(key('account-1'), JSON.stringify({ lastActiveAt: baseTime - 8 * DAY }));
  assert.equal((await answer(fixture, { ...request, userId: 'account-2', realName: 'مريم' })).reservation, null);
  assert.equal(Boolean((await answer(fixture)).opening), true);
  const size = fixture.disk.size;
  assert.equal((await answer(fixture, { ...request, userId: null })).reservation, null);
  assert.equal(fixture.disk.size, size);
});

test('overlapping tabs reserve only one greeting using device locks where available', async () => {
  const disk = new Map([[key('account-1'), JSON.stringify({ lastActiveAt: baseTime - 8 * DAY })]]);
  const firstTab = setup({ disk, locks: true });
  const secondTab = setup({ disk, locks: true });
  const results = await Promise.all([firstTab.api.prepareLocalAiOpening(request), secondTab.api.prepareLocalAiOpening(request)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(firstTab.lockCalls.length + secondTab.lockCalls.length, 2);
});

test('blocked or corrupt storage and empty generated openings skip personalization gracefully', async () => {
  const blocked = setup({ blocked: true });
  blocked.disk.set(key('account-1'), JSON.stringify({ lastActiveAt: baseTime - 8 * DAY }));
  assert.equal(await blocked.api.prepareLocalAiOpening(request), null);
  const corrupt = setup();
  corrupt.disk.set(key('account-1'), '{broken');
  assert.equal(await corrupt.api.prepareLocalAiOpening(request), null);
  const empty = setup();
  empty.disk.set(key('account-1'), JSON.stringify({ lastActiveAt: baseTime - 8 * DAY }));
  assert.equal((await answer(empty, request, '')).opening, '');
  assert.equal(JSON.parse(empty.disk.get(key('account-1'))).lastOpeningAt, undefined);
});
