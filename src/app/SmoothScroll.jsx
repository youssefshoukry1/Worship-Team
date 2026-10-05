"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScroll({ children }) {
  useEffect(() => {
    // Disable on mobile and touch devices
    const isTouchOrMobile =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 768 ||
      Boolean(window.Capacitor?.isNativePlatform?.());

    if (isTouchOrMobile) return;

    const lenis = new Lenis({
      duration: 1,
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1,
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

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}