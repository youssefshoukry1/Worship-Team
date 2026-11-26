import { yieldToMain } from '../utils/cooperativeWork';

// Dependency injection keeps transport, persistence and account ownership explicit.
// No durable delivery cursor: failed/unacknowledged items are retried on the next scan.
export async function syncPrayerPages({ kind, read, download, consume, remove, saveDeletionCursor, deletedSince, target, targetOnly = false, active, acknowledge }) {
    let failures = 0;
    let targetSaved = false;
    const current = () => { if (!active()) throw Object.assign(new Error('Prayer session changed'), { name: 'AbortError' }); };
    const deliver = async (items) => {
        for (let offset = 0; offset < items.length; offset += 10) {
            current();
            const acknowledgements = [];
            // Sequential payloads bound peak audio memory to one bundle. An item
            // failure must not prevent unrelated prayers from reaching the device.
            for (const item of items.slice(offset, offset + 10)) {
                try {
                    current();
                    const bundle = await download(item, kind === 'replies');
                    current();
                    const committed = await consume(bundle); current();
                    if (committed !== false) {
                        if (target && bundle.shareId === target) targetSaved = true;
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
    const readPage = async params => {
        const page = await read({ protocol: 2, ...params });
        current();
        if (page.protocol !== 2) throw new Error('Unsupported prayer delivery protocol');
        return page;
    };
    let revokedTarget = false;
    const applyDeletions = async () => {
        if (kind === 'replies') return;
        const seen = new Set();
        let page = await readPage({ kind: 'deletions', ...(deletedSince ? { deletedSince } : {}) });
        for (;;) {
            const ids = (page.items || []).map(item => item.shareId);
            if (target && ids.includes(target)) revokedTarget = true;
            current(); await remove(ids); current();
            if (!page.nextCursor) { if (page.deletionCursor) await saveDeletionCursor(page.deletionCursor); break; }
            if (seen.has(page.nextCursor)) throw new Error('Prayer deletion cursor repeated'); seen.add(page.nextCursor);
            await yieldToMain(); current();
            page = await readPage({ kind: 'deletions', cursor: page.nextCursor, ...(deletedSince ? { deletedSince } : {}) });
        }
    };
    // Only fetch the descriptor in parallel. Never fetch or persist its payload
    // until every deletion page and its watermark have committed.
    if (target) {
        const [deletions, descriptor] = await Promise.allSettled([applyDeletions(), readPage({ kind, target })]);
        if (deletions.status === 'rejected') throw deletions.reason;
        if (descriptor.status === 'rejected') throw descriptor.reason;
        current();
        if (!revokedTarget) await deliver((descriptor.value.items || []).filter(item => item.shareId === target));
    } else if (kind !== 'replies') {
        await applyDeletions();
    }
    current();
    if (targetOnly) return { failures, targetSaved, protocol: 2 };
    const seen = new Set();
    let page;
    for (;;) {
        current(); if (!page) page = await readPage({ kind }); current();
        await deliver(page.items || []);
        if (!page.nextCursor) break;
        if (seen.has(page.nextCursor)) throw new Error('Prayer cursor repeated'); seen.add(page.nextCursor);
        current(); page = await readPage({ kind, cursor: page.nextCursor });
    }
    return { failures, protocol: 2 };
}
