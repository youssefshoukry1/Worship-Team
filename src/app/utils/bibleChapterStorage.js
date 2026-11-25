import localforage from 'localforage';
import { storageReady, isRetiredTranslation, removeLegacyStorageKeys } from './platform';
import { forEachChunked, yieldToMain, checkCancelled } from './cooperativeWork';
import { waitForNavigationIdle } from './navigationWork';
import { buildBibleSearchIndex, findBibleSearchHits, validBibleSearchIndex } from './bibleSearchIndex';

const prefix = 'wasla_bible_v1/';
const codeOf = code => String(code).toUpperCase();
const base = code => prefix + encodeURIComponent(codeOf(code)) + '/';
const manifestKey = code => base(code) + 'manifest';
const intentKey = code => base(code.replace(/_/g, '-')) + 'intent';
const migrationKey = code => base(code) + 'migration';
const chapterPrefix = (code, version) => base(code) + 'data/' + version + '/';
const legacyPrefix = 'taspe7_bible_db_';
const legacyKey = code => legacyPrefix + codeOf(code);
const aliasOf = code => code.includes('-') ? code.replace(/-/g, '_') : code.replace(/_/g, '-');
const createVersion = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
const keysIn = prefix => IDBKeyRange.bound(prefix, prefix + '\uffff');

// localForage exposes single-key writes. Open its configured database for the
// one transaction that must publish the chapters and rollback copy together.
async function transaction(mode, work) {
  await storageReady;
  await localforage.ready();
  const config = localforage.config();
  const db = await result(indexedDB.open(config.name));
  try {
    const tx = db.transaction(config.storeName, mode);
    const finished = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('Bible storage transaction aborted'));
    });
    // Observe an abort even if a request rejects before work returns.
    finished.catch(() => {});
    try {
      const value = await work(tx.objectStore(config.storeName));
      await finished;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted. */ }
      throw error;
    }
  } finally {
    db.close();
  }
}

function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function installedBibleKeys() {
  await storageReady;
  await localforage.ready();
  if (localforage.driver() !== localforage.INDEXEDDB) return localforage.keys();
  // Every installation still has its rollback array. Limit enumeration to
  // those keys so the download picker never scans individual chapter keys.
  return transaction('readonly', store => result(store.getAllKeys(keysIn(legacyPrefix))));
}

export async function beginBibleInstall(code, seedOnly = false) {
  await storageReady;
  await localforage.ready();
  // Preserve the existing whole-array path on localForage fallback drivers.
  if (localforage.driver() !== localforage.INDEXEDDB) return { legacy: true };
  const version = createVersion();
  return transaction('readwrite', async store => {
    if (seedOnly) {
      if (await result(store.count(legacyKey(code)))) return null;
      // Parallel first opens may share a reservation. A background seed must
      // never take ownership away from an explicit download.
      const pending = await result(store.get(intentKey(code)));
      if (pending) return { version, intent: pending, seedOnly };
    }
    await result(store.put(version, intentKey(code)));
    return { version, intent: version, seedOnly };
  });
}

async function groupChapters(code, version, rows) {
  const books = new Map();
  const chapters = new Map();
  await forEachChunked(rows, verse => {
    const { bookName, bookNumber, chapter, verseNumber } = verse;
    if (!bookName || !Number.isInteger(chapter) || !Number.isInteger(verseNumber) || verse._id == null || typeof verse.text !== 'string') {
      throw new Error('Invalid Bible verse in ' + code);
    }
    if (!books.has(bookName)) books.set(bookName, { bookName, bookNumber, testament: verse.testament, chapters: [] });
    const key = encodeURIComponent(bookName) + '/' + chapter;
    if (!chapters.has(key)) {
      chapters.set(key, []);
      books.get(bookName).chapters.push({ chapter, key, verseCount: 0 });
    }
    chapters.get(key).push(verse);
  });
  if (!chapters.size) throw new Error('Empty Bible translation');
  const sortedBooks = [...books.values()].sort((a, b) => a.bookNumber - b.bookNumber);
  for (const book of sortedBooks) {
    book.chapters.sort((a, b) => a.chapter - b.chapter);
    for (const entry of book.chapters) {
      const verses = chapters.get(entry.key);
      verses.sort((a, b) => a.verseNumber - b.verseNumber);
      entry.verseCount = verses.length;
    }
  }
  return { chapters, manifest: { schema: 1, translation: codeOf(code), version, verseCount: rows.length, books: sortedBooks } };
}

