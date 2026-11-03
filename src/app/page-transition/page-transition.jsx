"use client";

import { usePathname } from "next/navigation";
import PrimaryTabPager, { primaryTabIndex } from '../components/PrimaryTabPager';

export default function PageTransition({ children }) {
    const pathname = usePathname();
    const index = primaryTabIndex(pathname || '/');
    const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    if (touch && index >= 0) return <PrimaryTabPager index={index} />;

    return (
        <div key={pathname} className="app-page-transition h-full w-full">
            {children}
        </div>
    );
}
