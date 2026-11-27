import { useEffect, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';

const copy = {
    en: ['Load 10 more', 'Retry', 'Loading…', 'Offline', 'All records shown', 'Could not load records'],
    de: ['10 weitere laden', 'Erneut versuchen', 'Wird geladen…', 'Offline', 'Alle Einträge angezeigt', 'Einträge konnten nicht geladen werden'],
    ar: ['عرض ١٠ سجلات أخرى', 'إعادة المحاولة', 'جارٍ التحميل…', 'دون اتصال', 'تم عرض جميع السجلات', 'تعذّر تحميل السجلات'],
};

export function ProfileBibleList({ store, state, render, active }) {
    const list = useRef(null);
    const initial = useRef(store.anchor);
    useEffect(() => {
        if (!active) return;
        const save = () => list.current?.getState(snapshot => { store.anchor = snapshot; });
        window.addEventListener('scroll', save, { passive: true });
        return () => window.removeEventListener('scroll', save);
    }, [active, store]);
    return <Virtuoso ref={list} useWindowScroll data={state.items} computeItemKey={(_, item) => item._id}
        defaultItemHeight={155} increaseViewportBy={250}
        restoreStateFrom={initial.current || undefined}
        itemContent={(_, item) => <div className="pb-3">{render(item)}</div>} />;
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
            if (movingDown && ref.current?.getBoundingClientRect().top < window.innerHeight + 160) {
                void store.load(true);
            }
        };
        window.addEventListener('scroll', nearEnd, { passive: true });
        return () => window.removeEventListener('scroll', nearEnd);
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
