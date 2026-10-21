import localforage from 'localforage';
import axios from 'axios';
import { isApp, storageReady } from './platform';
import { checkCancelled, forEachChunked } from './cooperativeWork';

// Map translation key helper
const getCacheKey = (translation) => `taspe7_bible_db_${String(translation || 'AVD').toUpperCase()}`;
const DOWNLOADED_TRANSLATIONS_KEY = 'taspe7_bible_downloaded_translations';

// In-memory caches for all downloaded translations
const memoryBiblesCaches = {}; // { AVD: [...], KEH: [...] }
const memoryIndexCaches = {};  // { AVD: index, KEH: index }
const bibleIndexPromises = new Map();
const verseSearchText = new WeakMap();
const bibleLoadPromises = new Map();
const bibleCacheVersions = {};
let defaultBibleInitPromise = null;
let bibleStorageKeysPromise = null;

function cacheBible(translation, verses) {
  bibleCacheVersions[translation] = (bibleCacheVersions[translation] || 0) + 1;
  bibleLoadPromises.delete(translation);
  delete memoryIndexCaches[translation];
  bibleIndexPromises.delete(translation);
  if (verses) memoryBiblesCaches[translation] = verses;
  else delete memoryBiblesCaches[translation];
}

// All consumers share the same IndexedDB read. Do not cache empty/failed reads:
// a later download, storage migration or retry must remain visible.
function loadLocalBible(translation) {
  if (memoryBiblesCaches[translation]?.length) return Promise.resolve(memoryBiblesCaches[translation]);
  if (bibleLoadPromises.has(translation)) return bibleLoadPromises.get(translation);
  const version = bibleCacheVersions[translation] || 0;
  const attempt = (async () => {
    await storageReady;
    let verses = await localforage.getItem(getCacheKey(translation));
    if (!verses?.length) {
      const alt = translation.includes('-') ? translation.replace(/-/g, '_') : translation.replace(/_/g, '-');
      if (alt !== translation) verses = await localforage.getItem(getCacheKey(alt));
    }
    // A download/deletion completed while this read was pending.
    if (version !== (bibleCacheVersions[translation] || 0)) return loadLocalBible(translation);
    if (verses?.length) memoryBiblesCaches[translation] = verses;
    return verses || [];
  })();
  bibleLoadPromises.set(translation, attempt);
  const cleanup = () => {
    if (bibleLoadPromises.get(translation) === attempt) bibleLoadPromises.delete(translation);
  };
  attempt.then(cleanup, cleanup);
  return attempt;
}

async function getBibleVerses(translation) {
  // Readers opening alongside first-install preparation must wait for the
  // seed to finish, rather than mistaking the not-yet-written cache for empty.
  if (translation === 'AVD' && defaultBibleInitPromise) return defaultBibleInitPromise;
  return loadLocalBible(translation);
}

function getTranslationCacheKeys(translation) {
  const clean = String(translation || '').toUpperCase();
  const alt = clean.includes('-') ? clean.replace(/-/g, '_') : clean.replace(/_/g, '-');
  return [getCacheKey(clean), getCacheKey(alt)];
}

async function getBibleStorageKeys() {
  if (!bibleStorageKeysPromise) {
    bibleStorageKeysPromise = storageReady
      .then(() => localforage.keys())
      .then(keys => new Set(keys))
      .catch((error) => {
        bibleStorageKeysPromise = null;
        throw error;
      });
  }
  return bibleStorageKeysPromise;
}

function invalidateBibleStorageKeys() {
  bibleStorageKeysPromise = null;
}

export function getKnownDownloadedTranslations() {
  if (typeof window === 'undefined') return [];
  try {
    const saved = JSON.parse(localStorage.getItem(DOWNLOADED_TRANSLATIONS_KEY) || '[]');
    return Array.isArray(saved) ? saved.map(value => String(value).toUpperCase()) : [];
  } catch {
    return [];
  }
}

