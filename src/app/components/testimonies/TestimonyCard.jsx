'use client';

import { Pin } from 'lucide-react';
import Link from 'next/link';
import OfflineAvatar from '../OfflineAvatar';
import styles from './testimonies.module.css';
import { profileHref } from './testimonyApi';

export default function TestimonyCard({ item, onRead, index = 0 }) {
  const name = item.author.Name || item.author.username || 'Friend';
  return <article className={styles.miniCard} style={{ '--tilt': `${[-1.5, 1, -.8][index % 3]}deg` }}>
    <div data-note-surface className={`${styles.miniNote} ${styles[item.style] || styles.olive}`}>
      <button type="button" className={styles.noteReadButton} aria-label={`Read testimony: ${item.title}`} onClick={event => onRead(item, event.currentTarget)}><h3 dir="auto">{item.title}</h3></button>
      <Link className={styles.miniAuthor} href={profileHref(item.author._id)} aria-label={`Visit ${name} profile`} title={name}>
        <OfflineAvatar userKey={item.author._id} remoteUrl={item.author.profilePhoto} name={name} className={styles.pinnedAvatar} />
        <span className={styles.noteAuthorName} dir="auto">{name}</span>
      </Link>
      <Pin className={styles.pin} strokeWidth={1.8} aria-hidden="true" />
    </div>
  </article>;
}
