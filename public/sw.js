self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Next.js static exports store the React Server Component payload for each
// route as index.txt. Static hosts and Capacitor cannot content-negotiate an
// `?_rsc=` request, so point those client-navigation requests at the exported
// payload. This keeps navigation inside the mounted app (no global reload).
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.searchParams.has('_rsc')) return;

  const lastPathSegment = url.pathname.split('/').filter(Boolean).pop() || '';
  if (lastPathSegment.includes('.')) return;

  const routePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const payloadUrl = new URL(`${routePath}index.txt`, url.origin);

  event.respondWith(
    fetch(payloadUrl).then(async (response) => {
      if (!response.ok) return fetch(request);

      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'text/x-component');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }).catch(() => fetch(request))
  );
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
