/**
 * offlineQueue.js — Ultra-high-performance offline sync queue.
 *
 * Key optimisations:
 *  1. Singleton DB connection — IndexedDB is opened once and kept alive.
 *     All subsequent calls reuse the same connection in O(0) time.
 *  2. Fire-and-forget queuing — queueOfflineAction returns immediately;
 *     the IndexedDB write and SW registration happen in the background.
 *  3. No blocking awaits on the happy (online) path — users never wait.
 *  4. Background Sync registration is cached after the first call so
 *     navigator.serviceWorker.ready is never awaited more than once.
 */

// ─── Singleton DB connection ────────────────────────────────────────────────
let _dbPromise = null;

function getDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('Taspe7OfflineDB', 1);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sync-queue')) {
        db.createObjectStore('sync-queue', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror  = (e) => { _dbPromise = null; reject(e.target.error); };

    // If the DB connection is lost (e.g. browser GC) reset the singleton
    req.onsuccess = (e) => {
      const db = e.target.result;
      db.onclose = () => { _dbPromise = null; };
      resolve(db);
    };
  });

  return _dbPromise;
}

// ─── SW registration cache ──────────────────────────────────────────────────
let _swRegistrationPromise = null;

function getSwRegistration() {
  if (_swRegistrationPromise) return _swRegistrationPromise;
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return null;

  _swRegistrationPromise = navigator.serviceWorker.ready.catch(() => {
    _swRegistrationPromise = null;
    return null;
  });

  return _swRegistrationPromise;
}

// Pre-warm the SW registration and DB connection as soon as the module loads
// so they are ready before any offline action is needed.
if (typeof window !== 'undefined') {
  getDB().catch(() => {});
  getSwRegistration();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Queue a failed API call for background sync.
 * This function returns IMMEDIATELY. All async work happens in the background.
 *
 * @param {string} url
 * @param {string} method
 * @param {object} payload
 * @param {object} headers  — plain object, e.g. { Authorization: 'Bearer ...' }
 */
export function queueOfflineAction(url, method, payload, headers) {
  if (typeof window === 'undefined') return;

  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    url,
    method,
    payload,
    headers,
    timestamp: Date.now(),
  };

  // All of this is fire-and-forget — callers don't wait for it.
  ;(async () => {
    try {
      const db = await getDB();
      const tx = db.transaction('sync-queue', 'readwrite');
      tx.objectStore('sync-queue').add(item);
      // No need to await tx.oncomplete — IDB batches the write safely.

      // Register background sync (uses cached SW registration)
      const swReg = await getSwRegistration();
      if (swReg) {
        swReg.sync.register('sync-offline').catch(() => {});
      } else if (navigator.onLine) {
        // Safari / iOS fallback — process immediately if online
        processOfflineQueue();
      }
    } catch (err) {
      console.warn('[OfflineQueue] Failed to queue action:', err);
    }
  })();
}

// ─── Queue processor (called by SW sync event or online listener) ────────────

let _isProcessing = false;

export async function processOfflineQueue() {
  if (typeof window === 'undefined' || !navigator.onLine || _isProcessing) return;
  _isProcessing = true;

  try {
    const db = await getDB();

    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction('sync-queue', 'readonly');
      const req = tx.objectStore('sync-queue').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });

    if (!items?.length) return;

    // Fire all requests in parallel for maximum throughput
    await Promise.allSettled(
      items.map(async (item) => {
        try {
          const res = await fetch(item.url, {
            method : item.method,
            headers: { ...item.headers, 'Content-Type': 'application/json' },
            body   : item.payload ? JSON.stringify(item.payload) : undefined,
          });

          // Remove on success OR on permanent client errors (don't retry 4xx)
          if (res.ok || (res.status >= 400 && res.status < 500)) {
            const tx = db.transaction('sync-queue', 'readwrite');
            tx.objectStore('sync-queue').delete(item.id);
          }
        } catch {
          // Network error — leave in queue and retry on next sync
        }
      })
    );
  } catch (err) {
    console.warn('[OfflineQueue] processOfflineQueue error:', err);
  } finally {
    _isProcessing = false;
  }
}
