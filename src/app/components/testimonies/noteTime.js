export function formatNoteTime(createdAt, isFeed, now = Date.now()) {
    const date = new Date(createdAt);
    if (!createdAt || !Number.isFinite(date.getTime())) return '';
    if (isFeed) {
        const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        return `${Math.floor(minutes / 60)}h ago`;
    }
    const today = new Date(now);
    // Compare calendar days, including days affected by daylight-saving changes.
    const day = value => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
    const days = (day(today) - day(date)) / 86400000;
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
