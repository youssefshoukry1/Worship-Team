import localforage from 'localforage';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

export const isApp = typeof window !== 'undefined' && (
  Capacitor.isNativePlatform() || 
  (window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes('Electron'))
);

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
 * Handles spaces, punctuation, and Arabic character variants (Alef, Teh Marbuta, etc).
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
    .replace(/[\u064B-\u0652]/g, '') // Remove Arabic diacritics (Tashkeel)
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ') // Replace punctuation with space
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Hydrates IndexedDB. 
 * - Mobile App: Uses packaged hymns.json.
 * - Web: Triggers background sync via API.
 */
export async function initLocalHymns() {
  if (typeof window === 'undefined') return [];
  if (!isApp) {
    console.log("[HymnsSync] Web detected. Skipping local cache hydration.");
    return [];
  }

  try {
    // 1. Setup automatic sync when network is restored
    if (typeof window !== 'undefined' && !window._hymnSyncAttached) {
      window.addEventListener('online', () => {
        console.log("[HymnsSync] Network restored. Triggering automatic sync...");
        syncRemoteHymns();
      });

      // 2. Setup automatic sync when app resumes (Android/Mobile foreground)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          console.log("[HymnsSync] App resumed. Triggering automatic sync...");
          syncRemoteHymns();
        }
      });

      // 3. Setup periodic background polling (Changed to 15 minutes to save performance)
      setInterval(() => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          console.log("[HymnsSync] Periodic background sync check...");
          syncRemoteHymns();
        }
      }, 15 * 60 * 1000);

      window._hymnSyncAttached = true;
    }

    // Return from memory if already loaded
    if (memoryHymnsCache && memoryHymnsCache.length > 0) {
      console.log(`[HymnsSync] Returning ${memoryHymnsCache.length} hymns from memory cache.`);
      return memoryHymnsCache;
    }

    const existing = await localforage.getItem(HYMNS_CACHE_KEY);
    if (existing && existing.length > 0) {
      console.log(`[HymnsSync] Cache already hydrated with ${existing.length} hymns.`);
      memoryHymnsCache = existing;
      return existing;
    }

    console.log("[HymnsSync] App detected. Hydrating local cache from public/hymns.json...");
    const response = await fetch('/hymns.json');
    if (!response.ok) throw new Error("Local hymns.json fallback file not found in public folder");

    const rawHymns = await response.json();

    // Flatten Mongo ObjectIDs if necessary
    const normalized = rawHymns.map(h => ({
      ...h,
      _id: h._id?.$oid || h._id
    }));

    await localforage.setItem(HYMNS_CACHE_KEY, normalized);
    console.log(`[HymnsSync] Local cache successfully hydrated with ${normalized.length} hymns.`);
    memoryHymnsCache = normalized;
    return normalized;
  } catch (error) {
    console.error("[HymnsSync] Failed to initialize local hymns database:", error);
    return [];
  }
}

/**
 * Searches and filters hymns locally from the in-memory cache (falls back to API for Web).
 */
export async function getLocalHymns({ activeTab, search, pageParam = 0, limit = 10 }) {
  if (typeof window === 'undefined') return [];

  // Use in-memory cache for instant access; only hit IndexedDB on first call
  if (!memoryHymnsCache) {
    const stored = await localforage.getItem(HYMNS_CACHE_KEY);
    memoryHymnsCache = stored || [];
  }

  let filtered = memoryHymnsCache;

  // 1. Local Search Filter (Offline only — returns up to 40 results)
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
      // Title matching (High priority)
      if (normTitle === query) score += 500; // Perfect match
      else if (normTitle.startsWith(query)) score += 200;
      else if (normTitle.includes(query)) score += 100;

      // Lyrics matching (Lower priority)
      if (normLyrics.includes(query)) score += 40;

      // Add popularity boost if we have any match at all
      if (score > 0) {
        // usageCount of 1000 adds ~60 points, 10 adds ~20 points
        score += Math.log10((hymn.usageCount || 0) + 1) * 20;
      }

      return { ...hymn, _searchScore: score };
    })
      .filter(h => h._searchScore > 0)
      .sort((a, b) => b._searchScore - a._searchScore);

    // Return up to 40 results during offline search
    return filtered.slice(0, 40);
  }

  // 2. Local Category Filter
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

  // Sort categories/general list by popularity as well
  filtered.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

  // 3. Local Pagination
  return filtered.slice(pageParam, pageParam + limit);
}

