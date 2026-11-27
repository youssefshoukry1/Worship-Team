'use client';

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useTabPageActive } from '../components/TabPageActivity';
import { useLanguage } from '../context/LanguageContext';
import { isNavigationBusy, waitForNavigationIdle } from '../utils/navigationWork';
import { usePrayerSession } from './PrayerSessionProvider';
import { PRAYER_BATCH, PRAYER_ESTIMATE, prayerBatchFor } from './prayerListLayout';

const keyFor = (_, entry) => String(entry._id);
const sessionKey = 'journalViewport';

// The pager keeps its neighbor visible during a return swipe. Retain the last
// committed rows there and detach their measurement observer until activation.
const Rows = memo(function Rows({ element, attributes }) {
    return <div {...attributes} ref={element} role="list" />;
}, (_, next) => !next.active);
function ListBody({ ref, context, ...props }) {
    const element = useRef(null);
    useImperativeHandle(ref, () => context.active ? element.current : null, [context.active]);
    return <Rows active={context.active} element={element} attributes={props} />;
}
const components = { List: ListBody };

const JournalRow = memo(function JournalRow({ entry, index, context }) {
    return <div role="listitem" tabIndex={0} aria-posinset={index + 1} aria-setsize={context.count}
        data-prayer-row={String(entry._id)} onKeyDown={context.onKeyDown} className="pb-2.5">
        {context.renderItem(entry)}
    </div>;
});
const renderRow = (index, entry, context) => <JournalRow entry={entry} index={index} context={context} />;

