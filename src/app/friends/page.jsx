'use client';
import PageSkeleton from '../components/PageSkeleton';

import { useState, useEffect, useLayoutEffect, useContext, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  UserPlus,
  Check,
  X,
  Clock,
  UserMinus,
  Loader2,
  Inbox,
  Send
} from 'lucide-react';
import { UserContext } from '../context/User_Context';
import { useTabPageActive } from '../components/TabPageActivity';
import { getApiBaseUrl } from '../utils/apiBase';
import { showToast } from '../components/ToastContainer';
import OfflineAvatar from '../components/OfflineAvatar';
import FriendPhotoViewer from '../components/FriendPhotoViewer';
import { cacheAvatarsInBackground } from '../utils/avatarStorage';
import { clearFriendsInvalidation, getFriendsCacheKey, isFriendsCacheFresh, readFriendsCache, readFriendsInvalidation, writeFriendsCache } from '../utils/friendsCache';
import { readFriendNotificationTarget } from '../utils/friendNotificationNavigation';
import { invalidateTabRead, readTabJson, TAB_READ_FRESH_MS, tabReadKey } from '../utils/tabRequests';
import TestimonyBoard from '../components/testimonies/TestimonyBoard';
import { announceTestimonyChange, profileHref } from '../components/testimonies/testimonyApi';

const API_URL = getApiBaseUrl();

