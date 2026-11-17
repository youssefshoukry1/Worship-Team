// Shared paged-list engine. See friends/README.md before changing its contracts.
export function createPeoplePageStore({ request, cache, now = Date.now }) {
  let state = { items: [], nextCursor: null, total: null, loading: false, ready: false, error: '' };
  let paused = false;
  let pending = null, controller, version = 0, syncedAt = 0, hydration, hydrated = false, retryMore = false;
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const save = () => {
    if (cache && state.items.length <= 100) void cache.set({ items: state.items, nextCursor: state.nextCursor, total: state.total }).catch(() => {});
  };
  const hydrate = () => {
    const current = version;
    return hydration ||= Promise.resolve(cache?.get()).then(value => {
      if (current === version && !state.ready && value && Array.isArray(value.items)) emit({ ...value, ready: true });
    }).catch(() => {}).finally(() => { hydrated = true; });
  };
  const load = (more = false) => {
    if (paused) return Promise.resolve();
    if (pending) return pending;
    if (more && !state.nextCursor) return Promise.resolve();
    const current = version;
    controller = new AbortController();
    const signal = controller.signal;
    retryMore = more;
    emit({ loading: true, error: '' });
    pending = (async () => {
      if (!hydrated) await hydrate();
      if (current !== version) return;
      const target = more ? 0 : state.items.length;
      let items = more ? [...state.items] : [], cursor = more ? state.nextCursor : null, result;
      do {
        result = await request(cursor, signal);
        if (signal.aborted || current !== version) return;
        if (!Array.isArray(result.items)) throw new Error('Could not load people. Please try again.');
        const ids = new Set(items.map(item => String(item._id)));
        items.push(...result.items.filter(item => !ids.has(String(item._id))));
        const previousCursor = cursor;
        cursor = result.nextCursor || null;
        if (cursor && cursor === previousCursor) throw new Error('Could not advance to the next page.');
      } while (!more && cursor && items.length < target);
      syncedAt = now();
      emit({ items, nextCursor: cursor, total: result.total ?? state.total, ready: true, loading: false });
      save();
    })().catch(error => {
      if (current === version && error.name !== 'AbortError') emit({ loading: false, error: error.message });
    }).finally(() => { if (current === version) { pending = null; emit({ loading: false }); } });
    return pending;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    ensure() { return state.ready && now() - syncedAt < 15000 ? Promise.resolve() : load(); },
    refresh: () => load(),
    loadMore: () => load(true),
    retry: () => load(retryMore),
    pause(value) { paused = value; if (value) this.invalidate(); },
    setItems(update) { emit({ items: typeof update === 'function' ? update(state.items) : update }); },
    invalidate() { ++version; syncedAt = 0; controller?.abort(); pending = null; emit({ loading: false }); },
  };
}
