export const HOME_REFRESH_EVENT = 'taspe7:home-refresh';
export const BACK_EXIT_WINDOW_MS = 2000;

export function isHomePath(pathname) {
  const path = (pathname || '/').replace(/\/index\.html\/?$/i, '').replace(/\/+$/, '');
  return path === '' || path === '/pray';
}

// Keep gesture state outside React: no renders, polling, or timers per Back.
export function createAndroidBackController({ getPath, isAuthenticated, isScrolled, scrollToTop, refreshHome, goHome, exitApp, notifyExit, now = () => performance.now() }) {
  let exitUntil = 0;
  let goingHome = false;
  let exiting = false;
  let revision = 0;

  const reset = () => { exitUntil = 0; goingHome = false; exiting = false; revision++; };

  const back = () => {
    if (exiting) return;
    if (isAuthenticated() && !isHomePath(getPath())) {
      exitUntil = 0;
      if (goingHome) return;
      goingHome = true;
      const request = ++revision;
      // Async routing may wait for the exported-route worker. A new route or
      // user interaction invalidates that work before it can navigate late.
      Promise.resolve(goHome(() => revision === request)).catch(() => {
        if (revision === request) goingHome = false;
      });
      return;
    }

    goingHome = false;
    const scrolled = isAuthenticated() && isScrolled();
    if (!scrolled && exitUntil > now()) {
      exiting = true;
      exitUntil = 0;
      Promise.resolve(exitApp()).catch(() => { exiting = false; });
      return;
    }

    if (scrolled) scrollToTop();
    else if (isAuthenticated()) refreshHome();
    exitUntil = now() + BACK_EXIT_WINDOW_MS;
    notifyExit();
  };

  return { back, reset };
}
