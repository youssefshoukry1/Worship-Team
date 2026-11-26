'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import localforage from 'localforage';
import { createPeoplePageStore } from './peoplePageStore';
import { getApiBaseUrl } from './apiBase';
import { peopleStores as stores, handlePeoplePush, affectsPeoplePage } from './peoplePageCache';
export { invalidatePeoplePages } from './peoplePageCache';

const disk = localforage.createInstance({ name: 'taspe7_app', storeName: 'people_pages_v1' });
export default function usePeoplePage(path, token, userId, enabled = true, persistent = true) {
  const store = useMemo(() => {
    const key = JSON.stringify([token, userId, path]);
    if (!stores.has(key)) {
      // Search strings stay in memory only; preserve the small non-search lists.
      if (stores.size > 64) {
        const entry = [...stores].find(([, value]) => value.users === 0);
        if (entry) { entry[1].store.invalidate(); stores.delete(entry[0]); }
      }
      const cacheKey = `${userId}:${path}`;
      let writes = Promise.resolve();
      const cached = persistent && !path.includes('q=') && userId;
      const store = createPeoplePageStore({
        progressive: path.startsWith('friend-requests?kind=') || path === 'friend-suggestions',
        cache: cached ? { get: async () => {
          const saved = await disk.getItem(cacheKey);
          if (saved) return saved;
          const legacy = await localforage.getItem(`friends_data_${userId}`);
          const field = { friends: 'friends', 'friend-requests?kind=incoming': 'incomingRequests', 'friend-requests?kind=outgoing': 'outgoingRequests' }[path];
          if (!field || !Array.isArray(legacy?.[field])) return null;
          const rows = legacy[field].filter(item => item?._id).sort((a, b) => String(a._id).localeCompare(String(b._id)) * (path === 'friends' ? 1 : -1));
          return { items: rows.slice(0, 10), total: rows.length, nextCursor: rows.length > 10 ? String(rows[9]._id) : null };
        }, set: value => { writes = writes.catch(() => {}).then(() => disk.setItem(cacheKey, value)); return writes; } } : null,
        request: async (cursor, signal) => {
          const url = `${getApiBaseUrl()}/users/${path}${cursor ? `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : ''}`;
          const response = await fetch(url, { signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || result.msg || 'Could not load people.');
          return result;
        },
      });
      stores.set(key, { token, path, store, users: 0 });
    }
    return stores.get(key).store;
  }, [path, token, userId, persistent]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    const entry = [...stores.values()].find(entry => entry.store === store);
    if (entry) entry.users++;
    return () => { if (entry) entry.users--; };
  }, [store]);
  useEffect(() => {
    if (!token) return;
    const refresh = () => { if (enabled && document.visibilityState === 'visible') void store.ensure(); };
    refresh();
    const changed = event => {
      handlePeoplePush(event, token, userId);
      const change = event.detail?.friendChange;
      // The confirmed write already updated every cached matching search result.
      // Unfinished first reads still need a response after invalidation.
      if (change && path.startsWith('people-search?') && store.getSnapshot().ready) return;
      if (affectsPeoplePage(path, change)) refresh();
    };
    window.addEventListener('taspe7:friends-push', changed);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('taspe7:friends-push', changed);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [store, enabled, token, userId, path]);
  return { ...state, ...store };
}
