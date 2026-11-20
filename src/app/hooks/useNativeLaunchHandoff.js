"use client";

import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { finishNativeLaunch } from "../utils/nativeLaunch";

const launch = registerPlugin("WaslaLaunch");
let signalled = false;

export default function useNativeLaunchHandoff({ mounted, waitForPrayer, waitForUsername }) {
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (mounted && !waitForPrayer) window.waslaPrayerPreview?.close();
    if (!mounted || signalled || !Capacitor.isPluginAvailable("WaslaLaunch")) return;
    let frame;
    let observer;
    const ready = () => {
      if (waitForUsername) return document.querySelector("[data-launch-username]");
      if (!waitForPrayer) return true;
      const scope = document.querySelector('[data-tab-active="true"]') || document;
      return scope.querySelector('[role="alert"]') ||
        (document.querySelector("nav.app-header svg") && scope.querySelector('textarea[data-preview-content="pray"]'));
    };
    const check = () => {
      if (!ready() || frame != null) return;
      // Two animation frames allow the committed first screen to paint under the native cover.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = null;
          if (!ready()) return;
          observer?.disconnect();
          signalled = true;
          performance.mark("wasla-launch-screen-ready");
          const preview = window.waslaPrayerPreview;
          const focusRequested = preview?.focusRequested;
          preview?.close();
          if (preview) setCompleted(true);
          if (focusRequested) {
            const editor = document.querySelector('[data-tab-active="true"] textarea[data-preview-content="pray"]') ||
              document.querySelector('textarea[data-preview-content="pray"]');
            editor?.focus({ preventScroll: true });
          }
          const visible = preview?.visible;
          const handoff = visible ? visible.then(shown => shown || launch.ready()) : launch.ready();
          void handoff.then(finishNativeLaunch).catch(() => { /* Use the recovery deadline. */ });
        });
      });
    };
    observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [mounted, waitForPrayer, waitForUsername]);
  return !completed && typeof window !== 'undefined' && Boolean(window.waslaPrayerPreview);
}
