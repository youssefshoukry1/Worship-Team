import { useEffect, useLayoutEffect, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';

const copy = {
    en: ['Load 10 more', 'Retry', 'Loading…', 'Offline', 'All records shown', 'Could not load records'],
    de: ['10 weitere laden', 'Erneut versuchen', 'Wird geladen…', 'Offline', 'Alle Einträge angezeigt', 'Einträge konnten nicht geladen werden'],
    ar: ['عرض ١٠ سجلات أخرى', 'إعادة المحاولة', 'جارٍ التحميل…', 'دون اتصال', 'تم عرض جميع السجلات', 'تعذّر تحميل السجلات'],
};

export function ProfileBibleList({ store, state, render, active }) {
    const list = useRef(null);
    const initial = useRef(store.anchor);
    const count = state.items.length;
    const virtual = count > 10;
    useLayoutEffect(() => {
        if (!active || !count || virtual || !initial.current) return;
        window.scrollTo({ top: initial.current.scrollTop, behavior: 'instant' });
        initial.current = null;
    }, [active, count, virtual]);
    useEffect(() => {
        if (!active) return;
        const save = () => {
            if (list.current) list.current.getState(snapshot => { store.anchor = snapshot; });
            else if (count) store.anchor = { scrollTop: window.scrollY };
        };
        window.addEventListener('scroll', save, { passive: true });
        return () => window.removeEventListener('scroll', save);
    }, [active, store, count]);
    const card = item => <div key={item._id} className="pb-3">{render(item)}</div>;
    return <div className="profile-bible-list">
        {virtual ? <Virtuoso ref={list} useWindowScroll data={state.items} computeItemKey={(_, item) => item._id}
            defaultItemHeight={155} increaseViewportBy={250} skipAnimationFrameInResizeObserver
            initialItemCount={10} restoreStateFrom={initial.current?.ranges ? initial.current : undefined}
            itemContent={(_, item) => card(item)} /> : state.items.map(card)}
    </div>;
}

export function ProfileBibleFooter({ store, state, active, language }) {
    const ref = useRef(null);
    const [more, retry, loading, offline, end, failed] = copy[language] || copy.en;
    useEffect(() => {
        if (!active || !state.nextCursor || state.busy || state.error || !ref.current) return;
        let previous = window.scrollY;
        const nearEnd = () => {
            const top = window.scrollY;
            const movingDown = top > previous;
            previous = top;
            if (movingDown) void store.load(true);
        };
        if (typeof IntersectionObserver === 'undefined') {
            const check = () => {
                if (ref.current?.getBoundingClientRect().top < window.innerHeight + 160) nearEnd();
                else previous = window.scrollY;
            };
            window.addEventListener('scroll', check, { passive: true });
            return () => window.removeEventListener('scroll', check);
        }
        const observer = new IntersectionObserver(([entry]) => {
            window.removeEventListener('scroll', nearEnd);
            if (entry.isIntersecting) {
                nearEnd();
                window.addEventListener('scroll', nearEnd, { passive: true });
            } else previous = window.scrollY;
        }, { rootMargin: '0px 0px 160px' });
        observer.observe(ref.current);
        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', nearEnd);
        };
    }, [store, active, state.nextCursor, state.busy, state.error]);
    return <div ref={ref} className="py-3 text-center text-xs text-slate-400">
        <span role="status">{state.busy ? loading : state.error ? (state.offline ? offline : failed) :
            state.offline ? offline : state.ready && state.items.length > 0 && !state.nextCursor ? end : ''}</span>
        {(state.error || state.nextCursor) && <button type="button" disabled={state.busy}
            className="min-h-11 px-4 text-sky-400" onClick={() => store.load(state.error ? state.error === 'more' : true)}>
            {state.error ? retry : more}
        </button>}
        {state.offline && state.error === 'first' && state.nextCursor && <button type="button"
            className="min-h-11 px-4 text-sky-400" onClick={() => store.load(true)}>{more}</button>}
    </div>;
}