function hasHymnChanged(existing, incoming) {
  // If either has updatedAt and they don't match, it changed
  if (existing.updatedAt || incoming.updatedAt) {
    return String(existing.updatedAt) !== String(incoming.updatedAt);
  }

  // Fallbacks if updatedAt is missing from either
  if (existing.title !== incoming.title) return true;
  if (existing.scale !== incoming.scale) return true;
  if (existing.relatedChords !== incoming.relatedChords) return true;
  if (existing.BPM !== incoming.BPM) return true;
  if (existing.timeSignature !== incoming.timeSignature) return true;
  if (existing.link !== incoming.link) return true;
  if (existing.usageCount !== incoming.usageCount) return true;

  // Compare party array
  const arr1 = Array.isArray(existing.party) ? existing.party : [existing.party];
  const arr2 = Array.isArray(incoming.party) ? incoming.party : [incoming.party];
  if (arr1.length !== arr2.length) return true;
  const set1 = new Set(arr1.map(p => String(p || '').toLowerCase()));
  const hasMismatch = arr2.some(p => !set1.has(String(p || '').toLowerCase()));
  if (hasMismatch) return true;

  // Compare lyrics
  if (Array.isArray(existing.lyrics) && Array.isArray(incoming.lyrics)) {
    if (existing.lyrics.length !== incoming.lyrics.length) return true;
    for (let i = 0; i < existing.lyrics.length; i++) {
      if (existing.lyrics[i].text !== incoming.lyrics[i].text) return true;
      if (existing.lyrics[i].type !== incoming.lyrics[i].type) return true;
      if (existing.lyrics[i].title !== incoming.lyrics[i].title) return true;
    }
  } else if (existing.lyrics !== incoming.lyrics) {
    return true;
  }

  return false;
}

/**
 * Background sync remote additions using incremental checks (Optimized)
 */
export async function syncRemoteHymns(queryClient) {
  if (typeof window === 'undefined') return;
  if (!isApp) return; // Only sync on native app or windows app
  if (queryClient) globalQueryClient = queryClient;

  // Prevent sync when offline
  if (!navigator.onLine) {
    return;
  }

  try {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) console.log("[HymnsSync] Starting automatic background sync with remote server...");

    // Pass 1, 2 & 3: Update modified content, add new ones, and refresh popularity stats
    const endpoints = [
      "https://worship-team-api.onrender.com/api/hymns?sort=-updatedAt&limit=200",
      "https://worship-team-api.onrender.com/api/hymns?sort=-createdAt&limit=200",
      "https://worship-team-api.onrender.com/api/hymns?sort=-usageCount&limit=200"
    ];

    // Use in-memory cache as starting point if available
    let localHymns = memoryHymnsCache || await localforage.getItem(HYMNS_CACHE_KEY) || [];
    const localMap = new Map(localHymns.map(h => [h._id, h]));
    let hasChanges = false;

    for (const url of endpoints) {
      const response = await axios.get(url);
      const remoteHymns = response.data;
      if (!Array.isArray(remoteHymns)) continue;

      for (const remoteHymn of remoteHymns) {
        const flatId = remoteHymn._id?.$oid || remoteHymn._id;
        const flatHymn = { ...remoteHymn, _id: flatId };

        const existing = localMap.get(flatId);
        if (!existing) {
          localMap.set(flatId, flatHymn);
          hasChanges = true;
          if (isDev) console.log(`[HymnsSync] Auto-added new hymn from remote: "${flatHymn.title}"`);
        } else if (hasHymnChanged(existing, flatHymn)) {
          // Using our optimized helper function instead of JSON.stringify
          localMap.set(flatId, flatHymn);
          hasChanges = true;
          if (isDev) console.log(`[HymnsSync] Auto-updated stats/content for: "${flatHymn.title}"`);
        }
      }
    }

    // Pass 4: Reconcile Deletions (Pruning local cache of items removed from server)
    try {
      // Fetch current active IDs (limit 5000 to cover the whole DB safely)
      const allIdsResponse = await axios.get("https://worship-team-api.onrender.com/api/hymns?limit=5000&select=_id");
      if (Array.isArray(allIdsResponse.data)) {
        const remoteIdSet = new Set(allIdsResponse.data.map(h => h._id?.$oid || h._id));
        if (remoteIdSet.size > 0) {
          for (const localId of localMap.keys()) {
            if (!remoteIdSet.has(localId)) {
              localMap.delete(localId);
              hasChanges = true;
              if (isDev) console.log(`[HymnsSync] Pruned deleted hymn from local cache: ${localId}`);
            }
          }
        }
      }
    } catch (e) {
      if (isDev) console.warn("[HymnsSync] Deletion reconciliation skipped:", e.message);
    }

    if (hasChanges) {
      // Keep sorted by newest first
      const updatedList = Array.from(localMap.values()).sort((a, b) =>
        String(b._id).localeCompare(String(a._id))
      );

      await localforage.setItem(HYMNS_CACHE_KEY, updatedList);
      // Also update the in-memory cache so subsequent reads are instant
      memoryHymnsCache = updatedList;
      if (isDev) console.log("[HymnsSync] Local cache updated and saved successfully.");

      const qc = queryClient || globalQueryClient;
      if (qc) {
        qc.invalidateQueries({ queryKey: ["humns"] });
        if (isDev) console.log("[HymnsSync] UI notified of cache changes.");
      }
    } else {
      if (isDev) console.log("[HymnsSync] Local database is already up to date with remote server.");
    }
  } catch (error) {
    console.warn("[HymnsSync] Background sync encountered an error (server might be starting up):", error.message);
  }
}