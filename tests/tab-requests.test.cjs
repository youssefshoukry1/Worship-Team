const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { cooperativeWork } = require('./helpers/cooperative-work.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function moduleApi(file, names, values = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8').replace(/^import .*;$/gm, '')
    .replaceAll('export async function', 'async function').replaceAll('export function', 'function').replaceAll('export const', 'const');
  const context = { AbortController, setTimeout, clearTimeout, console, ...cooperativeWork(), ...values };
  vm.runInNewContext(source + `;globalThis.api={${names.join(',')}};`, context);
  return context.api;
}
const readsApi = values => moduleApi('utils/tabRequests.js', ['readTabResource', 'readTabJson', 'invalidateTabRead', 'tabReadKey'], values);

test('concurrent views share an in-flight GET and reuse its successful result for 15 seconds', async () => {
  let now = 1, calls = 0; const gate = deferred();
  const api = readsApi({ Date: { now: () => now } });
  const load = async () => { calls++; return gate.promise; };
  const first = api.readTabResource('profile', load);
  assert.equal(api.readTabResource('profile', load), first);
  gate.resolve({ name: 'Alice' }); await first;
  now = 14999; await api.readTabResource('profile', load);
  assert.equal(calls, 1);
  now = 15002; await api.readTabResource('profile', load);
  assert.equal(calls, 2);
});

test('forced reads bypass freshness; failed reads remain retryable', async () => {
  const api = readsApi(); let calls = 0;
  const load = async () => { calls++; if (calls === 2) throw Error('offline'); return calls; };
  assert.equal(await api.readTabResource('friends', load), 1);
  await assert.rejects(api.readTabResource('friends', load, { force: true }), /offline/);
  assert.equal(await api.readTabResource('friends', load, { force: true }), 3);
});

test('push/focus signals during a GET coalesce into a fresh follow-up instead of reusing an older snapshot', async () => {
  const api = readsApi(); const gate = deferred(); let calls = 0;
  const load = async () => { calls++; if (calls === 1) await gate.promise; return calls; };
  const first = api.readTabResource('friends', load);
  const forced = api.readTabResource('friends', load, { force: true });
  assert.equal(api.readTabResource('friends', load, { force: true }), forced);
  gate.resolve(); assert.equal(await first, 1); assert.equal(await forced, 2);
  assert.equal(calls, 2);
});

test('mutation invalidation aborts a read and prevents stale responses from committing', async () => {
  const api = readsApi(); const old = deferred(); let oldSignal, commits = 0;
  const first = api.readTabResource('notes', signal => { oldSignal = signal; return old.promise; }, { onSuccess: () => commits++ });
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await flush(); api.invalidateTabRead('notes');
  assert.equal(oldSignal.aborted, true);
  assert.equal(await api.readTabResource('notes', async () => 'new'), 'new');
  old.resolve('old'); await rejected;
  assert.equal(commits, 0);
  assert.equal(await api.readTabResource('notes', async () => 'wrong'), 'new');
});

test('account/token and API scopes never share GET responses', async () => {
  const api = readsApi(); let calls = 0;
  const load = async () => ++calls;
  assert.equal(await api.readTabResource(api.tabReadKey('/profile', 'token-a'), load), 1);
  assert.equal(await api.readTabResource(api.tabReadKey('/profile', 'token-b'), load), 2);
  assert.equal(await api.readTabResource(api.tabReadKey('/other/profile', 'token-a'), load), 3);
});

test('a hung read is bounded even if its loader ignores abort', async () => {
  let timeout;
  const api = readsApi({ setTimeout(callback, ms) { assert.equal(ms, 20000); timeout = callback; return 1; }, clearTimeout() {} });
  const pending = api.readTabResource('hung', () => new Promise(() => {}));
  timeout(); await assert.rejects(pending, /timed out/);
  assert.equal(await api.readTabResource('hung', async () => 'recovered'), 'recovered');
});

