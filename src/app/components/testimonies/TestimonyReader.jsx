'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Loader2, Pencil, Pin, Trash2 } from 'lucide-react';
import TestimonyDialog from './TestimonyDialog';
import { announceTestimonyChange, profileHref, testimonyRequest } from './testimonyApi';
import styles from './testimonies.module.css';

export default function TestimonyReader({ item, userId, token, onClose, onEdit }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = String(item.author?._id) === String(userId);
  const remove = async () => {
    setBusy(true); setError('');
    try {
      await testimonyRequest(token, `/${item._id}`, { method: 'DELETE' });
      announceTestimonyChange(); onClose();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <TestimonyDialog title="Testimony" card onClose={() => { if (!busy) onClose(); }}>
    <article className={`${styles.expandedNote} ${styles[item.style] || styles.olive}`} data-testid="expanded-testimony-note">
      <Pin className={`${styles.pin} ${styles.expandedPin}`} strokeWidth={1.8} aria-hidden="true" />
      <div className={styles.expandedText} tabIndex={0} aria-label="Testimony text">
        {!item.body.startsWith(item.title) && <h2 dir="auto">{item.title}</h2>}
        <p className={styles.fullStory} dir="auto">{item.body}</p>
        {item.verse?.reference && <div className={styles.attachedVerse}><BookOpen size={15} /><blockquote dir="auto"><p>{item.verse.text}</p><cite>{item.verse.reference}</cite></blockquote></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      {mine && <footer className={styles.expandedFooter}>
        <div className={styles.noteOwnerTools}>
          <button type="button" className={styles.iconButton} aria-label="Edit testimony" title="Edit testimony" disabled={busy} onClick={() => onEdit(item)}><Pencil size={15} /></button>
          <button type="button" className={styles.iconButton} aria-label="Remove" title="Remove testimony" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /></button>
        </div>
      </footer>}
      {confirmDelete && <div className={`${styles.deleteConfirmation} ${styles.noteDeleteConfirmation}`} role="group" aria-label="Confirm removal"><strong>Remove this testimony?</strong><p>It will be removed from Friends and your profile.</p><div><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button><button type="button" className={styles.dangerButton} disabled={busy} onClick={remove}>{busy ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />} Remove testimony</button></div></div>}
    </article>
    <Link className={styles.expandedAuthor} href={profileHref(item.author._id)} aria-label={`Visit ${item.author.Name || item.author.username || 'your'} profile`} onClick={() => onClose()}>{item.author.Name || item.author.username || 'You'}</Link>
  </TestimonyDialog>;
}