export async function commitBibleInstall(code, ticket, rows) {
  if (!ticket) return false;
  if (ticket.legacy) {
    await localforage.setItem(legacyKey(code), rows);
    return true;
  }
  const { chapters, manifest } = await groupChapters(code, ticket.version, rows);
  const staged = chapterPrefix(code, ticket.version);
  const published = await transaction('readwrite', async store => {
    if (await result(store.get(intentKey(code))) !== ticket.intent) return false;
    if (ticket.seedOnly && await result(store.count(legacyKey(code)))) return false;
    // All deletes and puts roll back together on quota failure or process death.
    store.delete(keysIn(base(code) + 'data/'));
    store.delete(keysIn(base(code) + 'search/'));
    let written = 0;
    for (const [key, verses] of chapters) {
      const write = store.put(verses, staged + key);
      // Let the browser process bounded batches of structured clones.
      if (++written % 32 === 0) await result(write);
    }
    if (await result(store.count(keysIn(staged))) !== chapters.size) throw new Error('Incomplete Bible chapter set');
    store.put(rows, legacyKey(code));
    store.delete(migrationKey(code));
    const alias = aliasOf(code);
    if (alias !== code) {
      store.delete(legacyKey(alias));
      store.delete(manifestKey(alias));
      store.delete(migrationKey(alias));
      store.delete(keysIn(base(alias) + 'data/'));
      store.delete(keysIn(base(alias) + 'search/'));
    }
    if (ticket.version === ticket.intent) store.delete(intentKey(code));
    await result(store.put(manifest, manifestKey(code)));
    return true;
  });
  if (published) invalidateSearchCache(code);
  return published;
}

export async function readBibleContents(code) {
  await storageReady;
  const manifest = await localforage.getItem(manifestKey(code));
  const alias = aliasOf(code);
  if (manifest || alias === code) return manifest;
  return localforage.getItem(manifestKey(alias));
}

// A single cache shared by the reader, Compare and the chat picker. Recheck
// the active manifest before a hit so another tab can replace/delete a Bible.
const recentChapters = new Map();
const chapterCacheLimit = 4;

export async function readBibleChapter(code, bookName, chapter) {
  await storageReady;
  await localforage.ready();
  if (localforage.driver() !== localforage.INDEXEDDB) return null;
  return transaction('readonly', async store => {
    let manifest = await result(store.get(manifestKey(code)));
    const alias = aliasOf(code);
    if (!manifest && alias !== code) manifest = await result(store.get(manifestKey(alias)));
    if (!manifest) return null;
    const key = encodeURIComponent(bookName) + '/' + Number(chapter);
    const recordKey = chapterPrefix(manifest.translation, manifest.version) + key;
    let verses = recentChapters.get(recordKey);
    if (verses) recentChapters.delete(recordKey);
    else verses = await result(store.get(recordKey));
    if (!verses) return null;
    recentChapters.set(recordKey, verses);
    if (recentChapters.size > chapterCacheLimit) recentChapters.delete(recentChapters.keys().next().value);
    return verses;
  });
}

// Only the most recently used search index stays resident. Downloads keep
// their ordinary layout until somebody actually needs offline search.
let lastSearchIndex = null;
const searchBuilds = new Map();

function invalidateSearchCache(code) {
  for (const name of new Set([code, aliasOf(code)])) {
    const namespace = base(name) + 'search/';
    if (lastSearchIndex?.key.startsWith(namespace)) lastSearchIndex = null;
    for (const key of searchBuilds.keys()) {
      if (key.startsWith(namespace)) searchBuilds.delete(key);
    }
  }
}