test('session sync jobs survive their original caller and coalesce forced follow-up signals', async () => {
  const { runSessionTask } = moduleApi('utils/sessionTasks.js', ['runSessionTask']);
  const gate = deferred(); const calls = [];
  const first = runSessionTask('inbox', async () => { calls.push('import'); await gate.promise; calls.push('persist and acknowledge'); });
  assert.equal(runSessionTask('inbox', async () => calls.push('duplicate')), first);
  await flush();
  runSessionTask('inbox', async () => calls.push('obsolete force'), { force: true });
  runSessionTask('inbox', async () => calls.push('latest force'), { force: true });
  gate.resolve(); await first;
  assert.deepEqual(calls, ['import', 'persist and acknowledge', 'latest force']);
});

test('a failed session job can retry', async () => {
  const { runSessionTask } = moduleApi('utils/sessionTasks.js', ['runSessionTask']);
  await assert.rejects(runSessionTask('inbox', async () => { throw Error('offline'); }));
  let ran = false; await runSessionTask('inbox', async () => { ran = true; }); assert.equal(ran, true);
});

test('profile refresh shares the response and keeps all offline sections when Prayer and Profile visit', async () => {
  let requests = 0; const disk = new Map();
  const reads = readsApi({ fetch: async () => { requests++; return { ok: true, json: async () => ({ user: { username: 'alice', bibleNotes: [{ note: 'note' }], bibleHighlights: [{ color: 'blue' }], prayTime: [{ words: 'prayer' }] } }) }; } });
  const api = moduleApi('utils/profileCache.js', ['readCachedProfile', 'refreshProfile', 'writeCachedProfile', 'invalidateProfile'], {
    ...reads, fetchTabJson: async (url, token, signal) => {
      const data = await reads.readTabJson(url + '/raw', token, { maxAge: 0 }); return data;
    }, localforage: { getItem: async key => disk.get(key) || null, setItem: async (key, value) => disk.set(key, value) },
  });
  const [profile, prayer] = await Promise.all([api.refreshProfile('/api', 'token', 'alice'), api.refreshProfile('/api', 'token', 'alice')]);
  assert.equal(profile, prayer); assert.equal(requests, 1);
  assert.equal((await api.readCachedProfile('alice')).bibleNotes[0].note, 'note');
  assert.equal(prayer.bibleHighlights[0].color, 'blue');
  await api.refreshProfile('/api', 'token', 'alice'); assert.equal(requests, 1);
});

test('an old profile response cannot overwrite a local edit', async () => {
  const gate = deferred(); const reads = readsApi(); const disk = new Map();
  const api = moduleApi('utils/profileCache.js', ['refreshProfile', 'writeCachedProfile', 'readCachedProfile'], { ...reads,
    fetchTabJson: async () => gate.promise, localforage: { getItem: async () => null, setItem: async (k, v) => disk.set(k, v) } });
  const pending = api.refreshProfile('/api', 'old-token', 'alice');
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush(); await api.writeCachedProfile('alice', { user: { username: 'edited' } });
  gate.resolve({ user: { username: 'old' } }); await rejected;
  assert.equal((await api.readCachedProfile('alice')).user.username, 'edited');
  assert.equal(disk.get('profile_data_alice').user.username, 'edited');
});

test('a profile response from an earlier login cannot replace the current session snapshot', async () => {
  const old = deferred(); const reads = readsApi();
  const api = moduleApi('utils/profileCache.js', ['refreshProfile', 'readCachedProfile'], { ...reads,
    fetchTabJson: async (_, token) => token === 'old-token' ? old.promise : { user: { username: 'current' } },
    localforage: { getItem: async () => null, setItem: async () => {} } });
  const pending = api.refreshProfile('/api', 'old-token', 'alice');
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush(); await api.refreshProfile('/api', 'new-token', 'alice');
  old.resolve({ user: { username: 'old' } }); await rejected;
  assert.equal((await api.readCachedProfile('alice')).user.username, 'current');
});

