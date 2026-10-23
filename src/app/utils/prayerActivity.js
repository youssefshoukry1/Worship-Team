// Shared by the feed and local storage. Parse dates once per item, outside sort comparisons.
const timestamp = value => {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
};
export const prayerParty = entry => entry.sharedWith || entry.sharedFrom;
export const prayerActivityTime = entry => Math.max(timestamp(entry.date), timestamp(prayerParty(entry)?.respondedAt));
export const prayerActivityKey = entry => `${entry._id}:${prayerActivityTime(entry)}:${prayerParty(entry)?.status || ''}`;

export function sortPrayerActivity(entries) {
    return entries.map((entry, index) => ({ entry, index, time: prayerActivityTime(entry) }))
        .sort((a, b) => b.time - a.time || a.index - b.index).map(item => item.entry);
}

export function incomingPrayerActivity(entry) {
    const party = prayerParty(entry);
    if (!party) return null;
    const id = party.shareId || party.originalPrayId || String(entry._id);
    if (entry.sharedWith) return party.status === 'confirmed' ? `reply:${id}:${party.respondedAt || 'legacy'}` : null;
    return `prayer:${id}`;
}

export function isPrayerUnread(entry, ownerId, legacyOpened) {
    const activity = incomingPrayerActivity(entry);
    if (!activity) return false;
    const party = prayerParty(entry);
    // Existing confirmed cards predate reply-unread tracking. Do not announce the whole history.
    if (!party.seenActivityBy) {
        if (party.status === 'confirmed') return false;
        if (legacyOpened?.has(String(entry._id))) return false;
    }
    return party.seenActivityBy?.[String(ownerId || 'guest')] !== activity;
}

export function seenPrayerChanges(entry, ownerId, activity = incomingPrayerActivity(entry)) {
    if (!activity || activity !== incomingPrayerActivity(entry)) return null;
    const field = entry.sharedWith ? 'sharedWith' : 'sharedFrom';
    const party = entry[field];
    const owner = String(ownerId || 'guest');
    if (party.seenActivityBy?.[owner] === activity) return null;
    return { [field]: { ...party, seenActivityBy: { ...party.seenActivityBy, [owner]: activity } } };
}

// Storage returns fresh JSON objects. Retain unchanged card props so memoized cards/audio skip work.
const sameParty = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
export function reconcilePrayerEntries(previous, next) {
    const old = new Map(previous.map(entry => [String(entry._id), entry]));
    let changed = previous.length !== next.length;
    const result = next.map((entry, index) => {
        const existing = old.get(String(entry._id));
        const keys = Object.keys(entry);
        const same = existing && keys.length === Object.keys(existing).length && keys.every(key =>
            key === 'sharedFrom' || key === 'sharedWith' ? sameParty(existing[key], entry[key]) : existing[key] === entry[key]);
        const retained = same ? existing : entry;
        if (retained !== previous[index]) changed = true;
        return retained;
    });
    return changed ? result : previous;
}

// Keep each unchanged recording object, including when another clip is added to the same prayer.
// SavedVoiceClip owns a Blob URL/player whose lifetime follows that object.
export function reconcilePrayerRecordings(previous, next) {
    let changed = Object.keys(previous).length !== Object.keys(next).length;
    const result = {};
    for (const id of Object.keys(next)) {
        const oldList = previous[id] || [];
        const oldClips = new Map(oldList.map(clip => [clip.id, clip]));
        const clips = next[id].map(clip => {
            const old = oldClips.get(clip.id);
            return old && sameParty(old, clip) ? old : clip;
        });
        result[id] = previous[id] && oldList.length === clips.length && clips.every((clip, index) => clip === oldList[index]) ? oldList : clips;
        if (result[id] !== previous[id]) changed = true;
    }
    return changed ? result : previous;
}
