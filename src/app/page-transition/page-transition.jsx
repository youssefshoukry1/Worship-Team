"use client";

import { useLayoutEffect, useRef } from 'react';
import { Capacitor, registerPlugin } from "@capacitor/core";
import { usePathname } from "next/navigation";
import PrimaryTabPager, { primaryTabIndex } from '../components/PrimaryTabPager';
import { commitSettingsRoute, profileScrollPosition, returnFromSettings, settingsParent } from '../utils/profileNavigation';
import { installInteriorSwipe } from '../utils/interiorSwipe';
import { useSwipePreference } from '../utils/swipePreferences';

const nativeView = registerPlugin("WaslaLaunch");

function setBibleScrollbar(visible) {
    document.documentElement.toggleAttribute("data-bible-page", visible);
    if (Capacitor.isNativePlatform()) {
        // Older native builds use the same overlay fallback as the web.
        return nativeView.setScrollIndicator({ visible });
    }
}

export default function PageTransition({ children }) {
    const pathname = usePathname();
    const index = primaryTabIndex(pathname || '/');
    const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const surface = useRef(null);
    const [enabled] = useSwipePreference();

    useLayoutEffect(() => {
        const bible = index === primaryTabIndex('/bible_form');
        const nativeUpdate = setBibleScrollbar(bible);
        if (!bible) { nativeUpdate?.catch(() => {}); return; }
        let active = true, thumb, timer, frame;
        function draw() {
            frame = 0;
            const root = document.scrollingElement;
            const height = root.clientHeight;
            const range = root.scrollHeight - height;
            if (range <= 0) { thumb.style.opacity = '0'; return; }
            const size = Math.min(height, Math.max(20, height * height / root.scrollHeight));
            thumb.style.height = size + 'px';
            const progress = Math.min(1, Math.max(0, window.scrollY / range));
            thumb.style.transform = 'translateY(' + progress * (height - size) + 'px)';
            thumb.style.opacity = '1';
            clearTimeout(timer);
            timer = setTimeout(() => { thumb.style.opacity = '0'; }, 500);
        }
        function onScroll() {
            if (!frame) frame = requestAnimationFrame(draw);
        }
        function installOverlay() {
            if (!active) return;
            thumb = document.createElement('span');
            thumb.className = 'bible-scroll-indicator';
            thumb.setAttribute('aria-hidden', 'true');
            document.body.appendChild(thumb);
            window.addEventListener('scroll', onScroll, { passive: true });
        }
        if (nativeUpdate) nativeUpdate.catch(installOverlay);
        else installOverlay();
        return () => {
            active = false;
            window.removeEventListener('scroll', onScroll);
            cancelAnimationFrame(frame);
            clearTimeout(timer);
            thumb?.remove();
            setBibleScrollbar(false)?.catch(() => {});
        };
    }, [index]);

    useLayoutEffect(() => {
        commitSettingsRoute();
        if (index >= 0 || !settingsParent()) return;
        const top = profileScrollPosition();
        if (top != null) window.scrollTo({ top, behavior: 'instant' });
    }, [index, pathname]);

    useLayoutEffect(() => {
        if (!touch || !enabled || index >= 0 || !surface.current || !settingsParent()) return;
        return installInteriorSwipe({
            element: surface.current,
            begin: direction => direction === -1,
            finish: completed => { if (completed) returnFromSettings(); },
            cancel: () => {},
        });
    }, [enabled, index, pathname, touch]);

    if (touch && index >= 0) return <PrimaryTabPager index={index} />;

    // A transformed page wrapper becomes the containing block for the fixed display.
    if (pathname?.replace(/\/(?:index\.html)?$/, '') === '/presentation/display') return children;

    return (
        <div key={pathname} ref={surface} className="app-page-transition h-full w-full">
            {children}
        </div>
    );
}
