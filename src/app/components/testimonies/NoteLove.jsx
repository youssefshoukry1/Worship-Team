'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import Portal from '../../Portal/Portal';
import { testimonyRequest } from './testimonyApi';
import styles from './testimonies.module.css';

export default function NoteLove({ item, userId, token, onReaction }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const request = useRef(null);
  const enabled = Boolean(token && userId && String(item.author._id) !== String(userId));
  const count = item.loveCount || 0;
  const countLabel = `${count} ${count === 1 ? 'love' : 'loves'}`;
  useEffect(() => () => request.current?.abort(), []);

  const react = async event => {
    event.preventDefault(); event.stopPropagation();
    if (!enabled || request.current) return;
    const trigger = event.currentTarget;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(null);
    try {
      const result = await testimonyRequest(token, `/${item._id}/love`, { method: item.loved ? 'DELETE' : 'PUT', signal: controller.signal });
      onReaction(item._id, result.reaction);
    } catch (error) {
      if (!controller.signal.aborted) {
        const rect = trigger.getBoundingClientRect();
        setError({ message: error.message, left: Math.max(8, Math.min(window.innerWidth - 198, rect.left)), top: Math.max(8, rect.top - 58) });
      }
    } finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); } }
  };

  return <>
    <div className={styles.loveControl} onClick={event => event.stopPropagation()}>
      {enabled ? <button type="button" className={`${styles.loveButton} ${item.loved ? styles.loved : ''}`} disabled={busy} aria-label={item.loved ? 'Remove love' : 'Love this note'} aria-pressed={Boolean(item.loved)} title={item.loved ? 'Remove love' : 'Love this note'} onClick={react}>
        <Heart size={13} strokeWidth={1.7} fill={item.loved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button> : <span className={`${styles.loveButton} ${count ? styles.loved : ''}`} title={countLabel}>
        <Heart size={13} strokeWidth={1.7} fill={count ? 'currentColor' : 'none'} aria-hidden="true" />
      </span>}
      {count > 0 && <span className={styles.loveStatus} role="status" aria-label={countLabel}>{countLabel}</span>}
    </div>
    {error && <Portal><p className={styles.reactionError} role="alert" style={{ left: error.left, top: error.top }}>{error.message}</p></Portal>}
  </>;
}
