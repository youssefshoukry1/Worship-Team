'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, RefreshCw, UserMinus, UserPlus, X } from 'lucide-react';
import { changeFriendship, invalidateFriendship, readFriendship } from '../../utils/friendshipActions';
import TestimonyDialog from '../testimonies/TestimonyDialog';
import styles from '../testimonies/testimonies.module.css';

export default function FriendshipControls({ profile, token, userId, refreshing, onRevoke, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [relationship, setRelationship] = useState(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState('');
  const inFlight = useRef(false);
  const lookup = useRef(null);
  const requestQueue = useRef(Promise.resolve());
  const pendingRequests = useRef(0);
  const requestVersion = useRef(0);
  const confirmedRelationship = useRef(null);
  const person = profile.user;
  const targetId = person._id;
  const checkFriendship = useCallback(async () => {
    if (pendingRequests.current) return;
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    setChecking(true); setCheckError('');
    try {
      const current = await readFriendship(token, targetId, { signal: controller.signal });
      if (!controller.signal.aborted) {
        confirmedRelationship.current = current;
        setRelationship(current);
      }
    } catch (error) {
      if (!controller.signal.aborted) setCheckError(error.message);
    } finally { if (!controller.signal.aborted) setChecking(false); }
  }, [token, targetId]);
  useEffect(() => {
    checkFriendship();
    const refresh = () => { if (document.visibilityState === 'visible') checkFriendship(); };
    const restore = event => { if (event.persisted) refresh(); };
    window.addEventListener('taspe7:friends-push', refresh);
    window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      lookup.current?.abort();
      window.removeEventListener('taspe7:friends-push', refresh);
      window.removeEventListener('pageshow', restore);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [checkFriendship]);
  const disabled = busy || refreshing || checking || Boolean(checkError);
  const requestDisabled = busy || relationship === null || Boolean(checkError);
  const performRequest = action => {
    if (inFlight.current || requestDisabled) return;
    lookup.current?.abort();
    setChecking(false);
    setError('');
    const next = action === 'add' ? 'outgoing' : 'none';
    const message = { add: 'Friend request sent.', cancel: 'Friend request cancelled.', remove: 'Friend removed.' }[action];
    setRelationship(next);
    setNotice(message);
    setConfirmRemove(false);
    const rollbackRemoval = action === 'remove' ? onRevoke() : null;
    const version = ++requestVersion.current;
    pendingRequests.current++;
    // Save rapid friendship changes in order without blocking the next button.
    requestQueue.current = requestQueue.current.catch(() => {}).then(async () => {
      try {
        const result = await changeFriendship(token, targetId, action);
        const confirmed = action === 'add' && result.status === 'accepted' ? 'friends' : next;
        confirmedRelationship.current = confirmed;
        if (version === requestVersion.current) {
          setRelationship(confirmed);
          setNotice(confirmed === 'friends' ? 'You are now friends.' : message);
        }
      } catch (error) {
        rollbackRemoval?.();
        if (error.relationship === 'friends') confirmedRelationship.current = 'friends';
        if (version === requestVersion.current) {
          setRelationship(confirmedRelationship.current);
          setNotice(error.relationship === 'friends' ? 'You are already friends.' : '');
          if (error.relationship !== 'friends') setError(error.message);
        }
      } finally {
        pendingRequests.current--;
        if (!pendingRequests.current) invalidateFriendship(token, userId);
      }
    });
  };
  const perform = async action => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await changeFriendship(token, person._id, action);
      lookup.current?.abort();
      const confirmed = action === 'accept' ? 'friends' : 'none';
      confirmedRelationship.current = confirmed;
      setRelationship(confirmed);
      setConfirmRemove(false);
      const messages = { decline: 'Friend request declined.', accept: 'You are now friends.' };
      setNotice(messages[action]);
      invalidateFriendship(token, userId);
    } catch (error) {
      setError(error.message);
      checkFriendship();
      onRefresh();
    } finally { inFlight.current = false; setBusy(false); }
  };
  const spinner = busy ? <Loader2 size={15} className={styles.spin} /> : null;
  return <>
    <div className={styles.friendshipActions}>
      {relationship === null ? <span className={styles.pendingBadge} role="status">{checking && <Loader2 size={14} className={styles.spin} />}{checking ? 'Checking friendship…' : 'Friendship unavailable'}</span>
        : relationship === 'friends' ? <><span className={styles.friendsBadge}><Check size={14} /> Friends</span><button type="button" className={styles.friendSecondary} disabled={requestDisabled} onClick={() => { setError(''); setConfirmRemove(true); }}><UserMinus size={14} /> Remove friend</button></>
        : relationship === 'incoming' ? <><span className={styles.requestHint}>Sent you a friend request</span><button type="button" className={styles.friendPrimary} disabled={disabled} onClick={() => perform('accept')}>{spinner || <UserPlus size={15} />} Accept request</button><button type="button" className={styles.friendSecondary} disabled={disabled} onClick={() => perform('decline')}><X size={14} /> Decline</button></>
          : relationship === 'outgoing' ? <button type="button" className={styles.friendSecondary} disabled={requestDisabled} onClick={() => performRequest('cancel')}><X size={14} /> Cancel request</button>
            : <button type="button" className={styles.friendPrimary} disabled={requestDisabled} onClick={() => performRequest('add')}><UserPlus size={15} /> Add friend</button>}
    </div>
    {notice && <p className={styles.relationshipNotice} role="status">{notice}</p>}
    {error && !confirmRemove && <p className={styles.relationshipError} role="alert">{error}</p>}
    {checkError && <div className={styles.boardError} role="alert"><span>{checkError}</span><button type="button" className={styles.retryButton} aria-label="Retry friendship check" disabled={checking} onClick={checkFriendship}><RefreshCw size={13} /></button></div>}
    {confirmRemove && <TestimonyDialog title="Remove friend?" onClose={() => { if (!inFlight.current) setConfirmRemove(false); }}>
      <div className={styles.removeFriendDialog}><p>Remove <strong>{person.Name || person.username}</strong> from your friends?</p><p>You can send a new request later. Your shared testimonies will be visible to each other again once you become friends.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div><button type="button" className={styles.friendSecondary} onClick={() => setConfirmRemove(false)}>Keep friend</button><button type="button" className={styles.dangerButton} disabled={requestDisabled} onClick={() => performRequest('remove')}><UserMinus size={14} /> Remove friend</button></div>
      </div>
    </TestimonyDialog>}
  </>;
}
