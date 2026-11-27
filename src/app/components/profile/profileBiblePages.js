import localforage from 'localforage';
import { readCachedProfile } from '../../utils/profileCache';
import { groupNotes, groupHighlights } from '../../utils/bibleProfileGroups';
import { fetchTabJson, TAB_READ_FRESH_MS } from '../../utils/tabRequests';

import { journal, overlayBibleGroups, readerKey, readReaderMap, saveReaderMap, applyBibleMap } from '../../utils/bibleChanges';

const disk = localforage.createInstance({ name: 'taspe7_app', storeName: 'profile_bible_pages' });
const empty = { items: [], ready: false, busy: false, error: null, offline: false, total: 0, nextCursor: null };

export function createProfileBiblePages(api, owner, token, kind) {
    const prefix = JSON.stringify([api, owner, kind]);
    const key = index => prefix + '/' + index;
    const listeners = new Set();
    let pages = [];
    let legacyGroups;
    let state = empty;
    let freshAt = 0;
    let controller;
    let savedWrites = Promise.resolve();
    const publish = patch => {
        state = { ...state, ...patch };
        listeners.forEach(fn => fn());
    };
    let edits = [];
    const scope = journal.scope(api, owner, kind);
    const display = () => {
        const first = pages[0];
        const overlay = edits.filter(edit => edit.status === 'pending' || edit.version > (first?.version ?? -1));
        const base = pages.flatMap(page => page.items);
        const items = overlayBibleGroups(base, overlay, kind);
        publish({ ready: !!first || !!overlay.length, items,
            total: Math.max(items.length, (first?.total || 0) + items.length - base.length),
            nextCursor: pages.at(-1)?.nextCursor || null });
    };
    const persist = (index, page) => {
        const commit = savedWrites.then(() => disk.setItem(key(index), page));
        savedWrites = commit.catch(() => {});
        return commit;
    };

    function legacyPage(index, cursor) {
        const start = index * 10;
        return { cursor, items: legacyGroups.slice(start, start + 10), total: legacyGroups.length,
            version: -1, nextCursor: start + 10 < legacyGroups.length ? String(start + 10) : null };
    }

    async function load(more = false, localOnly = false) {
        if (controller || (more && !state.nextCursor)) return;
        if (!more && state.ready && !state.error && !state.offline && Date.now() - freshAt < TAB_READ_FRESH_MS) return;
        const request = new AbortController();
        controller = request;
        const index = more ? pages.length : 0;
        const cursor = more ? state.nextCursor : null;
        publish({ busy: true, error: null });
        const accept = (page, replace) => {
            // A matching revision keeps all later pages and the reading position.
            if (index === 0 && pages.length && pages[0].version !== page.version) {
                pages = [];
                store.anchor = null;
            }
            if (replace || !pages[index]) pages[index] = page;
            display();
        };
        let retryFirst = false;
        try {
            const current = await journal.list(scope);
            if (request.signal.aborted) return;
            edits = current;
            if (edits.length || pages.length || state.ready) display();
            if (more && pages[0]?.version === -1 && legacyGroups) {
                accept(legacyPage(index, cursor), true);
                return;
            }
            if (!pages[index]) {
                const cached = await disk.getItem(key(index)).catch(() => null);
                if (request.signal.aborted) return;
                if (cached && cached.cursor === cursor && (!more || cached.version === pages[0].version)) {
                    accept(cached, false);
                    // The versioned cursor identifies this immutable page.
                    if (more) return;
                }
            }
            if (localOnly && state.ready) return;
            const query = new URLSearchParams({ limit: '10' });
            if (cursor) query.set('cursor', cursor);
            const result = await fetchTabJson(`${api}/users/profile-bible/${kind}?${query}`, token, request.signal);
            if (request.signal.aborted) return;
            if (!Array.isArray(result?.items) || result.items.length > 10 || !Number.isInteger(result.total) ||
                !Number.isInteger(result.version)) throw new Error('Invalid Bible collection response');
            legacyGroups = undefined;
            const page = { ...result, cursor };
            accept(page, true);
            const commit = persist(index, page);
            if (!more && edits.some(e => e.status === 'confirmed' && e.version <= page.version)) {
                const confirmed = edits.filter(e => e.status === 'confirmed' && e.version <= page.version);
                for (const team of new Set(confirmed.map(e => e.team))) {
                    const key = readerKey(api, owner, team, kind);
                    saveReaderMap(key, applyBibleMap(readReaderMap(key), confirmed.filter(e => e.team === team)));
                }
                commit.then(() => journal.prune(scope, page.version)).catch(console.warn);
            }
            if (!more) freshAt = Date.now();
            publish({ offline: false });
        } catch (error) {
            if (request.signal.aborted) return;
            if (more && error.status === 409) {
                freshAt = 0;
                retryFirst = true;
            } else {
                const offline = !navigator.onLine || error instanceof TypeError;
                if (offline && !more && !pages.length) {
                    const legacy = await readCachedProfile(owner);
                    if (request.signal.aborted) return;
                    const entries = kind === 'notes' ? legacy?.bibleNotes : legacy?.bibleHighlights;
                    if (Array.isArray(entries)) {
                        legacyGroups = kind === 'notes' ? groupNotes(entries) : groupHighlights(entries);
                        accept(legacyPage(0, null), true);
                    }
                }
                publish({ error: more ? 'more' : 'first', offline });
            }
        } finally {
            if (controller === request) {
                controller = null;
                publish({ busy: false });
                if (retryFirst) void load(false);
            }
        }
    }
    const store = {
        anchor: null,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        snapshot: () => state,
        load,
        cancel() {
            controller?.abort();
            controller = null;
            if (state.busy) publish({ busy: false });
        },
        invalidate() {
            store.cancel();
            freshAt = 0;
        },
    };
    return store;
}