export default function FriendsPage() {
  const pageActive = useTabPageActive();
  const router = useRouter();
  const { isLogin, user_id } = useContext(UserContext);

  const [activeTab, setActiveTab] = useState('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFriendsSearch, setShowFriendsSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsRetry, setSuggestionsRetry] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const closePhoto = useCallback(() => setSelectedPhoto(null), []);

  const debounceTimerRef = useRef(null);
  const cacheReadyRef = useRef(false);
  const syncTimesRef = useRef({ friendsSyncedAt: 0, requestsSyncedAt: 0 });
  const friendsCacheKey = getFriendsCacheKey(user_id);
  const cacheLoadRef = useRef(null);
  const syncInFlightRef = useRef({ requests: null, friends: null });
  const syncAgainRef = useRef({ requests: false, friends: false });
  const actionVersionRef = useRef(0);
  const pendingActionsRef = useRef(0);
  const [notificationTarget, setNotificationTarget] = useState(null);
  const notificationScrolledRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch pending requests and friends list
  const loadData = useCallback(async (force = false) => {
    if (!isLogin) return;
    if (!cacheLoadRef.current) {
      cacheLoadRef.current = (async () => {
        try {
          const cached = await readFriendsCache(user_id);
          if (!mountedRef.current) return;
          if (cached) {
            setIncomingRequests(cached.incomingRequests || []);
            setOutgoingRequests(cached.outgoingRequests || []);
            setFriends(cached.friends || []);
            syncTimesRef.current = {
              friendsSyncedAt: cached.friendsSyncedAt || 0,
              requestsSyncedAt: cached.requestsSyncedAt || 0,
            };
          }
        } catch { /* Network refresh still runs if the local cache is unavailable. */ }
        cacheReadyRef.current = true;
        setLoading(false);
      })();
    }
    await cacheLoadRef.current;
    if (!mountedRef.current) return;
    const invalidation = readFriendsInvalidation(user_id);
    const refreshAll = force || Boolean(invalidation);
    // Deduplicate each endpoint separately so a stalled friends list cannot
    // block later pushes from refreshing incoming requests.
    const syncPart = (part, fetchAndApply) => {
      if (syncInFlightRef.current[part]) {
        if (refreshAll) syncAgainRef.current[part] = true;
        return syncInFlightRef.current[part];
      }
      const run = async () => {
        let success = false;
        do {
          syncAgainRef.current[part] = false;
          try { success = await fetchAndApply(); } catch { success = false; }
        } while (mountedRef.current && syncAgainRef.current[part]);
        return success;
      };
      syncInFlightRef.current[part] = run().finally(() => { syncInFlightRef.current[part] = null; });
      return syncInFlightRef.current[part];
    };
    const results = await Promise.allSettled([
      syncPart('requests', async () => {
        if (!refreshAll && isFriendsCacheFresh(syncTimesRef.current.requestsSyncedAt) && Date.now() - syncTimesRef.current.requestsSyncedAt < TAB_READ_FRESH_MS) return true;
        const version = actionVersionRef.current;
        const data = await readTabJson(`${API_URL}/users/friend-requests`, isLogin, { force: refreshAll });
        if (!mountedRef.current || version !== actionVersionRef.current || pendingActionsRef.current > 0) return false;
        syncTimesRef.current.requestsSyncedAt = Date.now();
        setIncomingRequests(data.incoming || []);
        setOutgoingRequests(data.outgoing || []);
        return true;
      }),
      syncPart('friends', async () => {
        if (!refreshAll && isFriendsCacheFresh(syncTimesRef.current.friendsSyncedAt) && Date.now() - syncTimesRef.current.friendsSyncedAt < TAB_READ_FRESH_MS) return true;
        const version = actionVersionRef.current;
        const data = await readTabJson(`${API_URL}/users/friends`, isLogin, { force: refreshAll });
        if (!mountedRef.current || version !== actionVersionRef.current || pendingActionsRef.current > 0) return false;
        syncTimesRef.current.friendsSyncedAt = Date.now();
        setFriends(data.friends || []);
        return true;
      }),
    ]);
    if (results.every(result => result.status === 'fulfilled' && result.value)) {
      clearFriendsInvalidation(user_id, invalidation);
    }
  }, [isLogin, user_id]);

  useLayoutEffect(() => {
    if (!pageActive) return;
    const open = (target) => {
      if (!target) return;
      notificationScrolledRef.current = false;
      setNotificationTarget(target);
      setActiveTab(target.tab);
      setSearchQuery('');
      setSelectedPhoto(null);
      setLoading(false);
    };
    open(readFriendNotificationTarget(window.location.search));
    const handleOpen = (event) => {
      const href = event.detail?.href;
      if (!href) return;
      const target = readFriendNotificationTarget(new URL(href, window.location.origin).search);
      if (!target) return;
      event.preventDefault();
      open(target);
      void loadData(true);
    };
    window.addEventListener('taspe7:open-friends', handleOpen);
    return () => window.removeEventListener('taspe7:open-friends', handleOpen);
  }, [loadData, pageActive]);

  useEffect(() => {
    // Rapid revisits reuse fresh data; notifications and returning to the page
    // fetch changes without periodically polling either endpoint.
    void loadData(Boolean(readFriendNotificationTarget(window.location.search)));
    const refresh = () => { if (pageActive) void loadData(true); };
    const whenVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const restore = event => { if (event.persisted) whenVisible(); };
    window.addEventListener('taspe7:friends-push', whenVisible);
    window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      window.removeEventListener('taspe7:friends-push', whenVisible);
      window.removeEventListener('pageshow', restore);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [loadData, pageActive]);

  useLayoutEffect(() => {
    if (!pageActive || !notificationTarget?.actorId || notificationScrolledRef.current || activeTab !== notificationTarget.tab) return;
    const row = Array.from(document.querySelectorAll('[data-friend-id]'))
      .find(element => element.dataset.friendId === notificationTarget.actorId);
    if (row) {
      notificationScrolledRef.current = true;
      row.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }, [pageActive, notificationTarget, activeTab, incomingRequests, friends, loading]);

  useEffect(() => {
    if (!cacheReadyRef.current || !user_id) return;
    writeFriendsCache(user_id, {
      incomingRequests,
      outgoingRequests,
      friends,
      friendsSyncedAt: syncTimesRef.current.friendsSyncedAt,
      requestsSyncedAt: syncTimesRef.current.requestsSyncedAt,
      updatedAt: Date.now(),
    }).catch((error) => console.warn('Failed to cache friends data:', error));
  }, [friends, incomingRequests, outgoingRequests, friendsCacheKey, user_id]);

  useEffect(() => {
    const users = [
      ...friends,
      ...incomingRequests.map((request) => request.from).filter(Boolean),
      ...outgoingRequests.map((request) => request.to).filter(Boolean),
    ];
    cacheAvatarsInBackground(users);
  }, [friends, incomingRequests, outgoingRequests]);

  useEffect(() => {
    if (!pageActive || !isLogin) return;
    const controller = new AbortController();
    fetch(`${API_URL}/users/friend-suggestions`, { headers: { Authorization: `Bearer ${isLogin}` }, signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Suggestions unavailable'); return response.json(); })
      .then(data => { if (!controller.signal.aborted) { setSuggestions(data.suggestions || []); setSuggestionsError(false); } })
      .catch(() => { if (!controller.signal.aborted) setSuggestionsError(true); })
      .finally(() => { if (!controller.signal.aborted) setSuggestionsLoading(false); });
    return () => controller.abort();
  }, [pageActive, isLogin, suggestionsRetry]);

  // Debounced search for users by username
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const cleanQuery = searchQuery.trim().replace(/^@/, '');
    if (cleanQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const controller = new AbortController();
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/users/search-username?q=${encodeURIComponent(cleanQuery)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) setSearchResults(data || []);
        }
      } catch {
        if (!controller.signal.aborted) setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => { clearTimeout(debounceTimerRef.current); controller.abort(); };
  }, [searchQuery]);

  // Helper status checker for a target user
  const getUserStatus = (targetId) => {
    if (targetId === user_id) return 'self';
    if (friends.some((f) => (f._id || f) === targetId)) return 'friend';
    if (outgoingRequests.some((r) => (r.to?._id || r.to) === targetId)) return 'requested';
    if (incomingRequests.some((r) => (r.from?._id || r.from) === targetId)) return 'incoming';
    return 'none';
  };

  // Send friend request
  const beginAction = () => {
    invalidateTabRead(tabReadKey(`${API_URL}/users/friend-requests`, isLogin));
    invalidateTabRead(tabReadKey(`${API_URL}/users/friends`, isLogin));
    actionVersionRef.current++;
    pendingActionsRef.current++;
  };
  const finishAction = () => {
    invalidateTabRead(tabReadKey(`${API_URL}/users/friend-requests`, isLogin));
    invalidateTabRead(tabReadKey(`${API_URL}/users/friends`, isLogin));
    actionVersionRef.current++;
    pendingActionsRef.current--;
    setSuggestionsRetry(value => value + 1);
    void loadData(true);
    announceTestimonyChange();
  };

  const handleSendRequest = async (targetUser) => {
    beginAction();
    const targetId = targetUser._id;
    setActionLoading((prev) => ({ ...prev, [targetId]: true }));

    // Optimistic update
    setOutgoingRequests((prev) => [...prev, { to: targetUser, createdAt: new Date() }]);

    try {
      const res = await fetch(`${API_URL}/users/friend-request/${targetId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.msg || 'Request failed');
      }

      if (data.status === 'accepted') {
        setOutgoingRequests((prev) => prev.filter((r) => (r.to?._id || r.to) !== targetId));
        setIncomingRequests((prev) => prev.filter((r) => (r.from?._id || r.from) !== targetId));
        setFriends((prev) => [...prev, targetUser]);
        showToast({ message: `You are now friends with @${targetUser.username}`, type: 'success' });
      } else {
        showToast({ message: `Request sent to @${targetUser.username}`, type: 'success' });
      }
    } catch (err) {
      setOutgoingRequests((prev) => prev.filter((r) => (r.to?._id || r.to) !== targetId));
      showToast({ message: err.message, type: 'error' });
    } finally {
      finishAction();
      setActionLoading((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  // Cancel friend request (sender unsend or receiver dismiss)
  const handleCancelRequest = async (targetId) => {
    beginAction();
    setActionLoading((prev) => ({ ...prev, [targetId]: true }));

    // Optimistic removal
    const prevIncoming = [...incomingRequests];
    const prevOutgoing = [...outgoingRequests];
    setIncomingRequests((prev) => prev.filter((r) => (r.from?._id || r.from) !== targetId));
    setOutgoingRequests((prev) => prev.filter((r) => (r.to?._id || r.to) !== targetId));

    try {
      const res = await fetch(`${API_URL}/users/friend-request/cancel/${targetId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.msg || 'Cancel failed');
      }
      showToast({ message: 'Request cancelled', type: 'info' });
    } catch (err) {
      setIncomingRequests(prevIncoming);
      setOutgoingRequests(prevOutgoing);
      showToast({ message: err.message, type: 'error' });
    } finally {
      finishAction();
      setActionLoading((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  // Accept incoming friend request
  const handleAcceptRequest = async (targetUser) => {
    beginAction();
    const targetId = targetUser._id;
    setActionLoading((prev) => ({ ...prev, [targetId]: true }));

    // Optimistic update
    const prevIncoming = [...incomingRequests];
    setIncomingRequests((prev) => prev.filter((r) => (r.from?._id || r.from) !== targetId));
    setFriends((prev) => [...prev, targetUser]);

    try {
      const res = await fetch(`${API_URL}/users/friend-request/accept/${targetId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.msg || 'Accept failed');
      }
      showToast({ message: `Accepted @${targetUser.username}'s request!`, type: 'success' });
    } catch (err) {
      setIncomingRequests(prevIncoming);
      setFriends((prev) => prev.filter((f) => (f._id || f) !== targetId));
      showToast({ message: err.message, type: 'error' });
    } finally {
      finishAction();
      setActionLoading((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  // Remove friend
  const handleRemoveFriend = async (targetId, username) => {
    beginAction();
    setActionLoading((prev) => ({ ...prev, [targetId]: true }));

    const prevFriends = [...friends];
    setFriends((prev) => prev.filter((f) => (f._id || f) !== targetId));

    try {
      const res = await fetch(`${API_URL}/users/friends/${targetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.msg || 'Remove failed');
      }
      showToast({ message: `Removed @${username} from friends`, type: 'info' });
      announceTestimonyChange();
    } catch (err) {
      setFriends(prevFriends);
      showToast({ message: err.message, type: 'error' });
    } finally {
      finishAction();
      setActionLoading((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  return (
    <div className="app-page min-h-screen text-slate-100 pb-28 pt-4 px-4 sm:px-6 max-w-2xl mx-auto transition-colors duration-150">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 mb-6 relative z-30">
        <h1 className={`${showFriendsSearch ? 'hidden sm:block' : ''} text-lg sm:text-xl font-bold tracking-tight text-white`}>Friends activity</h1>
        <div className="flex items-center justify-end gap-2 sm:gap-3 h-10 flex-1 min-w-0">
          {showFriendsSearch && (
      <div className="relative h-10 flex-1 min-w-0 max-w-[260px] search-fade-in">
        <div className="relative h-10 flex items-center">
          <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-full backdrop-blur-md shadow-inner" />
          <input
            type="text"
            autoFocus
            aria-label="Search friends by username"
            onKeyDown={event => { if (event.key === 'Escape') { setShowFriendsSearch(false); setSearchQuery(''); } }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by @username..."
            className="w-full h-full pl-4 pr-8 py-2 bg-transparent text-sm text-white placeholder-gray-400/70 outline-none relative z-10 font-light tracking-wide"
          />
          {isSearching ? (
            <Loader2 className="absolute z-20 right-3.5 w-4 h-4 text-[#00C2FF] animate-spin" />
          ) : searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute z-20 right-3.5 p-0.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>

        {/* Live Search Results Dropdown / Panel */}
        {searchQuery.trim().length >= 2 && (
          <div className="absolute top-full right-0 mt-2 w-[min(360px,calc(100vw-32px))] max-h-[60dvh] overflow-y-auto p-2 rounded-2xl bg-app-panel/95 border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/50 space-y-1.5">
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Search Results
            </div>
            {searchResults.length === 0 && !isSearching ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No users found matching &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              searchResults.map((user) => {
                const status = getUserStatus(user._id);
                const isLoading = actionLoading[user._id];

                return (
                  <div
                    key={user._id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <OfflineAvatar
                        userKey={user._id || user.username}
                        remoteUrl={user.profilePhoto}
                        name={user.Name}
                        className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-500/30 to-blue-600/30 border border-sky-400/20 flex items-center justify-center font-bold text-xs text-sky-300 uppercase shrink-0 overflow-hidden"
                      />
                      <button type="button" onClick={() => router.push(profileHref(user._id))} className="min-w-0 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-sky-400" aria-label={`Open ${user.Name || 'user'} profile`}>
                        <div className="text-xs sm:text-sm font-semibold text-white truncate">
                          {user.Name}
                        </div>
                        <div className="text-[11px] text-[#00C2FF] truncate">
                          @{user.username || 'user'}
                        </div>
                      </button>
                    </div>

                    <div className="shrink-0">
                      {status === 'self' ? (
                        <span className="text-[11px] text-slate-500 font-medium px-2 py-1">You</span>
                      ) : status === 'friend' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-medium">
                          <Check className="w-3 h-3" /> Friends
                        </span>
                      ) : status === 'requested' ? (
                        <button
                          onClick={() => handleCancelRequest(user._id)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg font-medium transition-colors"
                        >
                          <Clock className="w-3 h-3" /> Cancel
                        </button>
                      ) : status === 'incoming' ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAcceptRequest(user)}
                            disabled={isLoading}
                            className="text-[11px] bg-[#00C2FF] text-[#020817] font-semibold px-2.5 py-1 rounded-lg hover:brightness-110 transition-all"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleCancelRequest(user._id)}
                            disabled={isLoading}
                            className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSendRequest(user)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1 text-[11px] bg-[#00C2FF]/15 border border-[#00C2FF]/30 text-[#00C2FF] hover:bg-[#00C2FF] hover:text-[#020817] px-2.5 py-1 rounded-lg font-medium transition-all"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>)}
          <button type="button" onClick={() => { setShowFriendsSearch(previous => !previous); setSearchQuery(''); }}
            aria-label={showFriendsSearch ? 'Close search' : 'Search friends'} aria-expanded={showFriendsSearch}
            className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all duration-300 border backdrop-blur-xl relative overflow-hidden group shadow-lg z-30 ${showFriendsSearch
              ? 'bg-red-500/10 border-red-500/20 text-red-400 rotate-90 scale-90'
              : 'bg-white/5 border-white/20 text-sky-200 hover:bg-white/10 hover:text-white hover:border-sky-400/30 hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]'}`}>
            {showFriendsSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <TestimonyBoard />

      <div className="max-w-2xl mx-auto mt-4">
      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('requests')}
          className={`relative pb-3 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'requests' ? 'text-[#00C2FF]' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Requests</span>
          {incomingRequests.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00C2FF] text-[#020817]">
              {incomingRequests.length}
            </span>
          )}
          {activeTab === 'requests' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C2FF] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('friends')}
          className={`relative pb-3 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'friends' ? 'text-[#00C2FF]' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>My Friends</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-300">
            {friends.length}
          </span>
          {activeTab === 'friends' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C2FF] rounded-full" />
          )}
        </button>
        <button type="button" onClick={() => setActiveTab('sent')}
          className={`relative pb-3 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'sent' ? 'text-[#00C2FF]' : 'text-slate-400 hover:text-slate-200'}`}>
          <span>Sent</span>{outgoingRequests.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-slate-300">{outgoingRequests.length}</span>}
          {activeTab === 'sent' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C2FF] rounded-full" />}
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <PageSkeleton variant="friends" compact />
      ) : activeTab === 'requests' ? (
        <div className="space-y-6">
          {/* Incoming Requests */}
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Inbox className="w-4 h-4 text-[#00C2FF]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Incoming Requests ({incomingRequests.length})
              </h2>
            </div>

            {incomingRequests.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-400">
                No pending incoming requests
              </div>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => {
                  const sender = req.from || {};
                  const isLoading = actionLoading[sender._id];

                  return (
                    <div
                      key={req._id || sender._id}
                      data-friend-id={String(sender._id)}
                      className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <OfflineAvatar
                          userKey={sender._id || sender.username}
                          remoteUrl={sender.profilePhoto}
                          name={sender.Name}
                          className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500/20 to-blue-600/30 border border-sky-400/20 flex items-center justify-center font-bold text-sm text-sky-300 shrink-0 overflow-hidden"
                        />
                        <button type="button" onClick={() => router.push(profileHref(sender._id))} className="min-w-0 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-sky-400" aria-label={`Open ${sender.Name || 'user'} profile`}>
                          <div className="text-xs sm:text-sm font-semibold text-white truncate">
                            {sender.Name}
                          </div>
                          <div className="text-[11px] text-[#00C2FF] truncate">
                            @{sender.username || 'user'}
                          </div>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleAcceptRequest(sender)}
                          disabled={isLoading}
                          className="px-3 py-1.5 text-xs font-semibold bg-[#00C2FF] text-[#020817] rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleCancelRequest(sender._id)}
                          disabled={isLoading}
                          className="px-3 py-1.5 text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <section aria-label="Suggested friends">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-1">Suggested friends</h2>
            {suggestionsLoading ? <div role="status" className="p-6 text-center text-xs text-slate-400">Finding people...</div>
              : suggestionsError ? <div className="p-6 text-center text-xs text-slate-400">Could not load suggestions. <button type="button" className="text-sky-400" onClick={() => { setSuggestionsLoading(true); setSuggestionsRetry(value => value + 1); }}>Retry</button></div>
              : suggestions.filter(user => getUserStatus(user._id) === 'none').length === 0 ? <p className="p-6 rounded-2xl bg-white/[0.02] text-center text-xs text-slate-400">No mutual-friend suggestions yet. Use search to find people you know.</p>
              : <div className="space-y-2">{suggestions.filter(user => getUserStatus(user._id) === 'none').map(user => (
                <div key={user._id} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                  <button type="button" onClick={() => router.push(profileHref(user._id))} className="flex items-center gap-3 min-w-0 text-left" aria-label={`Open ${user.Name || user.username} profile`}>
                    <OfflineAvatar userKey={user._id || user.username} remoteUrl={user.profilePhoto} name={user.Name} className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-white/5 flex items-center justify-center text-sky-300" />
                    <span className="min-w-0"><span className="block truncate text-xs sm:text-sm font-semibold text-white">{user.Name || user.username}</span><span className="block truncate text-[11px] text-slate-400">@{user.username}</span><span className="block mt-1 text-[11px] text-sky-300/80">{user.mutualFriendCount} mutual {user.mutualFriendCount === 1 ? 'friend' : 'friends'}</span></span>
                  </button>
                  <button type="button" disabled={actionLoading[user._id]} onClick={() => handleSendRequest(user)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 text-sky-300 text-xs font-semibold disabled:opacity-50"><UserPlus className="w-3.5 h-3.5" />Add</button>
                </div>
              ))}</div>}
          </section>
        </div>
      ) : activeTab === 'sent' ? (
        <div>          {/* Outgoing Requests */}
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Send className="w-4 h-4 text-slate-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Sent Requests ({outgoingRequests.length})
              </h2>
            </div>

            {outgoingRequests.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-400">
                No pending sent requests
              </div>
            ) : (
              <div className="space-y-2">
                {outgoingRequests.map((req) => {
                  const target = req.to || {};
                  const isLoading = actionLoading[target._id];

                  return (
                    <div
                      key={req._id || target._id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <OfflineAvatar
                          userKey={target._id || target.username}
                          remoteUrl={target.profilePhoto}
                          name={target.Name}
                          className="w-10 h-10 rounded-full bg-app-raised border border-white/10 flex items-center justify-center font-bold text-sm text-slate-300 shrink-0 overflow-hidden"
                        />
                        <button type="button" onClick={() => router.push(profileHref(target._id))} className="min-w-0 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-sky-400" aria-label={`Open ${target.Name || 'user'} profile`}>
                          <div className="text-xs sm:text-sm font-semibold text-white truncate">
                            {target.Name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            @{target.username || 'user'}
                          </div>
                        </button>
                      </div>

                      <button
                        onClick={() => handleCancelRequest(target._id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        Cancel Request
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div></div>
      ) : (
        /* My Friends Tab */
        <div>
          {friends.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-sm font-semibold text-white">No friends yet</div>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Search for someone using their @username above to send a friend request!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((friend) => {
                const isLoading = actionLoading[friend._id];

                return (
                  <div
                    key={friend._id}
                    data-friend-id={String(friend._id)}
                    className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      <button
                        type="button"
                        disabled={!friend.profilePhoto}
                        aria-label={`View ${friend.Name || 'friend'} profile picture`}
                        className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[#00C2FF]"
                        onClick={(event) => {
                          const image = event.currentTarget.querySelector('img');
                          if (!image?.complete || !image.naturalWidth) return;
                          // Reuse the already loaded (and potentially offline) avatar.
                          setSelectedPhoto({ name: friend.Name, src: image.currentSrc || image.src, fullScreen: false });
                        }}
                      >
                        <OfflineAvatar
                          userKey={friend._id || friend.username}
                          remoteUrl={friend.profilePhoto}
                          name={friend.Name}
                          className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#00C2FF]/20 to-blue-600/30 border border-[#00C2FF]/30 flex items-center justify-center font-bold text-sm text-[#00C2FF] shrink-0 overflow-hidden"
                        />
                      </button>
                      <button type="button" onClick={() => router.push(profileHref(friend._id))} className="min-w-0 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-sky-400" aria-label={`Open ${friend.Name || 'friend'} profile`}>
                        <div className="text-xs sm:text-sm font-semibold text-white truncate hover:text-sky-300 transition-colors">
                          {friend.Name}
                        </div>
                        <div className="text-[11px] text-[#00C2FF] truncate">
                          @{friend.username || 'user'}
                        </div>
                      </button>
                    </div>

                    <button
                      onClick={() => handleRemoveFriend(friend._id, friend.username)}
                      disabled={isLoading}
                      className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-50"
                      title="Remove Friend"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>
      <FriendPhotoViewer
        photo={selectedPhoto}
        onClose={closePhoto}
        onExpand={() => setSelectedPhoto((photo) => photo ? { ...photo, fullScreen: true } : null)}
      />
    </div>
  );
}
