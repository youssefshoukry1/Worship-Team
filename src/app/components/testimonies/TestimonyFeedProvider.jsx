'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { UserContext } from '../../context/User_Context';
import { getApiBaseUrl } from '../../utils/apiBase';
import { testimonyRequest } from './testimonyApi';
import { createTestimonyFeedStore } from './testimonyFeedStore';
import { createNoteReactorsStore } from './noteReactorsStore';
import { createProfileNotesStore } from './profileNotesStore';
import { feedNotesStorage } from './feedNotesStorage';
import { useFriendDirectorySession } from '../../utils/friendDirectory/useLocalFriends';
import { profileNotesStorage } from './profileNotesStorage';

const FeedContext = createContext(null);
const StoresContext = createContext(null);
export const useTestimonyFeed = (includeState = true) => useContext(includeState ? FeedContext : StoresContext);
export const useNoteReactorsStore = () => useContext(StoresContext)?.reactors;
export const useProfileNotesStore = () => useContext(StoresContext)?.profiles;

function Session({ token, userId, children }) {
  useFriendDirectorySession(token, userId);
  const pathname = usePathname();
  const isFriendsPage = pathname?.replace(/\/+$/, '') === '/friends';
  const [store] = useState(() => createTestimonyFeedStore({ userId, cache: feedNotesStorage(userId),
    request: (path, options) => testimonyRequest(token, path, options),
    sendSeen: (opened, signal, keepalive = false) => testimonyRequest(token, '/seen', { method: 'POST', body: JSON.stringify({ opened }), signal, keepalive }),
    storage: typeof window !== 'undefined' ? window.localStorage : null }));
  const [reactors] = useState(() => createNoteReactorsStore({ userId, request: (path, options) => testimonyRequest(token, path, options), storage: typeof window !== 'undefined' ? window.localStorage : null }));
  const [profiles] = useState(() => createProfileNotesStore({ userId, request: (path, options) => testimonyRequest(token, path, options), storage: profileNotesStorage(userId) }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.activate();
    reactors.activate();
    profiles.activate();
    let socket, stopped = false, connected = false, fallbackStarted = false;
    const initialSync = () => { if (!fallbackStarted) { fallbackStarted = true; void store.sync(); } };
    const bootstrap = setTimeout(initialSync, 1200);
    const change = event => {
      if (event.action === 'reaction') reactors.invalidate(event.id, event);
      if (event.action === 'deleted') reactors.remove(event.id);
      const update = store.changed(event);
      if (event.action === 'access') profiles.accessChanged();
      else void profiles.changed(event, update);
      if (event.action === 'access') window.dispatchEvent(new CustomEvent('taspe7:friends-push', { detail: { notesHandled: true, removedFriendId: event.removedFriendId } }));
      window.dispatchEvent(new CustomEvent('taspe7:testimony-live', { detail: event }));
    };
    import('socket.io-client').then(({ io }) => {
      if (stopped) return;
      socket = io(`${getApiBaseUrl().replace(/\/api\/?$/, '')}/testimonies`, { transports: ['websocket'], auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 30000 });
      socket.on('notes-ready', () => { window.dispatchEvent(new Event('taspe7:directory-resume')); connected = true; clearTimeout(bootstrap); fallbackStarted = true; void store.sync(true); profiles.resume(); });
      socket.on('disconnect', () => { connected = false; });
      socket.on('connect_error', initialSync);
      socket.on('note-changed', change);
    }).catch(initialSync);
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      store.tick(); void store.sync();
      profiles.resume();
      socket?.connect();
    };
    const restore = event => { if (event.persisted) resume(); };
    const friends = event => { if (!event.detail?.notesHandled && document.visibilityState === 'visible') { void store.changed({ action: 'access' }); profiles.accessChanged(); } };
    const ownChange = event => {
      if (event.detail?.action) void profiles.changed(event.detail, Promise.resolve(event.detail));
      else profiles.resume();
      if (document.visibilityState === 'visible') void store.sync(true);
    };
    const reaction = event => {
      if (!connected && event.detail?.testimonyId && String(event.detail.authorId) === String(userId)) {
        reactors.invalidate(event.detail.testimonyId);
        profiles.refresh(userId);
        void store.changed({ action: 'reaction', id: event.detail.testimonyId, authorId: userId });
      }
    };
    const logout = () => store.clear();
    window.addEventListener('taspe7:logout', logout);
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
      profiles.dispose();
      window.removeEventListener('taspe7:logout', logout);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('taspe7:friends-push', friends);
      window.removeEventListener('taspe7:testimonies-changed', ownChange);
      window.removeEventListener('taspe7:testimony-push', reaction);
    };
  }, [store, reactors, profiles, token, userId]);
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
  const stores = useMemo(() => ({ store, reactors, profiles }), [store, reactors, profiles]);
  return <StoresContext.Provider value={stores}><FeedContext.Provider value={{ ...stores, state }}>{children}</FeedContext.Provider></StoresContext.Provider>;
}

export default function TestimonyFeedProvider({ children }) {
  const { isLogin, user_id } = useContext(UserContext);
  const pathname = usePathname();
  const isDisplay = pathname?.replace(/\/(?:index\.html)?$/, '') === '/presentation/display';
  return isLogin && user_id && !isDisplay ? <Session key={`${user_id}:${isLogin}`} token={isLogin} userId={user_id}>{children}</Session> : <FeedContext.Provider value={null}>{children}</FeedContext.Provider>;
}
