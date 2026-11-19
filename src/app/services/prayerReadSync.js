import { getApiBaseUrl } from '../utils/apiBase';
import { prayerReadSyncInput, savePrayerReadPage, syncablePrayerRead } from '../utils/prayRecordings';

export const PRAYER_READ_EVENT = 'wasla:prayer-opened';

export function watchPrayerReads(owner, token) {
    let stopped = false, running = false, again = false, timer, retry = 1000;
    let controller;
    let scanLocal = true, lastAfter = 0;
    const pending = new Set();
    const schedule = (delay = 350) => {
        if (stopped || document.visibilityState === 'hidden' || navigator.onLine === false) return;
        if (running) { again = true; return; }
        clearTimeout(timer);
        timer = setTimeout(run, delay);
    };
    async function run() {
        running = true;
        let failed = false;
        try {
            const scan = scanLocal;
            scanLocal = false;
            const input = await prayerReadSyncInput(owner, scan ? null : [...pending]);
            let after = input.after, offset = 0, more;
            lastAfter = input.after;
            do {
                if (stopped) return;
                const opened = input.opened.slice(offset, offset + 100);
                controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);
                let page;
                try {
                    const response = await fetch(`${getApiBaseUrl()}/users/activity-reads/prayers`, {
                        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        cache: 'no-store', signal: controller.signal, body: JSON.stringify({ after, opened }),
                    });
                    if (!response.ok) throw new Error('Prayer receipts unavailable');
                    page = await response.json();
                } finally { clearTimeout(timeout); }
                if (stopped) return;
                if (!Array.isArray(page.seen) || page.seen.length > 100 || !Number.isSafeInteger(page.after) ||
                    page.after < after || typeof page.more !== 'boolean' || (page.more && page.after === after) ||
                    !page.seen.every(syncablePrayerRead)) throw new Error('Invalid prayer receipt page');
                if (opened.length || page.seen.length) await savePrayerReadPage(owner, page.after, [...opened, ...page.seen]);
                for (const key of opened) pending.delete(key);
                offset += opened.length;
                after = page.after;
                lastAfter = after;
                more = page.more;
            } while (more || offset < input.opened.length);
            retry = 1000;
        } catch { failed = true; scanLocal = true; }
        finally {
            running = false;
            if (failed) {
                retry = Math.min(60000, retry * 2);
                schedule(retry);
            } else if (again) schedule();
            again = false;
        }
    }
    const wake = () => schedule();
    const logout = () => {
        if (!pending.size || navigator.onLine === false) return;
        // Let the last small batch finish during sign-out. Local receipts still
        // replay idempotently on the next login if the connection drops.
        void fetch(`${getApiBaseUrl()}/users/activity-reads/prayers`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            keepalive: true, body: JSON.stringify({ after: lastAfter, opened: [...pending].slice(0, 100) }),
        }).catch(() => {});
    };
    const onRead = event => {
        if (event.detail?.owner && String(event.detail.owner) !== owner) return;
        if (syncablePrayerRead(event.detail?.activity)) pending.add(event.detail.activity);
        else scanLocal = true;
        schedule();
    };
    schedule();
    window.addEventListener(PRAYER_READ_EVENT, onRead);
    window.addEventListener('taspe7:logout', logout);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
        stopped = true; clearTimeout(timer); controller?.abort();
        window.removeEventListener(PRAYER_READ_EVENT, onRead);
        window.removeEventListener('taspe7:logout', logout);
        window.removeEventListener('online', wake);
        window.removeEventListener('focus', wake);
        document.removeEventListener('visibilitychange', wake);
    };
}
