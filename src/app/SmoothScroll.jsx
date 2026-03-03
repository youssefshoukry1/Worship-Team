"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScroll({ children }) {
  useEffect(() => {
    // إعداد Lenis
    const lenis = new Lenis({
      duration: 1.5,
      lerp: 0.1,
      smoothWheel: true,
      // دي الإعدادات اللي بتخلي الـ Scroll "درامي"
      wheelMultiplier: 1,
      touchMultiplier: 2,
      infinite: false,
      prevent: (node) => {
        if (!node || typeof node !== "object") return false;
        if (!(node instanceof HTMLElement)) return false;

        return (
          node.hasAttribute("data-lenis-prevent") ||
          node.hasAttribute("data-lenis-prevent-wheel") ||
          node.hasAttribute("data-lenis-prevent-touch")
        );
      },
    });

    // حلقة التحديث (Request Animation Frame)
    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    // تنظيف المكتبة لما الـ Component يتشال (مهم جداً في Next.js)
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}