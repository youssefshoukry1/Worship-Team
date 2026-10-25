'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Loader2, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
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
  return <TestimonyDialog title="A moment of faith" onClose={() => { if (!busy) onClose(); }}>
    <article className={styles.reader}>
      <div className={`${styles.readerContent} ${styles[item.style] || styles.olive}`}>
        <span className={styles.pin} aria-hidden="true" />
        <div className={styles.readerByline}><span className={styles.authorInitial} aria-hidden="true">{(item.author?.Name || item.author?.username || 'Y')[0]}</span><div><strong>{item.author?.Name || item.author?.username || 'You'}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</time></div></div>
        {!item.body.startsWith(item.title) && <h2 dir="auto">{item.title}</h2>}
        <p className={styles.fullStory} dir="auto">{item.body}</p>
        {item.verse?.reference && <div className={styles.attachedVerse}><BookOpen size={15} /><blockquote dir="auto"><p>{item.verse.text}</p><cite>{item.verse.reference}</cite></blockquote></div>}
        <p className={styles.readerPrivacy}><ShieldCheck size={14} /> Shared with friends · Saved on {mine ? 'your' : 'their'} profile</p>
        {mine ? <div className={styles.ownerActions}>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => onEdit(item)}><Pencil size={14} /> Edit testimony</button>
          <button type="button" className={styles.deleteButton} disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Remove</button>
        </div> : <Link className={styles.profileLink} href={profileHref(item.author._id)} onClick={() => onClose()}>Visit {item.author.Name || 'friend'}’s profile <ArrowUpRight size={16} /></Link>}
        {confirmDelete && <div className={styles.deleteConfirmation} role="group" aria-label="Confirm removal"><strong>Remove this testimony?</strong><p>It will be removed from Friends and your profile.</p><div><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button><button type="button" className={styles.dangerButton} disabled={busy} onClick={remove}>{busy ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />} Remove testimony</button></div></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </article>
  </TestimonyDialog>;
}
