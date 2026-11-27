// Permanent profile collections are separate from the 24-hour Friends feed.
export function createProfileNotesStore({ userId, request, storage }) {
  const entries = new Map();
  const friendVisits = new Map();
  let session = 0, access = 0, disposed = false;
  const isOwn = entry => entry.id === String(userId);
  const blank = () => ({ items: [], manifest: [], nextCursor: null, ready: false, loading: true, loadingMore: false, checking: false, error: '' });
  const emptySnapshot = blank();
  const entryFor = id => {
    id = String(id);
    if (!entries.has(id)) entries.set(id, { id, state: blank(), listeners: new Set(), epoch: 0, checked: -1, dirty: false, writes: Promise.resolve() });
    return entries.get(id);
  };
  const emit = (entry, patch) => {
    if (disposed || entries.get(entry.id) !== entry) return;
    entry.state = { ...entry.state, ...patch };
    for (const listener of entry.listeners) listener();
  };
  const save = (entry, extraBodies = []) => {
    if (!isOwn(entry)) return;
    const epoch = entry.epoch;
    const data = { ...entry.state };
    for (const field of ['loading', 'checking', 'loadingMore', 'error']) delete data[field];
    entry.writes = entry.writes.catch(() => {}).then(() => {
      if (epoch === entry.epoch) return storage?.setItem(entry.id, { ...data, dirty: entry.dirty }, extraBodies);
    }).catch(() => {});
  };
  const hydrate = entry => {
    if (!isOwn(entry)) return Promise.resolve();
    if (!entry.hydrating) {
      const epoch = entry.epoch, generation = access;
      entry.hydrating = Promise.resolve().then(() => storage?.getItem(entry.id)).then(saved => {
        if (disposed || epoch !== entry.epoch || (entry.id !== String(userId) && generation !== access)) return;
        if (saved?.ready && Array.isArray(saved.items) && Array.isArray(saved.manifest) && !entry.state.ready) {
          entry.dirty = Boolean(saved.dirty);
          emit(entry, { ...saved, ...layout(saved.manifest, saved.items, saved.archiveCursor), loading: false, loadingMore: false, checking: false, error: '' });
        }
      }).catch(() => {});
    }
    return entry.hydrating;
  };
  const sortIndex = index => [...index].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || String(b._id).localeCompare(String(a._id)));
  const cursorFor = item => `${new Date(item.createdAt).getTime()}_${item._id}`;
  const pruneFriends = () => {
    for (const id of friendVisits.keys()) {
      if (friendVisits.size <= 5) break;
      const entry = entries.get(id);
      // Keep a mounted view stable during navigation; prune again on unsubscribe.
      if (entry?.listeners.size) continue;
      if (entry) { ++entry.epoch; entry.controller?.abort(); entry.moreController?.abort(); entries.delete(id); }
      friendVisits.delete(id);
    }
  };
  const visit = entry => {
    if (isOwn(entry)) return;
    friendVisits.delete(entry.id); friendVisits.set(entry.id, true);
    pruneFriends();
  };
  const metadata = item => ({ _id: item._id, createdAt: item.createdAt, updatedAt: item.updatedAt, contentVersion: item.contentVersion || 0,
    loveCount: item.loveCount || 0, loveVersion: item.loveVersion || 0 });
  const layout = (manifest, items, archiveCursor = null) => {
    const byId = new Map(items.map(item => [item._id, item]));
    return { manifest, archiveCursor, items: manifest.filter(item => byId.has(item._id)).map(item => {
      const body = byId.get(item._id);
      return (item.loveVersion || 0) >= (body.loveVersion || 0) ? { ...body, loveCount: item.loveCount, loveVersion: item.loveVersion } : body;
    }), nextCursor: manifest.find(item => !byId.has(item._id))?._id || archiveCursor };
  };
  const denied = (entry, error) => {
    ++entry.epoch; entry.checked = session; entry.dirty = false;
    emit(entry, { items: [], manifest: [], nextCursor: null, notesVersion: null, canViewTestimonies: false, ready: true, loading: false, loadingMore: false, checking: false, error: error?.message || '' });
    if (isOwn(entry)) entry.writes = entry.writes.catch(() => {}).then(() => storage?.removeItem(entry.id)).catch(() => {});
  };
  const check = async (entry, force = false) => {
    await hydrate(entry);
    if (disposed || entries.get(entry.id) !== entry) return;
    if (entry.pending && !entry.controller?.signal.aborted) return entry.pending;
    if (!force && entry.state.ready && entry.checked === session && !entry.dirty) return;
    const epoch = entry.epoch, currentSession = session;
    const controller = new AbortController(); entry.controller = controller;
    const current = () => !disposed && entries.get(entry.id) === entry && !controller.signal.aborted && entry.epoch === epoch;
    const read = path => request(path, { signal: controller.signal });
    emit(entry, { loading: !entry.state.ready, checking: true, error: '' });
    const cached = entry.state.ready && Number.isFinite(entry.state.notesVersion);
    const ids = entry.state.items.slice(0, 120).map(item => item._id);
    let query = cached ? `?notesVersion=${entry.state.notesVersion}${ids.length ? `&cachedIds=${ids.join(',')}` : ''}` : '';
    if (isOwn(entry)) query += (query ? "&" : "?") + "paged=1";
    entry.pending = (async () => {
      try {
        const result = await read(`/profile/${entry.id}${query}`);
        if (!current()) return;
        if (result.canViewTestimonies === false) {
          entry.dirty = false; entry.checked = currentSession;
          emit(entry, { ...result, items: [], manifest: [], nextCursor: null, ready: true, loading: false, checking: false });
          save(entry); return;
        }
        if (!isOwn(entry)) {
          const reactions = new Map((result.reactions || []).map(item => [item._id, item]));
          const items = (result.unchanged && cached ? entry.state.items : result.items || []).map(item => ({ ...item,
            author: result.user || item.author,
            ...((reactions.get(item._id)?.loveVersion || 0) >= (item.loveVersion || 0) ? reactions.get(item._id) : {}) }));
          if (!result.unchanged || !cached) entry.limit = 12;
          entry.checked = currentSession; entry.dirty = false;
          const profile = { ...result }; delete profile.reactions; delete profile.unchanged; delete profile.delta; delete profile.indexCursor;
          emit(entry, { ...profile, items, manifest: [], nextCursor: result.unchanged && cached ? entry.state.nextCursor : result.nextCursor || null,
            ready: true, loading: false, checking: false, error: '' });
          return;
        }
        let archiveCursor = result.archiveCursor ?? entry.state.archiveCursor;
        if (result.delta) {
          const archived = new Set(entry.state.manifest.map(row => row._id));
          const boundary = archiveCursor?.split('_');
          const rows = result.delta.rows.filter(row => !boundary || archived.has(row._id)
            || Number(new Date(row.createdAt)) > Number(boundary[0])
            || (Number(new Date(row.createdAt)) === Number(boundary[0]) && row._id >= boundary[1]));
          const changedIds = new Set(result.delta.ids);
          result.manifest = sortIndex([...entry.state.manifest.filter(row => !changedIds.has(row._id)), ...rows]);
        }
        if ('indexCursor' in result) {
          archiveCursor = null;
          let cursor = result.indexCursor;
          while (cursor) {
            const page = await read(`/profile/${entry.id}?paged=1&indexPage=1&cursor=${encodeURIComponent(cursor)}`);
            if (!current()) return;
            if (page.notesVersion !== result.notesVersion) { entry.epoch++; entry.dirty = true; return; }
            result.manifest.push(...page.manifest);
            cursor = page.indexCursor;
          }
        }
        let refreshedArchive = [];
        let manifest = result.manifest || entry.state.manifest;
        let items = result.items || entry.state.items;
        if (!cached) manifest = result.manifest || result.items.map(metadata);
        if (cached && !result.unchanged) {
          if (!result.manifest) throw new Error('Could not verify the saved notes. Please refresh.');
          const existing = new Map(entry.state.items.map(item => [item._id, item]));
          const wanted = new Set([...existing.keys(), ...manifest.slice(0, 12).map(item => item._id)]);
          const oldRows = new Map(entry.state.manifest.map(row => [row._id, row]));
          const changed = manifest.filter(item => {
            const old = oldRows.get(item._id);
            if (!wanted.has(item._id)) return old && storage?.hasBody?.(old) &&
              ((old.contentVersion || 0) !== (item.contentVersion || 0) || old.updatedAt !== item.updatedAt);
            return !existing.has(item._id)
            || (item.contentVersion || 0) !== (existing.get(item._id).contentVersion || 0)
            || item.updatedAt !== existing.get(item._id).updatedAt;
          }).map(item => item._id);
          const downloaded = [];
          for (let offset = 0; offset < changed.length; offset += 50) {
            const batch = await read(`/profile/${entry.id}/notes?ids=${changed.slice(offset, offset + 50).join(',')}`);
            if (!current()) return;
            if (batch.notesVersion !== result.notesVersion) { entry.epoch++; entry.dirty = true; return; }
            downloaded.push(...batch.items);
          }
          const changedSet = new Set(changed);
          refreshedArchive = downloaded.filter(item => !wanted.has(item._id));
          items = [...entry.state.items.filter(item => !changedSet.has(item._id)), ...downloaded.filter(item => wanted.has(item._id))];
        }
        const reactions = new Map((result.reactions || []).map(item => [item._id, item]));
        items = items.map(item => ({ ...item, author: result.user || item.author,
          ...((reactions.get(item._id)?.loveVersion || 0) >= (item.loveVersion || 0) ? reactions.get(item._id) : {}) }));
        // Returned reaction metadata is newer than the saved collection index too.
        manifest = manifest.map(item => ({ ...item, ...(reactions.get(item._id) || {}) }));
        if (!current()) return;
        entry.checked = currentSession; entry.dirty = false;
        const profile = { ...result };
        delete profile.reactions; delete profile.unchanged; delete profile.delta; delete profile.indexCursor;
        emit(entry, { ...profile, ...layout(manifest, items, archiveCursor), ready: true, loading: false, checking: false, error: '' });
        save(entry, refreshedArchive);
      } catch (error) {
        if (!current()) return;
        if ([401, 403, 404].includes(error.status)) denied(entry, error);
        else emit(entry, { loading: false, checking: false, error: error.message });
      } finally {
        if (entry.controller === controller) {
          entry.pending = null;
          if (current()) emit(entry, { loading: false, checking: false });
          if (!disposed && entry.listeners.size && ((epoch !== entry.epoch && entry.dirty) || currentSession !== session)) void check(entry);
        }
      }
    })();
    return entry.pending;
  };
  const changed = async (event, resolved = null) => {
    if (disposed) return;
    const entry = entries.get(String(event.authorId));
    if (!entry) return;
    await hydrate(entry);
    if (disposed || entries.get(entry.id) !== entry || entry.state.canViewTestimonies === false) return;
    if (!entry.state.ready) {
      entry.dirty = true; ++entry.epoch; entry.controller?.abort(); entry.pending = null;
      if (entry.listeners.size) void check(entry, true);
      return;
    }
    if (event.action === 'reaction') {
      const reaction = item => item._id === event.id && event.loveVersion > (item.loveVersion || 0)
        ? { ...item, loveCount: event.loveCount, loveVersion: event.loveVersion } : item;
      emit(entry, { items: entry.state.items.map(reaction), manifest: entry.state.manifest.map(reaction) }); save(entry); return;
    }
    if (!['created', 'updated', 'deleted'].includes(event.action)) return;
    const version = event.notesVersion;
    if (Number.isFinite(version) && version <= (entry.state.notesVersion ?? -1)) {
      if (version === entry.state.notesVersion && event.publishing) { emit(entry, { publishing: event.publishing }); save(entry); }
      return;
    }
    // A gap means an event was missed: reconcile IDs/versions, never guess deletions.
    if (!Number.isFinite(version) || version !== (entry.state.notesVersion || 0) + 1) {
      ++entry.epoch; entry.controller?.abort(); entry.pending = null;
      entry.dirty = true; save(entry);
      if (entry.listeners.size) void check(entry, true);
      return;
    }
    ++entry.epoch; entry.controller?.abort(); entry.pending = null;
    const epoch = entry.epoch;
    try {
      let item, publishing = event.publishing;
      if (event.action === 'deleted' && isOwn(entry) && resolved) publishing ||= (await resolved)?.publishing;
      const needsBody = event.action !== 'deleted' && (isOwn(entry) || event.action === 'created' || entry.state.items.some(item => item._id === event.id));
      if (needsBody) {
        const result = resolved ? await resolved : await request(`/note/${event.id}`);
        item = result?.item;
        publishing ||= result?.publishing;
        if (!item) { entry.dirty = true; save(entry); if (entry.listeners.size) void check(entry, true); return; }
      }
      if (disposed || entries.get(entry.id) !== entry || entry.epoch !== epoch || version <= (entry.state.notesVersion ?? -1)) return;
      if (!isOwn(entry)) {
        const combined = sortIndex([...entry.state.items.filter(note => note._id !== event.id), ...(item ? [item] : [])]);
        const limit = entry.limit || 12;
        const items = combined.slice(0, limit);
        const nextCursor = combined.length > limit ? cursorFor(items[items.length - 1]) : entry.state.nextCursor;
        entry.dirty = false;
        const delta = event.action === 'created' ? 1 : event.action === 'deleted' ? -1 : 0;
        emit(entry, { items, manifest: [], nextCursor, notesVersion: version, loading: false, checking: false,
          stats: { ...entry.state.stats, testimonies: Math.max(0, (entry.state.stats?.testimonies || 0) + delta) } });
        return;
      }
      const manifest = sortIndex([...entry.state.manifest.filter(note => note._id !== event.id), ...(item ? [metadata(item)] : [])]);
      const items = [...entry.state.items.filter(note => note._id !== event.id), ...(item ? [item] : [])];
      entry.dirty = false;
      emit(entry, { ...layout(manifest, items, entry.state.archiveCursor), notesVersion: version, loading: false, checking: false,
        stats: { ...entry.state.stats, testimonies: Math.max(0, (entry.state.stats?.testimonies ?? entry.state.manifest.length) + (event.action === 'created' ? 1 : event.action === 'deleted' ? -1 : 0)) }, ...(publishing ? { publishing } : {}) });
      save(entry);
    } catch (error) {
      if (entry.epoch !== epoch || disposed) return;
      if ([401, 403, 404].includes(error.status)) denied(entry, error);
      else { entry.dirty = true; save(entry); }
    }
  };
  return {
    railPosition(id) { const entry = entryFor(id); return entry.railPosition ||= {}; },
    getSnapshot: id => entries.get(String(id))?.state || emptySnapshot,
    subscribe(id, listener) { const entry = entryFor(id); entry.listeners.add(listener); return () => { entry.listeners.delete(listener); pruneFriends(); }; },
    ensure(id, options = {}) { const entry = entryFor(id); visit(entry); return check(entry, options.force); },
    changed,
    async loadMore(id) {
      const entry = entryFor(id);
      if (entry.state.loadingMore || !entry.state.nextCursor) return;
      if (entry.dirty && !isOwn(entry)) return check(entry, true);
      const epoch = entry.epoch;
      const loaded = new Set(entry.state.items.map(item => item._id));
      const wanted = isOwn(entry) ? entry.state.manifest.filter(item => !loaded.has(item._id)).slice(0, 12) : [];
      const controller = new AbortController();
      entry.moreController = controller;
      emit(entry, { loadingMore: true, error: '' });
      try {
        const cached = wanted.length ? await storage?.bodies?.(entry.id, wanted) || [] : [];
        if (disposed || epoch !== entry.epoch) return;
        if (entry.dirty && cached.length !== wanted.length && !entry.state.error) { return check(entry, true); }
        const missing = wanted.filter(row => !cached.some(item => item._id === row._id));
        const path = wanted.length ? `/profile/${id}/notes?ids=${missing.map(row => row._id).join(',')}`
          : `/profile/${id}?cursor=${encodeURIComponent(entry.state.nextCursor)}${isOwn(entry) ? '&paged=1' : ''}`;
        const result = wanted.length && !missing.length ? { items: [], notesVersion: entry.state.notesVersion }
          : await request(path, { signal: controller.signal });
        if (disposed || entries.get(entry.id) !== entry || epoch !== entry.epoch) return;
        if (result.canViewTestimonies === false) { denied(entry); return; }
        if (result.notesVersion !== entry.state.notesVersion) { entry.dirty = true; return check(entry, true); }
        const items = [...entry.state.items, ...cached, ...result.items.filter(item => !loaded.has(item._id))];
        if (isOwn(entry)) {
          const index = new Map(entry.state.manifest.map(row => [row._id, row]));
          for (const item of result.items) index.set(item._id, metadata(item));
          emit(entry, { ...layout(sortIndex([...index.values()]), items, wanted.length ? entry.state.archiveCursor : result.archiveCursor ?? result.nextCursor), loadingMore: false });
          save(entry);
        }
        else { entry.limit = Math.max(12, items.length); emit(entry, { items, manifest: [], nextCursor: result.nextCursor || null, loadingMore: false }); }
      } catch (error) {
        if (epoch !== entry.epoch || disposed) return;
        if ([401, 403, 404].includes(error.status)) denied(entry, error);
        else {
          const missing = entry.state.manifest.filter(row => !loaded.has(row._id));
          const available = isOwn(entry) && await storage?.bodies?.(id, missing, 12);
          if (epoch !== entry.epoch || disposed) return;
          if (available?.length) emit(entry, layout(entry.state.manifest, [...entry.state.items, ...available], entry.state.archiveCursor));
          emit(entry, { error: error.message });
        }
      } finally { if (epoch === entry.epoch) emit(entry, { loadingMore: false }); }
    },
    updateReaction(id, reaction) {
      for (const entry of entries.values()) {
        if (!entry.state.items.some(item => item._id === id)) continue;
        emit(entry, { items: entry.state.items.map(item => item._id === id ? { ...item, ...reaction } : item) }); save(entry);
      }
    },
    cachedNote(authorId, id) { return entryFor(authorId).state.items.find(item => item._id === id); },
    async readCachedNote(authorId, id) { const entry = entryFor(authorId); await hydrate(entry);
      const item = entry.state.items.find(item => item._id === id);
      const row = entry.state.manifest.find(meta => meta._id === id);
      if (item || !row || !isOwn(entry)) return item;
      const body = (await storage?.bodies?.(entry.id, [row]))?.[0];
      return body && entry.state.manifest.includes(row) ? { ...body, author: entry.state.user || body.author, ...row } : undefined; },
    refresh(id) { const entry = entries.get(String(id)); if (!entry) return; entry.checked = -1; if (entry.listeners.size) void check(entry, true); },
    resume() {
      ++session;
      for (const entry of entries.values()) if (entry.listeners.size) void check(entry);
    },
    accessChanged() {
      ++access;
      for (const entry of entries.values()) if (entry.id !== String(userId)) {
        entry.controller?.abort(); entry.moreController?.abort(); entry.pending = null; denied(entry); entry.hydrating = Promise.resolve(); entry.dirty = true; entry.checked = -1;
      }
      void storage?.clearForeign?.().catch(() => {});
      ++session;
      for (const entry of entries.values()) if (entry.listeners.size) void check(entry, true);
    },
    activate() { disposed = false; void storage?.clearForeign?.().catch(() => {}); },
    dispose() { disposed = true; for (const entry of entries.values()) { entry.controller?.abort(); entry.moreController?.abort(); } },
  };
}
