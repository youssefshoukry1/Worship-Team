'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Portal from '../../Portal/Portal';
import styles from './testimonies.module.css';

export default function TestimonyDialog({ title, children, onClose, note = false, card = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => (ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('button'))?.focus({ preventScroll: true }));
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || [])]
        .filter(element => element.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); ref.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <Portal>
    <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={ref} className={`${styles.dialog} ${note ? styles.noteDialog : ''} ${card ? styles.expandedDialog : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-lenis-prevent>
        {card ? <button type="button" className={`${styles.iconButton} ${styles.cardClose}`} onClick={onClose} aria-label="Close"><X size={20} /></button>
          : <div className={styles.dialogTop}><span>{title}</span><button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close"><X size={20} /></button></div>}
        {children}
      </section>
    </div>
  </Portal>;
}
