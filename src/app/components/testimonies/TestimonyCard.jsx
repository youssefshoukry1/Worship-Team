'use client';

import { Pin } from 'lucide-react';
import { useContext, useLayoutEffect, useRef } from 'react';
import { TabPageSelected } from '../TabPageActivity';
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
  const selected = useContext(TabPageSelected);
  const lastFit = useRef(null);
  useLayoutEffect(() => {
    if (!selected) return;
    const text = previewRef.current;
    let size;
    let frame;
    const fit = () => {
      frame = undefined;
      if (!size?.width || !size.height) return;
      // FontFaceSet issues a new ready promise for each font-loading cycle.
      const fonts = document.fonts;
      const previous = lastFit.current;
      if (previous && previous.preview === preview && previous.hideAuthor === hideAuthor &&
          previous.width === size.width && previous.height === size.height &&
          previous.fonts === fonts?.ready && previous.fontStatus === fonts?.status) return;
      fitNotePreview(text);
      lastFit.current = { preview, hideAuthor, width: size.width, height: size.height,
        fonts: fonts?.ready, fontStatus: fonts?.status };
    };
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(fit); };
    // The initial resize delivery also handles reactivation at a new size.
    const observer = new ResizeObserver(([entry]) => {
      size = entry.contentRect;
      schedule();
    });
    observer.observe(text.parentElement);
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.addEventListener('loadingerror', schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.fonts?.removeEventListener('loadingdone', schedule);
      document.fonts?.removeEventListener('loadingerror', schedule);
    };
  }, [selected, hideAuthor, preview]);
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
