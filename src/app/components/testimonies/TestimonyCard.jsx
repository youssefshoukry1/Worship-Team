'use client';

import { Pin } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { fitNotePreview } from './fitNotePreview';
import { formatNoteTime } from './noteTime';
import OfflineAvatar from '../OfflineAvatar';
import styles from './testimonies.module.css';

export default function TestimonyCard({ item, onRead, index = 0, hideAuthor = false, isFeed = true, now, unread = false }) {
  const name = item.author.Name || item.author.username || 'Friend';
  const createdAt = item.createdAt ? new Date(item.createdAt) : null;
  const showTime = createdAt && Number.isFinite(createdAt.getTime());
  const timeLabel = formatNoteTime(item.createdAt, isFeed, now);
  const body = item.body?.trim() || '';
  const title = item.title?.trim() || '';
  const preview = body
    ? (body.startsWith(title) ? body : `${title} ${body}`)
    : title;
  const previewRef = useRef(null);
  useLayoutEffect(() => {
    const text = previewRef.current;
    if (!text) return;
    let disposed = false;
    let frame;
    const fit = () => { if (!disposed) fitNotePreview(text); };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(text.parentElement);
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.ready.then(() => { if (!disposed) schedule(); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', schedule);
      text.style.removeProperty('font-size');
      text.style.removeProperty('line-height');
      text.style.removeProperty('-webkit-line-clamp');
    };
  }, [hideAuthor, preview]);
  return <article className={styles.miniCard} style={{ '--tilt': `${[-1.5, 1, -.8][index % 3]}deg` }}>
    <div data-note-surface data-unread={unread || undefined} className={`${styles.miniNote} ${hideAuthor ? styles.withoutAuthor : ''} ${styles[item.style] || styles.olive}`}>
      <button type="button" className={styles.noteReadButton} aria-label={`Read testimony: ${item.title}`} onClick={event => onRead(item, event.currentTarget)}><h3 ref={previewRef} dir="auto">{preview}</h3></button>
      {!hideAuthor && <div className={styles.miniAuthor}>
        <OfflineAvatar userKey={item.author._id} remoteUrl={item.author.profilePhoto} name={name} className={styles.pinnedAvatar} />
        <span className={styles.noteAuthorName} dir="auto">{name}</span>
      </div>}
      <Pin className={`${styles.pin} ${unread ? styles.unreadPin : ''}`} strokeWidth={unread ? 2.2 : 1.8} aria-hidden="true" />
      {showTime && <time className={`${styles.noteTime} ${timeLabel === 'Just now' ? styles.justNow : ''}`} dateTime={createdAt.toISOString()} title={createdAt.toLocaleString()}>
        {timeLabel}
      </time>}
    </div>
  </article>;
}
