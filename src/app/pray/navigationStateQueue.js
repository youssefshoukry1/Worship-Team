// UI-only updates: durable storage and transport never enter this queue.
export function createNavigationStateQueue(commit, isBusy, waitUntilIdle) {
    let active = true, waiting = false, updates = [];
    const flush = () => {
        if (!active || !updates.length) return;
        const batch = updates; updates = [];
        commit(previous => batch.reduce((value, update) => typeof update === 'function' ? update(value) : update, previous));
    };
    return {
        push(update) {
            if (!active) return;
            // A complete snapshot supersedes older snapshots and reducers.
            if (typeof update !== 'function') updates = [];
            updates.push(update);
            if (!isBusy()) { flush(); return; }
            if (waiting) return;
            waiting = true;
            void waitUntilIdle().then(() => { waiting = false; flush(); });
        },
        dispose() { active = false; updates = []; },
    };
}
