'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import Portal from '../../Portal/Portal';
import { noteLoveQueue } from './noteLoveQueue';
import styles from './testimonies.module.css';

export default function NoteLove({ item, userId, token, onReaction, onShowReactors, showingReactors = false }) {
  const [error, setError] = useState(null);
  const button = useRef(null);
  const enabled = Boolean(token && userId && String(item.author._id) !== String(userId));
  const reaction = noteLoveQueue.pending(userId, item._id) || item;
  const count = reaction.loveCount || 0;
  const countLabel = `${count} ${count === 1 ? 'love' : 'loves'}`;
  useEffect(() => {
    if (!enabled) return;
    return noteLoveQueue.subscribe(userId, item._id, { onUpdate: onReaction, onError: error => {
      const rect = button.current?.getBoundingClientRect();
      if (rect) setError({ message: error.message, left: Math.max(8, Math.min(window.innerWidth - 198, rect.left)), top: Math.max(8, rect.top - 58) });
    } });
  }, [enabled, userId, item._id, onReaction]);

  const react = event => {
    event.preventDefault(); event.stopPropagation();
    if (!enabled) return;
    setError(null);
    noteLoveQueue.toggle({ item, userId, token, onUpdate: onReaction });
  };

  return <>
    <div className={`${styles.loveControl} ${onShowReactors ? styles.ownerLoveControl : ''}`} onClick={event => event.stopPropagation()}>
      {enabled ? <button ref={button} type="button" className={`${styles.loveButton} ${reaction.loved ? styles.loved : ''}`} aria-label={reaction.loved ? 'Remove love' : 'Love this note'} aria-pressed={Boolean(reaction.loved)} title={reaction.loved ? 'Remove love' : 'Love this note'} onClick={react}>
        <Heart size={13} strokeWidth={1.7} fill={reaction.loved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button> : onShowReactors ? <button type="button" className={`${styles.loveButton} ${count ? styles.loved : ''}`} aria-label="See who loved this note" aria-expanded={showingReactors} title="See who loved this note" onClick={onShowReactors}>
        <Heart size={13} strokeWidth={1.7} fill={count ? 'currentColor' : 'none'} aria-hidden="true" /><span className={styles.ownerLoveCount}>{count}</span>
      </button> : <span className={`${styles.loveButton} ${count ? styles.loved : ''}`} title={countLabel}>
        <Heart size={13} strokeWidth={1.7} fill={count ? 'currentColor' : 'none'} aria-hidden="true" />
      </span>}
      {count > 0 && <span className={styles.loveStatus} role="status" aria-label={countLabel}>{countLabel}</span>}
    </div>
    {error && <Portal><p className={styles.reactionError} role="alert" style={{ left: error.left, top: error.top }}>{error.message}</p></Portal>}
  </>;
}
