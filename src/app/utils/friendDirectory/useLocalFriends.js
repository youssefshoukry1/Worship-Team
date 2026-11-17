'use client';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getApiBaseUrl } from '../apiBase';
import { createFriendDirectory } from './store';
import { friendDirectoryStorage, clearFriendDirectoryStorage } from './storage';

const sessions = new Map();
export function getFriendDirectory(token, userId) {
  const key = JSON.stringify([token, userId]);
  if (!sessions.has(key)) {
    const store = createFriendDirectory({
      cache: friendDirectoryStorage(userId || 'guest'),
      yieldTask: () => new Promise(resolve => setTimeout(resolve, 16)),
      request: async (path, options = {}) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) abort();
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
        try {
          const response = await fetch(`${getApiBaseUrl()}/users/friends-directory${path}`, { ...options, signal: controller.signal, cache: 'no-store',
            headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Could not sync friends.');
          return result;
        } catch (error) { if (timedOut) throw new Error('Friend sync timed out.'); throw error; }
        finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
      },
    });
    sessions.set(key, { token, userId, store });
  }
  return sessions.get(key).store;
}
export function pauseFriendDirectory(token, paused) {
  for (const entry of sessions.values()) if (entry.token === token) entry.store.pause(paused);
}
export function optimisticFriendRemoval(token, id) {
  const entry = [...sessions.values()].find(entry => entry.token === token);
  return entry ? entry.store.beginRemoval(id) : () => {};
}
export function useFriendDirectorySession(token, userId) {
  const store = useMemo(() => getFriendDirectory(token, userId), [token, userId]);
  useEffect(() => {
    if (!token || !userId) return;
    store.activate();
    const initial = setTimeout(() => void store.sync(), 300);
    const resume = () => { if (document.visibilityState === 'visible') void store.sync(); };
    const reconnect = () => { if (document.visibilityState === 'visible') void store.restart(); };
    const changed = event => {
      if (event.detail?.removedFriendId) store.removeKnown(event.detail.removedFriendId);
      if (document.visibilityState === 'visible') void store.sync(true);
    };
    const logout = () => {
      store.dispose();
      void clearFriendDirectoryStorage(userId).catch(() => {});
      sessions.delete(JSON.stringify([token, userId]));
    };
    window.addEventListener('taspe7:friends-push', changed);
    window.addEventListener('taspe7:directory-resume', reconnect);
    window.addEventListener('online', reconnect);
    window.addEventListener('pageshow', resume);
    window.addEventListener('taspe7:logout', logout);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearTimeout(initial); store.dispose();
      window.removeEventListener('taspe7:friends-push', changed);
      window.removeEventListener('taspe7:directory-resume', reconnect);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('taspe7:logout', logout);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [store, token, userId]);
}
export default function useLocalFriends(token, userId, query = '', enabled = true) {
  const store = useMemo(() => getFriendDirectory(token, userId), [token, userId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { items: allItems } = state;
  // Query changes are local only. This effect deliberately does not depend on query.
  useEffect(() => { if (enabled && token) void store.hydrate(); }, [enabled, token, store]);
  const matches = useMemo(() => store.search(query, allItems), [store, query, allItems]);
  const [paging, setPaging] = useState({ query: '', limit: 10 });
  const limit = paging.query === query ? paging.limit : 10;
  const loadMore = useCallback(() => setPaging({ query, limit: limit + 10 }), [query, limit]);
  const reveal = useCallback(id => {
    const index = matches.findIndex(person => person._id === id);
    if (index < 0) return false;
    setPaging(previous => ({ query, limit: Math.max(previous.query === query ? previous.limit : 10, Math.ceil((index + 1) / 10) * 10) }));
    return true;
  }, [matches, query]);
  const retry = useCallback(() => store.restart(), [store]);
  return { items: matches.slice(0, limit), total: allItems.length, matchedTotal: matches.length, complete: state.complete,
    ready: state.ready, loading: false, syncing: state.syncing, error: state.ready ? '' : state.error, syncError: state.error, storageError: state.storageError,
    nextCursor: matches.length > limit ? String(limit) : null, loadMore, retry, setItems: store.setItems,
    knownTotal: state.total, reveal, contains: id => allItems.some(person => person._id === id) };
}
