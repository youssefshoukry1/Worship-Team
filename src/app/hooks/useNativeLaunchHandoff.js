"use client";

import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

const launch = registerPlugin("WaslaLaunch");
let signalled = false;

export default function useNativeLaunchHandoff({ mounted, waitForPrayer, waitForUsername }) {
  useEffect(() => {
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
          void launch.ready().catch(() => { /* The native cover has a recovery deadline. */ });
        });
      });
    };
    observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [mounted, waitForPrayer, waitForUsername]);
}