function rememberDownloadedTranslation(translation, isDownloaded = true) {
  if (typeof window === 'undefined') return;
  try {
    const clean = String(translation || '').toUpperCase();
    const known = new Set(getKnownDownloadedTranslations());
    if (isDownloaded) known.add(clean);
    else known.delete(clean);
    localStorage.setItem(DOWNLOADED_TRANSLATIONS_KEY, JSON.stringify([...known]));
  } catch {
    // IndexedDB remains the source of truth when localStorage is unavailable.
  }
}

/**
 * Hydrates IndexedDB with standard packaged AVD (Van Dyke) if empty.
 * Shared by first-install preparation and active Bible tools.
 */
export function initLocalBible() {
  if (typeof window === 'undefined') return Promise.resolve([]);
  if (memoryBiblesCaches.AVD?.length) return Promise.resolve(memoryBiblesCaches.AVD);
  if (defaultBibleInitPromise) return defaultBibleInitPromise;

  const attempt = hydrateDefaultBible();
  defaultBibleInitPromise = attempt;
  attempt.then(() => {
    if (defaultBibleInitPromise === attempt) defaultBibleInitPromise = null;
  });
  return attempt;
}

async function hydrateDefaultBible() {
  const cacheKey = getCacheKey('AVD');
  const version = bibleCacheVersions.AVD || 0;
  try {
    const existing = await loadLocalBible('AVD');
    if (existing && existing.length > 0) {
      console.log(`[BibleSync] AVD cache hydrated with ${existing.length} verses.`);
      rememberDownloadedTranslation('AVD');
      return existing;
    }

    if (isApp) {
      // Native/Electron: load from bundled public file
      console.log("[BibleSync] App: hydrating AVD from public/Taspe7.bibles.json...");
      const response = await fetch('/Taspe7.bibles.json');
      if (!response.ok) throw new Error("Local Taspe7.bibles.json not found in public folder");

      const raw = await response.json();
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Bundled Bible is empty or invalid');
      const normalized = new Array(raw.length);
      await forEachChunked(raw, (v, i) => {
        normalized[i] = { ...v, _id: v._id?.$oid || v._id, translation: 'AVD' };
      });

      if (version !== (bibleCacheVersions.AVD || 0)) return loadLocalBible('AVD');
      await localforage.setItem(cacheKey, normalized);
      invalidateBibleStorageKeys();
      console.log(`[BibleSync] App: AVD hydrated with ${normalized.length} verses.`);
      cacheBible('AVD', normalized);
      rememberDownloadedTranslation('AVD');
      return normalized;
    } else {
      // Web: fetch from the server download endpoint in the background
      console.log("[BibleSync] Web: downloading AVD from server API for offline use...");
      const apiBase = `${window.location.origin.includes('localhost') ? 'http://localhost:5000' : 'https://worship-team-api.onrender.com'}/api/bible`;
      try {
        const { data } = await axios.get(`${apiBase}/download?translation=AVD`);
        if (Array.isArray(data) && data.length > 0) {
          if (version !== (bibleCacheVersions.AVD || 0)) return loadLocalBible('AVD');
          await localforage.setItem(cacheKey, data);
          invalidateBibleStorageKeys();
          cacheBible('AVD', data);
          rememberDownloadedTranslation('AVD');
          console.log(`[BibleSync] Web: AVD downloaded and cached with ${data.length} verses.`);
          return data;
        }
      } catch (err) {
        console.warn("[BibleSync] Web: could not pre-download AVD (will use API on demand).", err.message);
      }
      return [];
    }
  } catch (error) {
    console.error("[BibleSync] Failed to initialize local Bible database:", error);
    return [];
  }
}

// Preserve automatic first-install offline preparation without hydrating a
// downloaded Bible just because the Hymns page mounted with its tools closed.
export async function prepareLocalBible() {
  if (typeof window === 'undefined') return;
  if (await isTranslationDownloaded('AVD')) return;
  await initLocalBible();
}

/**
 * Checks if a specific translation is downloaded locally.
 */
