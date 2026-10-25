'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Clock3, Loader2, Plus, RefreshCw } from 'lucide-react';
import { UserContext } from '../../context/User_Context';
import OfflineAvatar from '../OfflineAvatar';
import TestimonyCard from './TestimonyCard';
import TestimonyComposer from './TestimonyComposer';
import TestimonyReader from './TestimonyReader';
import { profileHref, testimonyRequest } from './testimonyApi';
import styles from './testimonies.module.css';

function Board({ token, userId, username, profileUserId, showProfileHeader }) {
  const isFeed = !profileUserId;
  const ownProfile = String(profileUserId) === String(userId);
  const [data, setData] = useState({ items: [], user: null, nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [now, setNow] = useState(Date.now);
  const pending = useRef(null);
  const version = useRef(0);
  const opener = useRef(null);
  const path = isFeed ? '' : `/profile/${encodeURIComponent(profileUserId)}`;
  const load = useCallback(async (cursor = null) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const revision = ++version.current;
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const result = await testimonyRequest(token, `${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal });
      if (revision !== version.current || controller.signal.aborted) return;
      setData(previous => ({ ...result, items: cursor
        ? [...previous.items, ...(result.items || []).filter(item => !previous.items.some(old => old._id === item._id))]
        : result.items || [] }));
      setNow(Date.now());
    } catch (error) {
      if (revision !== version.current || controller.signal.aborted) return;
      setError(error.message);
      // Shared content is never persisted offline; a failed access check clears the visible collection.
      setData({ items: [], user: null, nextCursor: null });
      setModal(null);
    } finally {
      if (revision === version.current && !controller.signal.aborted) { setLoading(false); setLoadingMore(false); }
    }
  }, [token, path]);

  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    const tick = setInterval(() => setNow(Date.now()), 15000);
    const refreshInterval = setInterval(refresh, 60000);
    window.addEventListener('taspe7:testimonies-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      pending.current?.abort();
      clearInterval(tick); clearInterval(refreshInterval);
      window.removeEventListener('taspe7:testimonies-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!isFeed) return;
    const upcoming = data.items.map(item => new Date(item.feedExpiresAt).getTime()).filter(expiry => expiry > now);
    if (!upcoming.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...upcoming) - Date.now()) + 10);
    return () => clearTimeout(timer);
  }, [data.items, isFeed, now]);

  const visibleItems = isFeed ? data.items.filter(item => new Date(item.feedExpiresAt).getTime() > now) : data.items;
  const reading = modal?.type === 'read' ? data.items.find(item => item._id === modal.id) : null;
  const author = data.user || { _id: userId, Name: username || 'You', username };
  const close = useCallback((saved = false) => {
    setModal(null);
    if (saved) setNotice('Shared with your friends.');
    requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); });
  }, []);
  const create = event => {
    opener.current = event.currentTarget;
    opener.current.focus({ preventScroll: true });
    setNotice(''); setModal({ type: 'compose' });
  };

  return <>
    {showProfileHeader && <div className={styles.friendProfileHeader}>
      <Link href="/friends" className={styles.backLink}><ArrowLeft size={17} /> Friends</Link>
      {data.user && <div className={styles.friendIdentity}>
        <OfflineAvatar userKey={data.user._id} remoteUrl={data.user.profilePhoto} name={data.user.Name} className={styles.profileAvatar} />
        <div><span className={styles.profileEyebrow}>A JOURNEY OF FAITH</span><h1 dir="auto">{data.user.Name || data.user.username}</h1>{data.user.username && <p>@{data.user.username}</p>}</div>
      </div>}
    </div>}
    <section className={styles.board} aria-label={isFeed ? 'Friends testimony highlights' : 'Profile testimony highlights'}>
      <header className={styles.boardHeader}>
        <h2>{isFeed ? 'Friends’ testimonies' : ownProfile ? 'Your testimony highlights' : 'Testimony highlights'}</h2>
        {isFeed && <span className={styles.feedLabel}><Clock3 size={11} />24h</span>}
        {isFeed && <Link href={profileHref(userId)} className={styles.quietLink}>Your notes <ArrowUpRight size={12} /></Link>}
      </header>
      <div className={styles.noteRail} data-testid="testimony-cards">
        {(isFeed || ownProfile) && <div className={styles.miniCard}>
          <button type="button" className={styles.createNote} onClick={create} aria-label="Share your testimony" title="Share your testimony"><span className={styles.pin} aria-hidden="true" /><Plus size={24} strokeWidth={1.4} /><span className={styles.noteLines} aria-hidden="true" /></button>
          <span className={styles.createCaption}>Share a note</span>
        </div>}
        {loading && !data.items.length ? <div className={styles.loadingNotes} aria-label="Loading testimonies" role="status"><span /><span /></div>
          : visibleItems.map((item, index) => <TestimonyCard key={item._id} item={item} index={index} now={now} onRead={(item, trigger) => {
            opener.current = trigger;
            trigger.focus({ preventScroll: true });
            setModal({ type: 'read', id: item._id });
          }} />)}
        {!loading && !error && !visibleItems.length && !isFeed && !ownProfile && <p className={styles.emptyNotes}>No shared testimonies yet.</p>}
        {!error && data.nextCursor && <button type="button" className={styles.moreNotes} disabled={loading || loadingMore} onClick={() => load(data.nextCursor)}>{loadingMore ? <Loader2 size={17} className={styles.spin} /> : <Plus size={17} />}<span>More</span></button>}
      </div>
      {notice && <p className={styles.successNotice} role="status">{notice}</p>}
      {error && <div className={styles.boardError} role="alert"><span>{error}</span><button type="button" className={styles.retryButton} aria-label="Try again" onClick={() => load()}><RefreshCw size={13} /></button></div>}
    </section>
    {modal?.type === 'compose' && <TestimonyComposer key={modal.editing?._id || 'new'} token={token} userId={userId} author={author} editing={modal.editing} onClose={close} />}
    {reading && <TestimonyReader key={reading._id} item={reading} userId={userId} token={token} onClose={close} onEdit={item => setModal({ type: 'compose', editing: item })} />}
  </>;
}

export default function TestimonyBoard({ profileUserId, showProfileHeader = false }) {
  const { isLogin, user_id, username } = useContext(UserContext);
  if (!isLogin || !user_id) return null;
  return <Board key={`${user_id}:${isLogin}:${profileUserId || 'feed'}`} token={isLogin} userId={user_id} username={username} profileUserId={profileUserId} showProfileHeader={showProfileHeader} />;
}
