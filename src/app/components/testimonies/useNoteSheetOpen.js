import { useEffect, useRef } from 'react';

export default function useNoteSheetOpen(surfaceRef, sheetRef, layerRef, enabled, onOpen) {
    const openRef = useRef(onOpen);
    useEffect(() => { openRef.current = onOpen; }, [onOpen]);
    useEffect(() => {
        const surface = surfaceRef.current, sheet = sheetRef.current, layer = layerRef.current;
        if (!enabled || !surface || !sheet || !layer) return;
        let gesture = null, timer, suppressClick = false;
        const duration = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
        const resetLayer = () => {
            layer.style.removeProperty('visibility');
            layer.style.removeProperty('pointer-events');
            layer.style.removeProperty('--sheet-progress');
        };
        const settle = (open = false) => {
            sheet.style.transition = `transform ${duration()}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
            sheet.style.transform = open ? 'translate3d(0, 0, 0)' : 'translate3d(0, 100%, 0)';
            if (open) { resetLayer(); openRef.current(); }
            else timer = setTimeout(() => { resetLayer(); suppressClick = false; }, duration());
        };
        const start = event => {
            clearTimeout(timer);
            suppressClick = false;
            if (event.touches.length !== 1) { gesture = null; return; }
            const touch = event.touches[0], bounds = surface.getBoundingClientRect();
            const control = event.target.closest('button, a');
            if (touch.clientY < bounds.top + bounds.height / 2 ||
                (control && control.getAttribute('aria-label') !== 'See who loved this note')) {
                gesture = null; resetLayer(); return;
            }
            gesture = { x: touch.clientX, y: touch.clientY, distance: 0, dragging: false,
                threshold: Math.min(100, surface.clientHeight * .25, sheet.offsetHeight) };
        };
        const move = event => {
            if (!gesture) return;
            if (event.touches.length !== 1) { if (gesture.dragging) settle(); gesture = null; return; }
            const touch = event.touches[0], dy = gesture.y - touch.clientY, dx = Math.abs(touch.clientX - gesture.x);
            if (!gesture.dragging) {
                if (dx > 8 && dx > Math.abs(dy)) { gesture = null; return; }
                if (dy <= 6 || dy < dx * 1.4) return;
                gesture.dragging = true;
                layer.style.visibility = 'visible'; layer.style.pointerEvents = 'none';
                sheet.style.animation = 'none'; sheet.style.transition = 'none';
            }
            const height = sheet.offsetHeight;
            gesture.distance = Math.max(0, Math.min(height, dy));
            sheet.style.transform = `translate3d(0, ${height - gesture.distance}px, 0)`;
            layer.style.setProperty('--sheet-progress', String(gesture.distance / height));
            suppressClick = true;
            if (event.cancelable) event.preventDefault();
        };
        const end = event => {
            const current = gesture; gesture = null;
            if (!current?.dragging) return;
            // Distance alone decides: at/below the preview height closes; beyond it opens.
            settle(event.type !== 'touchcancel' && current.distance > current.threshold);
        };
        const click = event => {
            if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); }
        };
        surface.addEventListener('touchstart', start, { passive: true });
        surface.addEventListener('touchmove', move, { passive: false });
        surface.addEventListener('touchend', end);
        surface.addEventListener('touchcancel', end);
        surface.addEventListener('click', click, true);
        return () => {
            clearTimeout(timer); resetLayer();
            surface.removeEventListener('touchstart', start);
            surface.removeEventListener('touchmove', move);
            surface.removeEventListener('touchend', end);
            surface.removeEventListener('touchcancel', end);
            surface.removeEventListener('click', click, true);
        };
    }, [surfaceRef, sheetRef, layerRef, enabled]);
}
