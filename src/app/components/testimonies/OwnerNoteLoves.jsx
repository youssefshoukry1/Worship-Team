'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import OfflineAvatar from '../OfflineAvatar';
import { useNoteReactorsStore } from './TestimonyFeedProvider';
import styles from './testimonies.module.css';

export default function OwnerNoteLoves({ item, onOpen }) {
    const store = useNoteReactorsStore();
    const subscribe = useCallback(listener => store.subscribe(item._id, listener), [store, item._id]);
    const snapshot = useCallback(() => store.getSnapshot(item._id), [store, item._id]);
    const data = useSyncExternalStore(subscribe, snapshot, snapshot);
    useEffect(() => { void store.ensure(item); }, [store, item]);
    const count = Math.max(0, item.loveCount || 0);
    const users = data.users.slice(0, Math.min(4, count));
    const more = Math.max(0, count - users.length);

    return <button type="button" className={styles.ownerLoves} onClick={onOpen}
        aria-label="See who loved this note" aria-expanded="false" title={`${count} ${count === 1 ? 'love' : 'loves'}`}>
        <span>{count ? 'Loved by' : 'No loves yet'}</span>
        {users.length > 0 && <span className={styles.loveAvatarStack}>
            {users.map(user => <OfflineAvatar key={user._id} userKey={user._id} remoteUrl={user.profilePhoto}
                name={user.Name || user.username || 'Friend'} className={styles.lovePreviewAvatar} />)}
        </span>}
        {count > 0 && !users.length && data.loading && <Loader2 size={12} className={styles.spin} aria-hidden="true" />}
        {more > 0 && <span className={styles.moreLoveCount}>+{more}</span>}
    </button>;
}
