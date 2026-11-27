'use client';

import { lazy, memo, Suspense, startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import PageSkeleton from './PageSkeleton';
import { useSwipePreference } from '../utils/swipePreferences';
import { profileView, returnFromSettings } from '../utils/profileNavigation';
import { installInteriorSwipe, swipeSettleDuration } from '../utils/interiorSwipe';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../utils/appNavigation';
import { holdNavigationWork, releaseNavigationWork } from '../utils/navigationWork';
import { TabPageActivity, TabViewMemory } from './TabPageActivity';
import { createFeatureBoundary } from './DeferredFeature';

const routes = ['/pray', '/bible_form', '/friends', '/normal_UserProfile'];
const variants = ['cards', 'bible', 'friends', 'profile'];
const imports = [() => import('../pray/page'), () => import('../bible_form/page'), () => import('../friends/page'), () => import('../normal_UserProfile/page')];
const loads = imports.map(load => { let pending; return () => pending || (pending = load().catch(error => { pending = null; throw error; })); });
// Pager preparation can update several times per route. Mounted pages still
// receive their activity contexts and data updates directly.
const LazyPrayer = lazy(loads[0]);
let preparedPrayer;

// Start loading the entry component while React hydrates the auth gate.
// Only the actual entry route qualifies, never a prepared swipe neighbor.
if (typeof window !== 'undefined' && primaryTabIndex(location.pathname) === 0
    && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
  try {
    if (localStorage.getItem('user_Taspe7_Token') && localStorage.getItem('user_Taspe7_Username')) {
      void loads[0]().then(module => { preparedPrayer = module.default; }).catch(() => {});
    }
  } catch { /* Storage may be unavailable. Use the normal route loader. */ }
}
if (typeof window !== 'undefined' && primaryTabIndex(location.pathname) === 3) {
  try {
    if (localStorage.getItem('user_Taspe7_Token') && localStorage.getItem('user_Taspe7_Username')) {
      void loads[3]().catch(() => {});
    }
  } catch { /* Use the normal route loader when storage is unavailable. */ }
}

function PrayerEntry() {
  // Keep the same component type for this mount, including cold-load fallback.
  const [View] = useState(() => preparedPrayer || LazyPrayer);
  return <View />;
}
const pages = loads.map((load, index) => memo(createFeatureBoundary(index === 0 ? PrayerEntry : lazy(load), 'page')));

export function primaryTabIndex(pathname) {
  const path = pathname.replace(/\/index\.html\/?$/i, '').replace(/\/+$/, '');
  return path === '' ? 0 : routes.indexOf(path);
}

// Mounted inside Suspense so idle warming starts after the active page commits.
function ActivePageCommit({ index, onCommit }) {
  useEffect(() => { onCommit(index); }, [index, onCommit]);
  return null;
}

export default function PrimaryTabPager({ index }) {
  const router = useRouter();
  const [enabled] = useSwipePreference();
  const rootRef = useRef(null);
  const session = useRef(null);
  const indexRef = useRef(index);
  const cancelRef = useRef(null);
  const [committedIndex, setCommittedIndex] = useState(null);
  const [views] = useState(() => routes.map(() => new Map()));
  const [visited] = useState(() => new Set());
  const offsets = useRef(new Map());
  const [opening, setOpening] = useState(null);
  const [prepared, setPrepared] = useState([index]);

  useLayoutEffect(() => {
    const returnOffset = offsets.current.get(index);
    visited.add(index);
    indexRef.current = index;
    cancelRef.current?.();
    if (returnOffset) window.scrollTo({ top: returnOffset, behavior: 'instant' });
    const rememberScroll = () => {
      if (!session.current) offsets.current.set(index, window.scrollY);
    };
    window.addEventListener('scroll', rememberScroll, { passive: true });
    return () => window.removeEventListener('scroll', rememberScroll);
  }, [index, visited]);

  useEffect(() => {
    if (!enabled || committedIndex !== index) return;
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
        if (navigator.serviceWorker?.controller) {
          void ensureNavigationServiceWorker().then(ready => {
            if (ready && !stopped && !session.current) router.prefetch(routes[neighbor]);
          });
        }
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
  }, [index, enabled, committedIndex, router]);

  useEffect(() => {
    const root = rootRef.current;
    root.toggleAttribute('data-android-pager', enabled && Capacitor.getPlatform() === 'android');
    let disposed = false, timer, deadline;
    const clear = () => {
      clearTimeout(timer); clearTimeout(deadline);
      const active = session.current;
      active?.observer?.disconnect();
      session.current = null;
      if (active?.committed) window.dispatchEvent(new Event('taspe7:swipe-end'));
      if (!disposed && active) setOpening(null);
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
      active.amount = amount;
      if (!active.preview) return;
      const offset = -active.direction * amount;
      active.source.style.transform = `translate3d(${offset}px,0,0)`;
      active.incoming.style.transform = `translate3d(${active.direction * active.width + offset}px,0,0)`;
    };
    const prepareLayers = active => {
      const { source, incoming, target } = active;
      const top = window.scrollY;
      const rootBox = root.getBoundingClientRect();
      const viewportHeight = incoming.clientHeight;
      // Leave a spacer equal to the active document's height. Cropping a
      // long source to the visible screen must never clamp window.scrollY.
      root.style.height = `${rootBox.height}px`;
      offsets.current.set(indexRef.current, top);
      incoming.firstElementChild.style.marginTop = `-${offsets.current.get(target) || 0}px`;
      source.firstElementChild.style.marginTop = `${-top}px`;
      for (const panel of [source, incoming]) {
        panel.style.top = `${top}px`;
        panel.style.height = `${viewportHeight}px`;
        panel.style.willChange = 'transform';
        panel.setAttribute('data-swipe-moving', 'true');
      }
      active.preview = true;
    };
    const whenReady = (active, callback) => {
      active.observer?.disconnect();
      const hasContent = () => active.incoming.querySelector('[data-preview-content], [role="alert"]');
      if (hasContent()) { callback(); return; }
      const check = () => {
        if (session.current !== active || !hasContent()) return;
        active.observer?.disconnect();
        callback();
      };
      active.observer = new MutationObserver(check);
      active.observer.observe(active.incoming, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-preview-content', 'role'] });
    };
    const settle = (completed, { velocity = 0 } = {}) => {
      const active = session.current;
      if (!active || active.released) return;
      active.released = true;
      active.committed = completed;
      if (completed) window.dispatchEvent(new CustomEvent('taspe7:swipe-commit', {
        detail: { href: routes[active.target] },
      }));
      const navigate = async () => {
        if (session.current !== active || active.navigating) return;
        active.navigating = true;
        active.observer?.disconnect();
        clearTimeout(timer);
        clearTimeout(deadline);
        deadline = setTimeout(clear, 5000);
        try {
          const ready = await ensureNavigationServiceWorker();
          if (disposed || session.current !== active) return;
          active.dispatched = true;
          if (ready) router.push(routes[active.target], { scroll: true });
          else navigateDocumentFallback(routes[active.target]);
        } catch { if (session.current === active) clear(); }
      };

      const animate = () => {
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 :
          swipeSettleDuration(completed, active.amount, active.width, velocity);
        root.setAttribute('data-settling', 'true');
        for (const panel of [active.source, active.incoming]) panel.style.transition = `transform ${duration}ms cubic-bezier(.23,.875,.58,1)`;
        move(completed ? active.width : 0);
        timer = setTimeout(completed ? navigate : clear, duration);
      };
      if (active.preview) { animate(); return; }
      if (!completed) { clear(); return; }

      // The cold panel was never exposed. Slide from its offscreen position
      // after content arrives, even if the finger has already been lifted.
      releaseNavigationWork();
      const reveal = () => {
        clearTimeout(timer);
        active.observer?.disconnect();
        active.amount = 0;
        prepareLayers(active);
        animate();
      };
      setOpening(active.target);
      timer = setTimeout(reveal, 1200);
      whenReady(active, reveal);
    };
    let settingsGesture = false;
    const remove = enabled ? installInteriorSwipe({
      element: root,
      begin: direction => {
        settingsGesture = false;
        if (session.current) return false;
        if (indexRef.current === 3 && profileView() !== 'menu') {
          settingsGesture = direction === -1;
          return settingsGesture;
        }
        const target = indexRef.current + direction;
        if (!pages[target]) return false;
        const source = root.querySelector(`[data-tab-index="${indexRef.current}"]`);
        const incoming = root.querySelector(`[data-tab-index="${target}"]`);
        if (!source || !incoming) return false;
        const width = root.clientWidth;
        holdNavigationWork();
        const active = { direction, target, source, incoming, width, preview: false, amount: 0 };
        session.current = active;
        deadline = setTimeout(clear, 30000);
        root.setAttribute('data-swiping', 'true');
        whenReady(active, () => {
          prepareLayers(active);
          move(active.amount);
        });
        return true;
      },
      update: move,
      finish: (completed, release) => {
        if (!settingsGesture) settle(completed, release);
        else if (release.amount >= 18 && release.velocity > 0.4 ||
                 release.amount >= release.width * 0.18 && release.velocity > -0.45) returnFromSettings();
        settingsGesture = false;
      },
      cancel: () => { settingsGesture = false; settle(false); },
    }) : () => {};
    const onTabTap = event => {
      // A tap on the current tab must supersede even an already dispatched push.
      if (session.current?.dispatched) event.preventDefault();
      clear();
    };
    window.addEventListener('taspe7:tab-tap', onTabTap);
    window.addEventListener('popstate', clear);
    window.addEventListener('resize', clear, { passive: true });
    return () => { remove(); clear(); disposed = true; window.removeEventListener('taspe7:tab-tap', onTabTap); window.removeEventListener('popstate', clear); cancelRef.current = null; window.removeEventListener('resize', clear); };
  }, [enabled, router]);

  // Drafts and active audio belong to the session, not a retained route tree.
  const visible = enabled ? [index - 1, index, index + 1].filter(i => pages[i]) : [index];
  return <div ref={rootRef} className="primary-tab-pager" data-tab-pager>
    {visible.map(pageIndex => {
      const Page = pages[pageIndex];
      const active = pageIndex === index;
      const ready = active || opening === pageIndex || visited.has(pageIndex) || prepared.includes(pageIndex);
      return <div key={routes[pageIndex]} data-tab-panel={routes[pageIndex]} data-tab-index={pageIndex} data-tab-ready={ready ? 'true' : 'false'} data-tab-active={active ? 'true' : 'false'}
        className="primary-tab-panel" aria-hidden={active ? undefined : true} inert={active ? undefined : true}
        style={{ transform: active ? undefined : `translate3d(${pageIndex < index ? -100 : 100}%,0,0)` }}>
        <div className="primary-tab-content"><TabViewMemory.Provider value={views[pageIndex]}><TabPageActivity.Provider value={active || opening === pageIndex}>
          <Suspense fallback={<PageSkeleton variant={variants[pageIndex]} fullPage />}>
            {active && <ActivePageCommit index={index} onCommit={setCommittedIndex} />}
            {ready ? <Page /> : <PageSkeleton variant={variants[pageIndex]} fullPage />}
          </Suspense>
        </TabPageActivity.Provider></TabViewMemory.Provider></div>
      </div>;
    })}
  </div>;
}
