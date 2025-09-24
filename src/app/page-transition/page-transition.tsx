"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, filter: "blur(15px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(15px)" }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="relative min-h-screen w-full"
      >
        {/* Overlay الأزرق السمواوي */}
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-0 bg-[#0a3d62]/60 pointer-events-none"
        />

        {/* الصفحة نفسها */}
        <div className="relative z-10">{children}</div>
      </motion.div>
    </AnimatePresence>
  );
}
