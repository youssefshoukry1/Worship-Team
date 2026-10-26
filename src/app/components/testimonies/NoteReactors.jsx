'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Loader2, RefreshCw } from 'lucide-react';
import OfflineAvatar from '../OfflineAvatar';
import { profileHref } from './testimonyApi';
import { useNoteReactorsStore } from './TestimonyFeedProvider';
import styles from './testimonies.module.css';

export default function NoteReactors({ item, onBack, onClose }) {
  const store = useNoteReactorsStore();
  const subscribe = useCallback(listener => store.subscribe(item._id, listener), [store, item._id]);
  const snapshot = useCallback(() => store.getSnapshot(item._id), [store, item._id]);
  const data = useSyncExternalStore(subscribe, snapshot, snapshot);
  const back = useRef(null);
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      void store.ensure(item);
      back.current?.focus({ preventScroll: true });
    }
  }, [store, item]);

  return <section className={styles.reactors} aria-label="People who loved your note">
    <header className={styles.reactorsHeader}>
      <button ref={back} type="button" className={styles.backToNote} onClick={onBack}><ArrowLeft size={14} />Back to note</button>
      <h2>Loved by</h2>
    </header>
    <div className={styles.reactorsList} aria-busy={data.loading && !data.ready}>
      {data.users.map(user => <Link key={user._id} className={styles.reactorRow} href={profileHref(user._id)} onClick={onClose} aria-label={`Visit ${user.Name || user.username || 'friend'} profile`}>
        <OfflineAvatar userKey={user._id} remoteUrl={user.profilePhoto} name={user.Name || user.username || 'Friend'} className={styles.reactorAvatar} />
        <span className={styles.reactorIdentity}><strong dir="auto">{user.Name || user.username || 'Friend'}</strong>{user.username && <span dir="ltr">@{user.username}</span>}</span>
        <Heart className={styles.reactorHeart} size={13} fill="currentColor" aria-hidden="true" />
      </Link>)}
      {data.loading && !data.ready && <p className={styles.reactorHint} role="status"><Loader2 size={14} className={styles.spin} />Loading reactions…</p>}
      {data.ready && !data.users.length && <p className={styles.reactorHint}>No loves yet.</p>}
      {data.error && <div className={styles.boardError} role="alert"><span>{data.error}</span><button type="button" className={styles.retryButton} aria-label="Retry reactions" onClick={() => store.retry(item)}><RefreshCw size={13} /></button></div>}
      {data.ready && data.nextCursor && <button type="button" className={styles.moreReactors} disabled={data.loading} onClick={() => store.loadMore(item)}>{data.loading ? 'Loading more…' : 'Show more'}</button>}
    </div>
  </section>;
}
