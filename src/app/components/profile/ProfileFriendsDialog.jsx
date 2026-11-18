'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import OfflineAvatar from '../OfflineAvatar';
import TestimonyDialog from '../testimonies/TestimonyDialog';
import { profileHref } from '../testimonies/testimonyApi';
import { changeFriendship, invalidateFriendship } from '../../utils/friendshipActions';
import usePeoplePage from '../../utils/usePeoplePage';
import useLocalFriends from '../../utils/friendDirectory/useLocalFriends';
import FriendDirectoryStatus from '../FriendDirectoryStatus';
import PeoplePager from '../PeoplePager';
import styles from './profileFriends.module.css';
import { useLanguage } from '../../context/LanguageContext';

function Person({ person, token, userId, onClose }) {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
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
      {relationship === 'self' || relationship === 'friends' ? <span className={styles.status}>{relationship === 'self' ? (ar ? 'أنت' : 'You') : t('friendsPlural')}</span>
        : <button type="button" className={styles.action} disabled={busy} onClick={act}>{busy ? (ar ? 'جاري الحفظ…' : 'Saving…') : relationship === 'incoming' ? (ar ? 'قبول الطلب' : 'Accept request') : relationship === 'outgoing' ? (ar ? 'إلغاء الطلب' : 'Cancel request') : (ar ? 'إضافة صديق' : 'Add friend')}</button>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </li>;
}

function PeopleList({ kind, query, profileUserId, token, userId, onClose }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 200); return () => clearTimeout(timer); }, []);
  const remote = usePeoplePage(`testimonies/profile/${profileUserId}/friends?kind=${kind}&q=${encodeURIComponent(query)}`, token, userId, ready && String(profileUserId) !== String(userId), false);
  const local = useLocalFriends(token, userId, query, ready && String(profileUserId) === String(userId));
  const page = String(profileUserId) === String(userId) ? { ...local, items: local.items.map(person => ({ ...person, relationship: 'friends' })) } : remote;
  return <div className={styles.results} aria-busy={page.loading}>
    <ul className={styles.people}>{page.items.map(person => <Person key={`${person._id}:${person.relationship}`} person={person} token={token} userId={userId} onClose={onClose} />)}</ul>
    {!page.loading && page.ready && !page.error && !page.items.length && <p className={styles.message}>{query ? (ar ? 'لم يتم العثور على أصدقاء مطابقين.' : 'No matching friends.') : kind === 'mutual' ? (ar ? 'لا يوجد أصدقاء مشتركون بعد.' : 'No mutual friends yet.') : (ar ? 'لا يوجد أصدقاء لعرضهم بعد.' : 'No friends to show yet.')}</p>}
    {String(profileUserId) === String(userId) && <FriendDirectoryStatus page={local} />}
    <PeoplePager page={page} active={ready} />
  </div>;
}

export default function ProfileFriendsDialog({ initialKind, isOwner, profileUserId, token, userId, onClose }) {
  const { t, language } = useLanguage();
  const ar = language === 'ar';
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState('');
  return <TestimonyDialog title={kind === 'mutual' ? t('mutualFriends') : t('friendsPlural')} onClose={onClose}>
    <div className={styles.toolbar}>
      {!isOwner && <div className={styles.tabs} aria-label="Friend list filter">{['friends', 'mutual'].map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{value === 'friends' ? (ar ? 'كل الأصدقاء' : 'All friends') : t('mutualFriends')}</button>)}</div>}
      <input type="search" aria-label={ar ? 'البحث عن أصدقاء' : 'Search friends'} placeholder={ar ? 'البحث عن أصدقاء' : 'Search friends'} value={query} maxLength={80} onChange={event => setQuery(event.target.value)} />
    </div>
    <PeopleList key={`${kind}:${query}`} kind={kind} query={query} profileUserId={profileUserId} token={token} userId={userId} onClose={onClose} />
  </TestimonyDialog>;
}
