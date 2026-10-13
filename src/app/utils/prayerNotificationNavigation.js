const PRAYER_TYPES = new Set(['PRAY_SHARED', 'PRAY_CONFIRMED']);

export function normalizePrayerShareId(value) {
    return typeof value === 'string' ? value.replace(/^received-/, '').trim() : '';
}

export function prayerNotificationHref(data) {
    if (!PRAYER_TYPES.has(data?.type)) return null;
    const query = new URLSearchParams({ notificationType: data.type });
    const shareId = normalizePrayerShareId(data.shareId);
    if (shareId) query.set('shareId', shareId);
    return `/pray/?${query.toString()}`;
}

export function readPrayerNotificationTarget(search) {
    const query = new URLSearchParams(search);
    const type = query.get('notificationType');
    if (!PRAYER_TYPES.has(type)) return null;
    return { type, shareId: normalizePrayerShareId(query.get('shareId')) };
}

export function findNotificationPrayer(prayers, target) {
    if (!target?.shareId) return null;
    return prayers.find(entry => {
        const party = target.type === 'PRAY_SHARED' ? entry.sharedFrom : entry.sharedWith;
        const shareId = party?.shareId || party?.originalPrayId;
        return normalizePrayerShareId(shareId) === target.shareId ||
            (target.type === 'PRAY_SHARED' && entry._id === `received-${target.shareId}`);
    }) || null;
}
