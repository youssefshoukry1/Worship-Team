'use client';

import { useContext, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { UserContext } from '../context/User_Context';
import { createAndroidBackController, HOME_REFRESH_EVENT } from '../utils/androidBack';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../utils/appNavigation';
import { showToast } from './ToastContainer';

export default function AndroidBackNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLogin } = useContext(UserContext);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let disposed = false;
    let listener;
    const controller = createAndroidBackController({
      getPath: () => window.location.pathname,
      isAuthenticated: () => !!localStorage.getItem('user_Taspe7_Token'),
      isScrolled: () => (document.scrollingElement?.scrollTop || window.scrollY) > 8,
      scrollToTop: () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }),
      refreshHome: () => window.dispatchEvent(new Event(HOME_REFRESH_EVENT)),
      goHome: async isCurrent => {
        const ready = await ensureNavigationServiceWorker();
        if (disposed || !isCurrent()) return;
        if (ready) router.replace('/');
        else navigateDocumentFallback('/');
      },
      exitApp: async () => {
        const { App } = await import('@capacitor/app');
        if (!disposed) await App.exitApp();
      },
      notifyExit: () => {
        const language = localStorage.getItem('app-language');
        showToast({ message: language === 'ar' ? 'اضغط رجوع مرة أخرى للخروج' : language === 'de' ? 'Zum Beenden erneut zurück' : 'Back again to exit' });
      },
    });
    controllerRef.current = controller;
    // Any new task or a background/resume cycle starts a fresh Back sequence.
    const reset = () => controller.reset();
    // Android cancels the pointer stream when an edge gesture wins. Reset on
    // completed interactions so the next edge gesture can still confirm exit.
    window.addEventListener('pointerup', reset, { passive: true });
    window.addEventListener('keydown', reset);
    document.addEventListener('visibilitychange', reset);
    import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', () => {
        if (!disposed) controller.back();
      });
      if (disposed) await handle.remove();
      else listener = handle;
    }).catch(error => console.warn('Android Back handler unavailable:', error));
    return () => {
      disposed = true;
      controller.reset();
      controllerRef.current = null;
      listener?.remove().catch(() => {});
      window.removeEventListener('pointerup', reset);
      window.removeEventListener('keydown', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [router]);

  useEffect(() => { controllerRef.current?.reset(); }, [pathname, isLogin]);
  return null;
}