function hymnsSetup(get, persist = async () => {}) {
  const local = new Map([['taspe7_hymns_sync_version', '1'], ['taspe7_force_sync', 'requested']]);
  const queryClient = { data: [{ _id: 'old', title: 'Old' }],
    async ensureQueryData() { return this.data; }, setQueryData(_, data) { this.data = data; } };
  const { normalizeDownloadedHymns } = moduleApi('utils/hymnsCache.js', ['normalizeDownloadedHymns']);
  const { syncDownloadedHymns } = moduleApi('services/hymnsSync.js', ['syncDownloadedHymns'], {
    storageReady: Promise.resolve(), downloadedHymnsQueryOptions: {}, normalizeDownloadedHymns,
    axios: { get }, localforage: { setItem: persist },
    localStorage: { getItem: k => local.get(k) ?? null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  });
  return { syncDownloadedHymns, queryClient, local };
}

test('overlapping hymn checks share one sync; forced signals queue one fresh version pass', async () => {
  const gate = deferred(); let serverVersion = 2, checks = 0;
  const h = hymnsSetup(async url => {
    if (url.endsWith('/version')) { checks++; const version = serverVersion; if (checks === 1) await gate.promise; return { data: { version } }; }
    return { data: { currentVersion: serverVersion, deleted: ['old'], updated: [{ _id: 'new', title: `Version ${serverVersion}` }] } };
  });
  const first = h.syncDownloadedHymns(h.queryClient);
  assert.equal(h.syncDownloadedHymns(h.queryClient), first);
  await flush(); serverVersion = 3;
  assert.equal(h.syncDownloadedHymns(h.queryClient, { force: true }), first);
  h.syncDownloadedHymns(h.queryClient, { force: true });
  gate.resolve(); await first;
  assert.equal(checks, 2);
  assert.equal(h.local.get('taspe7_hymns_sync_version'), '3');
  assert.equal(h.queryClient.data[0].title, 'Version 3');
  assert.equal(h.local.has('taspe7_force_sync'), false);
});

test('full hymn fallback persists before publishing its version or replacing the live cache', async () => {
  const gate = deferred(); const writing = deferred(); const calls = [];
  const h = hymnsSetup(async url => {
    calls.push(url);
    if (url.endsWith('/version')) return { data: { version: 2 } };
    if (url.includes('/changes')) return { data: { fallback: true } };
    return { data: [{ _id: { $oid: 'full' }, title: 'Full download', lyrics: [] }] };
  }, async () => { writing.resolve(); await gate.promise; });
  const sync = h.syncDownloadedHymns(h.queryClient); await writing.promise;
  assert.equal(h.local.get('taspe7_hymns_sync_version'), '1');
  assert.equal(h.queryClient.data[0]._id, 'old');
  gate.resolve(); await sync;
  assert.equal(h.queryClient.data[0]._id, 'full');
  assert.equal(h.local.get('taspe7_hymns_sync_version'), '2');
  assert.ok(calls.some(url => url.endsWith('?limit=50000')));
});

test('a failed hymn persistence keeps the force flag and current version available for retry', async () => {
  let fail = true;
  const h = hymnsSetup(async url => url.endsWith('/version') ? { data: { version: 2 } } : { data: { deleted: ['old'], updated: [{ _id: 'new' }], currentVersion: 2 } },
    async () => { if (fail) throw Error('storage unavailable'); });
  await h.syncDownloadedHymns(h.queryClient);
  assert.equal(h.local.get('taspe7_hymns_sync_version'), '1');
  assert.equal(h.queryClient.data[0]._id, 'old');
  assert.equal(h.local.has('taspe7_force_sync'), true);
  fail = false; await h.syncDownloadedHymns(h.queryClient);
  assert.equal(h.local.get('taspe7_hymns_sync_version'), '2');
  assert.equal(h.queryClient.data[0]._id, 'new');
});
