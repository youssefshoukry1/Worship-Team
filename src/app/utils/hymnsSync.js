import localforage from 'localforage';
import axios from 'axios';

// Configure localforage database safely (for client-side only execution)
if (typeof window !== 'undefined') {
  localforage.config({
    name: 'taspe7_app',
    storeName: 'hymns_store'
  });
}

let globalQueryClient = null; // Store reference to refresh UI during background events

const HYMNS_CACHE_KEY = 'taspe7_hymns_db';

// In-memory caching for perfect performance across renders
let memoryHymnsCache = null;

/**
 * Normalizes Arabic and Latin text for robust search matching.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u0652]/g, '') 
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ') 
    .replace(/\s+/g, ' ') 
    .trim();
}

/**
 * Hydrates IndexedDB. Uses hymns.json for instant UI, but immediately syncs with MongoDB.
 */
export async function initLocalHymns() {
  if (typeof window === 'undefined') return [];

  try {
    // 1. Setup automatic sync triggers
    if (typeof window !== 'undefined' && !window._hymnSyncAttached) {
      window.addEventListener('online', () => {
        syncRemoteHymns();
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          syncRemoteHymns();
        }
      });

      // Background polling every 15 mins
      setInterval(() => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          syncRemoteHymns();
        }
      }, 15 * 60 * 1000);

      window._hymnSyncAttached = true;
    }

    // 2. Return from memory if already loaded
    if (memoryHymnsCache && memoryHymnsCache.length > 0) {
      // Trigger a silent background sync just in case
      setTimeout(() => syncRemoteHymns(), 1000);
      return memoryHymnsCache;
    }

    // 3. Try getting from IndexedDB
    const existing = await localforage.getItem(HYMNS_CACHE_KEY);
    if (existing && existing.length > 0) {
      memoryHymnsCache = existing;
      // Trigger a silent background sync
      setTimeout(() => syncRemoteHymns(), 1000);
      return existing;
    }

    // 4. Fallback to static JSON if DB is completely empty (e.g., cleared cache)
    const response = await fetch('/hymns.json');
    if (!response.ok) throw new Error("Local fallback not found");
    const rawHymns = await response.json();
    
    const normalized = rawHymns.map(h => ({
      ...h,
      _id: h._id?.$oid || h._id
    }));

    await localforage.setItem(HYMNS_CACHE_KEY, normalized);
    memoryHymnsCache = normalized;

    // 🔥 THE MAGIC FIX: Instantly sync from MongoDB to overwrite this static JSON
    setTimeout(() => syncRemoteHymns(), 500);

    return normalized;
  } catch (error) {
    console.error("[HymnsSync] Failed to initialize:", error);
    return [];
  }
}

/**
 * Searches and filters hymns locally from the in-memory cache.
 */
export async function getLocalHymns({ activeTab, search, pageParam = 0, limit = 10 }) {
  if (typeof window === 'undefined') return [];

  if (!memoryHymnsCache) {
    const stored = await localforage.getItem(HYMNS_CACHE_KEY);
    memoryHymnsCache = stored || [];
  }

  let filtered = memoryHymnsCache;

  if (search && search.trim()) {
    const query = normalizeText(search);
    if (!query) return [];

    filtered = filtered.map(hymn => {
      const normTitle = normalizeText(hymn.title || '');
      let lyricsRaw = '';
      if (typeof hymn.lyrics === 'string') {
        lyricsRaw = hymn.lyrics;
      } else if (Array.isArray(hymn.lyrics)) {
        lyricsRaw = hymn.lyrics.map(l => l.text).join(' ');
      }
      const normLyrics = normalizeText(lyricsRaw);

      let score = 0;
      if (normTitle === query) score += 500;
      else if (normTitle.startsWith(query)) score += 200;
      else if (normTitle.includes(query)) score += 100;
      if (normLyrics.includes(query)) score += 40;

      if (score > 0) {
        score += Math.log10((hymn.usageCount || 0) + 1) * 20;
      }
      return { ...hymn, _searchScore: score };
    })
      .filter(h => h._searchScore > 0)
      .sort((a, b) => b._searchScore - a._searchScore);

    return filtered.slice(0, 40);
  }

  if (activeTab && activeTab !== 'all') {
    const target = String(activeTab).toLowerCase().trim() === 'christmass' ? 'christmas' : String(activeTab).toLowerCase().trim();
    filtered = filtered.filter(hymn => {
      if (!hymn.party) return false;
      const parties = Array.isArray(hymn.party) ? hymn.party : [hymn.party];
      return parties.some(p => {
        const lower = String(p).toLowerCase().trim();
        const normParty = lower === 'christmass' ? 'christmas' : lower;
        return normParty === target;
      });
    });
  }

  filtered.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  return filtered.slice(pageParam, pageParam + limit);
}

