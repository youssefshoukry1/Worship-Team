import { getApiBaseUrl } from '../utils/apiBase';
import { addRecordings, getPrayerActions, getRecordingBase64, stagePrayerAction, settlePrayerAction, deleteGuestPray, applyPrayerRevocations } from '../utils/prayRecordings';

export const PRAYER_SYNC_EVENT = 'taspe7:prayer-sync';
let session = { ownerId: 'guest', token: null };
let running = null;
let requested = false;
let timer = null;
const preparations = new Map();
export const localPrayerOverlay = () => Array.from(preparations.values(), item => item.entry);
const changed = entry => window.dispatchEvent(new CustomEvent(PRAYER_SYNC_EVENT, { detail: entry ? { entry } : undefined }));
export const newPrayerAction = (kind, ownerId, extra = {}) => ({
    kind, ownerId: String(ownerId || 'guest'), requestId: crypto.randomUUID(), state: 'preparing', attempts: 0, ...extra,
});

export function configurePrayerSync(ownerId, token) {
    session = { ownerId: String(ownerId || 'guest'), token };
    wakePrayerSync();
}

// Keep blobs alive until local persistence finishes, independently of the composer/route.
export async function preparePrayerAction(entry, recordings = []) {
    preparations.set(entry._id, { entry, recordings });
    try {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!await stagePrayerAction(entry)) { preparations.delete(entry._id); changed(); return; }
        if (recordings.length) await addRecordings(entry._id, recordings);
        // Local saves/deletes must never wait behind somebody else's slow upload.
        if (entry._sync.kind === 'save') await settlePrayerAction(entry._id, entry._sync.requestId, { _sync: null });
        else if (entry._sync.kind === 'delete-local') await deleteGuestPray(entry._id);
        else await settlePrayerAction(entry._id, entry._sync.requestId, { _sync: { ...entry._sync, state: 'pending' } });
        preparations.delete(entry._id);
        changed();
        wakePrayerSync();
    } catch {
        const failed = { ...entry, _sync: { ...entry._sync, state: 'failed', hidden: false, localFailure: true } };
        preparations.set(entry._id, { entry: failed, recordings });
        // Retain a visible, retryable copy even when device storage itself failed.
        changed(failed);
    }
}

export async function retryPrayerAction(entry) {
    const preparation = preparations.get(entry._id);
    if (preparation) return preparePrayerAction({ ...preparation.entry, _sync: { ...preparation.entry._sync, state: 'preparing', localFailure: false } }, preparation.recordings);
    if (!entry._sync || entry._sync.retryable === false) return;
    await settlePrayerAction(entry._id, entry._sync.requestId, {
        _sync: { ...entry._sync, state: 'pending', attempts: 0, nextAttemptAt: 0, hidden: entry._sync.kind === 'delete' },
    });
    changed();
    wakePrayerSync();
}

