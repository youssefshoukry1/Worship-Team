import axios from 'axios';
import localforage from 'localforage';
import { storageReady } from '../utils/platform';
import { downloadedHymnsQueryOptions, normalizeDownloadedHymns } from '../utils/hymnsCache';
import { forEachChunked } from '../utils/cooperativeWork';

const running = new WeakMap();
const API = 'https://worship-team-api.onrender.com/api/hymns';
const VERSION_KEY = 'taspe7_hymns_sync_version';
const FORCE_KEY = 'taspe7_force_sync';

// This job belongs to the app session, not the mounted Hymns view. Tab changes
// never cancel persistence or start competing incremental/full downloads.
export function syncDownloadedHymns(queryClient, { force = false } = {}) {
  const existing = running.get(queryClient);
  if (existing) {
    if (force) existing.again = true;
    return existing.promise;
  }
  const job = { again: false };
  running.set(queryClient, job);
  job.promise = (async () => {
    do {
      job.again = false;
      const forceVersion = localStorage.getItem(FORCE_KEY);
      try {
        await storageReady;
        const { data: versionData } = await axios.get(`${API}/version`, { timeout: 20000 });
        const serverVersion = Number(versionData.version);
        if (!Number.isFinite(serverVersion)) throw new Error('Invalid hymns version');
        const localVersion = Number(localStorage.getItem(VERSION_KEY) || 0);
        if (serverVersion > localVersion) {
          const cached = await queryClient.ensureQueryData(downloadedHymnsQueryOptions);
          let hymns;
          let version = serverVersion;
          if (cached?.length) {
            const { data } = await axios.get(`${API}/changes?fromVersion=${localVersion}`, { timeout: 20000 });
            if (!data.fallback) {
              const deleted = new Set((data.deleted || []).map(String));
              const merged = new Map();
              await forEachChunked(cached, hymn => { if (!deleted.has(hymn._id)) merged.set(hymn._id, hymn); });
              await forEachChunked(await normalizeDownloadedHymns(data.updated || []), hymn => { merged.set(hymn._id, hymn); });
              hymns = [...merged.values()];
              version = Number(data.currentVersion) || serverVersion;
            }
          }
          if (!hymns) {
            const { data } = await axios.get(`${API}?limit=50000`, { timeout: 20000 });
            if (!Array.isArray(data) || !data.length) throw new Error('Empty hymn download');
            hymns = await normalizeDownloadedHymns(data);
          }
          await localforage.setItem('taspe7_hymns_json', hymns);
          localStorage.setItem(VERSION_KEY, String(version));
          queryClient.setQueryData(['hymns', 'app'], hymns);
        }
        if (localStorage.getItem(FORCE_KEY) === forceVersion) localStorage.removeItem(FORCE_KEY);
        else job.again = true;
      } catch {
        // Keep the downloaded cache and pending force flag intact for retry.
      }
    } while (job.again);
  })().finally(() => running.delete(queryClient));
  return job.promise;
}
