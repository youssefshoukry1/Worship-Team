'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import OfflineAvatar from '../OfflineAvatar';
import TestimonyDialog from '../testimonies/TestimonyDialog';
import { profileHref, testimonyRequest } from '../testimonies/testimonyApi';
import { changeFriendship, invalidateFriendship } from '../../utils/friendshipActions';
import styles from './profileFriends.module.css';

function Person({ person, token, userId, onClose }) {
  const [relationship, setRelationship] = useState(person.relationship);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const action = relationship === 'incoming' ? 'accept' : relationship === 'outgoing' ? 'cancel' : 'add';
  const act = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await changeFriendship(token, person._id, action);
      setRelationship(action === 'accept' || result.status === 'accepted' ? 'friends' : action === 'add' ? 'outgoing' : 'none');
      invalidateFriendship(token, userId);
    } catch (error) {
      if (error.relationship === 'friends') setRelationship('friends');
      else setError(error.message);
    } finally { pending.current = false; setBusy(false); }
  };
  return <li className={styles.person}>
    <div className={styles.personRow}>
      <Link href={profileHref(person._id)} className={styles.identity} onClick={onClose}>
        <OfflineAvatar userKey={person._id} remoteUrl={person.profilePhoto} name={person.Name || person.username} className={styles.avatar} />
        <span className={styles.name}><strong>{person.Name || person.username}</strong><span>@{person.username}</span></span>
      </Link>
      {relationship === 'self' || relationship === 'friends' ? <span className={styles.status}>{relationship === 'self' ? 'You' : 'Friends'}</span>
        : <button type="button" className={styles.action} disabled={busy} onClick={act}>{busy ? 'Saving…' : relationship === 'incoming' ? 'Accept request' : relationship === 'outgoing' ? 'Cancel request' : 'Add friend'}</button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </li>;
}

function PeopleList({ kind, query, profileUserId, token, userId, onClose }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const controller = useRef(null);
  const load = useCallback(async (next = null) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ kind, q: query });
      if (next) params.set('cursor', next);
      const data = await testimonyRequest(token, `/profile/${profileUserId}/friends?${params}`, { signal: request.signal });
      if (!request.signal.aborted) {
        setItems(previous => next ? [...previous, ...data.items.filter(person => !previous.some(item => item._id === person._id))] : data.items);
        setCursor(data.nextCursor);
      }
    } catch (error) { if (!request.signal.aborted) setError(error.message); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }, [kind, query, profileUserId, token]);
  useEffect(() => {
    const timer = setTimeout(() => load(), 200);
    return () => { clearTimeout(timer); controller.current?.abort(); };
  }, [load]);
  return <div className={styles.results} aria-busy={loading}>
    <ul className={styles.people}>{items.map(person => <Person key={person._id} person={person} token={token} userId={userId} onClose={onClose} />)}</ul>
    {loading && <p role="status" className={styles.message}>Loading friends…</p>}
    {error && <div role="alert" className={styles.message}><p>{error}</p><button type="button" className={styles.action} onClick={() => load(items.length ? cursor : null)}>Try again</button></div>}
    {!loading && !error && !items.length && <p className={styles.message}>{query ? 'No matching friends.' : kind === 'mutual' ? 'No mutual friends yet.' : 'No friends to show yet.'}</p>}
    {cursor && !error && <button type="button" className={styles.more} disabled={loading} onClick={() => load(cursor)}>Show more</button>}
  </div>;
}

export default function ProfileFriendsDialog({ initialKind, isOwner, profileUserId, token, userId, onClose }) {
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState('');
  return <TestimonyDialog title={kind === 'mutual' ? 'Mutual friends' : 'Friends'} onClose={onClose}>
    <div className={styles.toolbar}>
      {!isOwner && <div className={styles.tabs} aria-label="Friend list filter">{['friends', 'mutual'].map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{value === 'friends' ? 'All friends' : 'Mutual friends'}</button>)}</div>}
      <input type="search" aria-label="Search friends" placeholder="Search friends" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} />
    </div>
    <PeopleList key={`${kind}:${query}`} kind={kind} query={query} profileUserId={profileUserId} token={token} userId={userId} onClose={onClose} />
  </TestimonyDialog>;
}
