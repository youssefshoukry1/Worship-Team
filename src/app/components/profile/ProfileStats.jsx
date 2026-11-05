'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import ProfileFriendsDialog from './ProfileFriendsDialog';
import styles from './profileFriends.module.css';

export default function ProfileStats({ stats, isOwner = false, profileUserId, token, userId, roleBadge }) {
  const [kind, setKind] = useState(null);
  return <>
    <div className={`${styles.stats} ${isOwner ? styles.ownerStats : ''}`} aria-label="Profile connections">
      <button type="button" onClick={() => setKind('friends')} aria-haspopup="dialog"><span><strong>{Number(stats.friends || 0).toLocaleString()}</strong> {stats.friends === 1 ? 'Friend' : 'Friends'}</span><ChevronRight size={15} aria-hidden="true" /></button>
      {!isOwner && <button type="button" onClick={() => setKind('mutual')} aria-haspopup="dialog"><span><strong>{Number(stats.mutualFriends || 0).toLocaleString()}</strong> Mutual friends</span><ChevronRight size={15} aria-hidden="true" /></button>}
      {isOwner && roleBadge && <div className={styles.roleBadge}>{roleBadge}</div>}
    </div>
    {kind && <ProfileFriendsDialog key={profileUserId} initialKind={kind} isOwner={isOwner} profileUserId={profileUserId} token={token} userId={userId} onClose={() => setKind(null)} />}
  </>;
}
