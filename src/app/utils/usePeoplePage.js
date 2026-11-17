'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import localforage from 'localforage';
import { createPeoplePageStore } from './peoplePageStore';
import { pauseFriendDirectory } from './friendDirectory/useLocalFriends';
import { getApiBaseUrl } from './apiBase';

const disk = localforage.createInstance({ name: 'taspe7_app', storeName: 'people_pages_v1' });
const stores = new Map();
const handledEvents = new WeakSet();
const mutations = new Map();
export function beginPeopleMutation(token) {
  pauseFriendDirectory(token, true);
  mutations.set(token, (mutations.get(token) || 0) + 1);
  for (const entry of stores.values()) if (entry.token === token) entry.store.pause(true);
}
export function endPeopleMutation(token) {
  const remaining = Math.max(0, (mutations.get(token) || 0) - 1);
  mutations.set(token, remaining);
  if (!remaining) pauseFriendDirectory(token, false);
  if (!remaining) for (const entry of stores.values()) if (entry.token === token) { entry.store.pause(false); entry.store.invalidate(); }
}
export function invalidatePeoplePages(token) {
  for (const entry of stores.values()) if (entry.token === token) entry.store.invalidate();
}
export default function usePeoplePage(path, token, userId, enabled = true, persistent = true) {
  const store = useMemo(() => {
    const key = JSON.stringify([token, path]);
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
      if (mutations.get(token)) store.pause(true);
      stores.set(key, { token, store, users: 0 });
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
    if (enabled) void store.ensure();
    const refresh = () => { if (enabled && document.visibilityState === 'visible') void store.ensure(); };
    const changed = event => {
      if (!handledEvents.has(event)) { handledEvents.add(event); invalidatePeoplePages(token); }
      refresh();
    };
    window.addEventListener('taspe7:friends-push', changed);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('taspe7:friends-push', changed);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [store, enabled, token]);
  return { ...state, ...store };
}
