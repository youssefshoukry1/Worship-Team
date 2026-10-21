const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cooperativeWork } = require('./helpers/cooperative-work.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/bibleSync.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replaceAll('export async function', 'async function').replaceAll('export function', 'function');
const verse = (text = 'Original verse', translation = 'AVD') => ({ _id: 'v1', bookName: 'Genesis', bookNumber: 1, chapter: 1, verseNumber: 1, text, translation });
const key = translation => `taspe7_bible_db_${translation}`;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function setup({ saved = {}, isApp = true, storageReady = Promise.resolve(), get, fetch, download, work = cooperativeWork() } = {}) {
  const disk = new Map(Object.entries(saved));
  const local = new Map();
  const reads = [], writes = [], fetches = [], downloads = [];
  const context = {
    ...work,
    isApp, storageReady, console: { log() {}, warn() {}, error() {} },
    window: { location: { origin: 'https://example.test' } },
    localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v) },
    localforage: {
      async getItem(k) { reads.push(k); return get ? get(k, disk) : structuredClone(disk.get(k) || null); },
      async setItem(k, v) { writes.push(k); disk.set(k, structuredClone(v)); },
      async removeItem(k) { disk.delete(k); },
      async keys() { return [...disk.keys()]; },
    },
    async fetch(url) { fetches.push(url); return fetch ? fetch(url) : { ok: true, json: async () => [verse()] }; },
    axios: { async get(url) { downloads.push(url); return download ? download(url) : { data: [verse('Downloaded verse')] }; } },
  };
  vm.runInNewContext(source + ';globalThis.api = { initLocalBible, prepareLocalBible, getLocalBibleIndex, searchLocalBible, downloadTranslationToLocal, deleteTranslationFromLocal, isTranslationDownloaded };', context);
  return { api: context.api, disk, reads, writes, fetches, downloads };
}

test('closed-tool preparation checks metadata without reading a downloaded Bible', async () => {
  const h = setup({ saved: { [key('AVD')]: [verse()] } });
  await h.api.prepareLocalBible(); await h.api.prepareLocalBible();
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.fetches, []);
  assert.deepEqual(h.downloads, []);
});

test('initialization, browsing and searching share one read and reuse the same index', async () => {
  const gate = deferred();
  const h = setup({ get: async () => { await gate.promise; return [verse()]; } });
  const init = h.api.initLocalBible();
  const secondInit = h.api.initLocalBible();
  assert.equal(init, secondInit);
  const firstIndex = h.api.getLocalBibleIndex();
  const secondIndex = h.api.getLocalBibleIndex();
  const search = h.api.searchLocalBible('Original');
  await flush(); gate.resolve();
  const [data, index, index2, results] = await Promise.all([init, firstIndex, secondIndex, search]);
  assert.equal(index, index2);
  assert.equal(results[0], data[0]);
  assert.deepEqual(h.reads, [key('AVD')]);
  for (let i = 0; i < 4; i++) {
    assert.equal(await h.api.initLocalBible(), data);
    assert.equal(await h.api.getLocalBibleIndex(), index);
  }
  assert.deepEqual(h.reads, [key('AVD')]);
});

test('first-install preparation still seeds native storage and readers wait for it', async () => {
  const gate = deferred();
  const h = setup({ fetch: async () => { await gate.promise; return { ok: true, json: async () => [{ ...verse(), _id: { $oid: 'seed-id' } }] }; } });
  const init = h.api.initLocalBible();
  const index = h.api.getLocalBibleIndex();
  await flush();
  assert.deepEqual(h.fetches, ['/Taspe7.bibles.json']);
  gate.resolve();
  const [data, loadedIndex] = await Promise.all([init, index]);
  assert.equal(data[0]._id, 'seed-id');
  assert.equal(loadedIndex.versesMap.get('Genesis_1')[0], data[0]);
  assert.deepEqual(h.writes, [key('AVD')]);
});

test('automatic preparation still downloads the default Bible on the web', async () => {
  const h = setup({ isApp: false });
  await h.api.prepareLocalBible();
  assert.equal(h.downloads.length, 1);
  assert.ok(h.downloads[0].endsWith('/api/bible/download?translation=AVD'));
  assert.equal(h.disk.get(key('AVD'))[0].text, 'Downloaded verse');
  await h.api.prepareLocalBible();
  assert.equal(h.downloads.length, 1);
});

test('a failed initialization can retry instead of caching a failure', async () => {
  let fail = true;
  const h = setup({ fetch: async () => {
    if (fail) throw new Error('temporarily unavailable');
    return { ok: true, json: async () => [verse()] };
  } });
  assert.equal((await h.api.initLocalBible()).length, 0);
  fail = false;
  assert.equal((await h.api.initLocalBible()).length, 1);
  assert.equal(h.fetches.length, 2);
});

test('invalid bundled data does not mark an empty Bible as downloaded', async () => {
  const h = setup({ fetch: async () => ({ ok: true, json: async () => [] }) });
  assert.equal((await h.api.initLocalBible()).length, 0);
  assert.equal(await h.api.isTranslationDownloaded('AVD'), false);
});

test('initialization still waits for legacy storage migration before reading or seeding', async () => {
  const migration = deferred();
  const h = setup({ storageReady: migration.promise });
  const init = h.api.initLocalBible();
  await flush();
  assert.deepEqual(h.reads, []); assert.deepEqual(h.fetches, []);
  h.disk.set(key('AVD'), [verse('Migrated verse')]); migration.resolve();
  assert.equal((await init)[0].text, 'Migrated verse');
  assert.deepEqual(h.fetches, []);
});

