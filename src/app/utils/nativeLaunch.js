import { Capacitor } from '@capacitor/core';

let release;
let recoveryTimer;
const firstScreen = new Promise(resolve => { release = resolve; });

export function finishNativeLaunch() {
  clearTimeout(recoveryTimer);
  release?.();
  release = null;
}

export function waitForNativeLaunch() {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('WaslaLaunch')) return Promise.resolve();
  // Both native covers have a ten-second recovery deadline if the handoff fails.
  if (release && recoveryTimer === undefined) recoveryTimer = setTimeout(finishNativeLaunch, 10000);
  return firstScreen;
}
