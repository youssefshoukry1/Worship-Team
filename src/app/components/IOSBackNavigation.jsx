'use client';

import { useContext, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { UserContext } from '../context/User_Context';
import { HOME_REFRESH_EVENT, isHomePath } from '../utils/androidBack';
import { installIOSEdgeBack } from '../utils/iosEdgeBack';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../utils/appNavigation';

export default function IOSBackNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLogin } = useContext(UserContext);
  const resetRef = useRef(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'ios' || !isLogin) return;
    let disposed = false;
    let goingHome = false;
    let revision = 0;
    const cancelNavigation = () => { revision++; goingHome = false; };
    const gestures = installIOSEdgeBack({
      onInteraction: cancelNavigation,
      onBack: async () => {
        if (disposed || !localStorage.getItem('user_Taspe7_Token')) return;
        if (isHomePath(window.location.pathname)) {
          if ((document.scrollingElement?.scrollTop || window.scrollY) > 8) {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          } else {
            window.dispatchEvent(new Event(HOME_REFRESH_EVENT));
          }
          return;
        }
        if (goingHome) return;
        goingHome = true;
        const request = ++revision;
        try {
          const ready = await ensureNavigationServiceWorker();
          if (disposed || request !== revision) return;
          if (ready) router.replace('/');
          else navigateDocumentFallback('/');
        } catch (error) {
          if (!disposed && request === revision) goingHome = false;
          console.warn('iOS Home navigation unavailable:', error);
        }
      },
    });
    const reset = () => { gestures.reset(); cancelNavigation(); };
    resetRef.current = reset;
    document.addEventListener('visibilitychange', reset);
    return () => {
      disposed = true;
      reset();
      resetRef.current = null;
      gestures.dispose();
      document.removeEventListener('visibilitychange', reset);
    };
  }, [router, isLogin]);

  useEffect(() => { resetRef.current?.(); }, [pathname]);
  return null;
}
