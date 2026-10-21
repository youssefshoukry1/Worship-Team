const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cooperativeWork } = require('./helpers/cooperative-work.cjs');

function searchApi(work = cooperativeWork()) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/hymnSearch.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const context = { ...work };
  vm.runInNewContext(source + ';globalThis.api={ selectLocalHymns, readLocalHymnsResult };', context);
  return context.api;
}
const ids = results => Array.from(results, item => item._id);

test('local hymn ranking keeps Arabic matching, title priority, popularity, category aliases and stable ties', async () => {
  const api = searchApi();
  const hymns = [
    { _id: 'lyric', title: 'Another', lyrics: [{ text: 'أنتَ نور' }], party: ['christmass'], usageCount: 0 },
    { _id: 'contains', title: 'يا أنت نور', lyrics: [], party: 'christmas', usageCount: 0 },
    { _id: 'prefix', title: 'انت نور حياتي', lyrics: [], party: ['christmas'], usageCount: 0 },
    { _id: 'exact', title: 'أَنْتَ نُور', lyrics: [], party: ['christmas'], usageCount: 0 },
    { _id: 'popular', title: 'Other', lyrics: [], party: ['praise'], usageCount: 999 },
    { _id: 'tie', title: 'انت نور حياتنا', lyrics: [], party: ['christmas'], usageCount: 0 },
  ];
  assert.deepEqual(ids(await api.selectLocalHymns(hymns, { query: 'انت نور', category: 'christmass' })), ['exact', 'prefix', 'tie', 'contains', 'lyric']);
  assert.deepEqual(ids(await api.selectLocalHymns(hymns)), ['popular', 'lyric', 'contains', 'prefix', 'exact', 'tie']);
  assert.deepEqual(ids(await api.selectLocalHymns(hymns, { query: '!!!' })), []);
  assert.deepEqual(ids(await api.selectLocalHymns(hymns, { query: '   ' })), ['popular', 'lyric', 'contains', 'prefix', 'exact', 'tie']);
});

test('search preparation is reused without reading lyrics during ordinary browsing; edits and deletions invalidate it', async () => {
  const api = searchApi(); let reads = 0;
  const row = { _id: 'one', title: 'Title', usageCount: 1, get lyrics() { reads++; return [{ text: 'Original words' }]; } };
  const rows = [row];
  await api.selectLocalHymns(rows); assert.equal(reads, 0);
  const result = await api.selectLocalHymns(rows, { query: 'original' });
  const firstReads = reads;
  assert.equal(await api.selectLocalHymns(rows, { query: 'original' }), result);
  await api.selectLocalHymns(rows, { query: 'words' }); assert.equal(reads, firstReads);
  const changed = [{ _id: 'one', title: 'Title', lyrics: [{ text: 'Updated words' }], party: ['kids'] }];
  assert.deepEqual(ids(await api.selectLocalHymns(changed, { query: 'original' })), []);
  assert.deepEqual(ids(await api.selectLocalHymns(changed, { category: 'kids', query: 'updated' })), ['one']);
  assert.deepEqual(ids(await api.selectLocalHymns([], { query: 'updated' })), []);
  assert.equal(await api.selectLocalHymns(rows, { query: 'original' }), result, 'An older snapshot retains only its own immutable results');
});

test('presentation fallback preserves source order and stops at 15; regular lists deduplicate IDs', async () => {
  const api = searchApi();
  const rows = Array.from({ length: 30 }, (_, i) => ({ _id: String(i), title: 'Matching hymn', usageCount: 30 - i }));
  assert.deepEqual(ids(await api.selectLocalHymns(rows, { query: 'matching', presentation: true })), rows.slice(0, 15).map(row => row._id));
  const later = { ...rows[0], title: 'Latest duplicate', usageCount: -1 };
  const result = await api.selectLocalHymns([rows[0], rows[1], later]);
  assert.deepEqual(ids(result), ['0', '1']); assert.equal(result[0], later);
});

test('large preparation yields to input tasks and canceled searches never publish partial results', async () => {
  let now = 0, yields = 0, inputRan = false;
  const work = cooperativeWork({ performance: { now: () => now += 6 }, scheduler: { yield: () => new Promise(resolve => setTimeout(() => { yields++; inputRan = true; resolve(); }, 0)) } });
  const api = searchApi(work);
  const rows = Array.from({ length: 2000 }, (_, i) => ({ _id: String(i), title: 'Song ' + i, lyrics: [] }));
  const controller = new AbortController();
  const search = api.selectLocalHymns(rows, { query: 'song', signal: controller.signal });
  assert.equal(inputRan, false);
  controller.abort();
  await assert.rejects(search, { name: 'AbortError' });
  assert.ok(yields > 0); assert.equal(inputRan, true);
  assert.equal(api.readLocalHymnsResult(rows, { query: 'song' }), undefined);
  assert.equal((await api.selectLocalHymns(rows, { query: '1999' }))[0], rows[1999]);
});

test('batched sort remains stable across merge boundaries, leaves the input unchanged and honors cancellation', async () => {
  const work = cooperativeWork();
  const rows = Array.from({ length: 3000 }, (_, index) => ({ index, score: index % 7 }));
  const expected = rows.slice().sort((a, b) => b.score - a.score);
  assert.deepEqual(Array.from(await work.sortChunked(rows, (a, b) => b.score - a.score)), expected);
  assert.equal(rows[0].index, 0); assert.equal(rows[2999].index, 2999);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(work.sortChunked(rows, () => 0, { signal: controller.signal }), { name: 'AbortError' });
});

test('background snapshots keep mounted rows, and late or unmounted searches cannot replace newer results', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/hooks/useLocalHymns.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  let state = null, dependencies, nextEffect, cleanup;
  const requests = [];
  const context = {
    AbortController, console,
    useState: () => [state, value => { state = value; }],
    useEffect(fn, next) {
      if (!dependencies || next.some((value, i) => value !== dependencies[i])) { dependencies = next; nextEffect = fn; }
    },
    readLocalHymnsResult: () => undefined,
    selectLocalHymns: (rows, { signal }) => new Promise(resolve => { requests.push({ rows, signal, resolve }); }),
  };
  vm.runInNewContext(source + ';globalThis.hook=useLocalHymns;', context);
  const render = (rows, query = '') => {
    nextEffect = null;
    const value = context.hook(rows, 'all', query, true);
    if (nextEffect) { cleanup?.(); cleanup = nextEffect(); }
    return value;
  };
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const original = [{ _id: 'one', title: 'Original' }], older = [{ _id: 'one', title: 'Older update' }], latest = [{ _id: 'one', title: 'Latest update' }];
  assert.equal(render(original).pending, true);
  requests[0].resolve(original); await flush();
  assert.equal(render(original).items, original);
  const refreshing = render(older);
  assert.equal(refreshing.items, original); assert.equal(refreshing.hasData, true); assert.equal(refreshing.pending, true);
  render(latest);
  assert.equal(requests[1].signal.aborted, true);
  requests[2].resolve(latest); await flush(); requests[1].resolve(older); await flush();
  assert.equal(render(latest).items, latest);
  const changingQuery = render(latest, 'different');
  assert.equal(changingQuery.items.length, 0); assert.equal(changingQuery.hasData, false);
  const previousState = state;
  cleanup(); requests[3].resolve([{ _id: 'late' }]); await flush();
  assert.equal(state, previousState);
});
