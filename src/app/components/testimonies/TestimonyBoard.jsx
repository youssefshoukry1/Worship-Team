'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Loader2, LockKeyhole, Plus, RefreshCw } from 'lucide-react';
import { UserContext } from '../../context/User_Context';
import TestimonyCard from './TestimonyCard';
import TestimonyComposer from './TestimonyComposer';
import TestimonyReader from './TestimonyReader';
import { profileHref, testimonyRequest } from './testimonyApi';
import styles from './testimonies.module.css';

function Board({ token, userId, username, profileUserId, onProfileLoad, initialProfile, profileAccess, onLoadingChange }) {
  const isFeed = !profileUserId;
  const ownProfile = String(profileUserId) === String(userId);
  const [data, setData] = useState(() => initialProfile || { items: [], user: null, nextCursor: null });
  const [loading, setLoading] = useState(!initialProfile);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [now, setNow] = useState(Date.now);
  const pending = useRef(null);
  const version = useRef(0);
  const opener = useRef(null);
  const seededProfile = useRef(initialProfile);
  const path = isFeed ? '' : `/profile/${encodeURIComponent(profileUserId)}`;
  const load = useCallback(async (cursor = null) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const revision = ++version.current;
    onLoadingChange?.(true);
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const result = await testimonyRequest(token, `${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal });
      if (revision !== version.current || controller.signal.aborted) return;
      if (profileUserId) onProfileLoad?.(result);
      setData(previous => ({ ...result, items: result.canViewTestimonies === false ? [] : cursor
        ? [...previous.items, ...(result.items || []).filter(item => !previous.items.some(old => old._id === item._id))]
        : result.items || [] }));
      setNow(Date.now());
    } catch (error) {
      if (revision !== version.current || controller.signal.aborted) return;
      setError(error.message);
      // Shared content is never persisted offline; a failed access check clears the visible collection.
      setData({ items: [], user: null, nextCursor: null });
      setModal(null);
      onProfileLoad?.(null, error);
    } finally {
      if (revision === version.current && !controller.signal.aborted) { setLoading(false); setLoadingMore(false); onLoadingChange?.(false); }
    }
  }, [token, path, profileUserId, onProfileLoad, onLoadingChange]);

  useEffect(() => {
    if (!seededProfile.current) load();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      load();
    };
    const restore = event => { if (event.persisted) refresh(); };
    window.addEventListener('taspe7:testimonies-changed', refresh);
    window.addEventListener('taspe7:friends-push', refresh);
    window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      pending.current?.abort();
      window.removeEventListener('taspe7:testimonies-changed', refresh);
      window.removeEventListener('taspe7:friends-push', refresh);
      window.removeEventListener('pageshow', restore);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  useEffect(() => {
    // Wake once at the next expiry; expiry never needs a network request.
    const upcoming = [...(isFeed ? data.items.map(item => new Date(item.feedExpiresAt).getTime()) : []), new Date(data.publishing?.nextPublishAt).getTime()].filter(expiry => expiry > now);
    if (!upcoming.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...upcoming) - Date.now()) + 10);
    return () => clearTimeout(timer);
  }, [data.items, data.publishing, isFeed, now]);

  const publishing = data.publishing;
  const canPublish = !loading && !!publishing && (publishing.unlimited || publishing.canPublish || (publishing.nextPublishAt && new Date(publishing.nextPublishAt).getTime() <= now));
  const restricted = profileAccess === false || data.canViewTestimonies === false;
  const visibleItems = restricted ? [] : isFeed ? data.items.filter(item => new Date(item.feedExpiresAt).getTime() > now) : data.items;
  const reading = !restricted && modal?.type === 'read' ? data.items.find(item => item._id === modal.id) : null;
  const author = data.user || { _id: userId, Name: username || 'You', username };
  const close = useCallback((saved = false) => {
    setModal(null);
    if (saved) setNotice('Shared with your friends.');
    requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); });
  }, []);
  const create = event => {
    if (!canPublish) return;
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
          <button type="button" className={styles.createNote} disabled={!canPublish} onClick={create} aria-label="Share your testimony" title={canPublish ? 'Share your testimony' : publishing?.canPublish === false ? 'You can share again after your current note expires.' : 'Checking availability…'}><Plus size={24} strokeWidth={1.4} /><span className={styles.noteLines} aria-hidden="true" /></button>
          <span className={styles.createCaption}>{publishing?.canPublish === false && !canPublish ? 'Note active' : 'Share a note'}</span>
        </div>}
        {loading && !data.items.length ? <div className={styles.loadingNotes} aria-label="Loading testimonies" role="status"><span /><span /></div>
          : visibleItems.map((item, index) => <TestimonyCard key={item._id} item={item} index={index} onRead={(item, trigger) => {
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
    {reading && <TestimonyReader key={reading._id} item={reading} userId={userId} token={token} onClose={close} onEdit={item => setModal({ type: 'compose', editing: item })} />}
  </>;
}

export default function TestimonyBoard({ profileUserId, onProfileLoad, initialProfile, profileAccess, onLoadingChange }) {
  const { isLogin, user_id, username } = useContext(UserContext);
  if (!isLogin || !user_id) return null;
  return <Board key={`${user_id}:${isLogin}:${profileUserId || 'feed'}`} token={isLogin} userId={user_id} username={username} profileUserId={profileUserId} onProfileLoad={onProfileLoad} initialProfile={initialProfile} profileAccess={profileAccess} onLoadingChange={onLoadingChange} />;
}