test('translation downloads replace the memory/index caches and deletion clears them', async () => {
  const h = setup({ saved: { [key('KEH')]: [verse('Old translation', 'KEH')] } });
  const oldIndex = await h.api.getLocalBibleIndex('KEH');
  await h.api.downloadTranslationToLocal('KEH', 'https://example.test/api/bible');
  const newIndex = await h.api.getLocalBibleIndex('KEH');
  assert.notEqual(newIndex, oldIndex);
  assert.equal(newIndex.versesMap.get('Genesis_1')[0].text, 'Downloaded verse');
  assert.equal(await h.api.isTranslationDownloaded('KEH'), true);
  assert.equal(await h.api.deleteTranslationFromLocal('KEH'), true);
  assert.equal(await h.api.isTranslationDownloaded('KEH'), false);
  assert.equal(await h.api.getLocalBibleIndex('KEH'), null);
  assert.equal((await h.api.searchLocalBible('Downloaded', 'KEH')).length, 0);
});

test('a stale disk read cannot overwrite a newer translation download', async () => {
  const read = deferred(); let firstRead = true;
  const h = setup({ saved: { [key('KEH')]: [verse('Old verse', 'KEH')] }, get: async (k, disk) => {
    if (firstRead) { firstRead = false; await read.promise; return [verse('Stale verse', 'KEH')]; }
    return structuredClone(disk.get(k) || null);
  } });
  const pending = h.api.getLocalBibleIndex('KEH'); await flush();
  await h.api.downloadTranslationToLocal('KEH', 'https://example.test/api/bible');
  read.resolve();
  assert.equal((await pending).versesMap.get('Genesis_1')[0].text, 'Downloaded verse');
});

test('a delayed first-install seed cannot restore a Bible deleted in the meantime', async () => {
  const download = deferred();
  const h = setup({ fetch: async () => { await download.promise; return { ok: true, json: async () => [verse()] }; } });
  const init = h.api.initLocalBible(); await flush();
  await h.api.deleteTranslationFromLocal('AVD');
  download.resolve(); await init;
  assert.equal(h.disk.has(key('AVD')), false);
  assert.equal(await h.api.getLocalBibleIndex(), null);
});

test('legacy translation key aliases remain readable without repeated disk loads', async () => {
  const h = setup({ saved: { [key('ERV_AR')]: [verse('Legacy verse', 'ERV-AR')] } });
  const index = await h.api.getLocalBibleIndex('ERV-AR');
  assert.equal(index.versesMap.get('Genesis_1')[0].text, 'Legacy verse');
  await h.api.getLocalBibleIndex('ERV-AR');
  assert.deepEqual(h.reads, [key('ERV-AR'), key('ERV_AR')]);
});

test('a download during a yielded Bible index build cannot publish the previous index', async () => {
  const gate = deferred(), started = deferred();
  let held = false;
  const work = cooperativeWork({ scheduler: { yield: () => {
    if (!held) { held = true; started.resolve(); return gate.promise; }
    return Promise.resolve();
  } } });
  const old = Array.from({ length: 600 }, (_, i) => ({ ...verse('Old'), _id: String(i), verseNumber: i + 1 }));
  const h = setup({ saved: { [key('AVD')]: old }, work });
  const pending = h.api.getLocalBibleIndex();
  await started.promise;
  await h.api.downloadTranslationToLocal('AVD', '/api/bible');
  gate.resolve();
  const index = await pending;
  assert.equal(index.versesMap.get('Genesis_1').length, 1);
  assert.equal(index.versesMap.get('Genesis_1')[0].text, 'Downloaded verse');
  assert.equal(await h.api.getLocalBibleIndex(), index);
});

test('deleting a translation during index preparation leaves no stale index behind', async () => {
  const gate = deferred(), started = deferred();
  const work = cooperativeWork({ scheduler: { yield: () => { started.resolve(); return gate.promise; } } });
  const rows = Array.from({ length: 600 }, (_, i) => ({ ...verse('Old', 'KEH'), _id: String(i) }));
  const h = setup({ saved: { [key('KEH')]: rows }, work });
  const pending = h.api.getLocalBibleIndex('KEH');
  await started.promise; await h.api.deleteTranslationFromLocal('KEH'); gate.resolve();
  assert.equal(await pending, null); assert.equal(await h.api.getLocalBibleIndex('KEH'), null);
});

test('Bible search preserves phrase/AND/OR priorities and the first 50 ties without mutating stored verses', async () => {
  const texts = ['light of life', 'life light', 'other light', 'other', 'light'];
  const rows = texts.map((text, i) => ({ ...verse(text), _id: String(i) }));
  const h = setup({ saved: { [key('AVD')]: rows } });
  const data = await h.api.initLocalBible(); data.forEach(Object.freeze);
  const ids = values => Array.from(values, row => row._id);
  assert.deepEqual(ids(await h.api.searchLocalBible('light of life')), ['0']);
  assert.deepEqual(ids(await h.api.searchLocalBible('light life')), ['0', '1']);
  assert.deepEqual(ids(await h.api.searchLocalBible('light other missing')), ['2', '0', '1', '3', '4']);
  assert.equal(data.some(row => '_searchCache' in row), false);
  const many = setup({ saved: { [key('AVD')]: Array.from({ length: 200 }, (_, i) => ({ ...verse('Matching'), _id: String(i) })) } });
  assert.deepEqual(ids(await many.api.searchLocalBible('Matching')), Array.from({ length: 50 }, (_, i) => String(i)));
});

test('a canceled Bible search exits without disabling subsequent searches', async () => {
  const h = setup({ saved: { [key('AVD')]: [verse('Still searchable')] } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(h.api.searchLocalBible('Still', 'AVD', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal((await h.api.searchLocalBible('Still'))[0].text, 'Still searchable');
});
