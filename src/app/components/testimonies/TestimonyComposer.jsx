'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, Loader2, Users, X } from 'lucide-react';
import TestimonyDialog from './TestimonyDialog';
import { announceTestimonyChange, testimonyRequest } from './testimonyApi';
import { getApiBaseUrl } from '../../utils/apiBase';
import styles from './testimonies.module.css';

const newClientId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function TestimonyComposer({ token, userId, author, editing, onClose }) {
  const draftKey = `taspe7_testimony_draft_v1:${userId}:${editing?._id || 'new'}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey));
      if (saved && typeof saved.body === 'string') return {
        title: typeof saved.title === 'string' ? saved.title.slice(0, 100) : '', body: saved.body.slice(0, 3000),
        style: ['olive', 'dawn', 'still'].includes(saved.style) ? saved.style : 'olive',
        reference: typeof saved.reference === 'string' ? saved.reference.slice(0, 100) : '',
        verseText: typeof saved.verseText === 'string' ? saved.verseText.slice(0, 1200) : '',
        clientId: saved.clientId || newClientId(),
      };
    } catch { /* Writing remains available without local storage. */ }
    return { title: editing?.title || '', body: editing?.body || '', style: editing?.style || 'olive',
      reference: editing?.verse?.reference || '', verseText: editing?.verse?.text || '', clientId: newClientId() };
  });
  const [showVerses, setShowVerses] = useState(false);
  const [savedHighlights, setSavedHighlights] = useState([]);
  const [highlightStatus, setHighlightStatus] = useState('');
  const [loadingVerses, setLoadingVerses] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftStatus, setDraftStatus] = useState('Saves on this device');
  const bodyRef = useRef(null);
  const published = useRef(false);
  const latestDraft = useRef(draft);
  const submitting = useRef(false);

  useEffect(() => {
    latestDraft.current = draft;
    const timer = setTimeout(() => {
      if (published.current) return;
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); setDraftStatus('Draft saved'); }
      catch { setDraftStatus('Saved in this window'); }
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, draftKey]);

  useEffect(() => () => {
    if (!published.current) {
      try { localStorage.setItem(draftKey, JSON.stringify(latestDraft.current)); } catch { /* Keep editing without storage. */ }
    }
  }, [draftKey]);

  useEffect(() => {
    if (!showVerses) return;
    const controller = new AbortController();
    setLoadingVerses(true);
    fetch(`${getApiBaseUrl()}/users/my-profile`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load your saved verses. Try again.');
        const data = await response.json();
        if (!controller.signal.aborted) {
          setSavedHighlights((data.user?.bibleHighlights || []).filter(highlight => highlight.text));
          setHighlightStatus('');
        }
      }).catch(error => { if (!controller.signal.aborted) setHighlightStatus(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingVerses(false); });
    return () => controller.abort();
  }, [showVerses, token]);

  const canPublish = draft.body.trim().length >= 10;
  const submit = async event => {
    event.preventDefault();
    if (!canPublish || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError('');
    try {
      // The note is the editor. An excerpt supplies the existing API's title field.
      const preserveTitle = !editing || !editing.body.startsWith(editing.title);
      const title = (preserveTitle ? draft.title.trim() : '') || draft.body.trim().split('\n')[0].slice(0, 80);
      await testimonyRequest(token, editing ? `/${editing._id}` : '', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ title, body: draft.body, style: draft.style, clientId: draft.clientId,
          verse: draft.reference && draft.verseText ? { reference: draft.reference, text: draft.verseText } : null }),
      });
      published.current = true;
      try { localStorage.removeItem(draftKey); } catch { /* Publishing succeeded. */ }
      announceTestimonyChange();
      onClose(true);
    } catch (error) { setError(error.message); }
    finally { submitting.current = false; setBusy(false); }
  };

  return <TestimonyDialog title={editing ? 'Edit testimony' : 'Share your testimony'} onClose={() => { if (!submitting.current) onClose(); }} note>
    <form onSubmit={submit} className={styles.noteComposer}>
      <div className={`${styles.writingNote} ${styles[draft.style]}`}>
        <span className={styles.pin} aria-hidden="true" />
        <div className={styles.noteByline}><span className={styles.authorInitial}>{(author?.Name || 'Y')[0]}</span><span>{author?.Name || author?.username || 'You'}</span><span className={styles.noteAudience}><Users size={12} /> Friends</span></div>
        {editing && draft.title && !editing.body.startsWith(editing.title) && <h2 className={styles.existingTitle} dir="auto">{draft.title}</h2>}
        <textarea ref={bodyRef} data-autofocus className={styles.noteWriting} aria-label="Your testimony" dir="auto" placeholder={'A moment of faith,\na prayer answered,\nsomething on your heart…'} value={draft.body} maxLength={3000} minLength={10} required disabled={busy} onChange={event => setDraft(previous => ({ ...previous, body: event.target.value }))} />
        {draft.reference && <div className={styles.attachedVerse}>
          <BookOpen size={15} /><blockquote dir="auto"><p>{draft.verseText}</p><cite>{draft.reference}</cite></blockquote>
          <button type="button" aria-label="Remove verse" disabled={busy} onClick={() => setDraft(previous => ({ ...previous, reference: '', verseText: '' }))}><X size={15} /></button>
        </div>}
        <div className={styles.noteTools}>
          <button type="button" className={styles.attachButton} aria-expanded={showVerses} disabled={busy} onClick={() => setShowVerses(previous => !previous)}><BookOpen size={15} /><span>{draft.reference ? 'Change verse' : 'Add verse'}</span></button>
          <span className={styles.noteCount}>{draft.body.length.toLocaleString()}/3,000</span>
        </div>
      </div>
      {showVerses && <div className={styles.versePicker} aria-label="Saved Bible highlights">
        <div className={styles.versePickerTitle}><span>Your saved Bible verses</span><button type="button" className={styles.iconButton} aria-label="Close verse picker" onClick={() => setShowVerses(false)}><X size={15} /></button></div>
        {loadingVerses ? <p role="status">Loading verses…</p> : highlightStatus ? <p role="alert">{highlightStatus}</p> : !savedHighlights.length ? <p>Highlight a verse in the Bible to add it here.</p> : savedHighlights.map((highlight, i) => {
          const reference = `${highlight.bookName} ${highlight.chapter}:${highlight.verseNumber}`;
          return <button key={highlight._id || i} type="button" disabled={busy} onClick={() => {
            setDraft(previous => ({ ...previous, reference, verseText: highlight.text.slice(0, 1200) }));
            setShowVerses(false); bodyRef.current?.focus({ preventScroll: true });
          }}><strong dir="auto">{reference}</strong><span dir="auto">{highlight.text}</span></button>;
        })}
      </div>}
      <div className={styles.noteFooter}>
        <p>24h on Friends · Kept on your profile{editing && <span>Editing keeps the original 24-hour window.</span>}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.notePublishActions}><span className={styles.draftStatus} role="status"><Check size={12} />{draftStatus}</span><button type="submit" className={styles.primaryButton} disabled={!canPublish || busy}>{busy ? <><Loader2 size={15} className={styles.spin} /> Saving…</> : <>{editing ? 'Save changes' : 'Share'}<ArrowUpRight size={15} /></>}</button></div>
      </div>
    </form>
  </TestimonyDialog>;
}
