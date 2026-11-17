// Friends feed cache rules are documented in ../../friends/README.md.
// Seen markers and downloaded note bodies use separate per-account stores.
export function createTestimonyFeedStore({ userId, request, storage, cache = null, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  const key = `taspe7_notes_seen_v1:${userId}`;
  let seen = {};
  try { seen = JSON.parse(storage?.getItem(key) || '{}') || {}; } catch { /* Fresh seen state. */ }
  if (typeof seen !== 'object' || Array.isArray(seen)) seen = {};
  let state = { items: [], activeNotes: [], publishing: null, nextCursor: null, loading: true, loadingMore: false, ready: false, error: '', hasUnseen: false, now: now() };
  const listeners = new Set(), requests = new Set(), revisions = new Map();
  let timer, pendingSync, syncAgain = false, disposed = false, generation = 0, accessGeneration = 0;
  let hydration, hydrated = !cache, cacheSnapshot = '', lastCachedItems = null, cacheInvalidated = false;
  const deleted = new Set();
  const persistNotes = () => {
    if (!cache || !hydrated || disposed) return;
    if (lastCachedItems?.length === state.items.length && state.items.every((item, index) => item === lastCachedItems[index])) return;
    lastCachedItems = state.items;
    // Keep the newest downloaded bodies, never fetch additional pages for caching.
    let size = 64;
    const items = [];
    for (const item of [...state.items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
      const bytes = JSON.stringify(item).length * 2 + 4;
      if (items.length >= 300) break;
      if (size + bytes > 2 * 1024 * 1024) continue;
      items.push(item); size += bytes;
    }
    const value = { version: 1, items };
    const signature = JSON.stringify(value);
    if (signature === cacheSnapshot) return;
    cacheSnapshot = signature;
    void cache.set(value).catch(() => { cacheSnapshot = ''; lastCachedItems = null; });
  };
  const persistSeen = () => {
    try { storage?.setItem(key, JSON.stringify(seen)); } catch { /* Seen state still works in memory. */ }
  };
  const emit = patch => {
    if (disposed) return;
    const time = now();
    state = { ...state, ...patch, now: time };
    state.items = state.items.filter(item => !deleted.has(item._id) && new Date(item.feedExpiresAt).getTime() > time);
    state.activeNotes = state.activeNotes.filter(item => !deleted.has(item._id) && new Date(item.feedExpiresAt).getTime() > time);
    // The complete active-note index owns eligibility, including notes beyond page one.
    // Never retain a cooldown after the owner's final active note is gone.
    if (state.ready && !state.error && state.publishing && !state.publishing.unlimited) {
      const next = Math.max(0, ...state.activeNotes.filter(item => String(item.authorId) === String(userId))
        .map(item => new Date(item.feedExpiresAt).getTime()));
      state.publishing = { ...state.publishing, canPublish: next <= time, nextPublishAt: next > time ? new Date(next).toISOString() : null };
    }
    let seenChanged = false;
    for (const [id, expiry] of Object.entries(seen)) if (expiry <= time) { delete seen[id]; seenChanged = true; }
    if (seenChanged) persistSeen();
    state.hasUnseen = state.activeNotes.some(item => String(item.authorId) !== String(userId) && !seen[item._id]);
    cancel(timer);
    const expiries = [...state.activeNotes.map(item => new Date(item.feedExpiresAt).getTime()), new Date(state.publishing?.nextPublishAt).getTime()].filter(expiry => expiry > time);
    if (expiries.length) timer = schedule(() => emit({}), Math.min(2147483647, expiries.reduce((soonest, value) => Math.min(soonest, value), Infinity) - time + 10));
    persistNotes();
    for (const listener of listeners) listener();
  };
  const fetchData = async path => {
    const controller = new AbortController(); requests.add(controller);
    try { return await request(path, { signal: controller.signal }); }
    finally { requests.delete(controller); }
  };
  const metadata = item => ({ _id: item._id, authorId: item.author._id, feedExpiresAt: item.feedExpiresAt });
  const remove = id => emit({ items: state.items.filter(item => item._id !== id), activeNotes: state.activeNotes.filter(item => item._id !== id) });
  const hydrate = () => {
    if (!cache || hydrated) return Promise.resolve();
    if (hydration) return hydration;
    const access = accessGeneration;
    hydration = cache.get().then(value => {
      if (disposed || access !== accessGeneration || state.ready) return;
      const items = (Array.isArray(value?.items) ? value.items : []).slice(0, 300)
        .filter(item => item && typeof item._id === 'string' && item.author?._id && typeof item.body === 'string'
          && !deleted.has(item._id) && new Date(item.feedExpiresAt).getTime() > now());
      const merged = [...state.items, ...items.filter(item => !state.items.some(old => old._id === item._id))];
      // Publishing eligibility and pagination are obtained from the server, not disk.
      if (merged.length) emit({ items: merged, activeNotes: merged.map(metadata), ready: true, loading: false });
    }).catch(() => { /* Unavailable disk must not prevent online operation. */ }).finally(() => {
      hydration = null;
      if (!disposed) {
        if (access !== accessGeneration && !cacheInvalidated && !state.ready) { void hydrate(); return; }
        hydrated = true; persistNotes();
      }
    });
    return hydration;
  };
  const denied = error => [401, 403, 404, 410].includes(error.status);
  const sync = (fresh = false) => {
    if (disposed) return Promise.resolve();
    if (pendingSync) { if (fresh) syncAgain = true; return pendingSync; }
    const version = ++generation;
    emit({ loading: !state.ready, error: '' });
    pendingSync = fetchData('').then(async result => {
      if (cache) await hydrate();
      if (disposed || version !== generation) return;
      const activeNotes = result.activeNotes || result.items.map(metadata);
      const allowed = new Map(activeNotes.map(item => [item._id, item]));
      if (result.activeNotes) {
        for (const id of [...state.items.map(item => item._id), ...revisions.keys()]) {
          if (!allowed.has(id)) revisions.set(id, (revisions.get(id) || 0) + 1);
        }
      }
      // The first page carries the complete access/expiry index. Preserve already
      // downloaded later pages only while their IDs remain in that index.
      const items = [...result.items, ...state.items.filter(item => allowed.has(item._id)
        && !result.items.some(fresh => fresh._id === item._id))]
        .map(item => ({ ...item, feedExpiresAt: allowed.get(item._id)?.feedExpiresAt || item.feedExpiresAt }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      emit({ ...result, items, activeNotes, ready: true, loading: false });
    }).catch(error => {
      if (!disposed && version === generation && error.name !== 'AbortError') {
        if (denied(error)) { cacheInvalidated = true; ++accessGeneration; emit({ items: [], activeNotes: [], publishing: null, ready: true }); }
        emit({ loading: false, error: error.message });
      }
    }).finally(() => {
      pendingSync = null;
      if (syncAgain && !disposed) { syncAgain = false; void sync(); }
    });
    return pendingSync;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    sync,
    hydrate,
    tick: () => emit({}),
    // Visiting the feed does not mean its notes have been opened.
    setFeedVisible() { emit({}); },
    isSeen(id) { return Boolean(seen[id]); },
    async loadMore() {
      if (!state.nextCursor || state.loadingMore) return;
      const version = generation, cursor = state.nextCursor;
      emit({ loadingMore: true, error: '' });
      try {
        const result = await fetchData(`?cursor=${encodeURIComponent(cursor)}`);
        if (version !== generation || disposed) return;
        const items = [...state.items.filter(old => !result.items.some(item => old._id === item._id)), ...result.items]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const activeNotes = [...state.activeNotes, ...result.items.filter(item => !state.activeNotes.some(old => old._id === item._id)).map(metadata)];
        emit({ ...result, items, activeNotes, loadingMore: false });
      } catch (error) { if (version === generation && error.name !== 'AbortError') emit({ error: error.message }); }
      finally { if (!disposed) emit({ loadingMore: false }); }
    },
    async changed(event) {
      if (disposed) return;
      if (event.action === 'access') {
        cacheInvalidated = true;
        ++generation; ++accessGeneration; for (const controller of requests) controller.abort();
        emit({ items: [], activeNotes: [], publishing: null, ready: false, loading: true });
        if (pendingSync) syncAgain = true;
        else void sync();
        return;
      }
      if (!/^[a-f\d]{24}$/i.test(event.id || '')) return;
      if (event.action === 'reaction' && String(event.authorId) === String(userId) && Number.isFinite(event.loveVersion)) {
        // The authenticated owner event already carries the count; no note read needed.
        emit({ items: state.items.map(item => item._id === event.id && event.loveVersion > (item.loveVersion || 0)
          ? { ...item, loveCount: event.loveCount, loveVersion: event.loveVersion } : item) });
        return;
      }
      const revision = (revisions.get(event.id) || 0) + 1;
      revisions.set(event.id, revision);
      if (pendingSync) syncAgain = true;
      if (event.action === 'deleted') { deleted.add(event.id); ++generation; remove(event.id); return { publishing: state.publishing }; }
      const access = accessGeneration;
      const version = ++generation;
      try {
        const result = await fetchData(`/note/${event.id}`);
        if (disposed || access !== accessGeneration || revisions.get(event.id) !== revision) return;
        const item = result.item;
        const items = state.items.filter(old => old._id !== item._id);
        items.push(item); items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        emit({ items, activeNotes: [...state.activeNotes.filter(old => old._id !== item._id), metadata(item)], ...(result.publishing ? { publishing: result.publishing } : {}), loading: false });
        return result;
      } catch (error) {
        if (!disposed && revisions.get(event.id) === revision && error.name !== 'AbortError') { if (denied(error)) { deleted.add(event.id); remove(event.id); } if (version === generation) emit({ error: error.message }); }
      }
    },
    markSeen(id, openedNote = null) {
      const item = state.activeNotes.find(note => note._id === id) || (openedNote ? metadata(openedNote) : null);
      if (!item) return;
      seen[id] = new Date(item.feedExpiresAt).getTime();
      persistSeen();
      emit({});
    },
    updateReaction(id, reaction) { emit({ items: state.items.map(item => item._id === id ? { ...item, ...reaction } : item) }); },
    activate() { disposed = false; void hydrate(); },
    clear() { cacheInvalidated = true; ++accessGeneration; hydrated = true; emit({ items: [], activeNotes: [], publishing: null }); this.dispose(); },
    dispose() { disposed = true; ++generation; ++accessGeneration; cancel(timer); for (const controller of requests) controller.abort(); },
  };
}
