'use client';

import { useLayoutEffect, useState } from 'react';
import { isNavigationBusy, waitForNavigationIdle } from '../utils/navigationWork';

export function prayerDeleteAvailable(date, now = Date.now()) {
    const savedAt = Date.parse(date || '');
    return Number.isFinite(savedAt) && savedAt <= now && now < savedAt + 60_000;
}

// One timer for all owned prayers, scheduled at the next expiry. No countdowns or per-card timers.
export default function usePrayerDeleteWindow(prayers, active = true) {
    const [availableIds, setAvailableIds] = useState(() => new Set());
    useLayoutEffect(() => {
        if (!active) return;
        let timer, cancelled = false, waiting = false;
        const refresh = () => {
            clearTimeout(timer);
            if (cancelled || document.visibilityState !== 'visible') return;
            if (isNavigationBusy()) {
                if (!waiting) {
                    waiting = true;
                    void waitForNavigationIdle().then(() => { waiting = false; refresh(); });
                }
                return;
            }
            const now = Date.now();
            const next = new Set();
            let expiresAt = Infinity;
            for (const entry of prayers) {
                if (!prayerDeleteAvailable(entry.date, now)) continue;
                next.add(String(entry._id));
                expiresAt = Math.min(expiresAt, Date.parse(entry.date) + 60_000);
            }
            setAvailableIds(previous => previous.size === next.size && [...next].every(id => previous.has(id)) ? previous : next);
            if (Number.isFinite(expiresAt) && document.visibilityState === 'visible') timer = setTimeout(refresh, Math.max(0, expiresAt - Date.now()));
        };
        refresh();
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [prayers, active]);
    return availableIds;
}
