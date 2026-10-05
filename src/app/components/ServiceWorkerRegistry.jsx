'use client';
import { useEffect } from 'react';
import { processOfflineQueue } from '../utils/offlineQueue';
import { ensureNavigationServiceWorker } from '../utils/appNavigation';

export default function ServiceWorkerRegistry() {
  useEffect(() => {
    // Register immediately so exported RSC payloads are available before the
    // first navigation tap. Registration itself is asynchronous and non-blocking.
    ensureNavigationServiceWorker();
    window.addEventListener('online', processOfflineQueue, { passive: true });

    return () => {
      window.removeEventListener('online', processOfflineQueue);
    };
  }, []);

  return null;
}
