'use client';

import { useLayoutEffect, useState } from 'react';

export function prayerDeleteAvailable(date, now = Date.now()) {
    const savedAt = Date.parse(date || '');
    return Number.isFinite(savedAt) && savedAt <= now && now < savedAt + 60_000;
}

// One timer for all owned prayers, scheduled at the next expiry. No countdowns or per-card timers.
export default function usePrayerDeleteWindow(prayers) {
    const [availableIds, setAvailableIds] = useState(() => new Set());
    useLayoutEffect(() => {
        let timer;
        const refresh = () => {
            clearTimeout(timer);
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
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [prayers]);
    return availableIds;
}
