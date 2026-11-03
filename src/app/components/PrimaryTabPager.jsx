'use client';

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageSkeleton from './PageSkeleton';
import { useSwipePreference } from '../utils/swipePreferences';
import { installInteriorSwipe } from '../utils/interiorSwipe';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../utils/appNavigation';
import { TabPageActivity } from './TabPageActivity';
import { createFeatureBoundary } from './DeferredFeature';

const routes = ['/pray', '/bible_form', '/hymns', '/friends', '/normal_UserProfile'];
const variants = ['cards', 'bible', 'hymns', 'friends', 'profile'];
const imports = [() => import('../pray/page'), () => import('../bible_form/page'), () => import('../hymns/page'), () => import('../friends/page'), () => import('../normal_UserProfile/page')];
const loads = imports.map(load => { let pending; return () => pending || (pending = load().catch(error => { pending = null; throw error; })); });
const pages = loads.map(load => createFeatureBoundary(lazy(load), 'page'));

export function primaryTabIndex(pathname) {
  const path = pathname.replace(/\/index\.html\/?$/i, '').replace(/\/+$/, '');
  return path === '' ? 0 : routes.indexOf(path);
}

export default function PrimaryTabPager({ index }) {
  const router = useRouter();
  const [enabled] = useSwipePreference();
  const rootRef = useRef(null);
  const session = useRef(null);
  const [preview, setPreview] = useState(null);
  const indexRef = useRef(index);
  const cancelRef = useRef(null);

  useLayoutEffect(() => {
    indexRef.current = index;
    // Both a drag commit and a normal tab tap land on the same keyed page.
    cancelRef.current?.();
  }, [index]);

  useEffect(() => {
    if (!enabled) return;
    // Warm code, not mounted pages: only the current page and a drag preview
    // run effects. Neighbor modules remain separate from the startup bundle.
    const warm = () => [index - 1, index + 1].forEach(neighbor => { if (loads[neighbor]) loads[neighbor]().catch(() => {}); });
    const id = window.setTimeout(warm, 600);
    return () => window.clearTimeout(id);
  }, [index, enabled]);

  useEffect(() => {
    const root = rootRef.current;
    let disposed = false;
    let timer;
    let deadline;
    const clear = () => {
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
      session.current = null;
      root.style.removeProperty('--swipe-offset');
      root.removeAttribute('data-swiping');
      root.removeAttribute('data-settling');
      if (!disposed) setPreview(null);
    };
    cancelRef.current = clear;
    const move = amount => {
      const active = session.current;
      if (active) root.style.setProperty('--swipe-offset', `${-active.direction * amount}px`);
    };
    const settle = completed => {
      const active = session.current;
      if (!active) return;
      root.setAttribute('data-settling', 'true');
      move(completed ? root.clientWidth : 0);
      timer = window.setTimeout(async () => {
        if (!completed) { clear(); return; }
        try {
          const ready = await ensureNavigationServiceWorker();
          if (disposed || session.current !== active) return;
          // Bound a stalled route without leaving a translated or locked UI.
          deadline = window.setTimeout(clear, 5000);
          if (ready) router.push(routes[active.target], { scroll: true });
          else navigateDocumentFallback(routes[active.target]);
        } catch { clear(); }
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    };
    const remove = enabled ? installInteriorSwipe({
      element: root,
      begin: direction => {
        if (session.current) return false;
        const target = indexRef.current + direction;
        if (!pages[target]) return false;
        const top = Math.max(0, window.scrollY);
        session.current = { direction, target };
        setPreview({ index: target, top });
        root.setAttribute('data-swiping', 'true');
        return true;
      },
      update: move,
      finish: settle,
      cancel: () => settle(false),
    }) : () => {};
    return () => {
      disposed = true;
      remove();
      clear();
      cancelRef.current = null;
    };
  }, [enabled, router]);

  const visible = preview && preview.index !== index ? [index, preview.index] : [index];
  return <div ref={rootRef} className="primary-tab-pager" data-tab-pager>
    {visible.map(pageIndex => {
      const Page = pages[pageIndex];
      const active = pageIndex === index;
      return <div key={routes[pageIndex]} data-tab-panel={routes[pageIndex]} data-tab-active={active ? 'true' : 'false'}
        className="primary-tab-panel" aria-hidden={active ? undefined : true} inert={active ? undefined : true}
        style={{ '--panel-direction': pageIndex - index, '--preview-top': `${active ? 0 : preview?.top || 0}px` }}>
        <TabPageActivity.Provider value={active}><Suspense fallback={<PageSkeleton variant={variants[pageIndex]} fullPage />}><Page /></Suspense></TabPageActivity.Provider>
      </div>;
    })}
  </div>;
}
