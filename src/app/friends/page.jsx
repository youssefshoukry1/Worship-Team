'use client';
// Before changing Friends notes, read ./README.md for cache and lifecycle rules.
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
  Loader2
} from 'lucide-react';
import { UserContext } from '../context/User_Context';
import { useTabPageActive } from '../components/TabPageActivity';
import { getApiBaseUrl } from '../utils/apiBase';
import { showToast } from '../components/ToastContainer';
import OfflineAvatar from '../components/OfflineAvatar';
import FriendPhotoViewer from '../components/FriendPhotoViewer';
import { cacheAvatarsInBackground } from '../utils/avatarStorage';
import usePeoplePage, { beginPeopleMutation, endPeopleMutation } from '../utils/usePeoplePage';
import useLocalFriends from '../utils/friendDirectory/useLocalFriends';
import { changeFriendship } from '../utils/friendshipActions';
import FriendDirectoryStatus from '../components/FriendDirectoryStatus';
import PeoplePager from '../components/PeoplePager';
import { readFriendNotificationTarget } from '../utils/friendNotificationNavigation';

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
  const [searchTerm, setSearchTerm] = useState('');
  const incomingPage = usePeoplePage('friend-requests?kind=incoming', isLogin, user_id, pageActive && activeTab === 'requests');
  const outgoingPage = usePeoplePage('friend-requests?kind=outgoing', isLogin, user_id, pageActive && activeTab === 'sent');
  const friendsPage = useLocalFriends(isLogin, user_id, activeTab === 'friends' ? searchQuery : '', pageActive);
  const suggestedPage = usePeoplePage('friend-suggestions', isLogin, user_id, pageActive && activeTab === 'requests');
  const searchPage = usePeoplePage(`people-search?q=${encodeURIComponent(searchTerm)}`, isLogin, user_id, pageActive && activeTab !== 'friends' && searchTerm.length >= 2, false);
  const { items: incomingRequests, setItems: setIncomingRequests } = incomingPage;
  const { items: outgoingRequests, setItems: setOutgoingRequests } = outgoingPage;
  const { items: friends, setItems: setFriends, reveal: revealFriend } = friendsPage;
  const suggestions = suggestedPage.items, suggestionsLoading = suggestedPage.loading && !suggestedPage.ready;
  const searchResults = searchTerm === searchQuery.trim().replace(/^@/, '') ? searchPage.items : [];
  const isSearching = searchPage.loading;
  const currentPage = activeTab === 'requests' ? incomingPage : activeTab === 'sent' ? outgoingPage : friendsPage;
  const loading = !currentPage.ready && !currentPage.error;
  const [totals, setTotals] = useState({});
  const incomingTotal = totals.incoming ?? incomingPage.total ?? 0;
  const outgoingTotal = totals.outgoing ?? outgoingPage.total ?? 0;
  const friendsTotal = friendsPage.complete ? friendsPage.total : (friendsPage.knownTotal || totals.friends || 0);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const closePhoto = useCallback(() => setSelectedPhoto(null), []);

  const [notificationTarget, setNotificationTarget] = useState(null);
  const notificationScrolledRef = useRef(false);
  const refreshSummary = useCallback(async (signal) => {
    try {
      const response = await fetch(`${API_URL}/users/friends-summary`, { signal, headers: { Authorization: `Bearer ${isLogin}` }, cache: 'no-store' });
      if (response.ok) { const result = await response.json(); if (!signal?.aborted) setTotals(result); }
    } catch { /* Keep previous totals while offline. */ }
  }, [isLogin]);
  useEffect(() => {
    if (!pageActive || !isLogin) return;
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === 'visible') void refreshSummary(controller.signal); };
    refresh();
    window.addEventListener('taspe7:friends-push', refresh);
    window.addEventListener('online', refresh);
    return () => { controller.abort(); window.removeEventListener('taspe7:friends-push', refresh); window.removeEventListener('online', refresh); };
  }, [pageActive, isLogin, refreshSummary]);
  useLayoutEffect(() => {
    if (!pageActive) return;
    const open = (target) => {
      if (!target) return;
      notificationScrolledRef.current = false;
      setNotificationTarget(target);
      setActiveTab(target.tab);
      setSearchQuery('');
      setSelectedPhoto(null);

    };
    open(readFriendNotificationTarget(window.location.search));
    const handleOpen = (event) => {
      const href = event.detail?.href;
      if (!href) return;
      const target = readFriendNotificationTarget(new URL(href, window.location.origin).search);
      if (!target) return;
      event.preventDefault();
      open(target);
      window.dispatchEvent(new CustomEvent('taspe7:friends-push', { detail: { notesHandled: true } }));
    };
    window.addEventListener('taspe7:open-friends', handleOpen);
    return () => window.removeEventListener('taspe7:open-friends', handleOpen);
  }, [pageActive]);

  useLayoutEffect(() => {
    if (!pageActive || !notificationTarget?.actorId || notificationScrolledRef.current || activeTab !== notificationTarget.tab) return;
    const row = Array.from(document.querySelectorAll('[data-friend-id]'))
      .find(element => element.dataset.friendId === notificationTarget.actorId);
    if (row) {
      notificationScrolledRef.current = true;
      row.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }, [pageActive, notificationTarget, activeTab, incomingRequests, friends, loading]);

  // Notification targets can be outside the downloaded pages. Fetch just that row.
  useEffect(() => {
    const target = notificationTarget?.actorId;
    if (!pageActive || !target || currentPage.loading || !currentPage.ready || notificationScrolledRef.current) return;
    const isFriends = notificationTarget.tab === 'friends';
    const rows = isFriends ? friends : incomingRequests;
    if (rows.some(row => String(isFriends ? row._id : row.from?._id) === target)) return;
    if (isFriends && revealFriend(target)) return;
    const controller = new AbortController();
    const path = isFriends ? 'friends' : 'friend-requests?kind=incoming';
    fetch(`${API_URL}/users/${path}${path.includes('?') ? '&' : '?'}target=${target}`, { signal: controller.signal, headers: { Authorization: `Bearer ${isLogin}` } })
      .then(response => response.ok ? response.json() : null).then(result => {
        if (!controller.signal.aborted && result?.items?.length) {
          const update = isFriends ? setFriends : setIncomingRequests;
          update(previous => [...previous, ...result.items.filter(item => !previous.some(old => old._id === item._id))]);
        }
      }).catch(() => {});
    return () => controller.abort();
  }, [pageActive, notificationTarget, currentPage.loading, currentPage.ready, friends, incomingRequests, isLogin, setFriends, setIncomingRequests, revealFriend]);

  useEffect(() => {
    cacheAvatarsInBackground([...friends, ...incomingRequests.map(request => request.from), ...outgoingRequests.map(request => request.to)].filter(Boolean));
  }, [friends, incomingRequests, outgoingRequests]);
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchQuery.trim().replace(/^@/, '')), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Helper status checker for a target user
  const getUserStatus = (targetId) => {
    if (targetId === user_id) return 'self';
    const known = searchResults.find(person => person._id === targetId);
    if (known?.relationship && !actionLoading[targetId]) return ({ friends: 'friend', outgoing: 'requested' })[known.relationship] || known.relationship;
    if (friends.some((f) => (f._id || f) === targetId)) return 'friend';
    if (outgoingRequests.some((r) => (r.to?._id || r.to) === targetId)) return 'requested';
    if (incomingRequests.some((r) => (r.from?._id || r.from) === targetId)) return 'incoming';
    const person = searchResults.find(person => person._id === targetId) || suggestions.find(person => person._id === targetId);
    return ({ friends: 'friend', outgoing: 'requested' })[person?.relationship] || person?.relationship || 'none';
  };

  // Send friend request
  const beginAction = () => beginPeopleMutation(isLogin);
  const finishAction = () => {
    endPeopleMutation(isLogin);
    window.dispatchEvent(new CustomEvent('taspe7:friends-push', { detail: { notesHandled: true } }));
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

    try {
      await changeFriendship(isLogin, targetId, 'remove');
      showToast({ message: `Removed @${username} from friends`, type: 'info' });
      announceTestimonyChange();
    } catch (err) {
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
        {activeTab !== 'friends' && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full right-0 mt-2 w-[min(360px,calc(100vw-32px))] max-h-[60dvh] overflow-y-auto p-2 rounded-2xl bg-app-panel/95 border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/50 space-y-1.5">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400">
              Search Results
            </div>
            {searchResults.length === 0 && !isSearching && !searchPage.error ? (
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
            <PeoplePager page={searchPage} active={pageActive && searchTerm.length >= 2} />
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
          {incomingTotal > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00C2FF] text-[#020817]">
              {incomingTotal}
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
          {activeTab === 'friends' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00C2FF] rounded-full" />
          )}
        </button>
        <button type="button" onClick={() => setActiveTab('sent')}
          className={`relative pb-3 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 ${activeTab === 'sent' ? 'text-[#00C2FF]' : 'text-slate-400 hover:text-slate-200'}`}>
          <span>Sent</span>{outgoingTotal > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-slate-300">{outgoingTotal}</span>}
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
              <h2 className="text-xs font-semibold text-slate-400">
                Incoming requests ({incomingTotal})
              </h2>
            </div>

            {incomingRequests.length === 0 && !incomingPage.error ? (
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

          <PeoplePager page={incomingPage} active={pageActive} />
          <section aria-label="Suggested friends">
            <h2 className="text-xs font-semibold text-slate-400 mb-3 px-1">Suggested friends</h2>
            {suggestionsLoading ? <div role="status" className="p-6 text-center text-xs text-slate-400">Finding people...</div>
              : suggestions.filter(user => getUserStatus(user._id) === 'none').length === 0 && !suggestedPage.error ? <p className="p-6 rounded-2xl bg-white/[0.02] text-center text-xs text-slate-400">No mutual-friend suggestions yet. Use search to find people you know.</p>
              : <div className="space-y-2">{suggestions.filter(user => getUserStatus(user._id) === 'none').map(user => (
                <div key={user._id} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                  <button type="button" onClick={() => router.push(profileHref(user._id))} className="flex items-center gap-3 min-w-0 text-left" aria-label={`Open ${user.Name || user.username} profile`}>
                    <OfflineAvatar userKey={user._id || user.username} remoteUrl={user.profilePhoto} name={user.Name} className="w-10 h-10 shrink-0 rounded-full overflow-hidden bg-white/5 flex items-center justify-center text-sky-300" />
                    <span className="min-w-0"><span className="block truncate text-xs sm:text-sm font-semibold text-white">{user.Name || user.username}</span><span className="block truncate text-[11px] text-slate-400">@{user.username}</span><span className="block mt-1 text-[11px] text-sky-300/80">{user.mutualFriendCount} mutual {user.mutualFriendCount === 1 ? 'friend' : 'friends'}</span></span>
                  </button>
                  <button type="button" disabled={actionLoading[user._id]} onClick={() => handleSendRequest(user)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 text-sky-300 text-xs font-semibold disabled:opacity-50"><UserPlus className="w-3.5 h-3.5" />Add</button>
                </div>
              ))}</div>}
            <PeoplePager page={suggestedPage} active={pageActive} />
          </section>
        </div>
      ) : activeTab === 'sent' ? (
        <div>          {/* Outgoing Requests */}
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <h2 className="text-xs font-semibold text-slate-400">
                Sent requests ({outgoingTotal})
              </h2>
            </div>

            {outgoingRequests.length === 0 && !outgoingPage.error ? (
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
          </div><PeoplePager page={outgoingPage} active={pageActive} /></div>
      ) : (
        /* My Friends Tab */
        <div>
          <p className="mb-3 px-1 text-xs text-slate-400">{friendsTotal} {friendsTotal === 1 ? 'friend' : 'friends'}</p>
          <FriendDirectoryStatus page={friendsPage} />
          {friends.length === 0 && !friendsPage.error ? (
            <div className="p-10 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-sm font-semibold text-white">{searchQuery ? 'No matching friends' : friendsPage.complete ? 'No friends yet' : 'No saved friends yet'}</div>
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
          <PeoplePager page={friendsPage} active={pageActive} />
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
