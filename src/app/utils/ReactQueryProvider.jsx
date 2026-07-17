"use client";

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import localforage from 'localforage';
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export const isApp = typeof window !== 'undefined' && (
  Capacitor.isNativePlatform() || 
  (window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes('Electron'))
);

// إعداد localforage بشكل آمن
if (typeof window !== 'undefined') {
  localforage.config({
    name: 'taspe7_app',
    storeName: 'hymns_store'
  });
}

export default function ReactQueryProvider({ children }) {
  // استخدام useState لمنع مشاكل الـ SSR في Next.js وتكرار إنشاء الـ Client
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 1000 * 60 * 60 * 24 * 7, // يحتفظ بالكاش في الذاكرة لمدة 7 أيام offline
            staleTime: 1000 * 60 * 5,        // يعتبر الداتا fresh لمدة 5 دقائق قبل ما يفكر يحدثها في الخلفية
            refetchOnWindowFocus: false,     // يمنع إعادة التحميل المزعجة كل ما ترجع للشاشة
          },
        },
      })
  );

  const [persister, setPersister] = useState(null);

  useEffect(() => {
    // إنشاء الـ Persister فقط على جهاز المستخدم (Client-side)
    const localPersister = createSyncStoragePersister({
      storage: {
        getItem: (key) => localforage.getItem(key),
        setItem: (key, value) => localforage.setItem(key, value),
        removeItem: (key) => localforage.removeItem(key),
      },
    });
    setPersister(localPersister);
  }, []);

  // لو الـ persister لسه مجهزش (أول ثانية في الـ SSR)، اعرض الـ children عادي
  if (!persister) {
    return children;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7 // صلاحية الكاش المحفوظ أسبوع كامل
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}