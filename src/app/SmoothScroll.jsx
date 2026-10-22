"use client";

import { useEffect } from "react";
import { preserveManualInputScroll } from "./utils/manualInputScroll";

export default function SmoothScroll({ children }) {
  // Auto-hide scrollbars when scrolling stops
  useEffect(() => {
    const scrollTimeouts = new WeakMap();

    const handleScroll = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;

      el.setAttribute("data-scrolling", "true");

      const prev = scrollTimeouts.get(el);
      if (prev) clearTimeout(prev);

      const timer = setTimeout(() => {
        el.removeAttribute("data-scrolling");
        scrollTimeouts.delete(el);
      }, 800);

      scrollTimeouts.set(el, timer);
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, []);

  useEffect(() => {
    // Disable on mobile and touch devices
    const isTouchOrMobile =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 768 ||
      Boolean(window.Capacitor?.isNativePlatform?.());

    if (isTouchOrMobile) return preserveManualInputScroll();

    let disposed = false, lenis, rafId;
    import('lenis').then(({ default: Lenis }) => {
      if (disposed) return;
      lenis = new Lenis({
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

      function raf(time) {
        lenis.raf(time);
        rafId = requestAnimationFrame(raf);
      }

      rafId = requestAnimationFrame(raf);
    }).catch(error => console.warn('Smooth scrolling unavailable:', error));

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      lenis?.destroy();
    };
  }, []);

  return <>{children}</>;
}
