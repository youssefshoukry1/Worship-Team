import localforage from 'localforage';

// IndexedDB transactions commit changed rows and their checkpoint together.
let database;
const oldPages = localforage.createInstance({ name: 'taspe7_app', storeName: 'people_pages_v1' });
const retired = new Set();
async function retireLegacy(ownerId) {
  if (retired.has(ownerId)) return;
  await oldPages.removeItem(`${ownerId}:friends`);
  const key = `friends_data_${ownerId}`, legacy = await localforage.getItem(key);
  if (legacy?.friends) { delete legacy.friends; delete legacy.friendsSyncedAt; await localforage.setItem(key, legacy); }
  retired.add(ownerId);
}
async function legacySnapshot(ownerId) {
  const page = await oldPages.getItem(`${ownerId}:friends`);
  const legacy = page?.items || (await localforage.getItem(`friends_data_${ownerId}`))?.friends;
  if (!Array.isArray(legacy)) return null;
  const items = legacy.filter(person => typeof person?._id === 'string');
  return { items, meta: { version: 1, ids: items.map(person => person._id), membership: '', watermark: 0, complete: false } };
}
const sessions = new Map();
const sessionFor = id => {
  if (!sessions.has(id)) sessions.set(id, { epoch: 0, writes: Promise.resolve() });
  return sessions.get(id);
};
const open = () => database ||= new Promise((resolve, reject) => {
  const request = indexedDB.open('wasla_friend_directory_v1', 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore('people', { keyPath: ['ownerId', '_id'] });
    db.createObjectStore('checkpoints', { keyPath: 'ownerId' });
  };
  request.onerror = () => { database = null; reject(request.error); };
  request.onblocked = () => { database = null; reject(new Error('Friend storage is busy.')); };
  request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => { db.close(); database = null; };
    resolve(db);
  };
});
const range = id => IDBKeyRange.bound([id, ''], [id, '\uffff']);
const enqueue = (session, work) => {
  session.writes = session.writes.catch(() => {}).then(work);
  return session.writes;
};
export function friendDirectoryStorage(ownerId) {
  const session = sessionFor(ownerId), epoch = session.epoch;
  return {
    async load() {
      await session.writes.catch(() => {});
      if (epoch !== session.epoch) return null;
      const db = await open();
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(['people', 'checkpoints'], 'readonly');
        const rows = tx.objectStore('people').getAll(range(ownerId));
        const checkpoint = tx.objectStore('checkpoints').get(ownerId);
        tx.oncomplete = () => resolve(epoch === session.epoch ? { items: rows.result.map(row => { const person = { ...row }; delete person.ownerId; return person; }), meta: checkpoint.result } : null);
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage read interrupted.'));
      });
      if (epoch !== session.epoch) return null;
      if (result?.meta) return result;
      const legacy = await legacySnapshot(ownerId);
      if (!legacy || epoch !== session.epoch) return null;
      // Migrate rows before exposing them, so unchanged sync rows survive restart.
      await enqueue(session, async () => {
        if (epoch !== session.epoch) return;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['people', 'checkpoints'], 'readwrite');
          for (const person of legacy.items) tx.objectStore('people').put({ ...person, ownerId });
          tx.objectStore('checkpoints').put({ ...legacy.meta, ownerId });
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
      });
      return epoch === session.epoch ? legacy : null;
    },
    save({ upserts = [], removed = [], meta }) {
      return enqueue(session, async () => {
        const db = await open();
        if (epoch !== session.epoch) return;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['people', 'checkpoints'], 'readwrite'), people = tx.objectStore('people');
          for (const id of removed) people.delete([ownerId, id]);
          for (const person of upserts) people.put({ ...person, ownerId });
          if (meta) tx.objectStore('checkpoints').put({ ...meta, ownerId });
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage write interrupted.'));
        });
        if (meta?.complete) await retireLegacy(ownerId).catch(() => {});
      });
    },
  };
}
export function clearFriendDirectoryStorage(ownerId) {
  const session = sessionFor(ownerId); ++session.epoch;
  return enqueue(session, async () => {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['people', 'checkpoints'], 'readwrite');
      tx.objectStore('people').delete(range(ownerId)); tx.objectStore('checkpoints').delete(ownerId);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    await retireLegacy(ownerId).catch(() => {});
  });
}
