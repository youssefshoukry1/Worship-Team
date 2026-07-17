import localforage from 'localforage';
import axios from 'axios';
import { isApp } from './ReactQueryProvider';

// Configure localforage database safely (for client-side only execution)
if (typeof window !== 'undefined') {
  localforage.config({
    name: 'taspe7_app',
    storeName: 'bible_store'
  });
}

// Map translation key helper
const getCacheKey = (translation) => `taspe7_bible_db_${String(translation || 'AVD').toUpperCase()}`;

// In-memory caches for all downloaded translations
const memoryBiblesCaches = {}; // { AVD: [...], KEH: [...] }
const memoryIndexCaches = {};  // { AVD: index, KEH: index }

/**
 * Hydrates IndexedDB with standard packaged AVD (Van Dyke) if empty.
 * Runs on app startup.
 */
export async function initLocalBible() {
  if (typeof window === 'undefined') return [];

  const cacheKey = getCacheKey('AVD');
  try {
    const existing = await localforage.getItem(cacheKey);
    if (existing && existing.length > 0) {
      console.log(`[BibleSync] AVD cache hydrated with ${existing.length} verses.`);
      memoryBiblesCaches['AVD'] = existing;
      return existing;
    }

    if (isApp) {
      // Native/Electron: load from bundled public file
      console.log("[BibleSync] App: hydrating AVD from public/Taspe7.bibles.json...");
      const response = await fetch('/Taspe7.bibles.json');
      if (!response.ok) throw new Error("Local Taspe7.bibles.json not found in public folder");

      const raw = await response.json();
      const normalized = raw.map(v => ({
        ...v,
        _id: v._id?.$oid || v._id,
        translation: 'AVD'
      }));

      await localforage.setItem(cacheKey, normalized);
      console.log(`[BibleSync] App: AVD hydrated with ${normalized.length} verses.`);
      memoryBiblesCaches['AVD'] = normalized;
      return normalized;
    } else {
      // Web: fetch from the server download endpoint in the background
      console.log("[BibleSync] Web: downloading AVD from server API for offline use...");
      const apiBase = `${window.location.origin.includes('localhost') ? 'http://localhost:5000' : 'https://worship-team-api.onrender.com'}/api/bible`;
      try {
        const { data } = await axios.get(`${apiBase}/download?translation=AVD`);
        if (Array.isArray(data) && data.length > 0) {
          await localforage.setItem(cacheKey, data);
          memoryBiblesCaches['AVD'] = data;
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

/**
 * Checks if a specific translation is downloaded locally.
 */
export async function isTranslationDownloaded(translation) {
  if (typeof window === 'undefined') return false;
  try {
    const cacheKey = getCacheKey(translation);
    const existing = await localforage.getItem(cacheKey);
    return !!(existing && existing.length > 0);
  } catch {
    return false;
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
    console.log(`[BibleSync] Cached translation ${cleanTranslation} with ${data.length} verses.`);

    // Update memory cache
    memoryBiblesCaches[cleanTranslation] = data;
    delete memoryIndexCaches[cleanTranslation]; // Reset index to force build

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
    await localforage.removeItem(cacheKey);

    delete memoryBiblesCaches[cleanTranslation];
    delete memoryIndexCaches[cleanTranslation];

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

  const cacheKey = getCacheKey(cleanTranslation);
  const bibles = memoryBiblesCaches[cleanTranslation] || await localforage.getItem(cacheKey) || [];
  if (bibles.length === 0) return null;

  if (!memoryBiblesCaches[cleanTranslation]) memoryBiblesCaches[cleanTranslation] = bibles;

  const uniqueBooksMap = new Map();
  const chaptersMap = new Map();
  const versesMap = new Map();

  for (const v of bibles) {
    if (!uniqueBooksMap.has(v.bookName)) {
      uniqueBooksMap.set(v.bookName, { _id: v.bookName, bookName: v.bookName, bookNumber: v.bookNumber, testament: v.testament });
    }

    if (!chaptersMap.has(v.bookName)) {
      chaptersMap.set(v.bookName, new Set());
    }
    chaptersMap.get(v.bookName).add(v.chapter);

    const key = `${v.bookName}_${v.chapter}`;
    if (!versesMap.has(key)) {
      versesMap.set(key, []);
    }
    versesMap.get(key).push(v);
  }

  for (const [bookName, chaptersSet] of chaptersMap.entries()) {
    chaptersMap.set(bookName, Array.from(chaptersSet).sort((a, b) => a - b));
  }

  for (const [key, versesArray] of versesMap.entries()) {
    versesArray.sort((a, b) => a.verseNumber - b.verseNumber);
  }

  const index = {
    books: Array.from(uniqueBooksMap.values()).sort((a, b) => a.bookNumber - b.bookNumber),
    chaptersMap,
    versesMap
  };

  memoryIndexCaches[cleanTranslation] = index;
  return index;
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
export async function searchLocalBible(query, translation = 'AVD') {
  if (typeof window === 'undefined' || !query) return [];
  const cleanTranslation = String(translation).toUpperCase();

  const cacheKey = getCacheKey(cleanTranslation);
  const bibles = memoryBiblesCaches[cleanTranslation] || await localforage.getItem(cacheKey) || [];
  if (bibles.length === 0) return [];

  if (!memoryBiblesCaches[cleanTranslation]) memoryBiblesCaches[cleanTranslation] = bibles;

  const normalizedQuery = normalizeArabic(query.trim());
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

  if (queryWords.length === 0) return [];

  // Lazily compute a normalized search string for each verse for performance
  if (bibles.length > 0 && !bibles[0]._searchCache) {
    for (let i = 0; i < bibles.length; i++) {
      const v = bibles[i];
      bibles[i]._searchCache = normalizeArabic((v.cleanText || '') + ' ' + (v.text || ''));
    }
  }

  // 1. Exact Phrase Match
  let results = bibles.filter(v => v._searchCache.includes(normalizedQuery));

  // 2. AND Logic Match
  if (results.length === 0) {
    results = bibles.filter(v => queryWords.every(word => v._searchCache.includes(word)));
  }

  // 3. OR Logic Match
  if (results.length === 0) {
    const scoredResults = bibles.map(v => {
      let score = 0;
      for (let i = 0; i < queryWords.length; i++) {
        if (v._searchCache.includes(queryWords[i])) score++;
      }
      return { verse: v, score };
    }).filter(item => item.score > 0);

    scoredResults.sort((a, b) => b.score - a.score);
    results = scoredResults.map(item => item.verse);
  }

  return results.slice(0, 50);
}