'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../utils/appNavigation';

export function normalizeTabPath(path) {
  const routePath = (path || '/').replace(/\/index\.html\/?$/i, '/');
  // The launch route renders Prayer directly, including native index.html URLs.
  // Treat both addresses as the same tab so a tap preserves the current draft.
  if (routePath === '/') return '/pray/';
  return routePath.endsWith('/') ? routePath : `${routePath}/`;
}

export default function useTabNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const latestRequest = useRef(null);
  const [requestedRequest, setRequestedRequest] = useState(null);
  const [swipeHref, setSwipeHref] = useState(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // An effect from the previous commit must not clear a newer tap that
    // arrived between the URL changing and that commit's effects running.
    if (!isPending && latestRequest.current === requestedRequest) latestRequest.current = null;
  }, [isPending, requestedRequest]);

  useEffect(() => {
    const selectSwipe = event => {
      latestRequest.current = null;
      setRequestedRequest(null);
      setSwipeHref(event.detail?.href ?? null);
    };
    const endSwipe = () => setSwipeHref(null);
    const onBack = () => {
      latestRequest.current = null;
      setRequestedRequest(null);
      endSwipe();
    };
    window.addEventListener('taspe7:swipe-commit', selectSwipe);
    window.addEventListener('taspe7:swipe-end', endSwipe);
    window.addEventListener('popstate', onBack);
    return () => {
      latestRequest.current = null;
      window.removeEventListener('taspe7:swipe-commit', selectSwipe);
      window.removeEventListener('taspe7:swipe-end', endSwipe);
      window.removeEventListener('popstate', onBack);
    };
  }, []);

  const navigate = (event, href) => {
    // Preserve normal Link behavior for new-tab/window and modified clicks.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const supersedingPush = !window.dispatchEvent(new Event('taspe7:tab-tap', { cancelable: true }));

    const destination = new URL(href, window.location.origin);
    if (normalizeTabPath(pathname) === normalizeTabPath(destination.pathname)
      && window.location.search === destination.search && !latestRequest.current && !supersedingPush) return;

    const request = { href };
    latestRequest.current = request;
    setRequestedRequest(request);

    startTransition(async () => {
      const workerReady = await ensureNavigationServiceWorker();
      // Superseded taps and unmounted navigation bars cannot route later.
      if (latestRequest.current !== request) return;

      if (workerReady) {
        // Keep the transition pending until Next commits the destination. A tap
        // back to the currently displayed route must also cancel an older push.
        startTransition(() => router.push(href));
      } else {
        navigateDocumentFallback(href);
      }
    });
  };

  return { navigate, pendingHref: swipeHref ?? (isPending ? requestedRequest?.href : null) };
}
