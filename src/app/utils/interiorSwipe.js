// The outer 24px belong to the existing iOS/Android edge gestures.
export function installInteriorSwipe({ element, begin, update, finish, cancel, win = window }) {
  const doc = win.document;
  let touch = null;
  let frame = null;
  let distance = 0;
  const ignored = 'input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="slider"],video,audio,canvas,[data-edge-back="off"],[data-page-swipe="off"]';
  const find = list => Array.from(list).find(point => point.identifier === touch?.id);
  const detach = () => {
    doc.removeEventListener('touchmove', move);
    doc.removeEventListener('touchend', end);
    doc.removeEventListener('touchcancel', abort);
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
  };
  const reset = () => { detach(); touch = null; };
  function abort() { if (touch?.locked) cancel(); reset(); }
  function move(event) {
    if (!touch) return;
    const point = find(event.touches);
    if (event.touches.length !== 1 || !point || event.defaultPrevented) { abort(); return; }
    const dx = point.clientX - touch.x;
    const dy = Math.abs(point.clientY - touch.y);
    if (!touch.locked) {
      if (dy > 8 && dy > Math.abs(dx)) { reset(); return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < dy * 1.5) return;
      if (!event.cancelable || !begin(dx < 0 ? 1 : -1)) { reset(); return; }
      touch.locked = true;
      touch.direction = dx < 0 ? 1 : -1;
    }
    if (event.cancelable) event.preventDefault();
    distance = Math.max(0, Math.min(win.innerWidth, -dx * touch.direction));
    touch.distance = distance;
    if (frame === null) frame = win.requestAnimationFrame(() => { frame = null; update(distance); });
  }
  function end(event) {
    if (!touch) return;
    const current = touch;
    const point = find(event.changedTouches);
    if (current.locked && point && !event.defaultPrevented && event.touches.length === 0) {
      if (event.cancelable) event.preventDefault();
      const amount = Math.max(0, -(point.clientX - current.x) * current.direction);
      const elapsed = Math.max(1, win.performance.now() - current.started);
      const completed = amount >= win.innerWidth * 0.28 || (amount >= 55 && amount / elapsed > 0.55);
      update(Math.min(win.innerWidth, amount));
      reset();
      finish(completed);
    } else abort();
  }
  const start = event => {
    abort();
    if (event.defaultPrevented || event.touches.length !== 1 || doc.visibilityState === 'hidden'
      || (win.visualViewport?.scale || 1) > 1.05 || win.location.search || win.location.hash) return;
    const point = event.touches[0];
    if (point.clientX <= 24 || point.clientX >= win.innerWidth - 24) return;
    const target = event.target instanceof win.Element ? event.target : null;
    if (!target || target.closest(ignored) || doc.getSelection()?.isCollapsed === false
      || doc.querySelector('[aria-modal="true"],dialog[open]')) return;
    // Nested carousels and overlays keep their own gestures.
    for (let node = target; node && node !== element; node = node.parentElement) {
      if (win.getComputedStyle(node).position === 'fixed'
        || (node.scrollWidth > node.clientWidth + 1 && /^(auto|scroll)$/.test(win.getComputedStyle(node).overflowX))) return;
    }
    touch = { id: point.identifier, x: point.clientX, y: point.clientY, started: win.performance.now(), locked: false };
    doc.addEventListener('touchmove', move, { passive: false });
    doc.addEventListener('touchend', end, { passive: false });
    doc.addEventListener('touchcancel', abort, { passive: true });
  };
  element.addEventListener('touchstart', start, { passive: true });
  doc.addEventListener('visibilitychange', abort);
  win.addEventListener('resize', abort, { passive: true });
  return () => {
    abort();
    element.removeEventListener('touchstart', start);
    doc.removeEventListener('visibilitychange', abort);
    win.removeEventListener('resize', abort);
  };
}
