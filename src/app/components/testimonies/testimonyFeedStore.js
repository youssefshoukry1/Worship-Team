// Note bodies live only in memory. Persist only seen IDs/expiry times, per account.
export function createTestimonyFeedStore({ userId, request, storage, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  const key = `taspe7_notes_seen_v1:${userId}`;
  let seen = {};
  try { seen = JSON.parse(storage?.getItem(key) || '{}') || {}; } catch { /* Fresh seen state. */ }
  if (typeof seen !== 'object' || Array.isArray(seen)) seen = {};
  let state = { items: [], activeNotes: [], publishing: null, nextCursor: null, loading: true, loadingMore: false, ready: false, error: '', hasUnseen: false, now: now() };
  const listeners = new Set(), requests = new Set(), revisions = new Map();
  let timer, pendingSync, syncAgain = false, disposed = false, feedVisible = false, generation = 0, accessGeneration = 0;
  const persistSeen = () => {
    try { storage?.setItem(key, JSON.stringify(seen)); } catch { /* Seen state still works in memory. */ }
  };
  const emit = patch => {
    if (disposed) return;
    const time = now();
    state = { ...state, ...patch, now: time };
    state.items = state.items.filter(item => new Date(item.feedExpiresAt).getTime() > time);
    state.activeNotes = state.activeNotes.filter(item => new Date(item.feedExpiresAt).getTime() > time);
    let seenChanged = false;
    for (const [id, expiry] of Object.entries(seen)) if (expiry <= time) { delete seen[id]; seenChanged = true; }
    if (feedVisible) {
      for (const item of state.activeNotes) {
        if (String(item.authorId) !== String(userId) && !seen[item._id]) {
          seen[item._id] = new Date(item.feedExpiresAt).getTime(); seenChanged = true;
        }
      }
    }
    if (seenChanged) persistSeen();
    state.hasUnseen = state.activeNotes.some(item => String(item.authorId) !== String(userId) && !seen[item._id]);
    cancel(timer);
    const expiries = [...state.activeNotes.map(item => new Date(item.feedExpiresAt).getTime()), new Date(state.publishing?.nextPublishAt).getTime()].filter(expiry => expiry > time);
    if (expiries.length) timer = schedule(() => emit({}), Math.min(2147483647, expiries.reduce((soonest, value) => Math.min(soonest, value), Infinity) - time + 10));
    for (const listener of listeners) listener();
  };
  const fetchData = async path => {
    const controller = new AbortController(); requests.add(controller);
    try { return await request(path, { signal: controller.signal }); }
    finally { requests.delete(controller); }
  };
  const metadata = item => ({ _id: item._id, authorId: item.author._id, feedExpiresAt: item.feedExpiresAt });
  const remove = id => emit({ items: state.items.filter(item => item._id !== id), activeNotes: state.activeNotes.filter(item => item._id !== id) });
  const sync = (fresh = false) => {
    if (disposed) return Promise.resolve();
    if (pendingSync) { if (fresh) syncAgain = true; return pendingSync; }
    const version = ++generation;
    emit({ loading: !state.ready, error: '' });
    pendingSync = fetchData('').then(result => {
      if (disposed || version !== generation) return;
      emit({ ...result, activeNotes: result.activeNotes || result.items.map(metadata), ready: true, loading: false });
    }).catch(error => {
      if (!disposed && version === generation && error.name !== 'AbortError') emit({ items: [], activeNotes: [], loading: false, error: error.message });
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
    tick: () => emit({}),
    setFeedVisible(visible) { feedVisible = visible; emit({}); },
    async loadMore() {
      if (!state.nextCursor || state.loadingMore) return;
      const version = generation, cursor = state.nextCursor;
      emit({ loadingMore: true, error: '' });
      try {
        const result = await fetchData(`?cursor=${encodeURIComponent(cursor)}`);
        if (version !== generation || disposed) return;
        const items = [...state.items, ...result.items.filter(item => !state.items.some(old => old._id === item._id))];
        const activeNotes = [...state.activeNotes, ...result.items.filter(item => !state.activeNotes.some(old => old._id === item._id)).map(metadata)];
        emit({ ...result, items, activeNotes, loadingMore: false });
      } catch (error) { if (version === generation && error.name !== 'AbortError') emit({ error: error.message }); }
      finally { if (!disposed) emit({ loadingMore: false }); }
    },
    async changed(event) {
      if (disposed) return;
      if (event.action === 'access') {
        ++generation; ++accessGeneration; for (const controller of requests) controller.abort();
        emit({ items: [], activeNotes: [], ready: false, loading: true });
        if (pendingSync) syncAgain = true;
        else void sync();
        return;
      }
      if (!/^[a-f\d]{24}$/i.test(event.id || '')) return;
      const revision = (revisions.get(event.id) || 0) + 1;
      revisions.set(event.id, revision);
      if (pendingSync) syncAgain = true;
      if (event.action === 'deleted') { ++generation; remove(event.id); return; }
      const access = accessGeneration;
      const version = ++generation;
      try {
        const result = await fetchData(`/note/${event.id}`);
        if (disposed || access !== accessGeneration || revisions.get(event.id) !== revision) return;
        const item = result.item;
        const items = state.items.filter(old => old._id !== item._id);
        items.push(item); items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        emit({ items, activeNotes: [...state.activeNotes.filter(old => old._id !== item._id), metadata(item)], ...(result.publishing ? { publishing: result.publishing } : {}), loading: false });
      } catch (error) {
        if (!disposed && revisions.get(event.id) === revision && error.name !== 'AbortError') { remove(event.id); if (version === generation) emit({ error: error.message }); }
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
    activate() { disposed = false; },
    dispose() { disposed = true; ++generation; ++accessGeneration; cancel(timer); for (const controller of requests) controller.abort(); },
  };
}
