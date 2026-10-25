'use client';

import { Clock3 } from 'lucide-react';
import Link from 'next/link';
import styles from './testimonies.module.css';
import { profileHref, remainingTime } from './testimonyApi';

export default function TestimonyCard({ item, onRead, index = 0, now }) {
  return <article className={styles.miniCard} style={{ '--tilt': `${[-1.5, 1, -.8][index % 3]}deg` }}>
    <button type="button" className={`${styles.miniNote} ${styles[item.style] || styles.olive}`} aria-label={`Read testimony: ${item.title}`} onClick={event => onRead(item, event.currentTarget)}>
      <span className={styles.pin} aria-hidden="true" />
      <h3 dir="auto">{item.title}</h3>
      <span className={styles.miniTime}><Clock3 size={9} />{remainingTime(item.feedExpiresAt, now)}</span>
    </button>
    <Link className={styles.miniAuthor} href={profileHref(item.author._id)} aria-label={`Visit ${item.author.Name || item.author.username || 'friend'} profile`}>{item.author.Name || item.author.username || 'Friend'}</Link>
  </article>;
}