export default function JournalList({ items, renderItem, targetId, targetKey }) {
    const active = useTabPageActive();
    const session = usePrayerSession();
    const { language } = useLanguage();
    const [saved] = useState(() => session.get(sessionKey) || {});
    const [limit, setLimit] = useState(saved.limit || PRAYER_BATCH);
    const data = useMemo(() => items.slice(0, limit), [items, limit]);
    const [root, setRoot] = useState(null);
    const list = useRef(null);
    const rendered = useRef([]);
    const recordPosition = useRef(null);
    const rememberRange = useCallback(rows => {
        rendered.current = rows;
        recordPosition.current?.();
    }, []);
    const anchor = useRef(saved.anchor);
    const pending = useRef(null);
    const handled = useRef(saved.handled);
    const [jump, setJump] = useState(null);
    const [buffer, setBuffer] = useState(() => typeof window === 'undefined' ? 800 : window.innerHeight);
    // Supply real rows while Virtuoso takes its first viewport measurement.
    const initialCount = Math.min(PRAYER_BATCH, data.length, Math.ceil(buffer / PRAYER_ESTIMATE));
    const latest = useRef(null);
    useLayoutEffect(() => { latest.current = { items, limit }; });
    const [initialSizes] = useState(() => {
        if (!saved.ranges?.length || !saved.anchor?.id || saved.width !== window.innerWidth) return;
        const estimates = Array(Math.min(items.length, saved.limit)).fill(PRAYER_ESTIMATE);
        for (const { startIndex, endIndex, size } of saved.ranges) estimates.fill(size, startIndex, endIndex + 1);
        return estimates;
    });

    const goTo = useCallback((index, offset = 0, focus = false) => {
        const { items } = latest.current;
        if (!items[index]) return;
        const request = { id: String(items[index]._id), index, offset, focus };
        pending.current = request;
        setLimit(previous => prayerBatchFor(index, items.length, previous));
        setJump(request);
    }, []);

    useLayoutEffect(() => {
        if (!active || !root) return;
        const controller = list.current;
        const element = root;
        let disposed = false;
        let restored = false;
        const initialAnchor = anchor.current;
        let width = window.innerWidth;
        const record = () => {
            if (!restored || pending.current || width !== window.innerWidth || isNavigationBusy() || element.closest('[data-tab-active="false"], [data-swipe-moving]')) return;
            const top = element.getBoundingClientRect().top;
            if (top > 0) { anchor.current = { pageY: window.scrollY }; return; }
            const row = rendered.current.find(row => row.offset + row.size > -top + 1 && row.offset <= -top + 1);
            if (row?.data) anchor.current = { id: String(row.data._id), index: row.index, offset: -top - row.offset };
        };
        const onScroll = () => {
            record();
            if (restored && !pending.current && !isNavigationBusy() && window.scrollY > 0 && element.getBoundingClientRect().bottom < 2 * window.innerHeight) {
                const { items, limit } = latest.current;
                if (limit < items.length) setLimit(Math.min(items.length, limit + PRAYER_BATCH));
            }
        };
        const restore = (position) => {
            if (disposed || pending.current) return;
            if (position?.id) {
                const entries = latest.current.items;
                const index = entries.findIndex(entry => String(entry._id) === position.id);
                goTo(index >= 0 ? index : Math.min(position.index, entries.length - 1), position.offset);
            } else if (position?.pageY != null) window.scrollTo({ top: position.pageY, behavior: 'instant' });
        };
        const resize = () => {
            setBuffer(window.innerHeight);
            if (width === window.innerWidth) return;
            width = window.innerWidth;
            const focused = document.activeElement;
            if (focused?.matches('[data-prayer-row]') && element.contains(focused)) {
                goTo(Number(focused.getAttribute('aria-posinset')) - 1, 0, true);
            } else restore(anchor.current);
        };
        recordPosition.current = record;
        void waitForNavigationIdle().then(() => {
            if (disposed) return;
            restored = true;
            restore(initialAnchor);
        });
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', resize);
        return () => {
            disposed = true;
            recordPosition.current = null;
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', resize);
            const position = { anchor: anchor.current, limit: latest.current.limit, handled: handled.current, width };
            session.set(sessionKey, position);
            controller?.getState(snapshot => session.set(sessionKey, { ...position, ranges: snapshot.ranges }));
        };
    }, [active, root, session, goTo]);

    useEffect(() => {
        const index = targetId && items.findIndex(entry => String(entry._id) === String(targetId));
        if (!active || !targetId || index < 0 || handled.current === targetKey) return;
        let cancelled = false;
        void waitForNavigationIdle().then(() => {
            if (!cancelled) { handled.current = targetKey; goTo(index); }
        });
        return () => { cancelled = true; };
    }, [active, targetId, targetKey, items, goTo]);

    useLayoutEffect(() => {
        if (!active || !root || !jump || jump !== pending.current) return;
        if (String(data[jump.index]?._id) !== jump.id) {
            pending.current = null;
            return;
        }
        let cancelled = false;
        const frame = requestAnimationFrame(() => list.current?.scrollIntoView({
            index: jump.index,
            calculateViewLocation: () => ({ index: jump.index, offset: jump.offset, align: 'start', behavior: 'auto' }),
            done() {
                if (cancelled || pending.current !== jump) return;
                const row = root.querySelector(`[data-prayer-row="${CSS.escape(jump.id)}"]`);
                if (row) {
                    const delta = row.getBoundingClientRect().top + jump.offset;
                    if (Math.abs(delta) > 1) window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' });
                    if (jump.focus) row.focus({ preventScroll: true });
                }
                anchor.current = { id: jump.id, index: jump.index, offset: jump.offset };
                pending.current = null;
            },
        }));
        return () => { cancelled = true; cancelAnimationFrame(frame); };
    }, [active, root, jump, data]);

    const onKeyDown = useCallback(event => {
        if (event.target !== event.currentTarget || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const index = Number(event.currentTarget.getAttribute('aria-posinset')) - 1;
        event.preventDefault();
        goTo(index + (event.key === 'ArrowDown' ? 1 : -1), 0, true);
    }, [goTo]);
    const context = useMemo(() => ({ active, renderItem, count: items.length, onKeyDown }), [active, renderItem, items.length, onKeyDown]);
    return <>
        <div ref={setRoot} data-prayer-list data-loaded-prayers={data.length}>
            <Virtuoso ref={list} useWindowScroll customScrollParent={active ? undefined : root}
                data={data} context={context} components={components} computeItemKey={keyFor} itemContent={renderRow}
                initialItemCount={initialCount}
                itemsRendered={rememberRange} heightEstimates={initialSizes} defaultItemHeight={PRAYER_ESTIMATE}
                increaseViewportBy={Math.round(buffer * 0.6)} skipAnimationFrameInResizeObserver />
        </div>
        <div className="py-3 text-center text-xs text-slate-500" data-prayer-list-footer>
            {data.length < items.length ? <button type="button" className="min-h-11 rounded-xl px-4 text-sky-400 focus-visible:outline focus-visible:outline-2"
                onClick={() => goTo(data.length, 0, true)}>
                {language === 'ar' ? 'عرض 10 صلوات أخرى' : language === 'de' ? '10 weitere laden' : 'Load 10 more'}
            </button> : <span>{language === 'ar' ? 'هذه كل الصلوات' : language === 'de' ? 'Alle Gebete angezeigt' : 'All prayers shown'}</span>}
        </div>
    </>;
}
