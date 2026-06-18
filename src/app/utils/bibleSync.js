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

/**
 * Search the Bible locally.
 */
export async function searchLocalBible(query) {
  if (typeof window === 'undefined' || !query) return [];
  
  const bibles = memoryBiblesCache || await localforage.getItem(BIBLE_CACHE_KEY) || [];
  if (bibles.length === 0) return [];

  if (!memoryBiblesCache) memoryBiblesCache = bibles;
  
  const lowerQuery = query.trim().toLowerCase();
  return bibles.filter(v => 
    (v.cleanText && v.cleanText.includes(lowerQuery)) ||
    (v.text && v.text.includes(lowerQuery))
  ).slice(0, 50);
}
