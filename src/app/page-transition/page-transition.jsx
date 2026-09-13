"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

export default function PageTransition({ children }) {
    const pathname = usePathname();

    // Presentation screens are fullscreen `position: fixed` layouts. The motion wrapper's
    // `filter` would become their containing block (0px tall), hiding everything.
    if (pathname?.startsWith('/presentation')) return children;

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={pathname}
                initial={{ opacity: 0, filter: "blur(12px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="h-full w-full"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}