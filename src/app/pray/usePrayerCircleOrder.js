'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prayerActivityKey } from '../utils/prayerActivity';

// No scroll handlers, animation loop, or per-card measurements. Check only on data changes.
export default function usePrayerCircleOrder(items, scope, anchorRef, forceId) {
    const [order, setOrder] = useState({ scope: null, ids: [], activity: new Map(), pending: 0 });
    const latest = useRef(items);
    useLayoutEffect(() => { latest.current = items; }, [items]);
    useLayoutEffect(() => {
        const activity = new Map(items.map(entry => [String(entry._id), prayerActivityKey(entry)]));
        setOrder(previous => {
            if (previous.scope !== scope || (forceId && previous.forceId !== forceId)) return { scope, forceId, ids: [...activity.keys()], activity, pending: 0 };
            let pending = 0;
            for (const [id, key] of activity) if (previous.activity.get(id) !== key) pending++;
            if (!pending) return previous.pending ? { ...previous, pending: 0 } : previous;
            const typing = document.activeElement?.matches('textarea, input, [contenteditable="true"]');
            const playing = document.querySelector('[data-prayer-playing="true"]');
            const readingBelow = (anchorRef.current?.getBoundingClientRect().top ?? 0) < -80;
            if (typing || playing || readingBelow || document.visibilityState !== 'visible') {
                return previous.pending === pending ? previous : { ...previous, pending };
            }
            return { scope, forceId, ids: [...activity.keys()], activity, pending: 0 };
        });
    }, [items, scope, forceId, anchorRef]);

    const visibleItems = useMemo(() => {
        if (order.scope !== scope) return items;
        const byId = new Map(items.map(entry => [String(entry._id), entry]));
        return order.ids.map(id => byId.get(id)).filter(Boolean);
    }, [items, scope, order]);

    const revealUpdates = () => {
        const activity = new Map(latest.current.map(entry => [String(entry._id), prayerActivityKey(entry)]));
        setOrder({ scope, forceId, ids: [...activity.keys()], activity, pending: 0 });
        anchorRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    };
    return { visibleItems, pendingUpdates: order.scope === scope ? order.pending : 0, revealUpdates };
}
