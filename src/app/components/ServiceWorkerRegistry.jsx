'use client';
import { useEffect } from 'react';
import { processOfflineQueue } from '../utils/offlineQueue';

export default function ServiceWorkerRegistry() {
  useEffect(() => {
    // Defer all registration work to after the page is fully idle.
    // This ensures zero impact on initial page render performance.
    const register = () => {
      if ('serviceWorker' in navigator) {
        // Use a microtask so this never blocks the main thread on load.
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      }
      window.addEventListener('online', processOfflineQueue, { passive: true });
    };

    // requestIdleCallback gives us a slot when the browser is truly idle.
    // Falls back to setTimeout(0) on browsers that don't support it (Safari).
    if ('requestIdleCallback' in window) {
      requestIdleCallback(register, { timeout: 3000 });
    } else {
      setTimeout(register, 0);
    }

    return () => {
      window.removeEventListener('online', processOfflineQueue);
    };
  }, []);

  return null;
}