async function execute(entry, recordings, active) {
    const job = entry._sync;
    if (job.kind === 'save') return { _sync: null };
    if (job.kind === 'delete-local') { await deleteGuestPray(entry._id); return null; }
    if (!active.token) throw Object.assign(new Error('Sign in to sync'), { retryable: false });
    let path, method = 'POST', payload;
    if (job.kind === 'send') {
        const audio = [];
        // Serialize only this request, after the card has painted; never a batch of prayers.
        for (const rec of recordings) {
            const data = await getRecordingBase64(rec);
            if (!data) throw Object.assign(new Error('Recording unavailable'), { retryable: false });
            audio.push({ ...rec, data });
        }
        path = '/share';
        payload = { requestId: job.requestId, words: entry.words, prayType: entry.prayType,
            targetUserId: entry.sharedWith.userId, isAnonymous: entry.sharedWith.isAnonymous, recordings: audio };
    } else if (job.kind === 'reply') {
        path = '/confirm-share';
        payload = { requestId: job.requestId, shareId: entry.sharedFrom.shareId || entry.sharedFrom.originalPrayId || String(entry._id).replace(/^received-/, ''),
            prayId: entry._id, responseWords: entry.sharedFrom.responseWords };
    } else if (job.kind === 'delete') {
        path = `/share/${encodeURIComponent(entry.sharedWith.shareId)}`;
        method = 'DELETE';
    } else throw Object.assign(new Error('Unknown action'), { retryable: false });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response, result;
    try {
        response = await fetch(`${getApiBaseUrl()}/users/pray-time${path}`, {
            method, signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${active.token}` },
            ...(payload ? { body: JSON.stringify(payload) } : {}),
        });
        result = await response.json();
    } finally { clearTimeout(timeout); }
    if (result.code === 'PRAYER_DELETED') {
        if (job.kind === 'send') await deleteGuestPray(entry._id);
        await applyPrayerRevocations([result.shareId || payload?.shareId || entry.sharedWith?.shareId], active.ownerId);
        return null;
    }
    if (!response.ok || result.success !== true || (job.kind === 'send' && !result.shareId) ||
        (job.kind === 'delete' && result.shareId !== entry.sharedWith.shareId)) {
        throw Object.assign(new Error(result.msg || 'Sync failed'), { retryable: response.ok || response.status >= 500 || [408, 409, 429].includes(response.status), code: result.code });
    }
    if (job.kind === 'delete') {
        await applyPrayerRevocations([entry.sharedWith.shareId], active.ownerId);
        return null;
    }
    if (job.kind === 'send') return current => ({ _sync: null, date: result.date || current.date,
        sharedWith: { ...current.sharedWith, shareId: result.shareId } });
    return current => ({ _sync: null, sharedFrom: { ...current.sharedFrom,
        respondedAt: result.respondedAt || result.prayEntry?.sharedFrom?.respondedAt || current.sharedFrom.respondedAt } });
}

export function wakePrayerSync() {
    requested = true;
    clearTimeout(timer);
    if (running) return running;
    running = (async () => {
        do {
            requested = false;
            const active = session;
            const jobs = await getPrayerActions(active.ownerId);
            const local = item => ['save', 'delete-local'].includes(item.entry._sync.kind);
            jobs.sort((a, b) => Number(local(b)) - Number(local(a)));
            let nextWake = Infinity;
            for (const { entry, recordings } of jobs) {
                if (active !== session) { requested = true; break; }
                let job = entry._sync;
                if (preparations.has(entry._id)) continue;
                if (job.state === 'preparing') {
                    // Recover an interrupted local save only when every expected clip exists.
                    if (['send', 'save'].includes(job.kind) && recordings.length !== (job.audioCount || 0)) {
                        await settlePrayerAction(entry._id, job.requestId, { _sync: { ...job, state: 'failed', hidden: false, retryable: false } });
                        changed(); continue;
                    }
                    job = { ...job, state: 'pending' };
                }
                if (job.retryable === false || (job.state === 'failed' && !job.nextAttemptAt)) continue;
                if (job.kind !== 'save' && job.kind !== 'delete-local' && (!active.token || navigator.onLine === false)) continue;
                if (job.nextAttemptAt > Date.now()) { nextWake = Math.min(nextWake, job.nextAttemptAt); continue; }
                try {
                    const change = await execute({ ...entry, _sync: job }, recordings, active);
                    if (change) await settlePrayerAction(entry._id, job.requestId, change);
                } catch (error) {
                    const attempts = (job.attempts || 0) + 1;
                    const retryable = error.retryable !== false;
                    const nextAttemptAt = retryable && attempts < 4 ? Date.now() + Math.min(60000, 2000 * (2 ** attempts)) : 0;
                    await settlePrayerAction(entry._id, job.requestId, { _sync: { ...job, state: 'failed', hidden: false, attempts, retryable, nextAttemptAt } });
                    if (nextAttemptAt) nextWake = Math.min(nextWake, nextAttemptAt);
                }
                changed();
            }
            if (Number.isFinite(nextWake)) timer = setTimeout(wakePrayerSync, Math.max(0, nextWake - Date.now()));
        } while (requested);
    })().catch(() => {}).finally(() => { running = null; if (requested) wakePrayerSync(); });
    return running;
}
