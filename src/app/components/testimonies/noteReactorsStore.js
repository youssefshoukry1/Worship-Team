// Account-scoped, bounded device cache. No polling or request on a fresh cache hit.
export function createNoteReactorsStore({ userId, request, storage, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  const key = `taspe7_note_reactors_v1:${userId}`;
  const maxAge = 15 * 60 * 1000;
  const entries = new Map();
  let disposed = false;
  const empty = () => ({ users: [], nextCursor: null, ready: false, loading: false, error: '' });
  const entryFor = id => {
    if (!entries.has(id)) entries.set(id, { id, state: empty(), listeners: new Set(), epoch: 0, dirty: false, savedAt: 0 });
    return entries.get(id);
  };
  try {
    for (const saved of JSON.parse(storage?.getItem(key) || '[]').slice(0, 30)) {
      if (!/^[a-f\d]{24}$/i.test(saved.id) || !Array.isArray(saved.users)) continue;
      Object.assign(entryFor(saved.id), saved, { firstUsers: saved.users.slice(0, 20), firstCursor: saved.nextCursor || null,
        state: { users: saved.users.slice(0, 20), nextCursor: saved.nextCursor || null, ready: true, loading: false, error: '' } });
    }
  } catch { /* Device storage is optional. */ }
  const persist = () => {
    try {
      const saved = [...entries.values()].filter(entry => entry.state.ready)
        .sort((a, b) => b.savedAt - a.savedAt).slice(0, 30)
        .map(entry => ({ id: entry.id, users: entry.firstUsers || entry.state.users.slice(0, 20),
          nextCursor: entry.firstCursor ?? null, version: entry.version, knownVersion: entry.knownVersion,
          count: entry.count, savedAt: entry.savedAt, dirty: entry.dirty }));
      storage?.setItem(key, JSON.stringify(saved));
    } catch { /* Continue with the in-memory cache if storage is full/unavailable. */ }
  };
  const emit = (entry, patch) => {
    entry.state = { ...entry.state, ...patch };
    for (const listener of entry.listeners) listener();
  };
  const needsRefresh = entry => !entry.state.ready || entry.dirty || now() - entry.savedAt >= maxAge;
  const fetchPage = (entry, cursor = null) => {
    if (disposed) return Promise.resolve();
    if (entry.pending && !entry.controller?.signal.aborted) return entry.pending;
    const epoch = entry.epoch;
    const controller = new AbortController();
    entry.controller = controller;
    emit(entry, { loading: true, error: '' });
    entry.pending = request(`/${entry.id}/loves${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal })
      .then(result => {
        if (disposed || controller.signal.aborted || epoch !== entry.epoch) return;
        if (Number.isFinite(result.loveVersion) && result.loveVersion < (entry.knownVersion || 0)) return;
        if (cursor && Number.isFinite(result.loveVersion) && result.loveVersion !== entry.version) {
          entry.dirty = true; entry.epoch++; return;
        }
        if (!cursor) {
          entry.firstUsers = result.users;
          entry.firstCursor = result.nextCursor;
        }
        const users = cursor ? [...entry.state.users, ...result.users.filter(user => !entry.state.users.some(old => old._id === user._id))] : result.users;
        entry.version = result.loveVersion ?? entry.knownVersion;
        entry.knownVersion = entry.version;
        entry.dirty = false;
        entry.savedAt = now();
        emit(entry, { users, nextCursor: result.nextCursor, ready: true, loading: false, error: '' });
        persist();
      }).catch(error => {
        if (disposed || controller.signal.aborted || epoch !== entry.epoch) return;
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          entry.firstUsers = []; entry.firstCursor = null; entry.savedAt = 0;
          emit(entry, { ...empty(), error: error.message }); persist();
        } else emit(entry, { error: error.message });
      }).finally(() => {
        if (entry.controller !== controller) return;
        entry.pending = null;
        if (disposed || controller.signal.aborted) return;
        emit(entry, { loading: false });
        // An update during a request gets one follow-up, never an older result.
        if (epoch !== entry.epoch && entry.listeners.size) queueRefresh(entry);
      });
    return entry.pending;
  };
  const queueRefresh = entry => {
    cancel(entry.timer);
    entry.timer = schedule(() => {
      if (!disposed && entry.listeners.size && needsRefresh(entry)) void fetchPage(entry);
    }, 200);
  };
  const invalidate = (id, { loveVersion, loveCount } = {}) => {
    const entry = entries.get(id);
    if (!entry) return;
    if (Number.isFinite(loveVersion)) {
      if (loveVersion <= (entry.knownVersion ?? -1)) return;
      entry.knownVersion = loveVersion;
    }
    entry.count = loveCount ?? entry.count;
    entry.dirty = true; entry.epoch++;
    persist();
    if (entry.listeners.size) queueRefresh(entry);
  };
  const prepare = item => {
    if (String(item.author?._id) !== String(userId)) return null;
    const entry = entryFor(item._id);
    if (Number.isFinite(item.loveVersion)) {
      if (entry.knownVersion !== undefined && item.loveVersion > entry.knownVersion) invalidate(item._id, item);
      entry.knownVersion = Math.max(entry.knownVersion ?? 0, item.loveVersion);
    } else if (entry.count !== undefined && entry.count !== item.loveCount) invalidate(item._id, item);
    entry.count = item.loveCount || 0;
    // A known empty note needs no identities query.
    if (!entry.count && !entry.pending && (!entry.knownVersion || item.loveVersion === entry.knownVersion)) {
      entry.dirty = false; entry.version = entry.knownVersion;
      entry.savedAt = now(); entry.firstUsers = []; entry.firstCursor = null;
      if (!entry.state.ready || entry.state.users.length) emit(entry, { ...empty(), ready: true });
      persist();
    }
    return entry;
  };
  return {
    getSnapshot: id => entryFor(id).state,
    subscribe(id, listener) { const entry = entryFor(id); entry.listeners.add(listener); return () => entry.listeners.delete(listener); },
    ensure(item) { const entry = prepare(item); return entry && needsRefresh(entry) ? fetchPage(entry) : Promise.resolve(); },
    prime(item) {
      const entry = prepare(item);
      if (!entry || entry.warmed) return;
      entry.warmed = true;
      if (needsRefresh(entry)) void fetchPage(entry);
    },
    loadMore(item) { const entry = prepare(item); if (!entry) return Promise.resolve(); return fetchPage(entry, entry.dirty ? null : entry.state.nextCursor); },
    retry(item) { const entry = prepare(item); return entry ? fetchPage(entry) : Promise.resolve(); },
    invalidate,
    remove(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.controller?.abort(); cancel(entry.timer); entry.epoch++;
      entry.firstUsers = []; entry.firstCursor = null; entry.savedAt = 0;
      emit(entry, empty()); persist();
    },
    activate() { disposed = false; },
    dispose() { disposed = true; for (const entry of entries.values()) { entry.controller?.abort(); cancel(entry.timer); } },
  };
}
