import { useCallback, useEffect, useRef } from 'react';

// Same gesture rules as the Bible selection panel: direct compositor movement,
// native list scrolling, distance/velocity dismissal, and a short settling curve.
export default function useNoteSheetDrag(ref, open, onClose) {
    const closeRef = useRef(onClose);
    const timer = useRef(null);
    const closing = useRef(false);
    useEffect(() => { closeRef.current = onClose; }, [onClose]);
    const close = useCallback(() => {
        const panel = ref.current;
        if (closing.current || !panel) return;
        closing.current = true;
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
        panel.style.animation = 'none';
        panel.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
        panel.style.transform = 'translate3d(0, 100%, 0)';
        timer.current = setTimeout(() => { closeRef.current(); closing.current = false; }, duration);
    }, [ref]);

    useEffect(() => {
        const panel = ref.current;
        if (!open || !panel) return;
        closing.current = false;
        let gesture = null, suppressClick = false;
        const settle = () => {
            const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
            panel.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
            panel.style.transform = 'translate3d(0, 0, 0)';
        };
        const start = event => {
            if (closing.current || event.touches.length !== 1) { gesture = null; return; }
            const touch = event.touches[0];
            const scroller = event.target.closest('[data-reactor-scroll]');
            gesture = { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, lastAt: Date.now(),
                velocity: 0, distance: 0, scroller, enabled: !scroller || scroller.scrollTop <= 0 };
            suppressClick = false;
            if (gesture.enabled) { panel.style.animation = 'none'; panel.style.transition = 'none'; }
        };
        const move = event => {
            if (!gesture || closing.current) return;
            if (event.touches.length !== 1) { gesture = null; settle(); return; }
            const touch = event.touches[0], dy = touch.clientY - gesture.y;
            const dx = Math.abs(touch.clientX - gesture.x);
            const stepY = touch.clientY - gesture.lastY;
            const time = Date.now();
            gesture.velocity = stepY / (time - gesture.lastAt || 1);
            gesture.lastY = touch.clientY; gesture.lastAt = time;
            if (dx > 8 && dx > Math.abs(dy) * 1.2) { gesture.enabled = false; return; }
            const scroller = gesture.scroller;
            if (scroller && (scroller.scrollTop > 0 || dy < -5)) {
                // A gesture that began scrolling can never become a dismiss drag.
                gesture.enabled = false; gesture.distance = 0;
                panel.style.transform = 'translate3d(0, 0, 0)';
            }
            if (gesture.enabled) {
                gesture.distance = Math.max(0, dy);
                suppressClick = gesture.distance > 6;
                panel.style.transform = `translate3d(0, ${gesture.distance}px, 0)`;
                if (event.cancelable) event.preventDefault();
            } else if (!scroller || !((stepY < 0 && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1) || (stepY > 0 && scroller.scrollTop > 0))) {
                if (event.cancelable) event.preventDefault();
            }
        };
        const end = event => {
            if (!gesture || closing.current) return;
            const { enabled, distance, scroller } = gesture;
            const velocity = Date.now() - gesture.lastAt > 100 ? 0 : gesture.velocity;
            gesture = null;
            const dismiss = enabled && event.type !== 'touchcancel' && (scroller
                ? distance > 80 : distance > 25 || (distance > 6 && velocity > .18) || (distance > 12 && velocity > .1));
            if (dismiss) close(); else settle();
        };
        const click = event => {
            if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); }
        };
        panel.addEventListener('touchstart', start, { passive: true });
        panel.addEventListener('touchmove', move, { passive: false });
        panel.addEventListener('touchend', end);
        panel.addEventListener('touchcancel', end);
        panel.addEventListener('click', click, true);
        return () => {
            clearTimeout(timer.current);
            panel.removeEventListener('touchstart', start);
            panel.removeEventListener('touchmove', move);
            panel.removeEventListener('touchend', end);
            panel.removeEventListener('touchcancel', end);
            panel.removeEventListener('click', click, true);
        };
    }, [ref, open, close]);
    return close;
}