export async function isTranslationDownloaded(translation) {
  if (typeof window === 'undefined') return false;
  try {
    const clean = String(translation || '').toUpperCase();
    const keys = await getBibleStorageKeys();
    const downloaded = getTranslationCacheKeys(clean).some(key => keys.has(key));
    rememberDownloadedTranslation(clean, downloaded);
    return downloaded;
  } catch {
    return false;
  }
}

export async function getDownloadedTranslations(translations) {
  if (typeof window === 'undefined' || !Array.isArray(translations)) return new Set();
  try {
    const keys = await getBibleStorageKeys();
    const downloaded = new Set();
    translations.forEach((translation) => {
      const clean = String(translation || '').toUpperCase();
      const exists = getTranslationCacheKeys(clean).some(key => keys.has(key));
      rememberDownloadedTranslation(clean, exists);
      if (exists) downloaded.add(translation);
    });
    return downloaded;
  } catch {
    return new Set(getKnownDownloadedTranslations().filter(value => translations.includes(value)));
  }
}

/**
 * Downloads a translation completely from the server and stores it in IndexedDB.
 */
export async function downloadTranslationToLocal(translation, apiBase) {
  if (typeof window === 'undefined') return false;
  try {
    const cleanTranslation = String(translation).toUpperCase();
    const cacheKey = getCacheKey(cleanTranslation);

    console.log(`[BibleSync] Downloading full translation ${cleanTranslation}...`);
    const { data } = await axios.get(`${apiBase}/download?translation=${cleanTranslation}`);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Invalid response or empty data for translation ${cleanTranslation}`);
    }

    await localforage.setItem(cacheKey, data);
    invalidateBibleStorageKeys();
    console.log(`[BibleSync] Cached translation ${cleanTranslation} with ${data.length} verses.`);

    // Update memory cache
    cacheBible(cleanTranslation, data);
    rememberDownloadedTranslation(cleanTranslation);

    return true;
  } catch (error) {
    // Provide a clearer message when the translation doesn't exist in the DB
    if (error?.response?.status === 404) {
      const serverMsg = error?.response?.data?.message || '';
      console.error(`[BibleSync] Translation '${translation}' is not available on the server (404). ${serverMsg}`);
      const notFoundError = new Error(`Translation '${translation}' is not available for download. It may not be seeded in the database yet.`);
      notFoundError.isNotFound = true;
      throw notFoundError;
    }
    console.error(`[BibleSync] Failed to download translation ${translation}:`, error);
    throw error;
  }
}

/**
 * Clears a translation from the local database.
 */
export async function deleteTranslationFromLocal(translation) {
  if (typeof window === 'undefined') return false;
  try {
    const cleanTranslation = String(translation).toUpperCase();
    const cacheKey = getCacheKey(cleanTranslation);
    await storageReady; // otherwise the migration could copy the legacy copy back afterwards
    await localforage.removeItem(cacheKey);
    invalidateBibleStorageKeys();

    cacheBible(cleanTranslation, null);
    rememberDownloadedTranslation(cleanTranslation, false);

    console.log(`[BibleSync] Removed translation ${cleanTranslation} from local database.`);
    return true;
  } catch (error) {
    console.error(`[BibleSync] Failed to delete translation ${translation}:`, error);
    return false;
  }
}

/**
 * Creates an index of books, chapters, and verses mapping from the local cache.
 */
export async function getLocalBibleIndex(translation = 'AVD') {
  if (typeof window === 'undefined') return null;
  const cleanTranslation = String(translation).toUpperCase();
  if (memoryIndexCaches[cleanTranslation]) return memoryIndexCaches[cleanTranslation];
  const bibles = await getBibleVerses(cleanTranslation);
  if (!bibles?.length) return null;
  if (memoryIndexCaches[cleanTranslation]) return memoryIndexCaches[cleanTranslation];
  const current = bibleIndexPromises.get(cleanTranslation);
  if (current?.verses === bibles) return current.promise;
  const version = bibleCacheVersions[cleanTranslation] || 0;
  const promise = (async () => {
    const uniqueBooksMap = new Map();
    const chaptersMap = new Map();
    const versesMap = new Map();
    await forEachChunked(bibles, v => {
      if (!uniqueBooksMap.has(v.bookName)) uniqueBooksMap.set(v.bookName, { _id: v.bookName, bookName: v.bookName, bookNumber: v.bookNumber, testament: v.testament });
      if (!chaptersMap.has(v.bookName)) chaptersMap.set(v.bookName, new Set());
      chaptersMap.get(v.bookName).add(v.chapter);
      const key = `${v.bookName}_${v.chapter}`;
      if (!versesMap.has(key)) versesMap.set(key, []);
      versesMap.get(key).push(v);
    });
    await forEachChunked([...chaptersMap], ([bookName, chapters]) => { chaptersMap.set(bookName, [...chapters].sort((a, b) => a - b)); });
    await forEachChunked([...versesMap.values()], verses => { verses.sort((a, b) => a.verseNumber - b.verseNumber); });
    // A translation may be replaced/deleted during a yield. Never publish the
    // previous translation's index over that newer download or deletion.
    if (version !== (bibleCacheVersions[cleanTranslation] || 0) || memoryBiblesCaches[cleanTranslation] !== bibles) return getLocalBibleIndex(cleanTranslation);
    const index = { books: [...uniqueBooksMap.values()].sort((a, b) => a.bookNumber - b.bookNumber), chaptersMap, versesMap };
    memoryIndexCaches[cleanTranslation] = index;
    return index;
  })();
  const pending = { verses: bibles, promise };
  bibleIndexPromises.set(cleanTranslation, pending);
  const cleanup = () => { if (bibleIndexPromises.get(cleanTranslation) === pending) bibleIndexPromises.delete(cleanTranslation); };
  promise.then(cleanup, cleanup);
  return promise;
}

const normalizeArabic = (text) => {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove diacritics (Tashkeel)
    .replace(/[أإآ]/g, 'ا') // Normalize Alef
    .replace(/[ىي]/g, 'ي') // Normalize Yaa
    .replace(/ة/g, 'ه') // Normalize Ta Marbuta
    .toLowerCase();
};

/**
 * Search the Bible locally for a specific translation.
 */
export async function searchLocalBible(query, translation = 'AVD', { signal } = {}) {
  if (typeof window === 'undefined' || !query) return [];
  checkCancelled(signal);
  const cleanTranslation = String(translation).toUpperCase();
  const bibles = await getBibleVerses(cleanTranslation);
  if (!bibles.length) return [];
  const normalizedQuery = normalizeArabic(query.trim());
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!queryWords.length) return [];
  const phrases = [], allWords = [];
  const scores = new Map();
  await forEachChunked(bibles, verse => {
    let text = verseSearchText.get(verse);
    if (text === undefined) {
      text = normalizeArabic((verse.cleanText || '') + ' ' + (verse.text || ''));
      verseSearchText.set(verse, text);
    }
    if (text.includes(normalizedQuery)) {
      phrases.push(verse);
      if (phrases.length === 50) return false;
    }
    // Exact phrase hits always win; otherwise retain the existing AND, then
    // word-count ranking. Buckets keep only the first 50 ties in Bible order.
    if (phrases.length) return;
    let score = 0;
    for (const word of queryWords) if (text.includes(word)) score++;
    if (score === queryWords.length && allWords.length < 50) allWords.push(verse);
    if (score > 0) {
      if (!scores.has(score)) scores.set(score, []);
      const bucket = scores.get(score);
      if (bucket.length < 50) bucket.push(verse);
    }
  }, { signal });
  checkCancelled(signal);
  if (memoryBiblesCaches[cleanTranslation] !== bibles) return searchLocalBible(query, cleanTranslation, { signal });
  if (phrases.length) return phrases;
  if (allWords.length) return allWords;
  return [...scores.keys()].sort((a, b) => b - a).flatMap(score => scores.get(score)).slice(0, 50);
}
