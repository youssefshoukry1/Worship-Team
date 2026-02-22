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
    });

    // حلقة التحديث (Request Animation Frame)
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    // تنظيف المكتبة لما الـ Component يتشال (مهم جداً في Next.js)
    return () => {
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}