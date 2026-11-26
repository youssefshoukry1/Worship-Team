// Runs in a blank fixture document. Seed the same account-scoped stores used by Friends.
async function seedFriendCache({ ownerId, friends, incomingRequests = [], outgoingRequests = [] }) {
  async function write(name, version, upgrade, stores, populate) {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(name, version);
      open.onupgradeneeded = () => upgrade(open.result);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const tx = db.transaction(stores, 'readwrite');
      populate(tx);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  await write(
    'wasla_friend_directory_v1',
    1,
    (db) => {
      db.createObjectStore('people', { keyPath: ['ownerId', '_id'] });
      db.createObjectStore('checkpoints', { keyPath: 'ownerId' });
    },
    ['people', 'checkpoints'],
    (tx) => {
      for (const person of friends) tx.objectStore('people').put({ ...person, ownerId });
      tx.objectStore('checkpoints').put({
        ownerId,
        version: 2,
        complete: true,
        cursor: '1',
        total: friends.length,
        ids: friends.map((person) => person._id),
      });
    }
  );
  await write(
    'taspe7_app',
    2,
    (db) => db.createObjectStore('people_pages_v1'),
    ['people_pages_v1'],
    (tx) => {
      for (const [kind, items] of [
        ['incoming', incomingRequests],
        ['outgoing', outgoingRequests],
      ]) {
        tx.objectStore('people_pages_v1').put(
          { items, total: items.length, nextCursor: null },
          ownerId + ':friend-requests?kind=' + kind
        );
      }
    }
  );
}
module.exports = { seedFriendCache };
