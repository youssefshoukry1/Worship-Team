// No React, network or storage globals: the directory's synchronization state machine.
export const normalizeFriendSearch = text => String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const validId = id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
const clean = person => ({ _id: person._id, Name: String(person.Name || ''), username: String(person.username || ''),
  profilePhoto: person.profilePhoto || null, revision: Number(person.revision) || 0 });
export function createFriendDirectory({ request, cache, now = Date.now, yieldTask = () => Promise.resolve() }) {
  let state = { items: [], ready: false, complete: false, syncing: false, error: '', storageError: '', total: 0, cursor: null };
  let paused = false;
  let records = new Map(), index = new Map(), ids = new Set(), pending, hydration, disposed = false, generation = 0, controller, again = false, lastSync = 0, saving = Promise.resolve();
  const removals = new Map(), listeners = new Set();
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; for (const listener of listeners) listener(); } };
  const meta = extra => ({ version: 2, cursor: state.cursor, complete: state.complete, ids: [...ids], ...extra });
  const dirtyRows = new Map(), dirtyRemoved = new Set();
  let dirtyMeta;
  const save = change => {
    saving = saving.catch(() => {}).then(async () => {
      for (const id of change.removed || []) { dirtyRows.delete(id); dirtyRemoved.add(id); }
      for (const row of change.upserts || []) { dirtyRemoved.delete(row._id); dirtyRows.set(row._id, row); }
      if (change.meta) dirtyMeta = change.meta;
      if (!dirtyRows.size && !dirtyRemoved.size && !dirtyMeta) return;
      await cache.save({ upserts: [...dirtyRows.values()], removed: [...dirtyRemoved], ...(dirtyMeta ? { meta: dirtyMeta } : {}) });
      dirtyRows.clear(); dirtyRemoved.clear(); dirtyMeta = undefined;
      emit({ storageError: '' });
    }).catch(() => emit({ storageError: 'Friends are available now, but could not be saved on this device.' }));
    return saving;
  };
  const apply = (people = [], removed = []) => {
    const upserts = [], deleted = [];
    for (const id of removed) { if (records.delete(id)) deleted.push(id); index.delete(id); }
    for (const person of people) {
      if (!validId(person?._id) || removals.has(person._id)) continue;
      const item = clean(person), previous = records.get(item._id);
      if (previous && JSON.stringify(previous) === JSON.stringify(item)) continue;
      records.set(item._id, item); index.set(item._id, normalizeFriendSearch(`${item.Name} ${item.username}`)); upserts.push(item);
    }
    if (upserts.length || deleted.length) emit({ items: [...records.values()].sort((a, b) => a._id.localeCompare(b._id)) });
    return { upserts, removed: deleted };
  };
  const hydrate = () => {
    if (hydration) return hydration;
    const version = generation;
    hydration = cache.load().then(value => {
      if (disposed || version !== generation || !value?.meta || ![1, 2].includes(value.meta.version)) return;
      ids = new Set(value.meta.ids || []);
      apply((value.items || []).filter(person => ids.has(person._id)));
      emit({ ready: true, complete: Boolean(value.meta.complete), total: ids.size, cursor: value.meta.version === 2 ? value.meta.cursor || null : null });
    }).catch(() => { /* Online sync still works if the device denies IndexedDB. */ }).finally(() => { if (version !== generation) hydration = null; });
    return hydration;
  };
  const sync = (force = false) => {
    if (disposed || paused || removals.size) return Promise.resolve();
    if (pending) { again ||= force; return pending; }
    if (!force && state.complete && now() - lastSync < 30000) return Promise.resolve();
    const version = generation; controller = new AbortController(); const signal = controller.signal;
    const current = () => !disposed && version === generation && !signal.aborted;
    const read = async (path, options) => {
      const result = await request(path, { ...options, signal });
      if (!current()) throw Object.assign(new Error('Superseded'), { name: 'AbortError' });
      return result;
    };
    emit({ syncing: true, error: '' });
    pending = (async () => {
      await hydrate(); if (!current()) return;
      await save({}); if (!current()) return;
      if (!hydration) await hydrate(); if (!current()) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!state.cursor) {
          let after = null, baseline = null;
          const seen = new Set();
          emit({ complete: false });
          do {
            const result = await read(`/snapshot${after ? `?after=${after}&cursor=${encodeURIComponent(baseline)}` : ''}`);
            if (result.reset || !Array.isArray(result.items) || !result.cursor) throw new Error('Snapshot expired. Please retry.');
            if (result.next && result.next === after) throw new Error('Snapshot did not advance.');
            baseline = result.cursor;
            for (const person of result.items) { if (!validId(person?._id)) throw new Error('Invalid friend.'); seen.add(person._id); ids.add(person._id); }
            const delta = apply(result.items);
            emit({ ready: true, total: ids.size });
            await save({ ...delta, meta: meta({ cursor: null, complete: false }) });
            after = result.next;
            await yieldTask(); if (!current()) return;
          } while (after);
          ids = seen;
          const delta = apply([], [...records.keys()].filter(id => !ids.has(id)));
          emit({ cursor: baseline, total: ids.size });
          await save({ ...delta, meta: meta() }); if (!current()) return;
        }
        let reset = false;
        do {
          const result = await read(`/sync?cursor=${encodeURIComponent(state.cursor)}`);
          if (result.reset) { emit({ cursor: null, complete: false }); reset = true; break; }
          if (!Array.isArray(result.changes) || !result.cursor || (result.hasMore && result.cursor === state.cursor)) throw new Error('Invalid sync response.');
          const people = [], removed = [];
          for (const change of result.changes) {
            if (change.type === 'upsert' && validId(change.person?._id)) { ids.add(change.person._id); people.push(change.person); }
            else if (change.type === 'remove' && validId(change.id)) { ids.delete(change.id); removed.push(change.id); }
            else throw new Error('Invalid directory change.');
          }
          const delta = apply(people, removed);
          emit({ cursor: result.cursor, complete: !result.hasMore, ready: true, total: ids.size });
          // Rows and cursor are one IndexedDB transaction: replay is safe after a crash.
          await save({ ...delta, meta: meta() });
          await yieldTask(); if (!current()) return;
          if (!result.hasMore) { lastSync = now(); return; }
        } while (current());
        if (!reset) return;
      }
      throw new Error('Directory recovery could not finish. Please retry.');
    })().catch(error => {
      if (current() && error.name !== 'AbortError') emit({ error: 'Could not sync friends. Saved friends are still available.' });
    }).finally(() => {
      if (version === generation) { pending = null; emit({ syncing: false }); }
      if (again && !disposed && !removals.size) { again = false; void sync(true); }
    });
    return pending;
  };
  const invalidate = () => { ++generation; controller?.abort(); pending = null; lastSync = 0; emit({ syncing: false }); };
  const removeKnown = id => {
    invalidate(); ids.delete(id);
    const delta = apply([], [id]); emit({ total: ids.size });
    void save({ ...delta, removed: [id], meta: meta() });
  };
  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    hydrate, sync,
    restart() { invalidate(); return sync(true); },
    search(query, items = state.items) {
      const terms = normalizeFriendSearch(query).replace(/^@/, '').split(/\s+/).filter(Boolean);
      return terms.length ? items.filter(person => terms.every(term => index.get(person._id)?.includes(term))) : items;
    },
    setItems(update) {
      const next = typeof update === 'function' ? update(state.items) : update;
      const nextIds = new Set(next.map(person => person._id));
      for (const id of records.keys()) if (!nextIds.has(id)) ids.delete(id);
      for (const id of nextIds) ids.add(id);
      const delta = apply(next, [...records.keys()].filter(id => !nextIds.has(id)));
      emit({ total: ids.size }); void save({ ...delta, meta: meta() });
    },
    removeKnown,
    pause(value) { paused = value; if (value) invalidate(); },
    beginRemoval(id) {
      const previous = records.get(id); removals.set(id, previous); removeKnown(id);
      let finished = false;
      return success => {
        if (finished) return; finished = true; removals.delete(id);
        if (!success && previous) {
          ids.add(id); const delta = apply([previous]); emit({ total: ids.size }); void save({ ...delta, meta: meta() });
        }
        if (!removals.size) void sync(true);
      };
    },
    activate() { disposed = false; },
    dispose() { invalidate(); disposed = true; },
  };
}
