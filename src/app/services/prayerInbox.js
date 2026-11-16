import { yieldToMain } from '../utils/cooperativeWork';

// Dependency injection keeps transport, persistence and account ownership explicit.
// No durable delivery cursor: failed/unacknowledged items are retried on the next scan.
export async function syncPrayerPages({ kind, read, download, consume, remove, saveDeletionCursor, deletedSince, target, targetOnly = false, active, acknowledge }) {
    let failures = 0;
    const current = () => { if (!active()) throw Object.assign(new Error('Prayer session changed'), { name: 'AbortError' }); };
    const deliver = async (items, legacy = false) => {
        for (let offset = 0; offset < items.length; offset += 10) {
            current();
            const acknowledgements = [];
            // Sequential payloads bound peak audio memory to one bundle. An item
            // failure must not prevent unrelated prayers from reaching the device.
            for (const item of items.slice(offset, offset + 10)) {
                try {
                    current();
                    const bundle = legacy ? item : await download(item, kind === 'replies');
                    current();
                    const committed = await consume(bundle); current();
                    if (committed !== false) {
                        acknowledgements.push(Promise.resolve().then(() => acknowledge(bundle.shareId, kind === 'replies'))
                            .then(response => { if (!response.ok) failures++; }).catch(() => { failures++; }));
                    }
                } catch (error) {
                    if (error.name === 'AbortError') throw error;
                    current();
                    if (error.code === 'PRAYER_DELETED') await remove([item.shareId]);
                    else if (![404, 409].includes(error.status)) failures++;
                }
            }
            await Promise.all(acknowledgements);
            await yieldToMain();
        }
    };
    current();
    let page = await read({ protocol: 2, kind: kind === 'replies' ? 'replies' : 'deletions', ...(deletedSince ? { deletedSince } : {}) }); current();
    if (page.protocol !== 2) {
        if (kind !== 'replies') {
            await remove(page.deletedShareIds || [], page.deletionCursor);
            const inbox = [...(page.inbox || [])];
            if (target) inbox.sort((a, b) => Number(b.shareId === target) - Number(a.shareId === target));
            await deliver(inbox, true);
        } else await deliver(page.updates || [], true);
        return { failures, protocol: 1 };
    }
    if (kind !== 'replies') {
        const seen = new Set();
        for (;;) {
            current(); await remove((page.items || []).map(item => item.shareId)); current();
            if (!page.nextCursor) { if (page.deletionCursor) await saveDeletionCursor(page.deletionCursor); break; }
            if (seen.has(page.nextCursor)) throw new Error('Prayer deletion cursor repeated'); seen.add(page.nextCursor);
            await yieldToMain(); current();
            page = await read({ protocol: 2, kind: 'deletions', cursor: page.nextCursor, ...(deletedSince ? { deletedSince } : {}) }); current();
            if (page.protocol !== 2) throw new Error('Prayer protocol changed during sync');
        }
        page = null;
    }
    // Deep targets get their own authorized request and never move the normal cursor.
    if (target) { const selected = await read({ protocol: 2, kind, target }); current(); await deliver(selected.items || []); }
    if (targetOnly) return { failures, protocol: 2 };
    const seen = new Set();
    for (;;) {
        current(); if (!page) page = await read({ protocol: 2, kind }); current();
        if (page.protocol !== 2) throw new Error('Prayer protocol changed during sync');
        await deliver(page.items || []);
        if (!page.nextCursor) break;
        if (seen.has(page.nextCursor)) throw new Error('Prayer cursor repeated'); seen.add(page.nextCursor);
        current(); page = await read({ protocol: 2, kind, cursor: page.nextCursor });
    }
    return { failures, protocol: 2 };
}
