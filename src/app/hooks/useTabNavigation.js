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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // An effect from the previous commit must not clear a newer tap that
    // arrived between the URL changing and that commit's effects running.
    if (!isPending && latestRequest.current === requestedRequest) latestRequest.current = null;
  }, [isPending, requestedRequest]);

  useEffect(() => () => { latestRequest.current = null; }, []);

  const navigate = (event, href) => {
    // Preserve normal Link behavior for new-tab/window and modified clicks.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    if (normalizeTabPath(pathname) === normalizeTabPath(href) && !latestRequest.current) return;

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

  return { navigate, pendingHref: isPending ? requestedRequest?.href : null };
}
