"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'; // 👈 نفس مكتبتك القديمة
import localforage from 'localforage';
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export const isApp = typeof window !== 'undefined' && (
  Capacitor.isNativePlatform() ||
  (window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes('Electron'))
);

if (typeof window !== 'undefined' && isApp) {
  localforage.config({
    name: 'taspe7_app',
    storeName: 'hymns_store'
  });
}

export default function ReactQueryProvider({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
      },
    },
  }));

  const [persister, setPersister] = useState(null);

  useEffect(() => {
    if (isApp) {
      // 🟢 تركاية صغيرة تخليك تستخدم مكتبتك بدون أي تثبيت جديد
      const localPersister = createSyncStoragePersister({
        storage: {
          getItem: (key) => localforage.getItem(key),
          setItem: (key, value) => localforage.setItem(key, value),
          removeItem: (key) => localforage.removeItem(key),
        },
        // التعامل مع الـ Promises بتاعة localforage بدون مكتبات خارجية
        async deserialize(data) {
          const value = await data;
          return value ? JSON.parse(value) : undefined;
        },
        serialize: (data) => JSON.stringify(data),
      });

      setPersister(localPersister);
    }
  }, []);

  // 1. WEB: خفيف وسريع وبدون أي Persister
  if (!isApp) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  // 2. APP: ينتظر الـ Persister
  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 أيام للأبلكيشن
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}