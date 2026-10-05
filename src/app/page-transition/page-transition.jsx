"use client";

import { usePathname } from "next/navigation";

export default function PageTransition({ children }) {
    const pathname = usePathname();

    return (
        <div key={pathname} className="app-page-transition h-full w-full">
            {children}
        </div>
    );
}