function hasHymnChanged(existing, incoming) {
  if (existing.updatedAt || incoming.updatedAt) {
    return String(existing.updatedAt) !== String(incoming.updatedAt);
  }
  
  const arr1 = Array.isArray(existing.party) ? existing.party : [existing.party];
  const arr2 = Array.isArray(incoming.party) ? incoming.party : [incoming.party];
  if (arr1.length !== arr2.length) return true;
  const set1 = new Set(arr1.map(p => String(p || '').toLowerCase()));
  const hasMismatch = arr2.some(p => !set1.has(String(p || '').toLowerCase()));
  if (hasMismatch) return true;

  return false;
}

/**
 * Bullet-fast Background Sync directly from MongoDB
 */
export async function syncRemoteHymns(queryClient) {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  if (queryClient) globalQueryClient = queryClient;

  // Prevent multiple syncs running at the exact same time (protects weak phones)
  if (window._isSyncing) return;
  window._isSyncing = true;

  try {
    const isDev = process.env.NODE_ENV !== 'production';
    
    // 🔥 Fetch up to 4000 hymns in ONE fast request. Covers entire DB.
    const url = "https://worship-team-api.onrender.com/api/hymns?sort=-updatedAt&limit=4000";
    const response = await axios.get(url);
    const remoteHymns = response.data;
    
    if (!Array.isArray(remoteHymns)) {
      window._isSyncing = false;
      return;
    }

    let localHymns = memoryHymnsCache || await localforage.getItem(HYMNS_CACHE_KEY) || [];
    const localMap = new Map(localHymns.map(h => [String(h._id), h]));
    let hasChanges = false;
    const remoteIdSet = new Set();

    // Reconcile additions and updates
    for (const remoteHymn of remoteHymns) {
      const flatId = String(remoteHymn._id?.$oid || remoteHymn._id);
      remoteIdSet.add(flatId);
      const flatHymn = { ...remoteHymn, _id: flatId };

      const existing = localMap.get(flatId);
      if (!existing || hasHymnChanged(existing, flatHymn)) {
        localMap.set(flatId, flatHymn);
        hasChanges = true;
      }
    }

    // Reconcile deletions natively (if it's not in the 4000 fetched, it was deleted)
    for (const localId of localMap.keys()) {
      if (!remoteIdSet.has(localId)) {
        localMap.delete(localId);
        hasChanges = true;
        if (isDev) console.log(`[HymnsSync] Pruned: ${localId}`);
      }
    }

    // Save and update UI if anything actually changed
    if (hasChanges) {
      const updatedList = Array.from(localMap.values()).sort((a, b) =>
        String(b._id).localeCompare(String(a._id))
      );

      await localforage.setItem(HYMNS_CACHE_KEY, updatedList);
      memoryHymnsCache = updatedList;

      const qc = queryClient || globalQueryClient;
      if (qc) {
        qc.invalidateQueries({ queryKey: ["humns"] });
      }
      if (isDev) console.log("[HymnsSync] Synced successfully and updated UI!");
    }
  } catch (error) {
    console.warn("[HymnsSync] Sync error:", error.message);
  } finally {
    // Release the lock so future syncs can run
    window._isSyncing = false;
  }
}