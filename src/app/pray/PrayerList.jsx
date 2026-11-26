'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePrayerSession } from './PrayerSessionProvider';
import { useTabPageActive } from '../components/TabPageActivity';
import { useLanguage } from '../context/LanguageContext';
import { isNavigationBusy, waitForNavigationIdle } from '../utils/navigationWork';
import { PRAYER_BATCH, prayerBatchFor, prayerListLayout, prayerWindow } from './prayerListLayout';

const PrayerRow = memo(function PrayerRow({ entry, index, count, top, register, keyboard, renderItem }) {
    const id = String(entry._id);
    const attach = useCallback(node => register(id, node), [id, register]);
    return <div ref={attach} role="listitem" aria-posinset={index + 1} aria-setsize={count} tabIndex={0}
        data-prayer-row={id} onKeyDown={keyboard}
        style={{ position: 'absolute', top, left: 0, right: 0, paddingBottom: 10, overflowAnchor: 'none' }}>
        {renderItem(entry)}
    </div>;
});

// Keep the bounded visible rows ready for a return swipe. Only the active
// page may measure, scroll, observe resizes or advance its loaded batch.
export default function PrayerList({ items, renderItem, scope, targetId, targetKey, targetReply = false }) {
    const active = useTabPageActive();
    const session = usePrayerSession();
    const { language } = useLanguage();
    const stateKey = `list:${scope}`;
    const [saved] = useState(() => session.get(stateKey) || {});
    const heights = useRef(new Map(saved.heights || []));
    const width = useRef(saved.width || 0);
    const root = useRef(null);
    const observer = useRef(null);
    const nodes = useRef(new Map());
    const frame = useRef(null);
    const lastAnchor = useRef(saved.anchor || null);
    const pendingJump = useRef(null);
    const consumedTarget = useRef(saved.consumedTarget || null);
    const restoring = useRef(true);
    const [limit, setLimit] = useState(() => Math.max(PRAYER_BATCH, saved.limit || 0));
    const [revision, setRevision] = useState(0);
    const [viewport, setViewport] = useState(() => saved.viewport || { top: 0, height: 800 });
    const [focusedId, setFocusedId] = useState(null);
    const visibleItems = useMemo(() => items.slice(0, limit), [items, limit]);
    // revision invalidates offsets after ResizeObserver batches update the height map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const layout = useMemo(() => prayerListLayout(visibleItems, heights.current), [visibleItems, revision]);
    const latest = useRef(null);
    useLayoutEffect(() => { latest.current = { items, layout, limit, focusedId, viewport }; });

    const measureViewport = useCallback(() => {
        if (!active || !root.current || root.current.closest('[data-swipe-moving]')) return;
        const { top, width: nextWidth } = root.current.getBoundingClientRect();
        if (width.current && Math.abs(width.current - nextWidth) > 1) {
            // Rotation may clamp the browser scroll before its resize event.
            // Preserve the previous item, not that temporary clamped position.
            if (!pendingJump.current && lastAnchor.current?.id) {
                pendingJump.current = { ...lastAnchor.current };
                restoring.current = true;
            }
            heights.current.clear();
            for (const [id, node] of nodes.current) heights.current.set(id, node.getBoundingClientRect().height);
            setRevision(value => value + 1);
        }
        width.current = nextWidth;
        setViewport(previous => previous.top === -top && previous.height === innerHeight ? previous : { top: -top, height: innerHeight });
        const current = latest.current;
        if (current && !restoring.current) {
            // Browser scroll positions are rounded; a subpixel boundary must
            // anchor the row beginning here, not the preceding row's last pixel.
            const index = current.layout.indexAt(Math.max(0, -top) + 1);
            lastAnchor.current = top > 0 ? { beforeList: true, scrollY } : {
                id: String(current.items[index]?._id || ''), index, offset: -top - current.layout.offsets[index],
            };
        }
    }, [active]);
    const scheduleViewport = useCallback(() => {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => { frame.current = null; measureViewport(); });
    }, [measureViewport]);

    const jumpTo = useCallback((id, offset = 0, focus = false, reply = false) => {
        const current = latest.current;
        const index = current?.items.findIndex(entry => String(entry._id) === id);
        if (index == null || index < 0) return false;
        pendingJump.current = { id, offset, focus, reply };
        restoring.current = true;
        setLimit(previous => prayerBatchFor(index, current.items.length, previous));
        setRevision(value => value + 1);
        return true;
    }, []);

    useEffect(() => {
        if (!active) return;
        restoring.current = true;
        const resumeAnchor = lastAnchor.current;
        let cancelled = false;
        const measuredHeights = heights.current;
        const measurements = new Map();
        let waiting = false;
        const applyMeasurements = () => {
            if (cancelled) return;
            let changed = false;
            for (const [id, size] of measurements) {
                if (size > 0 && Math.abs((heights.current.get(id) || 0) - size) > .5) { heights.current.set(id, size); changed = true; }
            }
            measurements.clear();
            if (changed) setRevision(value => value + 1);
        };
        const resize = new ResizeObserver(entries => {
            for (const entry of entries) measurements.set(entry.target.dataset.prayerRow,
                entry.borderBoxSize?.[0]?.blockSize || entry.target.getBoundingClientRect().height);
            if (!isNavigationBusy()) { applyMeasurements(); return; }
            if (waiting) return;
            waiting = true;
            void waitForNavigationIdle().then(() => { waiting = false; applyMeasurements(); });
        });
        observer.current = resize;
        for (const node of nodes.current.values()) resize.observe(node);
        window.addEventListener('scroll', scheduleViewport, { passive: true });
        window.addEventListener('resize', scheduleViewport);
        const start = async () => {
            await waitForNavigationIdle();
            if (cancelled) return;
            measureViewport();
            if (targetId && consumedTarget.current !== targetKey && items.some(entry => String(entry._id) === String(targetId))) return;
            const anchor = resumeAnchor;
            if (anchor?.id) {
                const exists = items.some(entry => String(entry._id) === anchor.id);
                const id = exists ? anchor.id : String(items[Math.min(anchor.index || 0, items.length - 1)]?._id || '');
                if (jumpTo(id, anchor.offset)) return;
            }
            if (anchor?.beforeList) window.scrollTo({ top: anchor.scrollY, behavior: 'instant' });
            restoring.current = false; scheduleViewport();
        };
        void start();
        return () => {
            cancelled = true; resize.disconnect(); observer.current = null;
            window.removeEventListener('scroll', scheduleViewport); window.removeEventListener('resize', scheduleViewport);
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            session.set(stateKey, { limit: latest.current?.limit || PRAYER_BATCH, anchor: lastAnchor.current, viewport: latest.current?.viewport, width: width.current, heights: [...measuredHeights], consumedTarget: consumedTarget.current });
        };
        // Initial restoration is mount-scoped. Subsequent targets use the effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, session, stateKey, measureViewport, scheduleViewport, jumpTo]);

    useEffect(() => {
        if (!active || !targetId || consumedTarget.current === targetKey) return;
        let cancelled = false;
        void waitForNavigationIdle().then(() => {
            if (!cancelled && jumpTo(String(targetId), 0, false, targetReply)) consumedTarget.current = targetKey;
        });
        return () => { cancelled = true; };
    }, [active, targetId, targetKey, targetReply, items, jumpTo]);

    useLayoutEffect(() => {
        const element = root.current;
        if (!active || !element || element.closest('[data-swipe-moving]')) return;
        const jump = pendingJump.current;
        const anchor = jump || (!restoring.current && lastAnchor.current?.id ? lastAnchor.current : null);
        if (anchor) {
            const index = layout.indices.get(anchor.id) ?? (!jump && visibleItems.length ? Math.min(anchor.index || 0, visibleItems.length - 1) : undefined);
            if (index !== undefined) {
                const listTop = element.getBoundingClientRect().top + scrollY;
                let offset = anchor.offset || 0;
                if (jump?.reply) {
                    const row = nodes.current.get(jump.id);
                    const reply = row?.querySelector('[data-prayer-reply-text]');
                    if (reply) {
                        const distance = reply.getBoundingClientRect().top - row.getBoundingClientRect().top;
                        if (distance > innerHeight * 0.6) offset = distance - innerHeight * 0.4;
                    }
                }
                const nextTop = Math.max(0, listTop + layout.offsets[index] + offset);
                if (Math.abs(nextTop - scrollY) > 1) window.scrollTo({ top: nextTop, behavior: 'instant' });
                if (jump) {
                    const row = nodes.current.get(jump.id);
                    // An already-mounted collapsed row can still have its old
                    // height until ResizeObserver commits the expanded layout.
                    if (row && heights.current.has(jump.id) && (!jump.reply ||
                        Math.abs(heights.current.get(jump.id) - row.getBoundingClientRect().height) <= 1)) {
                        pendingJump.current = null; restoring.current = false;
                        if (jump.focus) row.focus({ preventScroll: true });
                    }
                }
            }
        }
        measureViewport();
    }, [active, layout, revision, viewport.top, visibleItems.length, measureViewport]);

    const indices = prayerWindow(layout, viewport.top, viewport.height, visibleItems.length, focusedId);
    const loadMore = useCallback((focus = false) => {
        const current = latest.current;
        if (!current || current.limit >= current.items.length) return;
        if (focus) jumpTo(String(current.items[current.limit]._id), 0, true);
        else setLimit(previous => Math.min(current.items.length, previous + PRAYER_BATCH));
    }, [jumpTo]);
    useEffect(() => {
        if (active && !restoring.current && viewport.top > 0 && layout.total - viewport.top - viewport.height < 200) loadMore();
    }, [active, viewport, layout.total, loadMore]);

    const onFocus = event => setFocusedId(event.target.closest('[data-prayer-row]')?.dataset.prayerRow || null);
    const onBlur = () => queueMicrotask(() => setFocusedId(root.current?.contains(document.activeElement) ? document.activeElement.closest('[data-prayer-row]')?.dataset.prayerRow || null : null));
    const register = useCallback((id, node) => {
        const previous = nodes.current.get(id);
        if (previous && previous !== node) observer.current?.unobserve(previous);
        if (node) { nodes.current.set(id, node); observer.current?.observe(node); } else nodes.current.delete(id);
    }, []);
    const keyboard = useCallback(event => {
        if (event.target !== event.currentTarget) return;
        const items = latest.current.items;
        const index = items.findIndex(entry => String(entry._id) === event.currentTarget.dataset.prayerRow);
        const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : -1;
        if (next >= 0 && next < items.length) { event.preventDefault(); jumpTo(String(items[next]._id), 0, true); }
    }, [jumpTo]);
    return <>
        <div ref={root} role="list" data-prayer-list data-loaded-prayers={visibleItems.length}
            style={{ position: 'relative', height: layout.total, overflowAnchor: 'none' }} onFocusCapture={onFocus} onBlurCapture={onBlur}>
            {indices.map(index => {
                const entry = visibleItems[index], id = String(entry._id);
                return <PrayerRow key={id} entry={entry} index={index} count={items.length} top={layout.offsets[index]}
                    register={register} keyboard={keyboard} renderItem={renderItem} />;
            })}
        </div>
        <div className="py-3 text-center text-xs text-slate-500" data-prayer-list-footer>
            {visibleItems.length < items.length ? <button type="button" className="min-h-11 rounded-xl px-4 text-sky-400 focus-visible:outline focus-visible:outline-2" onClick={() => loadMore(true)}>
                {language === 'ar' ? 'عرض 10 صلوات أخرى' : language === 'de' ? '10 weitere laden' : 'Load 10 more'}
            </button> : <span>{language === 'ar' ? 'هذه كل الصلوات' : language === 'de' ? 'Alle Gebete angezeigt' : 'All prayers shown'}</span>}
        </div>
    </>;
}
