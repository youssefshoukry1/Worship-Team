'use client';

import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Loader2, LockKeyhole, Plus, RefreshCw } from 'lucide-react';
import { UserContext } from '../../context/User_Context';
import TestimonyCard from './TestimonyCard';
import TestimonyComposer from './TestimonyComposer';
import TestimonyReader from './TestimonyReader';
import { NOTE_ACTIVE_MESSAGE, profileHref, testimonyRequest } from './testimonyApi';
import { showToast } from '../ToastContainer';
import styles from './testimonies.module.css';
import { useTestimonyFeed } from './TestimonyFeedProvider';

const EMPTY_PROFILE = { items: [], loading: false };

function Board({ token, userId, username, profileUserId, onProfileLoad, profileAccess, onLoadingChange }) {
  const isFeed = !profileUserId;
  const ownProfile = String(profileUserId) === String(userId);
  const shared = useTestimonyFeed();
  const feedStore = shared?.store;
  const isSharedFeed = isFeed && Boolean(feedStore);
  const profileStore = shared?.profiles;
  const subscribeProfile = useCallback(listener => profileUserId ? profileStore.subscribe(profileUserId, listener) : () => {}, [profileStore, profileUserId]);
  const profileSnapshot = useCallback(() => profileUserId ? profileStore.getSnapshot(profileUserId) : EMPTY_PROFILE, [profileStore, profileUserId]);
  const profile = useSyncExternalStore(subscribeProfile, profileSnapshot, profileSnapshot);
  const data = isSharedFeed ? shared.state : profile;
  const { loading, loadingMore, error } = data;
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [localNow, setNow] = useState(Date.now);
  const now = isSharedFeed ? shared.state.now : localNow;
  const opener = useRef(null);
  const notificationRequest = useRef(null);
  const load = useCallback((cursor = null) => {
    if (isSharedFeed) return cursor ? feedStore.loadMore() : feedStore.sync();
    return cursor ? profileStore.loadMore(profileUserId) : profileStore.ensure(profileUserId, { force: true });
  }, [isSharedFeed, feedStore, profileStore, profileUserId]);
  useEffect(() => {
    if (profileUserId) void profileStore.ensure(profileUserId);
  }, [profileStore, profileUserId]);
  useEffect(() => {
    if (!profileUserId) return;
    onLoadingChange?.(profile.checking);
    if (profile.ready) onProfileLoad?.(profile);
  }, [profile, profileUserId, onProfileLoad, onLoadingChange]);

  useEffect(() => {
    const received = event => {
      if (String(event.detail?.authorId) !== String(userId) || document.visibilityState !== 'visible') return;
      if (event.detail.title) setNotice(event.detail.title);
      if (isSharedFeed && !event.detail.testimonyId) load();
    };
    window.addEventListener('taspe7:testimony-push', received);
    return () => window.removeEventListener('taspe7:testimony-push', received);
  }, [load, userId, isSharedFeed]);

  useEffect(() => {
    if (!ownProfile) return;
    const openNote = async id => {
      if (!/^[a-f\d]{24}$/i.test(id || '')) return;
      notificationRequest.current?.abort();
      const controller = new AbortController();
      notificationRequest.current = controller;
      try {
        const cached = await profileStore.readCachedNote(profileUserId, id);
        if (controller.signal.aborted) return;
        if (cached) { opener.current = null; setModal({ type: 'read', id }); return; }
        const result = await testimonyRequest(token, `/own/${id}`, { signal: controller.signal });
        if (!controller.signal.aborted) { opener.current = null; setModal({ type: 'read', id, linkedItem: result.item }); }
      } catch (error) { if (!controller.signal.aborted) setNotice(error.message); }
    };
    openNote(new URLSearchParams(window.location.search).get('note'));
    const fromPush = event => {
      const id = new URL(event.detail?.href || '/', window.location.origin).searchParams.get('note');
      if (!/^[a-f\d]{24}$/i.test(id || '')) return;
      event.preventDefault(); openNote(id);
    };
    window.addEventListener('taspe7:open-testimony', fromPush);
    return () => { notificationRequest.current?.abort(); window.removeEventListener('taspe7:open-testimony', fromPush); };
  }, [ownProfile, token, profileStore, profileUserId]);

  useEffect(() => {
    if (isSharedFeed) return;
    // Wake once at the next expiry; expiry never needs a network request.
    const upcoming = [...(isFeed ? data.items.map(item => new Date(item.feedExpiresAt).getTime()) : []), new Date(data.publishing?.nextPublishAt).getTime()].filter(expiry => expiry > now);
    if (!upcoming.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...upcoming) - Date.now()) + 10);
    return () => clearTimeout(timer);
  }, [data.items, data.publishing, isFeed, now, isSharedFeed]);

  const publishing = data.publishing;
  const canPublish = !loading && !!publishing && (publishing.unlimited || publishing.canPublish || (publishing.nextPublishAt && new Date(publishing.nextPublishAt).getTime() <= now));
  const restricted = profileAccess === false || data.canViewTestimonies === false;
  const visibleItems = restricted ? [] : isFeed ? data.items.filter(item => new Date(item.feedExpiresAt).getTime() > now) : data.items;
  const reading = !restricted && modal?.type === 'read' ? data.items.find(item => item._id === modal.id) || modal.linkedItem : null;
  const author = data.user || { _id: userId, Name: username || 'You', username };
  const reactToNote = useCallback((id, reaction) => {
    feedStore?.updateReaction(id, reaction);
    profileStore?.updateReaction(id, reaction);
    setModal(previous => previous?.linkedItem?._id === id ? { ...previous, linkedItem: { ...previous.linkedItem, ...reaction } } : previous);
  }, [feedStore, profileStore]);
  const close = useCallback((saved = false) => {
    setModal(null);
    if (saved) setNotice('Shared with your friends.');
    requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); });
  }, []);
  const create = event => {
    if (!canPublish) {
      if (publishing?.canPublish === false) showToast({ message: NOTE_ACTIVE_MESSAGE, type: 'info' });
      return;
    }
    opener.current = event.currentTarget;
    opener.current.focus({ preventScroll: true });
    setNotice(''); setModal({ type: 'compose' });
  };

  return <>
    <section className={styles.board} aria-label={isFeed ? 'Friends testimony highlights' : 'Profile testimony highlights'}>
      <header className={styles.boardHeader}>
        <h2>{isFeed ? 'Friends’ testimonies' : ownProfile ? 'Your testimony highlights' : 'Testimony highlights'}</h2>
        <button type="button" className={styles.refreshNotes} disabled={loading || loadingMore} aria-label="Refresh testimonies" title="Refresh notes" onClick={() => load()}><RefreshCw size={12} className={loading || loadingMore ? styles.spin : undefined} /></button>
        {isFeed && <Link href={profileHref(userId)} className={styles.quietLink}>Your notes <ArrowUpRight size={12} /></Link>}
      </header>
      {restricted ? <div className={styles.lockedTestimonies}><LockKeyhole size={18} /><div><strong>Shared with friends</strong><p>Become friends to read each other’s testimonies.</p></div></div> : <div className={styles.noteRail} data-testid="testimony-cards">
        {(isFeed || ownProfile) && <div className={styles.miniCard}>
          <button type="button" className={styles.createNote} disabled={loading || !publishing} aria-disabled={!canPublish} onClick={create} aria-label="Share your testimony" title={canPublish ? 'Share your testimony' : publishing?.canPublish === false ? NOTE_ACTIVE_MESSAGE : 'Checking availability…'}><Plus size={24} strokeWidth={1.4} /><span className={styles.noteLines} aria-hidden="true" /></button>
          <span className={styles.createCaption}>{publishing?.canPublish === false && !canPublish ? 'Note active' : 'Share a note'}</span>
        </div>}
        {loading && !data.items.length ? <div className={styles.loadingNotes} aria-label="Loading testimonies" role="status"><span /><span /></div>
          : visibleItems.map((item, index) => <TestimonyCard key={item._id} item={item} index={index} onRead={(item, trigger) => {
            feedStore?.markSeen(item._id, item);
            opener.current = trigger;
            trigger.focus({ preventScroll: true });
            setModal({ type: 'read', id: item._id });
          }} />)}
        {!loading && !error && !visibleItems.length && !isFeed && !ownProfile && <p className={styles.emptyNotes}>No shared testimonies yet.</p>}
        {!error && data.nextCursor && <button type="button" className={styles.moreNotes} disabled={loading || loadingMore} onClick={() => load(data.nextCursor)}>{loadingMore ? <Loader2 size={17} className={styles.spin} /> : <Plus size={17} />}<span>More</span></button>}
      </div>}
      {notice && <p className={styles.successNotice} role="status">{notice}</p>}
      {error && <div className={styles.boardError} role="alert"><span>{error}</span><button type="button" className={styles.retryButton} aria-label="Try again" onClick={() => load()}><RefreshCw size={13} /></button></div>}
    </section>
    {modal?.type === 'compose' && <TestimonyComposer key={modal.editing?._id || 'new'} token={token} userId={userId} author={author} editing={modal.editing} onClose={close} />}
    {reading && <TestimonyReader key={reading._id} item={reading} userId={userId} token={token} onReaction={reactToNote} onClose={close} onEdit={item => setModal({ type: 'compose', editing: item })} />}
  </>;
}

export default function TestimonyBoard({ profileUserId, onProfileLoad, profileAccess, onLoadingChange }) {
  const { isLogin, user_id, username } = useContext(UserContext);
  if (!isLogin || !user_id) return null;
  return <Board key={`${user_id}:${isLogin}:${profileUserId || 'feed'}`} token={isLogin} userId={user_id} username={username} profileUserId={profileUserId} onProfileLoad={onProfileLoad} profileAccess={profileAccess} onLoadingChange={onLoadingChange} />;
}
