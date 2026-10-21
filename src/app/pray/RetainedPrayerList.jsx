'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

const PrayerRow = memo(function PrayerRow({ entry, renderItem, eager, observe, preview }) {
    const [entered, setEntered] = useState(eager);
    const rowRef = useRef(null);
    // Remember a forced notification opening even if a later notification
    // points elsewhere before IntersectionObserver delivers its next event.
    if (eager && !entered) setEntered(true);
    useEffect(() => {
        if (entered) return;
        return observe(rowRef.current, () => setEntered(true));
    }, [entered, observe]);

    const rendered = entered || eager;
    return (
        <div ref={rowRef} data-prayer-row={String(entry._id)}>
            {rendered ? renderItem(entry) : (
                <div data-prayer-placeholder={String(entry._id)} aria-busy="true" tabIndex={0}
                    onFocus={() => setEntered(true)}
                    className="h-[140px] overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-500"
                    style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 140px' }}>
                    {/* Keep the plain words available for browser Find and
                        accessibility while deferring controls and audio setup. */}
                    <p dir="auto" className="whitespace-pre-wrap">{preview(entry)}</p>
                </div>
            )}
        </div>
    );
});

// Render nearby cards first, retaining every card once visited. Unlike an
// evicting virtual list, scrolling never tears down an active voice player.
export default function RetainedPrayerList({ items, renderItem, forceRenderId, preview }) {
    const observerRef = useRef(null);
    const callbacksRef = useRef(new Map());
    const observe = useCallback((element, enter) => {
        if (!element || typeof IntersectionObserver === 'undefined') { enter(); return; }
        if (!observerRef.current) {
            observerRef.current = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const callback = callbacksRef.current.get(entry.target);
                    callbacksRef.current.delete(entry.target);
                    observerRef.current?.unobserve(entry.target);
                    callback?.();
                }
            }, { rootMargin: '500px 0px' });
        }
        callbacksRef.current.set(element, enter);
        observerRef.current.observe(element);
        return () => { observerRef.current?.unobserve(element); callbacksRef.current.delete(element); };
    }, []);
    useEffect(() => {
        const callbacks = callbacksRef.current;
        return () => { observerRef.current?.disconnect(); observerRef.current = null; callbacks.clear(); };
    }, []);

    return items.map((entry, index) => (
        <PrayerRow key={entry._id} entry={entry} renderItem={renderItem} observe={observe} preview={preview}
            eager={items.length <= 20 || index < 4 || String(entry._id) === forceRenderId} />
    ));
}
