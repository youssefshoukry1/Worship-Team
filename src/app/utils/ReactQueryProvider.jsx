"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
// Imported here (the root layout's client boundary) so localforage is configured
// before any page touches storage.
import './platform';

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

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
