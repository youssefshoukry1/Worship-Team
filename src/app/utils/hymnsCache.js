import localforage from 'localforage';
import { storageReady } from './platform';
import { forEachChunked } from './cooperativeWork';

const HYMNS_CACHE_KEY = 'taspe7_hymns_json';

function resolveId(id) {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id.$oid) return id.$oid;
  return String(id);
}

export async function normalizeDownloadedHymns(hymns) {
  const normalized = new Array(hymns.length);
  await forEachChunked(hymns, (hymn, index) => { normalized[index] = {
    ...hymn,
    _id: resolveId(hymn._id),
    lyrics: Array.isArray(hymn.lyrics)
      ? hymn.lyrics.map(lyric => ({ ...lyric, _id: resolveId(lyric._id) }))
      : hymn.lyrics,
  }; });
  return normalized;
}

async function loadDownloadedHymns() {
  await storageReady;
  const cached = await localforage.getItem(HYMNS_CACHE_KEY);
  if (Array.isArray(cached) && cached.length > 0) return normalizeDownloadedHymns(cached);

  // Seed only on first install. A downloaded cache never waits for a fetch.
  try {
    const response = await fetch('/hymns.json');
    if (response.ok) {
      const bundled = await response.json();
      if (Array.isArray(bundled) && bundled.length > 0) {
        const normalized = await normalizeDownloadedHymns(bundled);
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
