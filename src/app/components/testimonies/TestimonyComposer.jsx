'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Loader2, Pin, X } from 'lucide-react';
import TestimonyDialog from './TestimonyDialog';
import OfflineAvatar from '../OfflineAvatar';
import { announceTestimonyChange, NOTE_ACTIVE_MESSAGE, testimonyRequest } from './testimonyApi';
import { showToast } from '../ToastContainer';
import styles from './testimonies.module.css';
import { NOTE_CHARACTER_LIMIT, noteContentLength } from './noteContent';
import useNoteEditWindow, { noteCanEdit } from './useNoteEditWindow';

const newClientId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function TestimonyComposer({ token, userId, author, editing, onClose }) {
  const editWindowOpen = useNoteEditWindow(editing?.createdAt);
  const draftKey = `taspe7_testimony_draft_v1:${userId}:${editing?._id || 'new'}`;
  const [draft, setDraft] = useState(() => ({
    title: editing?.title || '', body: editing?.body || '', style: editing?.style || 'olive',
    reference: editing?.verse?.reference || '', verseText: editing?.verse?.text || '', clientId: newClientId(),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const bodyRef = useRef(null);
  const submitting = useRef(false);

  // Discard legacy saved drafts too. Unpublished text lives only in this editor.
  useEffect(() => {
    const clear = () => { try { localStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ } };
    clear();
    return clear;
  }, [draftKey]);

  const preserveTitle = !editing || !editing.body.startsWith(editing.title);
  const title = (preserveTitle ? draft.title.trim() : '') || draft.body.trim().split('\n')[0].slice(0, 80);
  const verse = draft.reference && draft.verseText ? { reference: draft.reference, text: draft.verseText } : null;
  const characterCount = noteContentLength({ title, body: draft.body, verse });
  const bodyLimit = Math.max(0, NOTE_CHARACTER_LIMIT - (characterCount - draft.body.trim().length));
  const overLimit = characterCount > NOTE_CHARACTER_LIMIT;
  const canPublish = !blocked && !overLimit && draft.body.trim().length >= 1 && (!editing || editWindowOpen);
  const submit = async event => {
    event.preventDefault();
    if (!canPublish || submitting.current) return;
    if (editing && !noteCanEdit(editing.createdAt)) { setError('Notes can only be edited within 5 minutes of sharing.'); return; }
    submitting.current = true;
    setBusy(true); setError('');
    try {
      // The note is the editor. An excerpt supplies the existing API's title field.
      const result = await testimonyRequest(token, editing ? `/${editing._id}` : '', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ title, body: draft.body, style: draft.style, clientId: draft.clientId,
          verse }),
      });
      try { localStorage.removeItem(draftKey); } catch { /* Publishing succeeded. */ }
      announceTestimonyChange({ ...result, id: result.item._id, authorId: userId, action: editing ? 'updated' : 'created' });
      onClose(true);
    } catch (error) {
      setError(error.message);
      if (!editing && error.code === 'TESTIMONY_ACTIVE') {
        showToast({ message: NOTE_ACTIVE_MESSAGE, type: 'info' });
        setBlocked(true); announceTestimonyChange();
      }
    }
    finally { submitting.current = false; setBusy(false); }
  };

  return <TestimonyDialog title={editing ? 'Edit testimony' : 'Share your testimony'} onClose={() => { if (!submitting.current) onClose(); }} card className={styles.composerDialog}>
    <form onSubmit={submit} className={`${styles.expandedNote} ${styles.composingNote} ${styles[draft.style]}`} data-testid="testimony-composer-note">
      <div className={styles.expandedAuthor}>
        <OfflineAvatar userKey={userId} remoteUrl={author?.profilePhoto} name={author?.Name || author?.username || 'You'} className={styles.pinnedAvatar} />
        <span className={styles.noteAuthorName} dir="auto">{author?.Name || author?.username || 'You'}</span>
      </div>
      <Pin className={`${styles.pin} ${styles.expandedPin}`} strokeWidth={1.8} aria-hidden="true" />
      <div className={styles.composerContent}>
        {editing && draft.title && !editing.body.startsWith(editing.title) && <h2 className={styles.existingTitle} dir="auto">{draft.title}</h2>}
        <textarea ref={bodyRef} data-autofocus className={styles.noteWriting} aria-label="Your testimony" aria-describedby="testimony-character-count" aria-invalid={overLimit || undefined} dir="auto" value={draft.body} maxLength={bodyLimit} minLength={1} required disabled={busy} onChange={event => setDraft(previous => ({ ...previous, body: event.target.value }))} />
        {draft.reference && <div className={styles.attachedVerse}>
          <BookOpen size={15} /><blockquote dir="auto"><p>{draft.verseText}</p><cite>{draft.reference}</cite></blockquote>
          <button type="button" aria-label="Remove verse" disabled={busy} onClick={() => setDraft(previous => ({ ...previous, reference: '', verseText: '' }))}><X size={15} /></button>
        </div>}
        {overLimit && <p className={styles.error} role="alert">Please shorten this note to {NOTE_CHARACTER_LIMIT.toLocaleString()} characters so it fits when opened. Your full draft is kept until you save.</p>}
        {editing && !editWindowOpen && <p className={styles.error} role="status">The 5-minute editing window has ended.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <footer className={styles.composerFooter}>
        <div className={styles.composerStatus}>
          <span id="testimony-character-count" className={styles.noteCount}>{characterCount.toLocaleString()}/{NOTE_CHARACTER_LIMIT.toLocaleString()} characters{verse ? ' · including verse' : ''}</span>
        </div>
        <button type="submit" className={styles.primaryButton} title="Shared with friends and saved on your profile" disabled={!canPublish || busy}>{busy ? <><Loader2 size={15} className={styles.spin} /> Saving…</> : <>{editing ? 'Save changes' : 'Share'}<ArrowUpRight size={15} /></>}</button>
      </footer>
    </form>
  </TestimonyDialog>;
}
