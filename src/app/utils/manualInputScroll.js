const editableSelector = 'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="file"]), [contenteditable="true"]';

/** Keep focus/keyboard changes from moving the page; leave touch scrolling native. */
export function preserveManualInputScroll(win = window) {
    const doc = win.document;
    const root = doc.scrollingElement;
    let positions = new Map();
    let editing = false;
    let dragging = false;
    let pointerStart = null;
    let userScrolling = false;
    let settleTimer;
    let blurTimer;
    let frame;

    const editable = target => target instanceof win.Element ? target.closest(editableSelector) : null;
    const remember = () => {
        for (const element of positions.keys()) {
            positions.set(element, { left: element.scrollLeft, top: element.scrollTop });
        }
    };
    const capture = target => {
        const next = new Map();
        // The textarea itself must still scroll its text to keep the caret visible.
        for (let element = target.parentElement; element; element = element.parentElement) {
            if (element === root || element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
                next.set(element, positions.get(element) || { left: element.scrollLeft, top: element.scrollTop });
            }
        }
        if (!next.has(root)) next.set(root, positions.get(root) || { left: win.scrollX, top: win.scrollY });
        positions = next;
    };
    const restore = () => {
        if (!editing || userScrolling) return;
        for (const [element, position] of positions) {
            if (element.scrollLeft === position.left && element.scrollTop === position.top) continue;
            element.scrollTo({ ...position, behavior: 'instant' });
        }
    };
    const beginEditing = target => {
        win.clearTimeout(blurTimer);
        if (!editing) {
            userScrolling = false;
            win.clearTimeout(settleTimer);
        }
        capture(target);
        editing = true;
    };
    const settle = () => {
        win.clearTimeout(settleTimer);
        settleTimer = win.setTimeout(() => {
            if (dragging) return;
            remember();
            userScrolling = false;
        }, 180);
    };
    const onPointerDown = event => {
        pointerStart = { x: event.clientX, y: event.clientY };
        dragging = false;
        const input = editable(event.target);
        if (input) beginEditing(input);
    };
    const onPointerMove = event => {
        if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 6) return;
        dragging = true;
        userScrolling = true;
    };
    const onPointerEnd = () => {
        pointerStart = null;
        dragging = false;
        if (userScrolling) settle();
        if (editing && !editable(doc.activeElement)) onBlur();
    };
    // Touch events continue after the browser cancels pointer events to start a pan.
    const onTouchStart = event => {
        const touch = event.touches[0];
        if (touch) onPointerDown({ clientX: touch.clientX, clientY: touch.clientY, target: event.target });
    };
    const onTouchMove = event => {
        const touch = event.touches[0];
        if (touch) onPointerMove(touch);
    };
    const onPointerCancel = event => {
        if (event.pointerType !== 'touch') onPointerEnd();
    };
    const onWheel = () => { userScrolling = true; settle(); };
    const onFocus = event => {
        const input = editable(event.target);
        if (input) { beginEditing(input); restore(); }
    };
    const onBlur = () => {
        // Keyboard dismissal can move the viewport after the field has blurred.
        win.clearTimeout(blurTimer);
        blurTimer = win.setTimeout(() => {
            if (editable(doc.activeElement)) return;
            restore();
            editing = false;
            positions.clear();
        }, 700);
    };
    const onScroll = event => {
        const target = event.target === doc ? root : event.target;
        if (!editing || !positions.has(target)) return;
        if (userScrolling) { remember(); settle(); }
        else restore();
    };
    const onViewportChange = () => {
        restore();
        win.cancelAnimationFrame(frame);
        frame = win.requestAnimationFrame(restore);
    };
    const listeners = [
        [doc, 'pointerdown', onPointerDown], [doc, 'pointermove', onPointerMove],
        [doc, 'pointerup', onPointerEnd], [doc, 'pointercancel', onPointerCancel],
        [doc, 'touchstart', onTouchStart], [doc, 'touchmove', onTouchMove],
        [doc, 'touchend', onPointerEnd], [doc, 'touchcancel', onPointerEnd],
        [doc, 'wheel', onWheel], [doc, 'focusin', onFocus], [doc, 'focusout', onBlur],
        [doc, 'scroll', onScroll], [win, 'resize', onViewportChange],
        [win.visualViewport, 'resize', onViewportChange], [win.visualViewport, 'scroll', onViewportChange],
    ];
    for (const [target, type, handler] of listeners) target?.addEventListener(type, handler, { capture: true, passive: true });
    doc.documentElement.classList.add('manual-input-scroll');
    return () => {
        for (const [target, type, handler] of listeners) target?.removeEventListener(type, handler, { capture: true });
        win.clearTimeout(settleTimer);
        win.clearTimeout(blurTimer);
        win.cancelAnimationFrame(frame);
        doc.documentElement.classList.remove('manual-input-scroll');
    };
}
