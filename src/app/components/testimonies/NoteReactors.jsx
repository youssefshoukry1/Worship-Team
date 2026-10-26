'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Loader2, RefreshCw } from 'lucide-react';
import OfflineAvatar from '../OfflineAvatar';
import { profileHref, testimonyRequest } from './testimonyApi';
import styles from './testimonies.module.css';

export default function NoteReactors({ item, token, onBack, onClose }) {
  const [data, setData] = useState({ users: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(null);
  const back = useRef(null);
  const load = useCallback(async (cursor = null) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const result = await testimonyRequest(token, `/${item._id}/loves${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(previous => ({ ...result, users: cursor ? [...previous.users, ...result.users.filter(user => !previous.users.some(old => old._id === user._id))] : result.users }));
    } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [item._id, token]);
  useEffect(() => {
    load(); back.current?.focus({ preventScroll: true });
    const refresh = event => { if (event.detail?.testimonyId === item._id && document.visibilityState === 'visible') load(); };
    window.addEventListener('taspe7:testimony-push', refresh);
    return () => { request.current?.abort(); window.removeEventListener('taspe7:testimony-push', refresh); };
  }, [load, item._id]);

  return <section className={styles.reactors} aria-label="People who loved your note">
    <header className={styles.reactorsHeader}>
      <button ref={back} type="button" className={styles.backToNote} onClick={onBack}><ArrowLeft size={14} />Back to note</button>
      <h2>Loved by</h2>
    </header>
    <div className={styles.reactorsList} aria-busy={loading}>
      {data.users.map(user => <Link key={user._id} className={styles.reactorRow} href={profileHref(user._id)} onClick={onClose} aria-label={`Visit ${user.Name || user.username || 'friend'} profile`}>
        <OfflineAvatar userKey={user._id} remoteUrl={user.profilePhoto} name={user.Name || user.username || 'Friend'} className={styles.reactorAvatar} />
        <span className={styles.reactorIdentity}><strong dir="auto">{user.Name || user.username || 'Friend'}</strong>{user.username && <span dir="ltr">@{user.username}</span>}</span>
        <Heart className={styles.reactorHeart} size={13} fill="currentColor" aria-hidden="true" />
      </Link>)}
      {loading && <p className={styles.reactorHint} role="status"><Loader2 size={14} className={styles.spin} />Loading reactions…</p>}
      {!loading && !error && !data.users.length && <p className={styles.reactorHint}>No loves yet.</p>}
      {error && <div className={styles.boardError} role="alert"><span>{error}</span><button type="button" className={styles.retryButton} aria-label="Retry reactions" onClick={() => load(data.nextCursor)}><RefreshCw size={13} /></button></div>}
      {!loading && !error && data.nextCursor && <button type="button" className={styles.moreReactors} onClick={() => load(data.nextCursor)}>Show more</button>}
    </div>
  </section>;
}
