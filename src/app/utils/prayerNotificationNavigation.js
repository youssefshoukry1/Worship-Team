const PRAYER_TYPES = new Set(['PRAY_SHARED', 'PRAY_CONFIRMED']);
let pendingOpen;

// Hand off the latest tap across a lazy tab mount within this document.
export function queuePrayerOpen(owner, target) {
    pendingOpen = { owner, target };
}

export function takePrayerOpen(owner) {
    if (!pendingOpen || pendingOpen.owner !== owner) return null;
    const { target } = pendingOpen;
    pendingOpen = undefined;
    return target;
}

function normalizeShareId(value) {
    return typeof value === 'string' ? value.trim().replace(/^received-/, '') : '';
}

export function prayerNotificationHref(data) {
    if (!PRAYER_TYPES.has(data?.type)) return null;
    const shareId = normalizeShareId(data.shareId);
    if (!shareId) return '/pray/';
    const query = new URLSearchParams({ notificationType: data.type, shareId });
    return `/pray/?${query}`;
}

export function readPrayerNotificationTarget(search) {
    const query = new URLSearchParams(search);
    const type = query.get('notificationType');
    const shareId = normalizeShareId(query.get('shareId'));
    return PRAYER_TYPES.has(type) && shareId ? { type, shareId } : null;
}

export function findNotificationPrayer(prayers, target) {
    if (!PRAYER_TYPES.has(target?.type)) return null;
    const shareId = normalizeShareId(target.shareId);
    if (!shareId) return null;
    return prayers.find((entry) => {
        if (target.type === 'PRAY_CONFIRMED') {
            return normalizeShareId(entry.sharedWith?.shareId) === shareId;
        }
        return !entry.sharedWith && (
            normalizeShareId(entry.sharedFrom?.shareId) === shareId ||
            normalizeShareId(entry.sharedFrom?.originalPrayId) === shareId ||
            entry._id === `received-${shareId}`
        );
    }) || null;
}

export function savedNotificationPrayer(prayers, target) {
    const prayer = findNotificationPrayer(prayers, target);
    if (target?.type === 'PRAY_CONFIRMED' && prayer?.sharedWith?.status !== 'confirmed') return null;
    return prayer;
}
