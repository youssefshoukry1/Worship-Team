'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../utils/appNavigation';
import { queuePrayerOpen, readPrayerNotificationTarget, takePrayerOpen } from '../utils/prayerNotificationNavigation';

export function normalizeTabPath(path) {
  const routePath = (path || '/').replace(/\/index\.html\/?$/i, '/');
  // The launch route renders Prayer directly, including native index.html URLs.
  // Treat both addresses as the same tab so a tap preserves the current draft.
  if (routePath === '/') return '/pray/';
  return routePath.endsWith('/') ? routePath : `${routePath}/`;
}

export default function useTabNavigation(prayerOwner) {
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

  const selectTab = useCallback((href, fallbackHref = href, ignoreSearch = false) => {
    const supersedingPush = !window.dispatchEvent(new Event('taspe7:tab-tap', { cancelable: true }));

    const destination = new URL(href, window.location.origin);
    if (normalizeTabPath(window.location.pathname) === normalizeTabPath(destination.pathname)
      && (ignoreSearch || window.location.search === destination.search) && !latestRequest.current && !supersedingPush) return;

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
        navigateDocumentFallback(fallbackHref);
      }
    });
  }, [router, startTransition]);

  useLayoutEffect(() => {
    if (!prayerOwner) return;
    let lastDelivery;
    const openPrayer = event => {
      const href = event.detail?.href;
      if (typeof href !== 'string' || !/^\/pray\/(?:index\.html)?(?:\?|$)/.test(href)) return;
      const target = readPrayerNotificationTarget(new URL(href, location.origin).search);
      if (!target) return;
      event.preventDefault();
      const id = event.detail.notificationId;
      const delivery = id == null ? null : JSON.stringify([id, target.type, target.shareId]);
      if (delivery && delivery === lastDelivery) return;
      lastDelivery = delivery;
      queuePrayerOpen(prayerOwner, target);
      selectTab('/pray', href, true);
      window.dispatchEvent(new Event('taspe7:prayer-target-ready'));
    };
    window.addEventListener('taspe7:open-prayer', openPrayer);
    return () => {
      window.removeEventListener('taspe7:open-prayer', openPrayer);
      takePrayerOpen(prayerOwner);
      latestRequest.current = null;
    };
  }, [prayerOwner, selectTab]);

  const navigate = (event, href) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    takePrayerOpen(prayerOwner);
    selectTab(href);
  };

  return { navigate, pendingHref: swipeHref ?? (isPending ? requestedRequest?.href : null) };
}
