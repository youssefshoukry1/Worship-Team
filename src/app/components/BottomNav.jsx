"use client";
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Heart, BookOpen, Users, User } from 'lucide-react';
import { ensureNavigationServiceWorker } from '../utils/appNavigation';
import useTabNavigation, { normalizeTabPath } from '../hooks/useTabNavigation';
import { useTestimonyFeed } from './testimonies/TestimonyFeedProvider';

const NAV_ITEMS = [
  { label: 'Pray', icon: Heart, href: '/pray' },
  { label: 'Bible', icon: BookOpen, href: '/bible_form' },
  { label: 'Friends', icon: Users, href: '/friends' },
  { label: 'Profile', icon: User, href: '/normal_UserProfile' }
];

export default function BottomNav() {
  const hasNewNotes = useTestimonyFeed()?.state.hasUnseen || false;
  const pathname = usePathname();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);
  const [isLockedHidden, setIsLockedHidden] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isHiddenForChapter, setIsHiddenForChapter] = useState(false);
  const lastScrollY = useRef(0);
  const { navigate, pendingHref } = useTabNavigation();

  const visualPath = normalizeTabPath(pendingHref || pathname);

  // Hide bottom nav when soft keyboard opens
  useEffect(() => {
    const handleViewportChange = () => {
      const vv = window.visualViewport;
      const currentHeight = vv ? vv.height : window.innerHeight;
      const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      setIsKeyboardOpen(Boolean(isInput && window.screen.height - currentHeight > 150));
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    window.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Chapter loading can reset scrollTop; only an upward user gesture ends this hide.
  useEffect(() => {
    let scroller = null;
    let touchStart = null;
    const restore = () => {
      scroller = null;
      touchStart = null;
      setIsHiddenForChapter(false);
      setIsVisible(true);
    };
    const withinReader = target => scroller && target instanceof Node && scroller.contains(target);
    const hideForChapter = event => {
      if (event.detail?.hidden === false) { restore(); return; }
      scroller = event.detail?.scroller || null;
      touchStart = null;
      setIsHiddenForChapter(Boolean(scroller));
    };
    const wheel = event => {
      if (withinReader(event.target) && event.deltaY < 0) restore();
    };
    const startTouch = event => {
      const touch = event.touches.length === 1 && event.touches[0];
      touchStart = withinReader(event.target) && touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const moveTouch = event => {
      if (!touchStart || !withinReader(event.target) || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - touchStart.x;
      const dy = event.touches[0].clientY - touchStart.y;
      if (dy > 8 && dy > Math.abs(dx)) restore();
    };
    const endTouch = () => { touchStart = null; };
    const keyDown = event => {
      if (!scroller || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) restore();
    };

    window.addEventListener('hideBottomNavUntilScrollUp', hideForChapter);
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('touchstart', startTouch, { passive: true });
    window.addEventListener('touchmove', moveTouch, { passive: true });
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });
    window.addEventListener('keydown', keyDown);
    return () => {
      window.removeEventListener('hideBottomNavUntilScrollUp', hideForChapter);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('touchstart', startTouch);
      window.removeEventListener('touchmove', moveTouch);
      window.removeEventListener('touchend', endTouch);
      window.removeEventListener('touchcancel', endTouch);
      window.removeEventListener('keydown', keyDown);
    };
  }, []);

  // Listen for lock requests to hide bottom nav
  useEffect(() => {
    const handleLock = (e) => {
      setIsLockedHidden(Boolean(e.detail?.hidden));
    };

    window.addEventListener('lockBottomNav', handleLock);
    return () => {
      window.removeEventListener('lockBottomNav', handleLock);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    ensureNavigationServiceWorker().then((workerReady) => {
      if (!workerReady || cancelled) return;
      NAV_ITEMS.forEach(({ href }) => router.prefetch(href));
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const handleScroll = (e) => {
      let currentScrollY;
      if (e && e.type === 'internalScroll') {
        currentScrollY = e.detail.scrollY;
      } else {
        currentScrollY = window.scrollY;
      }

      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY.current || currentScrollY <= 50) {
        setIsVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('internalScroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('internalScroll', handleScroll);
    };
  }, []);

  const shouldShow = isVisible && !isLockedHidden && !isKeyboardOpen && !isHiddenForChapter;

  return (
    <div
      data-lenis-prevent
      className={`app-bottom-nav fixed bottom-0 left-0 right-0 z-[10000] border-t transition-all duration-200 ease-out touch-manipulation select-none ${shouldShow ? 'translate-y-0' : 'translate-y-full pointer-events-none'}`}
    >
      <nav className="flex justify-around items-center h-[58px] max-w-md mx-auto" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const destinationPath = normalizeTabPath(item.href);
          const isActive = visualPath === destinationPath || (item.href !== '/' && visualPath.startsWith(destinationPath));

          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch
              aria-current={isActive ? 'page' : undefined}
              aria-describedby={item.label === 'Friends' && hasNewNotes ? 'friends-unseen-notes' : undefined}
              onClick={(event) => navigate(event, item.href)}
              className="group relative flex h-full w-full touch-manipulation flex-col items-center justify-center gap-0.5 outline-none transition-transform duration-150 ease-out active:scale-[0.94]"
            >
              <div
                className={`pointer-events-none absolute top-[5px] h-8 w-12 rounded-2xl bg-sky-400/12 transition-[opacity,transform] duration-200 ease-out ${isActive ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                  }`}
              />
              <div className={`relative flex h-8 w-10 items-center justify-center pointer-events-none transition-transform duration-200 ease-out ${isActive ? '-translate-y-0.5 scale-105' : 'translate-y-0 scale-100'}`}>
                <item.icon
                  size={21}
                  className={`z-10 transition-[color,filter] duration-150 ${isActive ? 'text-[#00C2FF] drop-shadow-[0_0_6px_rgba(0,194,255,0.45)]' : 'text-slate-400'}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.label === 'Friends' && hasNewNotes && <span data-testid="friends-notes-badge" aria-hidden="true" className="absolute right-1 top-0.5 z-20 h-1.5 w-1.5 rounded-full bg-[#00C2FF] ring-2 ring-[#060b13]" />}
              </div>
              <span className={`pointer-events-none text-[10px] font-medium leading-none transition-[color,transform] duration-150 ease-out ${isActive ? '-translate-y-px text-[#00C2FF]' : 'translate-y-0 text-slate-400'}`}>
                {item.label}
              </span>
              <span
                className={`pointer-events-none absolute bottom-0 h-0.5 w-5 rounded-full bg-[#00C2FF] transition-[opacity,transform] duration-200 ease-out ${isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                  }`}
              />
            </Link>
          );
        })}
      </nav>
      {hasNewNotes && <span id="friends-unseen-notes" className="sr-only">New notes from friends</span>}
    </div>
  );
}
