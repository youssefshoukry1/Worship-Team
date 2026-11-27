'use client';
import { useEffect } from 'react';
import { credentials, journal } from '../utils/bibleChanges';
import { processOfflineQueue } from '../utils/offlineQueue';
import { ensureNavigationServiceWorker } from '../utils/appNavigation';

export default function ServiceWorkerRegistry() {
  useEffect(() => {
    // Register immediately so exported RSC payloads are available before the
    // first navigation tap. Registration itself is asynchronous and non-blocking.
    ensureNavigationServiceWorker();
    const retryBible = () => { if (navigator.onLine) void journal.flush(credentials()).catch(console.warn); };
    retryBible();
    window.addEventListener('focus', retryBible);
    window.addEventListener('online', retryBible);
    window.addEventListener('online', processOfflineQueue, { passive: true });

    return () => {
      window.removeEventListener('online', processOfflineQueue);
      window.removeEventListener('focus', retryBible);
      window.removeEventListener('online', retryBible);
    };
  }, []);

  return null;
}
