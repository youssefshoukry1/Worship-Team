"use client";

import { useLayoutEffect, useRef } from 'react';
import { usePathname } from "next/navigation";
import PrimaryTabPager, { primaryTabIndex } from '../components/PrimaryTabPager';
import { commitSettingsRoute, profileScrollPosition, returnFromSettings, settingsParent } from '../utils/profileNavigation';
import { installInteriorSwipe } from '../utils/interiorSwipe';
import { useSwipePreference } from '../utils/swipePreferences';

export default function PageTransition({ children }) {
    const pathname = usePathname();
    const index = primaryTabIndex(pathname || '/');
    const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const surface = useRef(null);
    const [enabled] = useSwipePreference();

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
