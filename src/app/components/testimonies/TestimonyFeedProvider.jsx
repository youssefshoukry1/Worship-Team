'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { UserContext } from '../../context/User_Context';
import { getApiBaseUrl } from '../../utils/apiBase';
import { testimonyRequest } from './testimonyApi';
import { createTestimonyFeedStore } from './testimonyFeedStore';
import { createNoteReactorsStore } from './noteReactorsStore';

const FeedContext = createContext(null);
export const useTestimonyFeed = () => useContext(FeedContext);
export const useNoteReactorsStore = () => useContext(FeedContext)?.reactors;

function Session({ token, userId, children }) {
  const pathname = usePathname();
  const isFriendsPage = pathname?.replace(/\/+$/, '') === '/friends';
  const [store] = useState(() => createTestimonyFeedStore({ userId, request: (path, options) => testimonyRequest(token, path, options), storage: typeof window !== 'undefined' ? window.localStorage : null }));
  const [reactors] = useState(() => createNoteReactorsStore({ userId, request: (path, options) => testimonyRequest(token, path, options), storage: typeof window !== 'undefined' ? window.localStorage : null }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.activate();
    reactors.activate();
    let socket, stopped = false, connected = false, fallbackStarted = false;
    const initialSync = () => { if (!fallbackStarted) { fallbackStarted = true; void store.sync(); } };
    const bootstrap = setTimeout(initialSync, 1200);
    const change = event => {
      if (event.action === 'reaction') reactors.invalidate(event.id, event);
      if (event.action === 'deleted') reactors.remove(event.id);
      void store.changed(event);
      if (event.action === 'access') window.dispatchEvent(new CustomEvent('taspe7:friends-push', { detail: { notesHandled: true } }));
      window.dispatchEvent(new CustomEvent('taspe7:testimony-live', { detail: event }));
    };
    import('socket.io-client').then(({ io }) => {
      if (stopped) return;
      socket = io(`${getApiBaseUrl().replace(/\/api\/?$/, '')}/testimonies`, { transports: ['websocket'], auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 30000 });
      socket.on('notes-ready', () => { connected = true; clearTimeout(bootstrap); fallbackStarted = true; void store.sync(true); });
      socket.on('disconnect', () => { connected = false; });
      socket.on('connect_error', initialSync);
      socket.on('note-changed', change);
    }).catch(initialSync);
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      store.tick(); void store.sync();
      socket?.connect();
    };
    const restore = event => { if (event.persisted) resume(); };
    const friends = event => { if (!event.detail?.notesHandled && document.visibilityState === 'visible') void store.changed({ action: 'access' }); };
    const ownChange = () => { if (document.visibilityState === 'visible') void store.sync(true); };
    const reaction = event => {
      if (!connected && event.detail?.testimonyId && String(event.detail.authorId) === String(userId)) {
        reactors.invalidate(event.detail.testimonyId);
        void store.changed({ action: 'reaction', id: event.detail.testimonyId, authorId: userId });
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', restore);
    window.addEventListener('taspe7:friends-push', friends);
    window.addEventListener('taspe7:testimonies-changed', ownChange);
    window.addEventListener('taspe7:testimony-push', reaction);
    return () => {
      stopped = true; clearTimeout(bootstrap); socket?.disconnect();
      store.dispose();
      reactors.dispose();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('taspe7:friends-push', friends);
      window.removeEventListener('taspe7:testimonies-changed', ownChange);
      window.removeEventListener('taspe7:testimony-push', reaction);
    };
  }, [store, reactors, token, userId]);
  useEffect(() => {
    // Warm only the most recent own note, never every friend's list or archive.
    const ownNote = state.items.find(item => String(item.author?._id) === String(userId));
    if (ownNote) reactors.prime(ownNote);
  }, [reactors, state.items, userId]);
  useEffect(() => {
    const updateVisibility = () => store.setFeedVisible(isFriendsPage && document.visibilityState === 'visible');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      store.setFeedVisible(false);
    };
  }, [store, isFriendsPage]);
  return <FeedContext.Provider value={{ store, state, reactors }}>{children}</FeedContext.Provider>;
}

export default function TestimonyFeedProvider({ children }) {
  const { isLogin, user_id } = useContext(UserContext);
  return isLogin && user_id ? <Session key={`${user_id}:${isLogin}`} token={isLogin} userId={user_id}>{children}</Session> : <FeedContext.Provider value={null}>{children}</FeedContext.Provider>;
}
