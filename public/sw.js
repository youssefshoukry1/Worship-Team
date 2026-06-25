self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Helper function to open IndexedDB
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('Taspe7OfflineDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('sync-queue')) {
        db.createObjectStore('sync-queue', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Background sync processor
async function processSyncQueue() {
  try {
    const db = await openOfflineDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction('sync-queue', 'readonly');
      const store = tx.objectStore('sync-queue');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (!items || items.length === 0) return;

    for (const item of items) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: {
            ...item.headers,
            'Content-Type': 'application/json'
          },
          body: item.payload ? JSON.stringify(item.payload) : undefined
        });

        if (response.ok || response.status >= 400) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('sync-queue', 'readwrite');
            const store = tx.objectStore('sync-queue');
            store.delete(item.id);
            tx.oncomplete = resolve;
            tx.onerror = reject;
          });
        }
      } catch (err) {
        console.error('[SW] Sync failed for item', item.id, err);
        throw err; // Throwing error tells SyncManager to retry later
      }
    }
  } catch (err) {
    console.error('[SW] processSyncQueue failed', err);
    throw err;
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(processSyncQueue());
  }
});
