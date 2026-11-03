// The outer 24px belong to the existing iOS/Android edge gestures.
export function installInteriorSwipe({ element, begin, update, finish, cancel, win = window }) {
  const doc = win.document;
  let touch = null;
  let frame = null;
  let distance = 0;
  let suppressClickUntil = 0;
  // Taps and text entry do not compete with a horizontal page drag. Reserve
  // only controls that already use dragging, or an explicit gesture opt-out.
  const ignored = 'select,input[type="range"],[role="slider"],video,audio,canvas,[data-edge-back="off"],[data-page-swipe="off"]';
  const find = list => Array.from(list).find(point => point.identifier === touch?.id);
  const detach = () => {
    doc.removeEventListener('touchmove', move, true);
    doc.removeEventListener('touchend', end, true);
    doc.removeEventListener('touchcancel', abort, true);
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
      suppressClickUntil = win.performance.now() + 1000;
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
      suppressClickUntil = win.performance.now() + 500;
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
    suppressClickUntil = 0;
    if (event.defaultPrevented || event.touches.length !== 1 || doc.visibilityState === 'hidden'
      || (win.visualViewport?.scale || 1) > 1.05) return;
    const point = event.touches[0];
    if (point.clientX <= 24 || point.clientX >= win.innerWidth - 24) return;
    const target = event.target instanceof win.Element ? event.target : null;
    // Portaled dialogs keep their gestures; both navigation bars belong to
    // the page surface even though they sit outside the tab panel.
    if (!target || (!element.contains(target) && !target.closest('nav'))) return;
    if (target.closest(ignored) || doc.getSelection()?.isCollapsed === false
      || doc.querySelector('[aria-modal="true"],dialog[open]')) return;
    const input = target.closest('input,textarea');
    if (input && input.selectionStart !== null && input.selectionEnd > input.selectionStart) return;
    // Nested horizontal carousels keep their own gestures.
    for (let node = target; node && node !== element; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 1 && /^(auto|scroll)$/.test(win.getComputedStyle(node).overflowX)) return;
    }
    touch = { id: point.identifier, x: point.clientX, y: point.clientY, started: win.performance.now(), locked: false };
    doc.addEventListener('touchmove', move, { capture: true, passive: false });
    doc.addEventListener('touchend', end, { capture: true, passive: false });
    doc.addEventListener('touchcancel', abort, { capture: true, passive: true });
  };
  const suppressSwipeClick = event => {
    if (event.detail !== 0 && win.performance.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  // Capture sees gestures even when a card stops touch event propagation.
  doc.addEventListener('touchstart', start, { capture: true, passive: true });
  doc.addEventListener('click', suppressSwipeClick, true);
  doc.addEventListener('visibilitychange', abort);
  win.addEventListener('resize', abort, { passive: true });
  return () => {
    abort();
    doc.removeEventListener('touchstart', start, true);
    doc.removeEventListener('click', suppressSwipeClick, true);
    doc.removeEventListener('visibilitychange', abort);
    win.removeEventListener('resize', abort);
  };
}
