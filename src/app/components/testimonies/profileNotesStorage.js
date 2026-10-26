import localforage from 'localforage';

const disk = localforage.createInstance({ name: 'taspe7_app', storeName: 'profile_testimony_cache' });

export function profileNotesStorage(viewerId) {
  const prefix = `${viewerId}:`;
  const ownKey = `${prefix}${viewerId}`;
  let writes = Promise.resolve();
  let cleanup;
  const enqueue = work => {
    writes = writes.catch(() => {}).then(work);
    return writes;
  };
  const clearForeign = () => enqueue(async () => {
    // Migrate older installations: retain this account's own notes only.
    for (const key of await disk.keys()) if (key.startsWith(prefix) && key !== ownKey) await disk.removeItem(key);
  });
  const migrate = () => cleanup ||= clearForeign();
  return {
    async getItem(id) {
      if (String(id) !== String(viewerId)) return null;
      await migrate(); await writes.catch(() => {});
      return disk.getItem(ownKey);
    },
    setItem(id, value) {
      if (String(id) !== String(viewerId)) return Promise.resolve();
      void migrate().catch(() => {});
      return enqueue(() => disk.setItem(ownKey, value));
    },
    removeItem(id) {
      if (String(id) !== String(viewerId)) return Promise.resolve();
      return enqueue(() => disk.removeItem(ownKey));
    },
    clearForeign,
  };
}
