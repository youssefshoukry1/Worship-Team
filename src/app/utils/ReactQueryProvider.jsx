"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
// Imported here (the root layout's client boundary) so localforage is configured
// before any page touches storage.
import { isApp } from './platform';
import { downloadedHymnsQueryOptions } from './hymnsCache';

// Kept for older imports; new code should import from './platform'.
export { isApp } from './platform';

// The app's single QueryClient. Offline data does not live in this cache — hymns, Bibles,
// profiles and chat are stored in localforage directly, and offline writes go through
// offlineQueue — so the cache is not persisted.
export default function ReactQueryProvider({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  }));

  useEffect(() => {
    if (!isApp) return;
    // Reading the entire offline hymn library is a warm-up, not a requirement
    // for Prayer. Let the first screen paint before cloning it from storage.
    // Opening Hymns sooner still starts the same deduplicated query immediately.
    const warmHymns = () => { void queryClient.prefetchQuery(downloadedHymnsQueryOptions); };
    if (typeof window.requestIdleCallback === 'function') {
      const idle = window.requestIdleCallback(warmHymns, { timeout: 2000 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = window.setTimeout(warmHymns, 100);
    return () => window.clearTimeout(timer);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
