const PRAYER_TYPES = new Set(['PRAY_SHARED', 'PRAY_CONFIRMED']);

export function prayerNotificationHref(data) {
    return PRAYER_TYPES.has(data?.type) ? '/pray/' : null;
}
