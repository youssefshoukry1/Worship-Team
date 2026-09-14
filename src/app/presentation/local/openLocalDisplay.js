// Local (HDMI) display window helpers — Window Management API (Chrome/Edge).
// No second screen connected → no window is opened (presenter behaves like on phones).

const WINDOW_NAME = 'taspe_local_display';
const DISPLAY_URL = '/presentation/local';
export const FULLSCREEN_MESSAGE = 'taspe-local-fullscreen';

let screenDetails = null;

function hasSecondScreen() {
  return typeof window !== 'undefined' && window.screen?.isExtended === true;
}

async function loadScreenDetails() {
  if (screenDetails) return screenDetails;
  if (!hasSecondScreen() || !('getScreenDetails' in window)) return null;
  try {
    screenDetails = await window.getScreenDetails();
  } catch {
    screenDetails = null;
  }
  return screenDetails;
}

function externalScreen() {
  if (!screenDetails || !hasSecondScreen()) return null;
  const { screens, currentScreen } = screenDetails;
  return (
    screens.find((s) => s !== currentScreen && !s.isInternal) ||
    screens.find((s) => s !== currentScreen) ||
    null
  );
}

/**
 * Call once on mount. Loads screen info now if permission was already granted,
 * otherwise asks for it on the first click in the page (the prompt needs a user gesture).
 */
export function prepareLocalDisplay() {
  if (!hasSecondScreen() || !('getScreenDetails' in window)) return () => {};

  let cancelled = false;
  const onFirstClick = () => loadScreenDetails();

  navigator.permissions
    ?.query({ name: 'window-management' })
    .then((status) => {
      if (cancelled) return;
      if (status.state === 'granted') loadScreenDetails();
      else if (status.state === 'prompt') window.addEventListener('pointerdown', onFirstClick, { once: true });
    })
    .catch(() => window.addEventListener('pointerdown', onFirstClick, { once: true }));

  return () => {
    cancelled = true;
    window.removeEventListener('pointerdown', onFirstClick);
  };
}

/**
 * Opens the local display window on the external screen. Call from a click handler.
 * Returns null (and opens nothing) when no second screen is available.
 * @param {{ current: Window | null }} ref
 */
export async function openLocalDisplay(ref) {
  if (ref.current && !ref.current.closed) return ref.current;
  if (!hasSecondScreen()) return null;

  await loadScreenDetails();
  const screen = externalScreen();
  if (!screen) return null;

  const win = window.open(
    DISPLAY_URL,
    WINDOW_NAME,
    `popup,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`
  );
  ref.current = win;
  return win;
}

/**
 * Manual "add display screen": always opens the window, even if the screen permission was denied.
 * Placed on the external screen when known, otherwise a normal popup the user can drag there.
 * Synchronous so the click's user activation isn't lost.
 * @param {{ current: Window | null }} ref
 */
export function openLocalDisplayManual(ref) {
  if (ref.current && !ref.current.closed) {
    ref.current.focus();
    return ref.current;
  }
  const screen = externalScreen();
  const features = screen
    ? `popup,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`
    : 'popup,width=1280,height=720';
  const win = window.open(DISPLAY_URL, WINDOW_NAME, features);
  ref.current = win;
  return win;
}

/**
 * Toggles fullscreen on the display window. Must be called from a click:
 * the click's user activation is delegated to the display window.
 * @param {{ current: Window | null }} ref
 */
export function toggleLocalFullscreen(ref) {
  const win = ref.current;
  if (!win || win.closed) return false;
  const message = { type: FULLSCREEN_MESSAGE };
  try {
    win.postMessage(message, { targetOrigin: window.location.origin, delegate: 'fullscreen' });
  } catch {
    win.postMessage(message, window.location.origin);
  }
  return true;
}
