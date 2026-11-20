const menu = '/normal_UserProfile';
const views = new Set(['highlights', 'notes', 'bible_settings']);
let pendingRoute;
let returningFrom;

function path(value) {
  return value.replace(/\/index\.html\/?$/i, '').replace(/\/+$/, '');
}

export function isProfilePath(pathname) {
  return path(pathname) === menu;
}

function entryKey() {
  return path(location.pathname) + location.search + location.hash;
}

function entry() {
  const saved = history.state?.settingsNavigation;
  return saved?.key === entryKey() ? saved : null;
}

export function profileView() {
  const view = location.hash.slice(1);
  if (!views.has(view) || !isProfilePath(location.pathname)) return 'menu';
  const owner = new URLSearchParams(location.search).get('user');
  return !owner || owner.toLowerCase() === localStorage.getItem('user_Taspe7_ID')?.toLowerCase() ? view : 'menu';
}

function savePosition() {
  const key = entryKey();
  history.replaceState({ ...history.state, settingsNavigation: { ...entry(), key, top: window.scrollY } }, '');
  return key;
}

export function profileScrollPosition() {
  return entry()?.top;
}

export function openProfileView(view) {
  const parent = savePosition();
  const key = parent.split('#')[0] + '#' + view;
  history.pushState({ settingsNavigation: { key, parent } }, '', '#' + view);
}

// Next creates its own history entry on a route push. Attach the parent only
// when that destination commits, and keep the position on the originating entry.
export function rememberSettingsRoute(href) {
  pendingRoute = { key: path(href), parent: savePosition() };
}

export function commitSettingsRoute() {
  if (pendingRoute?.key === entryKey()) {
    history.replaceState({ ...history.state, settingsNavigation: pendingRoute }, '');
  }
  pendingRoute = undefined;
}

export function settingsParent() {
  return entry()?.parent ?? (pendingRoute?.key === entryKey() ? pendingRoute.parent : null);
}

export function returnFromSettings() {
  if (settingsParent()) {
    const key = entryKey();
    if (returningFrom !== key) {
      returningFrom = key;
      window.addEventListener('popstate', () => { returningFrom = undefined; }, { once: true });
      history.back();
    }
    return true;
  }
  // A bookmarked Bible settings view has no in-app parent entry to pop.
  if (profileView() === 'menu') return false;
  const key = entryKey().split('#')[0];
  history.replaceState({ ...history.state, settingsNavigation: { key, top: 0 } }, '', location.pathname + location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  return true;
}
