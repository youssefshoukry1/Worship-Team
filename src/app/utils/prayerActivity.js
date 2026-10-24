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

// Restore is a merge of history, not a new delivery. Replies and read receipts
// must move forward even when a device and its backup contain different snapshots.
export function mergeRestoredPrayer(existing, restored, ownerId) {
    const result = { ...restored, ...existing };
    result.date = existing?.date || restored.date || null;
    const field = result.sharedWith ? 'sharedWith' : result.sharedFrom ? 'sharedFrom' : null;
    if (!field) return result;
    const local = existing?.[field], backup = restored[field];
    const localConfirmed = local?.status === 'confirmed', backupConfirmed = backup?.status === 'confirmed';
    const winner = !local || (backupConfirmed && (!localConfirmed || timestamp(backup.respondedAt) > timestamp(local.respondedAt))) ? backup : local;
    const party = { ...backup, ...local, ...winner };
    result[field] = party;
    const activity = incomingPrayerActivity(result);
    const seen = { ...backup?.seenActivityBy, ...local?.seenActivityBy };
    for (const source of [restored, existing]) {
        if (!source || incomingPrayerActivity(source) !== activity) continue;
        for (const [owner, receipt] of Object.entries(source[field]?.seenActivityBy || {})) {
            if (receipt === activity) seen[owner] = activity;
        }
    }
    // Newly imported activities are history, including unread snapshots from an
    // old backup. Activities already on this device keep their current unread
    // state; a genuinely newer live reply must never be cleared by restoration.
    if (activity && ownerId != null && ownerId !== '') {
        const owner = String(ownerId);
        if (!existing || (incomingPrayerActivity(restored) === activity && incomingPrayerActivity(existing) !== activity) || [existing, restored].some(source =>
            source && incomingPrayerActivity(source) === activity && !source[field]?.seenActivityBy && !isPrayerUnread(source, owner))) seen[owner] = activity;
    }
    if (local?.seenActivityBy || backup?.seenActivityBy || Object.keys(seen).length) party.seenActivityBy = seen;
    return result;
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
            key === 'sharedFrom' || key === 'sharedWith' || key === '_sync' ? sameParty(existing[key], entry[key]) : existing[key] === entry[key]);
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
