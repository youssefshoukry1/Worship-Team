'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2, Pin, Trash2 } from 'lucide-react';
import TestimonyDialog from './TestimonyDialog';
import OfflineAvatar from '../OfflineAvatar';
import { announceTestimonyChange, testimonyRequest } from './testimonyApi';
import styles from './testimonies.module.css';
import NoteLove from './NoteLove';
import OwnerNoteLoves from './OwnerNoteLoves';
import NoteActionsMenu from './NoteActionsMenu';
import NoteReactors from './NoteReactors';
import useFittedNote from './useFittedNote';
import { useNoteReactorsStore } from './TestimonyFeedProvider';
import { formatNoteTime } from './noteTime';
import useNoteSheetDrag from './useNoteSheetDrag';
import useNoteSheetOpen from './useNoteSheetOpen';
import useNoteEditWindow, { noteCanEdit } from './useNoteEditWindow';

export default function TestimonyReader({ item, userId, token, onReaction, onClose, onEdit, isFeed = true, now }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showReactors, setShowReactors] = useState(false);
  const timeLabel = formatNoteTime(item.createdAt, isFeed, now);
  const noteSurface = useRef(null);
  const [noteText, setNoteText] = useState(null);
  useFittedNote(noteSurface, noteText, JSON.stringify([item.title, item.body, item.verse, error]));
  const mine = String(item.author?._id) === String(userId);
  const canEdit = useNoteEditWindow(item.createdAt);
  const reactors = useNoteReactorsStore();
  const prefetched = useRef(false);
  const reactorLayer = useRef(null);
  const reactorSheet = useRef(null);
  const closeReactors = useNoteSheetDrag(reactorSheet, showReactors, () => {
    setShowReactors(false);
    requestAnimationFrame(() => noteSurface.current?.querySelector('[aria-label="See who loved this note"]')?.focus({ preventScroll: true }));
  });
  useNoteSheetOpen(noteSurface, reactorSheet, reactorLayer, mine && Boolean(noteText) && !showReactors && !confirmDelete && !busy, () => setShowReactors(true));
  const closeTopLayer = () => {
    if (busy) return;
    if (showReactors) closeReactors();
    else onClose();
  };
  useEffect(() => {
    if (mine && !prefetched.current) {
      prefetched.current = true;
      void reactors?.ensure(item);
    }
  }, [mine, reactors, item]);
  const remove = async () => {
    setBusy(true); setError('');
    try {
      const result = await testimonyRequest(token, `/${item._id}`, { method: 'DELETE' });
      announceTestimonyChange({ ...result, id: item._id, authorId: item.author._id, action: 'deleted' }); onClose();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <TestimonyDialog title="Testimony" card onClose={closeTopLayer}>
    <article ref={noteSurface} data-note-surface
      className={`${styles.expandedNote} ${mine ? styles.swipeNote : ''} ${styles[item.style] || styles.olive}`} data-testid="expanded-testimony-note">
      <div inert={showReactors ? true : undefined} className={`${styles.expandedAuthor} ${mine ? styles.authorWithTools : ''}`}>
        <OfflineAvatar userKey={item.author._id} remoteUrl={item.author.profilePhoto} name={item.author.Name || item.author.username || 'Friend'} className={styles.pinnedAvatar} />
        <span className={styles.noteAuthorName} dir="auto">{item.author.Name || item.author.username || 'You'}</span>
      </div>
        {mine && <div inert={showReactors ? true : undefined} className={`${styles.noteOwnerTools} ${styles.noteAuthorTools}`}>
          <NoteActionsMenu canEdit={canEdit} disabled={busy}
            onEdit={() => { if (noteCanEdit(item.createdAt)) onEdit(item); }}
            onDelete={() => setConfirmDelete(true)} />
        </div>}
      <Pin className={`${styles.pin} ${styles.expandedPin}`} strokeWidth={1.8} aria-hidden="true" />
      <div inert={showReactors ? true : undefined} ref={setNoteText} className={styles.expandedText} aria-label="Testimony text">

        {!item.body.startsWith(item.title) && <h2 dir="auto">{item.title}</h2>}
        <p className={styles.fullStory} dir="auto">{item.body}</p>
        {item.verse?.reference && <div className={styles.attachedVerse}><BookOpen size={15} /><blockquote dir="auto"><p>{item.verse.text}</p><cite>{item.verse.reference}</cite></blockquote></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <footer inert={showReactors ? true : undefined} className={`${styles.expandedFooter} ${mine ? styles.ownerNoteFooter : ''}`}>
        {mine ? <OwnerNoteLoves item={item} onOpen={() => setShowReactors(true)} />
          : <NoteLove item={item} userId={userId} token={token} onReaction={onReaction} />}

        {timeLabel && <time className={`${styles.expandedTime} ${timeLabel === 'Just now' ? styles.justNow : ''}`} dateTime={new Date(item.createdAt).toISOString()} title={new Date(item.createdAt).toLocaleString()}>{timeLabel}</time>}
      </footer>
      {mine && <div ref={reactorLayer} className={styles.reactorSheetLayer} data-sheet-open={showReactors} inert={!showReactors ? true : undefined}>
        <button type="button" className={styles.reactorSheetScrim} aria-label="Close loved by list" onClick={closeReactors} tabIndex={-1} />
        <div ref={reactorSheet} className={styles.reactorSheet} data-reactor-sheet data-page-swipe="off" style={{ transform: showReactors ? 'translate3d(0, 0, 0)' : 'translate3d(0, 100%, 0)', animation: 'none' }}>
          <NoteReactors item={item} onClose={onClose} onBack={closeReactors} sheet active={showReactors} />
        </div>
      </div>}
      {confirmDelete && <div className={`${styles.deleteConfirmation} ${styles.noteDeleteConfirmation}`} role="group" aria-label="Confirm removal"><strong>Remove this note?</strong><p>It will be removed from Friends and your profile.</p><div><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button><button type="button" className={styles.dangerButton} disabled={busy} onClick={remove}>{busy ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />} Remove note</button></div></div>}
    </article>
  </TestimonyDialog>;
}