async function loadSearchIndex(manifest, key) {
  const code = manifest.translation;
  const stored = await localforage.getItem(key);
  if (validBibleSearchIndex(stored, manifest.verseCount)) return stored;
  await waitForNavigationIdle();
  const rows = await transaction('readonly', async store => {
    if ((await result(store.get(manifestKey(code))))?.version !== manifest.version) return null;
    return result(store.get(legacyKey(code)));
  });
  if (!rows?.length) return null;
  const index = await buildBibleSearchIndex(rows);
  try {
    await transaction('readwrite', async store => {
      if ((await result(store.get(manifestKey(code))))?.version === manifest.version) {
        await result(store.put(index, key));
      }
    });
  } catch (error) {
    // Low free space still permits an in-memory index for this session.
    if (error.name !== 'QuotaExceededError') throw error;
  }
  return index;
}

function searchIndexFor(manifest) {
  const key = base(manifest.translation) + 'search/1/' + manifest.version;
  if (lastSearchIndex?.key === key) return Promise.resolve(lastSearchIndex.index);
  if (searchBuilds.has(key)) return searchBuilds.get(key);
  const pending = loadSearchIndex(manifest, key).then(index => {
    if (index && searchBuilds.get(key) === pending) lastSearchIndex = {key, index};
    return index;
  }).finally(() => searchBuilds.delete(key));
  searchBuilds.set(key, pending);
  return pending;
}

