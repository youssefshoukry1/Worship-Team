// A playing clip can outlive its row. Unattached paused/finished clips are released.
export function createPrayerPlayback() {
    const entries = new Map();
    let active = null, disposed = false;
    const remove = entry => {
        if (entries.get(entry.key) !== entry) return;
        entries.delete(entry.key);
        if (active === entry) active = null;
        entry.resource?.destroy();
    };
    const manager = {
        async acquire(key, create) {
            if (disposed) throw new Error('Prayer session ended');
            let entry = entries.get(key);
            if (!entry) {
                entry = { key, users: 0, resource: null };
                entries.set(key, entry);
                entry.pending = Promise.resolve().then(create).then(resource => {
                    entry.resource = resource;
                    if (disposed || entries.get(key) !== entry) { resource.destroy(); return resource; }
                    resource.player.on('play', () => {
                        const previous = active;
                        active = entry;
                        if (previous && previous !== entry) previous.resource.player.pause();
                    });
                    const releaseIdle = () => { if (!entry.users && !resource.player.isPlaying()) remove(entry); };
                    resource.player.on('pause', releaseIdle);
                    resource.player.on('finish', releaseIdle);
                    resource.player.on('error', releaseIdle);
                    return resource;
                }).catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
            }
            entry.users++;
            const resource = await entry.pending;
            let released = false;
            return { resource, release() {
                if (released) return;
                released = true; entry.users--;
                if (!entry.users) {
                    resource.container.remove();
                    if (!resource.player.isPlaying()) remove(entry);
                }
            } };
        },
        pause() { active?.resource.player.pause(); },
        stop(key) { const entry = entries.get(key); if (entry) { entry.resource?.player.pause(); remove(entry); } },
        retainSaved(recordings) {
            if (!entries.size) return;
            const ids = new Set(Object.values(recordings).flat().map(rec => String(rec.id)));
            for (const key of entries.keys()) if (key.startsWith('saved:') && !ids.has(key.slice(6))) manager.stop(key);
        },
        isPlaying: () => Boolean(active?.resource?.player.isPlaying()),
        dispose() { disposed = true; for (const entry of [...entries.values()]) remove(entry); },
    };
    return manager;
}
