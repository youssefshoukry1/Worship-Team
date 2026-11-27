import localforage from 'localforage';

const disk = localforage.createInstance({ name: 'taspe7_app', storeName: 'profile_testimony_cache' });

export function profileNotesStorage(viewerId) {
  const prefix = `${viewerId}:`;
  const ownKey = prefix + viewerId;
  const bodyPrefix = ownKey + ':note:';
  const bodyKey = row => bodyPrefix + row._id + ':' + (row.contentVersion || 0) + ':' + (row.updatedAt || '');
  let writes = Promise.resolve();
  let cleanup;
  let previous = new Set();
  const enqueue = work => writes = writes.catch(() => {}).then(work);
  const clearForeign = () => enqueue(async () => {
    for (const key of await disk.keys()) {
      if (key.startsWith(prefix) && key !== ownKey && !key.startsWith(bodyPrefix)) await disk.removeItem(key);
    }
  });
  const migrate = () => cleanup ||= clearForeign();
  async function save(value, extraBodies = []) {
    if (!Array.isArray(value.items)) return disk.setItem(ownKey, value);
    const keep = new Set(value.manifest.map(bodyKey));
    const known = new Set(previous);
    // Bodies are immutable at a content revision. Reaction totals live in the index.
    await Promise.all([...value.items, ...extraBodies].map(async item => {
      const key = bodyKey(item);
      if (!known.has(key)) { await disk.setItem(key, item); known.add(key); }
    }));
    const stored = [...known].filter(key => keep.has(key));
    await disk.setItem(ownKey, { ...value, items: value.items.slice(0, 12), stored });
    previous = new Set(stored);
    await Promise.all([...known].filter(key => !keep.has(key)).map(key => disk.removeItem(key)));
  }
  return {
    async getItem(id) {
      if (String(id) !== String(viewerId)) return null;
      await migrate(); await writes.catch(() => {});
      let saved = await disk.getItem(ownKey);
      if (saved?.items && !saved.stored) {
        await enqueue(() => save(saved));
        saved = await disk.getItem(ownKey);
      }
      if (!saved?.stored) return saved;
      const { stored, ...head } = saved;
      previous = new Set(stored);
      return head;
    },
    hasBody(row) { return previous.has(bodyKey(row)); },
    async bodies(id, rows, limit = rows.length) {
      if (String(id) !== String(viewerId)) return [];
      await writes.catch(() => {});
      return (await Promise.all(rows.filter(row => previous.has(bodyKey(row))).slice(0, limit).map(row => disk.getItem(bodyKey(row))))).filter(Boolean);
    },
    setItem(id, value, extraBodies) {
      if (String(id) !== String(viewerId)) return Promise.resolve();
      void migrate().catch(() => {});
      return enqueue(() => save(value, extraBodies));
    },
    removeItem(id) {
      if (String(id) !== String(viewerId)) return Promise.resolve();
      return enqueue(async () => {
        await disk.removeItem(ownKey);
        await Promise.all([...previous].map(key => disk.removeItem(key)));
        previous.clear();
      });
    },
    clearForeign: migrate,
  };
}