// A superseded query stops waiting immediately. Other queries can keep using
// the same build, which is independent of any one input's lifetime.
async function waitForSearchIndex(pending, signal) {
  if (!signal) return pending;
  checkCancelled(signal);
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new DOMException('Search cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, {once:true});
  });
  try { return await Promise.race([pending, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

export async function prepareOfflineSearch(code) {
  const manifest = await readBibleContents(code);
  if (manifest) await searchIndexFor(manifest);
}

export async function searchChapterDataset(translation, phrase, words, signal) {
  await storageReady;
  await localforage.ready();
  if (localforage.driver() !== localforage.INDEXEDDB) return null;
  for (;;) {
    checkCancelled(signal);
    const manifest = await readBibleContents(translation);
    checkCancelled(signal);
    if (!manifest) {
      const keys = await installedBibleKeys();
      // A deletion in another tab can leave an old array in this tab's memory.
      return keys.includes(legacyKey(translation)) || keys.includes(legacyKey(aliasOf(translation))) ? null : [];
    }
    const index = await waitForSearchIndex(searchIndexFor(manifest), signal);
    if (!index) {
      if ((await readBibleContents(translation))?.version === manifest.version) return null;
      continue;
    }
    const hits = await findBibleSearchHits(index, phrase, words, signal);
    const records = await transaction('readonly', async store => {
      const code = manifest.translation;
      if ((await result(store.get(manifestKey(code))))?.version !== manifest.version) return null;
      checkCancelled(signal);
      const chapters = new Map();
      for (const doc of hits) {
        const chapter = index.chapterIds[doc];
        if (!chapters.has(chapter)) {
          const key = chapterPrefix(code, manifest.version) + index.chapterKeys[chapter];
          chapters.set(chapter, result(store.get(key)));
        }
      }
      return Promise.all(hits.map(async doc => (await chapters.get(index.chapterIds[doc]))[index.offsets[doc]]));
    });
    checkCancelled(signal);
    if (records) return records;
  }
}

// Migrate by restarting incomplete work. Only the final manifest makes a
// generation readable. The original array stays available throughout.
async function migrateLegacyDataset(code) {
  const version = createVersion();
  const marker = migrationKey(code);
  const staged = chapterPrefix(code, version);
  const rows = await transaction('readwrite', async store => {
    if (await result(store.count(manifestKey(code)))) return null;
    if (!await result(store.count(legacyKey(code)))) return null;
    const abandoned = await result(store.get(marker));
    if (abandoned) store.delete(keysIn(chapterPrefix(code, abandoned)));
    store.put(version, marker);
    return result(store.get(legacyKey(code)));
  });
  if (!rows) return;
  try {
    const { chapters, manifest } = await groupChapters(code, version, rows);
    const entries = [...chapters];
    let verifiedVerses = 0;
    for (let offset = 0; offset < entries.length; offset += 16) {
      await yieldToMain();
      await waitForNavigationIdle();
      const batch = entries.slice(offset, offset + 16);
      const current = await transaction('readwrite', async store => {
        if (await result(store.get(marker)) !== version) return false;
        for (const [key, verses] of batch) store.put(verses, staged + key);
        const saved = await Promise.all(batch.map(([key]) => result(store.get(staged + key))));
        for (let i = 0; i < batch.length; i++) {
          const expected = batch[i][1];
          const actual = saved[i];
          if (actual?.length !== expected.length || expected.some((v, j) =>
            String(actual[j]._id?.$oid ?? actual[j]._id) !== String(v._id?.$oid ?? v._id) ||
            actual[j].verseNumber !== v.verseNumber || actual[j].text !== v.text)) {
            throw new Error('Bible chapter migration verification failed');
          }
          verifiedVerses += actual.length;
        }
        return true;
      });
      if (!current) return; // Deleted, replaced or taken over by a newer pass.
    }
    await waitForNavigationIdle();
    await transaction('readwrite', async store => {
      if (await result(store.get(marker)) !== version) return;
      if (!await result(store.count(legacyKey(code)))) {
        store.delete(keysIn(staged));
        store.delete(marker);
        return;
      }
      if (verifiedVerses !== rows.length || await result(store.count(keysIn(staged))) !== chapters.size) {
        throw new Error('Incomplete Bible migration');
      }
      store.delete(marker);
      store.put(manifest, manifestKey(code));
    });
  } catch (error) {
    await transaction('readwrite', async store => {
      if (await result(store.get(marker)) !== version) return;
      store.delete(keysIn(staged));
      store.delete(marker);
    });
    throw error;
  }
}

export async function migrateLegacyBibles() {
  await storageReady;
  await localforage.ready();
  if (localforage.driver() !== localforage.INDEXEDDB) return;
  const convert = async () => {
    const keys = await installedBibleKeys();
    for (const key of keys) {
      const code = key.slice(legacyPrefix.length);
      if (isRetiredTranslation(code)) continue;
      await waitForNavigationIdle();
      try {
        await migrateLegacyDataset(code);
      } catch (error) {
        if (error.name === 'QuotaExceededError') throw error;
        console.warn('[Bible] Skipped offline conversion for ' + code, error);
      }
    }
  };
  // Serialize whole-array reads across tabs where Web Locks is available.
  // The persisted generation check also protects browsers without Web Locks.
  if (globalThis.navigator?.locks) {
    await navigator.locks.request('wasla-bible-chapter-migration', { ifAvailable: true }, lock => lock && convert());
  } else {
    await convert();
  }
}

let migrationScheduled = false;
export function scheduleBibleMigration() {
  if (migrationScheduled) return;
  migrationScheduled = true;
  // Schedule only after the user has opened a reader and its index is ready.
  // An interrupted or failed pass retries on the next app session.
  window.setTimeout(() => {
    const run = () => migrateLegacyBibles().catch(error => console.warn('[Bible] Offline chapter conversion deferred', error));
    if (window.requestIdleCallback) window.requestIdleCallback(run);
    else void run();
  }, 5000);
}

export async function removeBibleDataset(code) {
  await storageReady;
  await localforage.ready();
  const alt = aliasOf(code);
  await removeLegacyStorageKeys(new Set([legacyKey(code), legacyKey(alt)]));
  if (localforage.driver() !== localforage.INDEXEDDB) {
    await localforage.removeItem(legacyKey(code));
    if (alt !== code) await localforage.removeItem(legacyKey(alt));
    return;
  }
  await transaction('readwrite', store => {
    for (const name of new Set([code, alt])) {
      store.delete(keysIn(base(name)));
      store.delete(legacyKey(name));
    }
  });
  invalidateSearchCache(code);
}
