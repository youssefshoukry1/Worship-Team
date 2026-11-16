export const PRAYER_BATCH = 10;
export const PRAYER_ESTIMATE = 180;

// Heights are measured only for mounted rows. Prefix offsets are rebuilt once per
// measurement batch, not once per scroll event; viewport lookup is binary search.
export function prayerListLayout(items, heights) {
    const offsets = [0], indices = new Map();
    items.forEach((entry, index) => {
        const id = String(entry._id);
        indices.set(id, index);
        offsets.push(offsets[index] + (heights.get(id) || PRAYER_ESTIMATE));
    });
    const indexAt = top => {
        let low = 0, high = items.length;
        while (low < high) { const mid = (low + high) >>> 1; if (offsets[mid + 1] <= top) low = mid + 1; else high = mid; }
        return Math.min(Math.max(0, items.length - 1), low);
    };
    return { offsets, indices, total: offsets.at(-1), indexAt };
}

export function prayerWindow(layout, top, viewport, count, focusedId, buffer = 240) {
    if (!count) return [];
    const start = layout.indexAt(Math.max(0, top - buffer));
    const end = layout.indexAt(Math.max(0, top + viewport + buffer));
    const indices = new Set();
    for (let i = start; i <= end && i < count; i++) indices.add(i);
    const focused = layout.indices.get(focusedId);
    if (focused !== undefined && focused < count) indices.add(focused);
    return [...indices].sort((a, b) => a - b);
}

export function prayerBatchFor(index, count, current = PRAYER_BATCH) {
    return Math.min(count, Math.max(current, Math.ceil((index + 1) / PRAYER_BATCH) * PRAYER_BATCH));
}
