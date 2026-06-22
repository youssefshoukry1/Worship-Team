import localforage from 'localforage';
import axios from 'axios';

// Configure localforage database safely (for client-side only execution)
if (typeof window !== 'undefined') {
  localforage.config({
    name: 'taspe7_app',
    storeName: 'bible_store'
  });
}

const BIBLE_CACHE_KEY = 'taspe7_bible_db';

// In-memory caching for perfect performance across components
let memoryBiblesCache = null;
let memoryIndexCache = null;

/**
 * Hydrates IndexedDB with packaged Taspe7.bibles.json if the cache is empty.
 * Runs on client side.
 */
export async function initLocalBible() {
  if (typeof window === 'undefined') return [];

  try {
    const existing = await localforage.getItem(BIBLE_CACHE_KEY);
    if (existing && existing.length > 0) {
      console.log(`[BibleSync] Cache already hydrated with ${existing.length} verses.`);
      memoryBiblesCache = existing;
      return existing;
    }

    console.log("[BibleSync] Database is empty. Hydrating local cache from public/Taspe7.bibles.json...");
    const response = await fetch('/Taspe7.bibles.json');
    if (!response.ok) throw new Error("Local Taspe7.bibles.json fallback file not found in public folder");

    const raw = await response.json();

    // Flatten Mongo ObjectIDs if necessary
    const normalized = raw.map(v => ({
      ...v,
      _id: v._id?.$oid || v._id
    }));

    await localforage.setItem(BIBLE_CACHE_KEY, normalized);
    console.log(`[BibleSync] Local cache successfully hydrated with ${normalized.length} verses.`);
    memoryBiblesCache = normalized;
    return normalized;
  } catch (error) {
    console.error("[BibleSync] Failed to initialize local Bible database:", error);
    return [];
  }
}

/**
 * Creates an index of books, chapters, and verses mapping from the local cache.
 */
export async function getLocalBibleIndex() {
  if (typeof window === 'undefined') return null;
  if (memoryIndexCache) return memoryIndexCache;

  const bibles = memoryBiblesCache || await localforage.getItem(BIBLE_CACHE_KEY) || [];
  if (bibles.length === 0) return null;

  if (!memoryBiblesCache) memoryBiblesCache = bibles;

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

  memoryIndexCache = {
    books: Array.from(uniqueBooksMap.values()).sort((a, b) => a.bookNumber - b.bookNumber),
    chaptersMap,
    versesMap
  };
  return memoryIndexCache;
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
 * Search the Bible locally.
 */
export async function searchLocalBible(query) {
  if (typeof window === 'undefined' || !query) return [];
  
  const bibles = memoryBiblesCache || await localforage.getItem(BIBLE_CACHE_KEY) || [];
  if (bibles.length === 0) return [];

  if (!memoryBiblesCache) memoryBiblesCache = bibles;
  
  const normalizedQuery = normalizeArabic(query.trim());
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

  if (queryWords.length === 0) return [];

  // Lazily compute a normalized search string for each verse for extreme performance
  if (bibles.length > 0 && !bibles[0]._searchCache) {
      for (let i = 0; i < bibles.length; i++) {
          const v = bibles[i];
          bibles[i]._searchCache = normalizeArabic((v.cleanText || '') + ' ' + (v.text || ''));
      }
  }

  // 1. Exact Phrase Match (Highest Priority)
  let results = bibles.filter(v => v._searchCache.includes(normalizedQuery));

  // 2. AND Logic Match (If Exact Phrase fails, all words must be present)
  if (results.length === 0) {
      results = bibles.filter(v => queryWords.every(word => v._searchCache.includes(word)));
  }

  // 3. OR Logic Match (If AND fails, fallback to any word match)
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
