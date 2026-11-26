'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { UserContext } from '../context/User_Context';
import { createPrayerSession } from './prayerSession';
import { createPrayerPlayback } from './prayerPlayback';
import { usePrayRecorder } from './usePrayRecorder';
import { subscribeLocalPrayers } from '../utils/prayRecordings';
import { watchPrayerReads } from '../services/prayerReadSync';

const Context = createContext(null);
export function usePrayerSession() {
    const session = useContext(Context);
    if (!session) throw new Error('PrayerSessionProvider is required');
    return session;
}
export function usePrayerField(key) {
    const session = usePrayerSession();
    const subscribe = useCallback(listener => session.subscribe(key, listener), [session, key]);
    const read = useCallback(() => session.get(key), [session, key]);
    const value = useSyncExternalStore(subscribe, read, read);
    const set = useCallback(update => session.set(key, update), [session, key]);
    return [value, set];
}

function RecorderHost({ session }) {
    const recorder = usePrayRecorder((blockId, recording) => {
        if (!session.active) { URL.revokeObjectURL(recording.url); return; }
        const clip = { id: crypto.randomUUID(), ...recording };
        if (blockId === 'general') session.set('generalRecordings', clips => [...clips, clip]);
        else session.set('prayBlocks', blocks => blocks.map(block => block.id === blockId ? { ...block, recordings: [...(block.recordings || []), clip] } : block));
    }, () => session.playback.pause());
    useLayoutEffect(() => { session.set('recorder', recorder); });
    return null;
}

function OwnerSession({ owner, token, children }) {
    const session = useMemo(() => Object.assign(createPrayerSession(owner), { playback: createPrayerPlayback() }), [owner]);
    useEffect(() => {
        if (!token || owner === 'guest') return;
        let stop;
        const start = () => {
            if (!stop && session.get('readsReady')) stop = watchPrayerReads(owner, token);
        };
        const unsubscribe = session.subscribe('readsReady', start);
        start();
        return () => { unsubscribe(); stop?.(); };
    }, [session, owner, token]);
    useEffect(() => {
        if (!token || owner === 'guest') return;
        const invalidate = event => {
            const type = event.detail?.type;
            const streams = type === 'PRAY_CONFIRMED' ? ['replies']
                : type === 'PRAY_SHARED' || type === 'PRAY_DELETED' ? ['inbox'] : ['inbox', 'replies'];
            for (const kind of streams) {
                session.set('deliveryChecked:' + kind, 0);
                session.set('deliveryRevision:' + kind, previous => Number(previous) + 1);
            }
        };
        window.addEventListener('taspe7:prayer-push', invalidate);
        window.addEventListener('offline', invalidate);
        return () => {
            window.removeEventListener('taspe7:prayer-push', invalidate);
            window.removeEventListener('offline', invalidate);
        };
    }, [session, token, owner]);
    useEffect(() => {
        session.mount();
        let previousRecordings;
        const unsubscribe = subscribeLocalPrayers(snapshot => {
            if (snapshot.recordings === previousRecordings) return;
            previousRecordings = snapshot.recordings;
            session.playback.retainSaved(snapshot.recordings);
        });
        return () => { unsubscribe(); session.unmount(); };
    }, [session]);
    return <Context.Provider value={session}><RecorderHost session={session} />{children}</Context.Provider>;
}

export default function PrayerSessionProvider({ children }) {
    const { user_id, isLogin } = useContext(UserContext);
    const owner = isLogin && user_id ? String(user_id) : 'guest';
    return <OwnerSession key={owner} owner={owner} token={isLogin}>{children}</OwnerSession>;
}
