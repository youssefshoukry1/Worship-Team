// Only an inward, mostly horizontal swipe from the first/last 24px is Back.
// Movement listeners exist only for an eligible edge touch, keeping ordinary
// scrolling on WebKit's native fast path. No React state changes per frame.
export function installIOSEdgeBack({ onBack, onInteraction = () => {}, win = window }) {
  const doc = win.document;
  const ignored = 'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="slider"], video, audio, canvas, [data-edge-back="off"]';
  let gesture = null;

  const reset = () => {
    gesture = null;
    doc.removeEventListener('touchmove', move);
    doc.removeEventListener('touchend', end);
    doc.removeEventListener('touchcancel', reset);
  };
  const position = (touches, id) => Array.from(touches).find(touch => touch.identifier === id);

  function move(event) {
    if (!gesture) return;
    if (event.touches.length !== 1 || event.defaultPrevented) { reset(); return; }
    const touch = position(event.touches, gesture.id);
    if (!touch) { reset(); return; }
    const dx = (touch.clientX - gesture.x) * gesture.direction;
    const dy = Math.abs(touch.clientY - gesture.y);
    if (!gesture.locked) {
      if (dx < -8 || (dy > 10 && dy > dx)) { reset(); return; }
      if (dx < 10 || dx < dy * 1.5) return;
      // Once native scrolling wins, never reinterpret that finger as Back.
      if (!event.cancelable) { reset(); return; }
      gesture.locked = true;
    }
    if (event.cancelable) event.preventDefault();
  }

  function end(event) {
    if (!gesture) return;
    const current = gesture;
    const touch = position(event.changedTouches, current.id);
    const dx = touch ? (touch.clientX - current.x) * current.direction : 0;
    const dy = touch ? Math.abs(touch.clientY - current.y) : Infinity;
    const completed = current.locked && event.touches.length === 0 && !event.defaultPrevented
      && win.performance.now() - current.started <= 1000
      && dx >= Math.min(96, win.innerWidth * 0.22) && dx > dy * 1.5;
    reset();
    if (!completed) return;
    if (event.cancelable) event.preventDefault();
    onBack();
  }

  const start = event => {
    reset();
    onInteraction();
    if (event.defaultPrevented || event.touches.length !== 1 || doc.visibilityState === 'hidden'
      || (win.visualViewport?.scale || 1) > 1.05) return;
    const touch = event.touches[0];
    const width = win.innerWidth;
    const direction = touch.clientX <= 24 ? 1 : touch.clientX >= width - 24 ? -1 : 0;
    if (!direction) return;
    const target = event.target instanceof win.Element ? event.target : event.target?.parentElement;
    if (!target || target.closest(ignored) || doc.querySelector('[aria-modal="true"], dialog[open]')) return;
    if (doc.getSelection()?.isCollapsed === false) return;
    for (let element = target; element && element !== doc.body; element = element.parentElement) {
      if (element.scrollWidth > element.clientWidth + 1 && /^(auto|scroll)$/.test(win.getComputedStyle(element).overflowX)) return;
    }
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, direction, started: win.performance.now(), locked: false };
    doc.addEventListener('touchmove', move, { passive: false });
    doc.addEventListener('touchend', end, { passive: false });
    doc.addEventListener('touchcancel', reset, { passive: true });
  };
  doc.addEventListener('touchstart', start, { passive: true });
  doc.addEventListener('visibilitychange', reset);
  win.addEventListener('resize', reset, { passive: true });

  return {
    reset,
    dispose() {
      reset();
      doc.removeEventListener('touchstart', start);
      doc.removeEventListener('visibilitychange', reset);
      win.removeEventListener('resize', reset);
    },
  };
}
