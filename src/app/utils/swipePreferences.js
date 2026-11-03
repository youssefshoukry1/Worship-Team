'use client';

import { useSyncExternalStore } from 'react';

export const SWIPE_PREFERENCE_KEY = 'wasla_swipe_navigation';
const CHANGE_EVENT = 'wasla:swipe-preference';
let fallback = true;
const read = () => {
  try { return localStorage.getItem(SWIPE_PREFERENCE_KEY) !== 'off'; }
  catch { return fallback; }
};
const subscribe = callback => {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
};

export function useSwipePreference() {
  const enabled = useSyncExternalStore(subscribe, read, () => true);
  const setEnabled = value => {
    fallback = value;
    try { localStorage.setItem(SWIPE_PREFERENCE_KEY, value ? 'on' : 'off'); } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [enabled, setEnabled];
}
