import { Capacitor } from '@capacitor/core';

const NAVIGATION_WORKER_VERSION = 'navigation-v2';
let workerReadyPromise;

const hasCurrentNavigationWorker = () =>
  navigator.serviceWorker.controller?.scriptURL.includes(NAVIGATION_WORKER_VERSION) === true;

export function ensureNavigationServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }

  if (hasCurrentNavigationWorker()) return Promise.resolve(true);
  if (workerReadyPromise) return workerReadyPromise;

  workerReadyPromise = (async () => {
    const registration = await navigator.serviceWorker.register(
      `/sw.js?v=${NAVIGATION_WORKER_VERSION}`,
      { scope: '/', updateViaCache: 'none' }
    );

    registration.update().catch(() => {});
    await navigator.serviceWorker.ready;

    if (hasCurrentNavigationWorker()) return true;

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        resolve(hasCurrentNavigationWorker());
      }, 4000);

      const handleControllerChange = () => {
        if (!hasCurrentNavigationWorker()) return;
        window.clearTimeout(timeoutId);
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        resolve(true);
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    });
  })().catch(() => false);

  return workerReadyPromise;
}

export function navigateDocumentFallback(href) {
  if (!Capacitor.isNativePlatform()) {
    window.location.assign(href);
    return;
  }

  const url = new URL(href, window.location.origin);
  const cleanPath = url.pathname.replace(/\/+$/, '');
  url.pathname = cleanPath ? `${cleanPath}/index.html` : '/index.html';
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}
