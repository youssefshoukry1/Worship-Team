// Transient, account-scoped UI state. Nothing here is written to prayer storage.
export function createPrayerSession(owner) {
    let disposed = false;
    const values = new Map();
    const listeners = new Map();
    const initial = {
        prayWords: '', prayBlocks: [], generalRecordings: [], selectedShareUser: null,
        isAnonymousShare: false, showShareSettings: false, activePrayTab: 'personal',
        circleFilter: 'all', expandedFriendPrayers: new Set(), recorder: null,
    };
    for (const [key, value] of Object.entries(initial)) values.set(key, value);
    const session = {
        owner, active: true,
        mount() { session.active = true; session.mountVersion = (session.mountVersion || 0) + 1; },
        unmount() {
            session.active = false;
            const version = session.mountVersion;
            queueMicrotask(() => { if (!session.active && session.mountVersion === version) { session.playback?.dispose(); session.active = true; session.dispose(); } });
        },
        get: key => values.has(key) ? values.get(key) : '',
        set(key, update) {
            if (!session.active) return;
            const previous = session.get(key), next = typeof update === 'function' ? update(previous) : update;
            if (Object.is(previous, next)) return;
            values.set(key, next);
            for (const listener of listeners.get(key) || []) listener();
        },
        subscribe(key, listener) {
            if (!listeners.has(key)) listeners.set(key, new Set());
            listeners.get(key).add(listener);
            return () => { const list = listeners.get(key); list?.delete(listener); if (!list?.size) listeners.delete(key); };
        },
        discardComposer() {
            for (const rec of [...session.get('generalRecordings'), ...session.get('prayBlocks').flatMap(block => block.recordings || [])]) {
                session.playback?.stop(`draft:${rec.url}`);
                URL.revokeObjectURL(rec.url);
            }
            for (const key of ['prayWords', 'prayBlocks', 'generalRecordings', 'selectedShareUser', 'isAnonymousShare', 'showShareSettings']) session.set(key, initial[key]);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            session.discardComposer();
            session.active = false;
            values.clear(); listeners.clear();
        },
    };
    return session;
}
