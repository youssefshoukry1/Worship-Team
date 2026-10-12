import localforage from 'localforage';
import { storageReady } from './platform';

const HYMNS_CACHE_KEY = 'taspe7_hymns_json';

function resolveId(id) {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id.$oid) return id.$oid;
  return String(id);
}

function normalizeIds(hymns) {
  return hymns.map(hymn => ({
    ...hymn,
    _id: resolveId(hymn._id),
    lyrics: Array.isArray(hymn.lyrics)
      ? hymn.lyrics.map(lyric => ({ ...lyric, _id: resolveId(lyric._id) }))
      : hymn.lyrics,
  }));
}

async function loadDownloadedHymns() {
  await storageReady;
  const cached = await localforage.getItem(HYMNS_CACHE_KEY);
  if (Array.isArray(cached) && cached.length > 0) return normalizeIds(cached);

  // Seed only on first install. A downloaded cache never waits for a fetch.
  try {
    const response = await fetch('/hymns.json');
    if (response.ok) {
      const bundled = await response.json();
      if (Array.isArray(bundled) && bundled.length > 0) {
        const normalized = normalizeIds(bundled);
        await localforage.setItem(HYMNS_CACHE_KEY, normalized);
        return normalized;
      }
    }
  } catch { }
  return [];
}

// Shared by startup prefetch and the page: React Query deduplicates concurrent
// loads and keeps the downloaded list available throughout the app session.
export const downloadedHymnsQueryOptions = {
  queryKey: ['hymns', 'app'],
  queryFn: loadDownloadedHymns,
  staleTime: Infinity,
  gcTime: Infinity,
  networkMode: 'always',
};
