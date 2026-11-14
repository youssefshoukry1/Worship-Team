'use client';

import { lazy, Suspense, startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageSkeleton from './PageSkeleton';
import { useSwipePreference } from '../utils/swipePreferences';
import { installInteriorSwipe } from '../utils/interiorSwipe';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../utils/appNavigation';
import { holdNavigationWork, releaseNavigationWork } from '../utils/navigationWork';
import { TabPageActivity } from './TabPageActivity';
import { createFeatureBoundary } from './DeferredFeature';

const routes = ['/pray', '/bible_form', '/friends', '/normal_UserProfile'];
const variants = ['cards', 'bible', 'friends', 'profile'];
const imports = [() => import('../pray/page'), () => import('../bible_form/page'), () => import('../friends/page'), () => import('../normal_UserProfile/page')];
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
  const indexRef = useRef(index);
  const cancelRef = useRef(null);
  const [prepared, setPrepared] = useState([index]);
  const [prayerVisited, setPrayerVisited] = useState(index === 0);
  if (index === 0 && !prayerVisited) setPrayerVisited(true);

  useLayoutEffect(() => {
    indexRef.current = index;
    cancelRef.current?.();
  }, [index]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false, idle, timer;
    const neighbors = [index + 1, index - 1].filter(i => pages[i]);
    const prepare = async () => {
      if (stopped) return;
      if (session.current) { timer = setTimeout(schedule, 250); return; }
      const neighbor = neighbors.shift();
      if (neighbor === undefined) return;
      try {
        await loads[neighbor]();
        if (stopped) return;
        // A cold page never mounts while the finger is moving.
        if (session.current) { neighbors.unshift(neighbor); timer = setTimeout(schedule, 250); return; }
        startTransition(() => setPrepared(previous => [...new Set([...previous.filter(i => Math.abs(i - index) <= 1), index, neighbor])]));
      } catch { /* The page boundary handles an explicit retry on navigation. */ }
      timer = setTimeout(schedule, 250);
    };
    const schedule = () => {
      if (stopped) return;
      if (window.requestIdleCallback) idle = window.requestIdleCallback(prepare, { timeout: 1500 });
      else timer = setTimeout(prepare, 250);
    };
    timer = setTimeout(schedule, 200);
    return () => { stopped = true; clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback?.(idle); };
  }, [index, enabled]);

  useEffect(() => {
    const root = rootRef.current;
    let disposed = false, timer, deadline;
    const clear = () => {
      clearTimeout(timer); clearTimeout(deadline);
      const active = session.current;
      session.current = null;
      if (active) for (const panel of [active.source, active.incoming]) {
        if (!panel?.isConnected) continue;
        panel.style.removeProperty('transition');
        panel.style.removeProperty('will-change');
        panel.style.top = '';
        panel.style.height = '';
        panel.firstElementChild.style.marginTop = '';
        panel.style.transform = Number(panel.dataset.tabIndex) === indexRef.current ? '' : `translate3d(${Number(panel.dataset.tabIndex) < indexRef.current ? -100 : 100}%,0,0)`;
        panel.removeAttribute('data-swipe-moving');
      }
      root.removeAttribute('data-swiping');
      root.removeAttribute('data-settling');
      root.style.height = '';
      releaseNavigationWork();
    };
    cancelRef.current = clear;
    const move = amount => {
      const active = session.current;
      if (!active) return;
      // Only two compositor properties change: no inherited CSS variables,
      // React renders, or layout reads in the finger-movement path.
      const offset = -active.direction * amount;
      active.source.style.transform = `translate3d(${offset}px,0,0)`;
      active.incoming.style.transform = `translate3d(${active.direction * active.width + offset}px,0,0)`;
    };
    const settle = completed => {
      const active = session.current;
      if (!active) return;
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
      root.setAttribute('data-settling', 'true');
      for (const panel of [active.source, active.incoming]) panel.style.transition = `transform ${duration}ms cubic-bezier(.2,.7,.2,1)`;
      move(completed ? active.width : 0);
      timer = setTimeout(async () => {
        if (!completed) { clear(); return; }
        try {
          const ready = await ensureNavigationServiceWorker();
          if (disposed || session.current !== active) return;
          deadline = setTimeout(clear, 5000);
          if (ready) router.push(routes[active.target], { scroll: true });
          else navigateDocumentFallback(routes[active.target]);
        } catch { clear(); }
      }, duration);
    };
    const remove = enabled ? installInteriorSwipe({
      element: root,
      begin: direction => {
        if (session.current) return false;
        const target = indexRef.current + direction;
        if (!pages[target]) return false;
        const source = root.querySelector(`[data-tab-index="${indexRef.current}"]`);
        const incoming = root.querySelector(`[data-tab-index="${target}"]`);
        if (!source || !incoming) return false;
        const width = root.clientWidth;
        const top = window.scrollY;
        const rootBox = root.getBoundingClientRect();
        // The inactive frame already resolves 100dvh, including browser chrome.
        const viewportHeight = incoming.clientHeight;
        holdNavigationWork();
        session.current = { direction, target, source, incoming, width };
        // Leave a spacer equal to the active document's height. Cropping a
        // long source to the visible screen must never clamp window.scrollY.
        root.style.height = `${rootBox.height}px`;
        source.firstElementChild.style.marginTop = `${-top}px`;
        for (const panel of [source, incoming]) {
          panel.style.top = `${top}px`;
          panel.style.height = `${viewportHeight}px`;
          panel.style.willChange = 'transform';
          panel.setAttribute('data-swipe-moving', 'true');
        }
        root.setAttribute('data-swiping', 'true');
        return true;
      }, update: move, finish: settle, cancel: () => settle(false),
    }) : () => {};
    window.addEventListener('resize', clear, { passive: true });
    return () => { disposed = true; remove(); clear(); cancelRef.current = null; window.removeEventListener('resize', clear); };
  }, [enabled, router]);

  // Retain the visited Prayer page so returning preserves cards, drafts and players.
  // Other pages still use the bounded neighbor policy.
  const visible = [...new Set([...(enabled ? [index - 1, index, index + 1].filter(i => pages[i]) : [index]), ...(prayerVisited ? [0] : [])])];
  return <div ref={rootRef} className="primary-tab-pager" data-tab-pager>
    {visible.map(pageIndex => {
      const Page = pages[pageIndex];
      const active = pageIndex === index;
      const ready = active || prepared.includes(pageIndex) || (pageIndex === 0 && prayerVisited);
      return <div key={routes[pageIndex]} data-tab-panel={routes[pageIndex]} data-tab-index={pageIndex} data-tab-ready={ready ? 'true' : 'false'} data-tab-active={active ? 'true' : 'false'}
        className="primary-tab-panel" aria-hidden={active ? undefined : true} inert={active ? undefined : true}
        style={{ transform: active ? undefined : `translate3d(${pageIndex < index ? -100 : 100}%,0,0)` }}>
        <div className="primary-tab-content"><TabPageActivity.Provider value={active}>
          <Suspense fallback={<PageSkeleton variant={variants[pageIndex]} fullPage />}>
            {ready ? <Page /> : <PageSkeleton variant={variants[pageIndex]} fullPage />}
          </Suspense>
        </TabPageActivity.Provider></div>
      </div>;
    })}
  </div>;
}
