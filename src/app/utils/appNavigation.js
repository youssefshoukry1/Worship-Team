import { Capacitor } from '@capacitor/core';

const NAVIGATION_WORKER_VERSION = 'navigation-v2';
const NAVIGATION_WORKER_TIMEOUT_MS = 4000;
let workerReadyPromise;

const hasCurrentNavigationWorker = () =>
  navigator.serviceWorker.controller?.scriptURL.includes(NAVIGATION_WORKER_VERSION) === true;

export function ensureNavigationServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }

  if (hasCurrentNavigationWorker()) return Promise.resolve(true);
  if (workerReadyPromise) return workerReadyPromise;

  // Bound the entire attempt, including registration. An active worker from
  // `ready` is not enough: exported route payloads need a controlling worker.
  const attempt = new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      resolve(ready);
    };
    const handleControllerChange = () => {
      if (hasCurrentNavigationWorker()) finish(true);
    };
    const timeoutId = window.setTimeout(() => finish(hasCurrentNavigationWorker()), NAVIGATION_WORKER_TIMEOUT_MS);

    try {
      // Subscribe before registering so a fast installation cannot be missed.
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      Promise.resolve(navigator.serviceWorker.register(
        `/sw.js?v=${NAVIGATION_WORKER_VERSION}`,
        { scope: '/', updateViaCache: 'none' }
      )).then((registration) => {
        // Installation/update continues even if the navigation wait times out.
        registration.update().catch(() => {});
        handleControllerChange();
      }).catch(() => finish(false));
      handleControllerChange();
    } catch {
      finish(false);
    }
  });

  workerReadyPromise = attempt;
  // A failed/timed-out attempt must not disable client navigation for the rest
  // of the session. Concurrent callers still share the same active attempt.
  attempt.then(() => {
    if (workerReadyPromise === attempt) workerReadyPromise = undefined;
  });
  return attempt;
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
