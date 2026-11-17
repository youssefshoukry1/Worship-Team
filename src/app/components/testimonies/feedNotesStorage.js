import localforage from 'localforage';

const disk = localforage.createInstance({ name: 'taspe7_app', storeName: 'friends_note_cache' });
const accounts = new Map();
const account = id => {
  if (!accounts.has(id)) accounts.set(id, { queue: Promise.resolve(), epoch: 0 });
  return accounts.get(id);
};
const enqueue = (session, work) => {
  session.queue = session.queue.catch(() => {}).then(work);
  return session.queue;
};

// A single atomic snapshot avoids half-written indexes. Only content changes write.
// This is separate from seen markers, avatar files and the owner's Profile archive.
export function feedNotesStorage(userId) {
  const session = account(userId), epoch = session.epoch;
  let previous = null;
  return {
    async get() {
      await session.queue.catch(() => {});
      if (epoch !== session.epoch) return null;
      const value = await disk.getItem(userId);
      return epoch === session.epoch && value?.version === 1 ? value : null;
    },
    set(value) {
      const serialized = JSON.stringify(value);
      if (serialized === previous || epoch !== session.epoch) return Promise.resolve();
      previous = serialized;
      return enqueue(session, async () => {
        if (epoch !== session.epoch) return;
        try { await disk.setItem(userId, value); }
        catch (error) { previous = null; throw error; }
      });
    },
  };
}

export function clearFeedNotes(userId) {
  if (!userId) return Promise.resolve();
  const session = account(userId);
  ++session.epoch; // Invalidate old adapters before queued writes can restore data.
  return enqueue(session, () => disk.removeItem(userId));
}
