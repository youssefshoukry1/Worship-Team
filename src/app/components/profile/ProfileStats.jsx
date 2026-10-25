import styles from '../testimonies/testimonies.module.css';

export default function ProfileStats({ stats, isOwner = false }) {
  return <dl className={styles.profileStats} aria-label="Profile statistics">
    <div><dd>{Number(stats.friends || 0).toLocaleString()}</dd><dt>{stats.friends === 1 ? 'Friend' : 'Friends'}</dt></div>
    {!isOwner && <div><dd>{Number(stats.mutualFriends || 0).toLocaleString()}</dd><dt>Mutual friends</dt></div>}
    {stats.testimonies != null && <div><dd>{Number(stats.testimonies).toLocaleString()}</dd><dt>{stats.testimonies === 1 ? 'Testimony' : 'Testimonies'}</dt></div>}
  </dl>;
}
