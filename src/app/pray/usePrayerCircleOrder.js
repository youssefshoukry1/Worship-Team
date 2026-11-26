'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prayerActivityKey } from '../utils/prayerActivity';
import { usePrayerSession } from './PrayerSessionProvider';

// No scroll handlers, animation loop, or per-card measurements. Check only on data changes.
export default function usePrayerCircleOrder(items, scope, anchorRef, forceId, openedTargetId) {
    const session = usePrayerSession();
    const [order, setOrder] = useState({ scope: null, ids: [], activity: new Map(), pending: 0 });
    const latest = useRef(items);
    useLayoutEffect(() => { latest.current = items; }, [items]);
    useLayoutEffect(() => {
        if (!scope) return;
        const activity = new Map(items.map(entry => [String(entry._id), prayerActivityKey(entry)]));
        setOrder(previous => {
            if (previous.scope !== scope || (forceId && previous.forceId !== forceId) || (previous.pinnedId && previous.pinnedId !== openedTargetId)) return { scope, forceId, ids: [...activity.keys()], activity, pending: 0 };
            let pending = 0;
            for (const [id, key] of activity) if (previous.activity.get(id) !== key) pending++;
            if (!pending) return previous.pending ? { ...previous, pending: 0 } : previous;
            const typing = document.activeElement?.matches('textarea, input, [contenteditable="true"]');
            const playing = session.playback.isPlaying();
            const readingBelow = (anchorRef.current?.getBoundingClientRect().top ?? 0) < -80;
            if (typing || playing || readingBelow || document.visibilityState !== 'visible') {
                return previous.pending === pending ? previous : { ...previous, pending };
            }
            const ids = [...activity.keys()];
            // An open notification can be followed by several pages of older
            // deliveries. Keep the target in its slot while adding other rows.
            if (openedTargetId) {
                const slot = previous.ids.indexOf(openedTargetId);
                const nextSlot = ids.indexOf(openedTargetId);
                if (slot >= 0 && nextSlot > slot) {
                    ids.splice(nextSlot, 1);
                    ids.splice(slot, 0, openedTargetId);
                }
            }
            return { scope, forceId, ids, activity, pending: 0, pinnedId: openedTargetId };
        });
    }, [items, scope, forceId, openedTargetId, anchorRef, session]);

    const visibleItems = useMemo(() => {
        if (!scope || order.scope !== scope) return items;
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
