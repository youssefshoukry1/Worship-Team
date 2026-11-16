/**
 * prayRecordings.js — 100% local storage for prayer voice recordings.
 *
 * Native (Capacitor): files live in Directory.Data under `my_prays/`
 *   my_prays/index.json            → which recordings belong to which prayer
 *   my_prays/audio/<recId>.<ext>   → the audio itself
 * Web: the same index + blobs are kept in a dedicated localforage store.
 *
 * This module does not call the backend — audio never leaves the device except
 * through backups or the explicitly requested friend-sharing flow.
 */
import localforage from 'localforage';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { runPrayerArchive, checkArchiveAbort, yieldArchiveWork } from './prayerArchiveTask';
import { incomingPrayerActivity, isPrayerUnread, seenPrayerChanges, mergeRestoredPrayer, reconcilePrayerEntries, reconcilePrayerRecordings } from './prayerActivity';

const ROOT = 'my_prays';
const INDEX_PATH = `${ROOT}/index.json`;
const AUDIO_DIR = `${ROOT}/audio`;

const isNative = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();
// New binaries advertise the bridge. Legacy binaries keep the Filesystem adapter.
const hasAtomicStorage = () => isNative() && Boolean(Capacitor.isPluginAvailable?.('PrayerStorage'));
let nativeStorage;
const atomicStorage = () => nativeStorage ||= registerPlugin('PrayerStorage');
const indexFingerprints = new WeakMap();

let _webStore = null;
const webStore = () => {
    if (!_webStore) _webStore = localforage.createInstance({ name: 'my_prays' });
    return _webStore;
};

// guestPrays is the legacy key for personal, sent and received prayers in every session.
const emptyIndex = () => ({ version: 1, recordings: {}, pendingWords: {}, guestPrays: [], revokedPrayerShares: {}, prayerDeletionCursors: {} });
const normalizeShareId = value => String(value || '').replace(/^received-/, '');
const entryShareId = entry => normalizeShareId(entry.sharedWith?.shareId || entry.sharedFrom?.shareId || entry.sharedFrom?.originalPrayId || (String(entry._id).startsWith('received-') ? entry._id : ''));
const isRevokedPrayer = (index, entry) => Boolean(index.revokedPrayerShares?.[entryShareId(entry)]);
const prayerShareKey = entry => {
    const id = entryShareId(entry);
    return id ? `${entry.sharedWith ? 'sent' : 'received'}:${id}` : null;
};

// ─── Binary helpers ─────────────────────────────────────────────────────────
const uint8ToBase64 = (bytes) => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

const base64ToUint8 = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

export const extensionForMime = (mimeType = '') => {
    if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';
    if (mimeType.includes('wav')) return 'wav';
    return 'webm';
};

const audioPath = (rec) => `${AUDIO_DIR}/${rec.id}.${rec.ext}`;

// ─── Index (runtime serialization; cooperating web tabs also use Web Locks) ───────
let _indexLock = Promise.resolve();

let storageError = null;
const errorListeners = new Set();
export const getPrayerStorageError = () => storageError;
export function subscribePrayerStorageError(listener) { errorListeners.add(listener); return () => errorListeners.delete(listener); }
function reportStorageError(error) {
    storageError = error;
    for (const listener of errorListeners) listener();
}
const recordObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validateIndex(value) {
    if (!recordObject(value) || (value.version !== undefined && value.version !== 1)
        || (value.guestPrays !== undefined && (!Array.isArray(value.guestPrays) || value.guestPrays.some(entry => !recordObject(entry) || entry._id == null)))
        || ['recordings', 'pendingWords', 'revokedPrayerShares', 'prayerDeletionCursors'].some(key => value[key] !== undefined && !recordObject(value[key]))
        || Object.values(value.recordings || {}).some(list => !Array.isArray(list) || list.some(rec => !recordObject(rec) || !rec.id))) {
        throw new Error('Prayer storage has an invalid or unsupported index. Existing data was not replaced.');
    }
    return { ...emptyIndex(), ...value };
}
const readIndexFromDisk = async () => {
    try {
        let value, fingerprint;
        if (hasAtomicStorage()) {
            const stored = await atomicStorage().readIndex();
            if (typeof stored.fingerprint !== 'string') throw new Error('Invalid native storage response');
            fingerprint = stored.fingerprint;
            if (stored.data === null && fingerprint === 'missing' && !snapshot?.prayers.length && !Object.keys(snapshot?.recordings || {}).length) {
                const index = emptyIndex(); indexFingerprints.set(index, fingerprint);
                if (storageError) reportStorageError(null);
                return index;
            }
            value = JSON.parse(stored.data);
        } else if (isNative()) {
            let file;
            try { file = await Filesystem.readFile({ path: INDEX_PATH, directory: Directory.Data, encoding: Encoding.UTF8 }); }
            catch (error) {
                // Only the installed plugin's explicit missing-file code is a new store.
                if ((error.code === 'OS-PLUG-FILE-0008' || error.code === 'ENOENT') && !snapshot?.prayers.length && !Object.keys(snapshot?.recordings || {}).length) {
                    if (storageError) reportStorageError(null);
                    return emptyIndex();
                }
                throw error;
            }
            value = JSON.parse(file.data);
        } else {
            value = await webStore().getItem('index');
            if (value === null && !snapshot?.prayers.length && !Object.keys(snapshot?.recordings || {}).length) {
                if (storageError) reportStorageError(null);
                return emptyIndex();
            }
        }
        const index = validateIndex(value);
        if (fingerprint !== undefined) indexFingerprints.set(index, fingerprint);
        if (storageError) reportStorageError(null);
        return index;
    } catch (cause) {
        const error = new Error('Could not read saved prayers. Retry when device storage is available; existing history will not be overwritten.', { cause });
        error.code = 'PRAYER_STORAGE_READ';
        reportStorageError(error);
        throw error;
    }
};

let cachedIndex = null;
let loadingIndex = null;
let snapshot = null;
let cacheGeneration = 0;
let watchingStorage = false;
let storageChannel = null;
const localListeners = new Set();
const migratedOwners = new Map();

export const getCachedPrayerSnapshot = () => snapshot;
export function subscribeLocalPrayers(listener) {
    localListeners.add(listener);
    watchStorage();
    return () => localListeners.delete(listener);
}

function publishIndex(index) {
    cachedIndex = index;
    const prayers = reconcilePrayerEntries(snapshot?.prayers || [], index.guestPrays
        .filter(entry => !isRevokedPrayer(index, entry) && !entry._sync?.hidden).sort(byNewest));
    const recordings = reconcilePrayerRecordings(snapshot?.recordings || {}, index.recordings);
    if (snapshot && snapshot.prayers === prayers && snapshot.recordings === recordings) return;
    snapshot = { prayers, recordings };
    for (const listener of localListeners) listener(snapshot);
}

// Refresh on external writes/resume, never on ordinary React renders or tab switches.
export function refreshLocalPrayerCache() {
    cacheGeneration++;
    cachedIndex = null;
    loadingIndex = null;
    migratedOwners.clear();
    return readIndex();
}

function watchStorage() {
    if (watchingStorage || typeof window === 'undefined' || !window.addEventListener) return;
    watchingStorage = true;
    const refresh = () => { void refreshLocalPrayerCache().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
    if (typeof BroadcastChannel !== 'undefined') {
        storageChannel = new BroadcastChannel('taspe7-local-prayers');
        storageChannel.onmessage = refresh;
    }
}

const readIndex = async () => {
    watchStorage();
    await _indexLock;
    if (cachedIndex) return cachedIndex;
    if (!loadingIndex) {
        const generation = cacheGeneration;
        const pending = readIndexFromDisk().then(index => {
            if (generation !== cacheGeneration) return readIndex();
            publishIndex(index);
            return index;
        }).finally(() => { if (loadingIndex === pending) loadingIndex = null; });
        loadingIndex = pending;
    }
    return loadingIndex;
};

const writeIndex = async (index) => {
    if (hasAtomicStorage()) {
        const result = await atomicStorage().writeIndex({ expectedFingerprint: indexFingerprints.get(index), data: JSON.stringify(index) });
        indexFingerprints.set(index, result.fingerprint);
    } else if (isNative()) {
        await Filesystem.writeFile({ path: INDEX_PATH, directory: Directory.Data, encoding: Encoding.UTF8, data: JSON.stringify(index), recursive: true });
    } else {
        await webStore().setItem('index', index);
    }
};

const updateIndex = (mutator, shouldWrite, yieldWork) => {
    const transaction = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        // Fresh transactional copy: never mutate a snapshot already held by React,
        // and include changes made by another browser tab before this transaction.
        const index = await readIndexFromDisk();
        if (yieldWork) await yieldWork();
        const before = shouldWrite ? null : JSON.stringify(index);
        if (yieldWork) await yieldWork();
        const result = await mutator(index);
        if (yieldWork) await yieldWork();
        const changed = shouldWrite ? shouldWrite(result) : before !== JSON.stringify(index);
        if (yieldWork) await yieldWork();
        if (changed) {
            try { await writeIndex(index); }
            catch (error) {
                if (error.code === 'PRAYER_STORAGE_CONFLICT' && attempt < 2) continue;
                reportStorageError(error); throw error;
            }
            try { storageChannel?.postMessage('changed'); } catch { /* Persistence already succeeded. */ }
        }
        cacheGeneration++;
        loadingIndex = null;
        if (yieldWork) await yieldWork();
        publishIndex(index);
        if (storageError) reportStorageError(null);
        if (result && typeof result === 'object' && !Array.isArray(result) && result.prayers) result.prayers = snapshot.prayers;
        return result;
      }
    };
    // Web Locks serialize the fresh read + write across cooperating browser tabs.
    const run = _indexLock.then(() => !isNative() && typeof navigator !== 'undefined' && navigator.locks?.request
        ? navigator.locks.request('taspe7-prayer-index', transaction) : transaction());
    _indexLock = run.catch(() => {});
    return run;
};

// ─── Audio bytes ────────────────────────────────────────────────────────────
const writeAudio = async (rec, bytes) => {
    if (isNative()) {
        await Filesystem.writeFile({ path: audioPath(rec), directory: Directory.Data, data: uint8ToBase64(bytes), recursive: true });
    } else {
        await webStore().setItem(`audio_${rec.id}`, new Blob([bytes], { type: rec.mimeType }));
    }
};

export const readAudioBytes = async (rec) => {
    if (isNative()) {
        const file = await Filesystem.readFile({ path: audioPath(rec), directory: Directory.Data });
        return typeof file.data === 'string' ? base64ToUint8(file.data) : new Uint8Array(await file.data.arrayBuffer());
    }
    const blob = await webStore().getItem(`audio_${rec.id}`);
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
};

export async function getRecordingBase64(rec) {
    try {
        if (isNative()) {
            const file = await Filesystem.readFile({ path: audioPath(rec), directory: Directory.Data });
            if (typeof file.data === 'string') return file.data;
        } else if (typeof FileReader !== 'undefined') {
            const blob = await webStore().getItem(`audio_${rec.id}`);
            if (!blob) return null;
            // Browser encoding avoids a large synchronous byte-to-string loop on small devices.
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        const bytes = await readAudioBytes(rec);
        return bytes ? uint8ToBase64(bytes) : null;
    } catch {
        return null;
    }
}

export async function addExternalRecording(prayId, recInfo, data) {
    if (!prayId || !recInfo || !data) return null;
    return (await addExternalRecordings(prayId, [{ ...recInfo, data }]))[0] || null;
}

export async function addExternalRecordings(prayId, items, shareId = prayId) {
    if (!prayId || !items.length) return [];
    const current = await readIndex();
    const known = new Set((current.recordings[prayId] || []).map(rec => rec.id));
    const saved = [];
    for (const info of items) {
        if (known.has(info.id)) continue;
        if (!info.data) throw new Error('Prayer audio is incomplete. Delivery will be retried.');
        const bytes = typeof info.data === 'string' ? base64ToUint8(info.data) : info.data;
        const mimeType = info.mimeType || 'audio/webm';
        const rec = { id: info.id || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            blockType: info.blockType || 'general', sectionIndex: Number.isInteger(info.sectionIndex) ? info.sectionIndex : null,
            mimeType, ext: info.ext || extensionForMime(mimeType), duration: Math.round(info.duration || 0), size: bytes.length,
            createdAt: info.createdAt || new Date().toISOString() };
        await writeAudio(rec, bytes);
        saved.push(rec); known.add(rec.id);
    }
    if (!saved.length) return [];
    const kept = await updateIndex(index => {
        if (index.revokedPrayerShares?.[normalizeShareId(shareId)]) return false;
        const clips = index.recordings[prayId] || [];
        const ids = new Set(clips.map(rec => rec.id));
        index.recordings[prayId] = [...clips, ...saved.filter(rec => !ids.has(rec.id))];
        return true;
    });
    if (!kept) { for (const rec of saved) await removeAudio(rec); return []; }
    return saved;
}

const removeAudio = async (rec) => {
    try {
        if (isNative()) await Filesystem.deleteFile({ path: audioPath(rec), directory: Directory.Data });
        else await webStore().removeItem(`audio_${rec.id}`);
    } catch { /* already gone */ }
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Returns `{ [prayId]: Recording[] }` */
export async function getRecordingsIndex() {
    await readIndex();
    return snapshot.recordings;
}

/**
 * Persist the recordings made while writing a prayer, attached to its saved id.
 * @param {string} prayId
 * @param {{blob: Blob, blockType: string, duration: number, mimeType: string}[]} items
 * @param {string} [pendingWords] — set when prayId is an offline `temp-` id, used to re-link after sync
 */
export async function addRecordings(prayId, items, pendingWords) {
    if (!prayId || !items?.length) return;
    const saved = [];
    for (const item of items) {
        const mimeType = item.mimeType || item.blob.type || 'audio/webm';
        const rec = {
            id: item.id || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            blockType: item.blockType || 'general',
            // Position of the prayer section (general text first, then each block) this clip belongs to
            sectionIndex: Number.isInteger(item.sectionIndex) ? item.sectionIndex : null,
            mimeType,
            ext: extensionForMime(mimeType),
            duration: Math.round(item.duration || 0),
            size: item.blob.size,
            createdAt: new Date().toISOString(),
        };
        await writeAudio(rec, new Uint8Array(await item.blob.arrayBuffer()));
        saved.push(rec);
    }
    await updateIndex((index) => {
        index.recordings[prayId] = [...(index.recordings[prayId] || []).filter(rec => !saved.some(item => item.id === rec.id)), ...saved];
        if (pendingWords) index.pendingWords[prayId] = pendingWords;
    });
}

// ─── Local prayers (stored on device) ────────────────────────────────────────
const byNewest = (a, b) => new Date(b.date) - new Date(a.date);

export async function getGuestPrays() {
    await readIndex();
    return snapshot.prayers;
}

// The action lives beside its prayer, so text and the outbox cannot drift apart.
// Credentials are supplied by the active session and are never stored here.
export async function stagePrayerAction(entry) {
    let changed = false;
    return updateIndex(index => {
        changed = false;
        if (isRevokedPrayer(index, entry)) return false;
        const current = index.guestPrays.find(item => String(item._id) === String(entry._id));
        const next = { ...current, ...entry };
        if (current && JSON.stringify(current) === JSON.stringify(next)) return true;
        index.guestPrays = [...index.guestPrays.filter(item => String(item._id) !== String(entry._id)), next];
        changed = true;
        return true;
    }, () => changed);
}

export async function getPrayerActions(ownerId) {
    const index = await readIndex();
    return index.guestPrays.filter(entry => !isRevokedPrayer(index, entry) && entry._sync && entry._sync.ownerId === String(ownerId || 'guest'))
        .map(entry => ({ entry, recordings: index.recordings[entry._id] || [] }));
}

// A late acknowledgement must not overwrite a newer action or a revocation.
export async function settlePrayerAction(id, requestId, change) {
    let changed = false;
    return updateIndex(index => {
        changed = false;
        const entry = index.guestPrays.find(item => String(item._id) === String(id));
        if (!entry || entry._sync?.requestId !== requestId || isRevokedPrayer(index, entry)) return false;
        const before = JSON.stringify(entry);
        Object.assign(entry, typeof change === 'function' ? change(entry) : change);
        changed = before !== JSON.stringify(entry);
        return true;
    }, () => changed);
}

export async function getPrayerDeletionState(ownerId) {
    const index = await readIndex();
    return { cursor: index.prayerDeletionCursors?.[String(ownerId)] || null, seen: new Set(Object.keys(index.revokedPrayerShares || {})) };
}

// Persist removals before deleting audio bytes. Late deliveries and old backups cannot resurrect a prayer.
export async function applyPrayerRevocations(shareIds, ownerId, cursor) {
    const ids = shareIds.map(normalizeShareId).filter(Boolean);
    const result = await updateIndex(index => {
        let changed = false;
        const audio = [];
        index.revokedPrayerShares ||= {};
        index.prayerDeletionCursors ||= {};
        for (const id of ids) if (!index.revokedPrayerShares[id]) { index.revokedPrayerShares[id] = true; changed = true; }
        const retained = index.guestPrays.filter(entry => {
            if (!isRevokedPrayer(index, entry)) return true;
            audio.push(...(index.recordings[entry._id] || []));
            delete index.recordings[entry._id]; delete index.pendingWords[entry._id];
            return false;
        });
        const removed = retained.length !== index.guestPrays.length;
        if (removed) { index.guestPrays = retained; changed = true; }
        if (cursor && Number.isFinite(Date.parse(cursor)) && index.prayerDeletionCursors[String(ownerId)] !== cursor) {
            index.prayerDeletionCursors[String(ownerId)] = cursor; changed = true;
        }
        return { changed, audio, prayers: removed ? index.guestPrays : null };
    }, result => result.changed);
    for (const rec of result.audio) await removeAudio(rec);
    return result;
}

// Upgrade older browser-only read markers once, so native/web backups carry the same state.
export function migratePrayerReadState(ownerId, legacyOpened) {
    const owner = String(ownerId || 'guest');
    if (migratedOwners.has(owner)) return migratedOwners.get(owner).then(() => getGuestPrays());
    const pending = updateIndex(index => {
        let changed = false;
        index.guestPrays = index.guestPrays.map(entry => {
            const field = entry.sharedWith ? 'sharedWith' : entry.sharedFrom ? 'sharedFrom' : null;
            if (!field || entry[field].seenActivityBy) return entry;
            const activity = incomingPrayerActivity(entry);
            const seenActivityBy = activity && !isPrayerUnread(entry, ownerId, legacyOpened) ? { [String(ownerId || 'guest')]: activity } : {};
            changed = true;
            return { ...entry, [field]: { ...entry[field], seenActivityBy } };
        });
        return { changed, prayers: index.guestPrays };
    }, result => result.changed).then(() => getGuestPrays()).catch(error => { migratedOwners.delete(owner); throw error; });
    migratedOwners.set(owner, pending);
    return pending;
}

/** @returns {Promise<object>} the saved entry (with a local `_id`) */
export async function addGuestPray({ words, prayType, sharedWith, sharedFrom, _id, date, feeling }) {
    let changed = false;
    const entry = {
        _id: _id || `local-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        words,
        prayType: prayType || 'general',
        date: date || new Date().toISOString(),
        ...(feeling ? { feeling } : {}),
        ...(sharedWith ? { sharedWith } : {}),
        ...(sharedFrom ? { sharedFrom } : {}),
    };
    return updateIndex((index) => {
        changed = false;
        if (isRevokedPrayer(index, entry)) return null;
        const old = index.guestPrays.find(item => String(item._id) === String(entry._id));
        if (old && JSON.stringify(old) === JSON.stringify(entry)) return old;
        index.guestPrays = [entry, ...(index.guestPrays || []).filter((e) => String(e._id) !== String(entry._id))];
        changed = true;
        return entry;
    }, () => changed);
}

export async function updateGuestPray(prayId, changes) {
    await updateIndex(index => {
        const position = index.guestPrays.findIndex(entry => String(entry._id) === String(prayId));
        if (position < 0) return false;
        const next = { ...index.guestPrays[position], ...changes };
        if (JSON.stringify(next) === JSON.stringify(index.guestPrays[position])) return false;
        index.guestPrays[position] = next;
        return true;
    }, Boolean);
    return getGuestPrays();
}

// Compare encrypted source text inside the transaction; never overwrite a newer reply.
export async function repairPrayerTexts(changes) {
    return updateIndex(index => {
        const positions = new Map(index.guestPrays.map((entry, i) => [String(entry._id), i]));
        let changed = false;
        for (const { id, field, text, plain } of changes) {
            const position = positions.get(String(id));
            if (position === undefined || !plain || plain === text) continue;
            const entry = index.guestPrays[position];
            if (field === 'words' && entry.words === text) { index.guestPrays[position] = { ...entry, words: plain }; changed = true; }
            const party = field === 'sharedFrom.responseWords' ? 'sharedFrom' : field === 'sharedWith.responseWords' ? 'sharedWith' : null;
            if (party && entry[party]?.responseWords === text) { index.guestPrays[position] = { ...entry, [party]: { ...entry[party], responseWords: plain } }; changed = true; }
        }
        return changed;
    }, Boolean);
}

export async function importLegacyPrayers(items) {
    return updateIndex(index => {
        const byId = new Map(index.guestPrays.map(entry => [String(entry._id), entry]));
        let changed = false;
        for (const item of items) {
            if (!item?._id || !item.words || isRevokedPrayer(index, item)) continue;
            const id = String(item._id), old = byId.get(id);
            if (!old) {
                byId.set(id, { _id: item._id, words: item.words, prayType: item.prayType || 'general', date: item.date || new Date().toISOString(),
                    ...(item.sharedWith ? { sharedWith: item.sharedWith } : {}), ...(item.sharedFrom ? { sharedFrom: item.sharedFrom } : {}) });
                changed = true;
            }
            else if (old.words?.startsWith('enc:v1:') && !item.words.startsWith('enc:v1:')) { byId.set(id, { ...old, words: item.words }); changed = true; }
        }
        if (changed) index.guestPrays = [...byId.values()];
        return changed;
    }, Boolean);
}

// One index read/write per inbox batch. Retries never replace an already replied/read prayer.
export function mergeIncomingPrayers(bundles) {
    return updateIndex(index => {
        const ids = new Set(index.guestPrays.map(entry => String(entry._id)));
        const byShare = new Map(index.guestPrays.filter(entry => !entry.sharedWith && entry.sharedFrom)
            .map(entry => [entryShareId(entry), String(entry._id)]));
        const prayerIds = {};
        const added = [];
        for (const bundle of bundles) {
            const shareId = normalizeShareId(bundle.shareId);
            const id = `received-${shareId}`;
            prayerIds[shareId] = byShare.get(shareId) || id;
            if (byShare.has(shareId) || ids.has(id) || index.revokedPrayerShares?.[shareId]) continue;
            ids.add(id);
            byShare.set(shareId, id);
            added.push({ _id: id, words: bundle.words, prayType: bundle.prayType || 'general', date: bundle.date || new Date().toISOString(),
                sharedFrom: { userId: bundle.senderId, username: bundle.senderUsername, name: bundle.senderName || bundle.senderUsername,
                    profilePhoto: bundle.senderProfilePhoto || null, shareId: bundle.shareId, originalPrayId: bundle.shareId,
                    status: 'pending', isAnonymous: Boolean(bundle.isAnonymous), seenActivityBy: {} } });
        }
        if (added.length) index.guestPrays = [...added, ...index.guestPrays];
        return { changed: added.length > 0, prayers: added.length ? index.guestPrays : null, prayerIds };
    }, result => result.changed);
}

export function applyPrayerReplies(updates) {
    return updateIndex(index => {
        const byShare = new Map(), legacyByRecipient = new Map();
        index.guestPrays.forEach((entry, position) => {
            if (!entry.sharedWith) return;
            if (entry.sharedWith.shareId) byShare.set(String(entry.sharedWith.shareId).replace(/^received-/, ''), position);
            else if (entry.sharedWith.status === 'sent' && entry._sync?.kind !== 'send') {
                const id = String(entry.sharedWith.userId || '');
                legacyByRecipient.set(id, legacyByRecipient.has(id) ? null : position);
            }
        });
        let changed = false;
        const acknowledged = [];
        for (const update of updates) {
            const shareId = String(update.shareId).replace(/^received-/, '');
            const recipient = String(update.recipientId?._id || update.recipientId || '');
            const position = byShare.get(shareId) ?? legacyByRecipient.get(recipient);
            if (position == null) continue; // Never guess between multiple prayers to the same person.
            const entry = index.guestPrays[position];
            const old = entry.sharedWith;
            if (old.status === 'confirmed' && old.respondedAt && update.respondedAt && Date.parse(old.respondedAt) > Date.parse(update.respondedAt)) continue;
            const party = { ...old, shareId, status: 'confirmed', responseWords: update.responseWords,
                respondedAt: update.respondedAt || old.respondedAt || null,
                profilePhoto: update.recipientProfilePhoto || old.profilePhoto || null,
                name: update.recipientName || old.name || '',
                username: update.recipientUsername && update.recipientUsername !== 'Anonymous' ? update.recipientUsername : old.username || 'friend' };
            // A newly arriving reply to a legacy sent prayer needs explicit unread tracking.
            if (old.status !== 'confirmed') party.seenActivityBy = old.seenActivityBy || {};
            if (JSON.stringify(old) !== JSON.stringify(party)) {
                index.guestPrays[position] = { ...entry, sharedWith: party };
                changed = true;
            }
            acknowledged.push(update.shareId);
            legacyByRecipient.delete(recipient);
        }
        return { changed, acknowledged, prayers: changed ? index.guestPrays : null };
    }, result => result.changed);
}

// Check the exact activity again inside the serialized write: opening an older reply cannot clear a newer one.
export function markPrayerActivitySeen(prayId, ownerId, activity) {
    return updateIndex(index => {
        const position = index.guestPrays.findIndex(entry => String(entry._id) === String(prayId));
        if (position < 0) return null;
        const entry = index.guestPrays[position];
        if (incomingPrayerActivity(entry) !== activity) return null;
        const changes = seenPrayerChanges(entry, ownerId, activity);
        if (changes) index.guestPrays[position] = { ...entry, ...changes };
        return changes;
    }, Boolean);
}

export async function deleteGuestPray(prayId) {
    const result = await updateIndex(index => {
        const retained = index.guestPrays.filter(entry => String(entry._id) !== String(prayId));
        const audio = index.recordings[prayId] || [];
        const changed = retained.length !== index.guestPrays.length || prayId in index.recordings || prayId in index.pendingWords;
        index.guestPrays = retained;
        delete index.recordings[prayId]; delete index.pendingWords[prayId];
        return { audio, changed };
    }, result => result.changed);
    for (const rec of result.audio) await removeAudio(rec);
}

export const getLocalPrays = getGuestPrays;
export const saveLocalPray = addGuestPray;
export const updateLocalPray = updateGuestPray;
export const deleteLocalPray = deleteGuestPray;


/** Playable URL. On web the caller must URL.revokeObjectURL() it when done. */
export async function getRecordingUrl(rec) {
    if (isNative()) {
        const { uri } = await Filesystem.getUri({ path: audioPath(rec), directory: Directory.Data });
        return { url: Capacitor.convertFileSrc(uri), revoke: false };
    }
    const blob = await webStore().getItem(`audio_${rec.id}`);
    return blob ? { url: URL.createObjectURL(blob), revoke: true } : { url: null, revoke: false };
}

export async function deleteRecording(prayId, recId) {
    const removed = await updateIndex((index) => {
        const list = index.recordings[prayId] || [];
        const rec = list.find((item) => item.id === recId);
        index.recordings[prayId] = list.filter((item) => item.id !== recId);
        if (!index.recordings[prayId].length) delete index.recordings[prayId];
        return rec;
    });
    if (removed) await removeAudio(removed);
}

export async function deleteRecordingsForPray(prayId) {
    const removed = await updateIndex((index) => {
        const list = index.recordings[prayId] || [];
        delete index.recordings[prayId];
        delete index.pendingWords[prayId];
        return list;
    });
    for (const rec of removed) await removeAudio(rec);
}

/**
 * Prayers saved offline get a `temp-` id; once the offline queue syncs, the server
 * assigns a real _id. Move recordings to the real entry by matching the prayer text.
 * @returns {Promise<boolean>} whether anything changed
 */
export async function reconcileTempRecordings(prayTime = []) {
    const index = await readIndex();
    const tempIds = Object.keys(index.pendingWords || {});
    if (!tempIds.length) return false;
    const currentIds = new Set(prayTime.map((entry) => String(entry._id)));
    if (tempIds.every((tempId) => currentIds.has(tempId))) return false;

    return updateIndex((fresh) => {
        let changed = false;
        for (const tempId of Object.keys(fresh.pendingWords || {})) {
            if (currentIds.has(tempId)) continue; // still offline / not synced yet
            const words = (fresh.pendingWords[tempId] || '').trim();
            const match = prayTime.find((entry) => !String(entry._id).startsWith('temp-')
                && (entry.words || '').trim() === words
                && !fresh.recordings[entry._id]);
            if (!match) continue;
            fresh.recordings[match._id] = fresh.recordings[tempId] || [];
            delete fresh.recordings[tempId];
            delete fresh.pendingWords[tempId];
            changed = true;
        }
        return changed;
    });
}

/**
 * Build "my prays.zip": prays.json (all prayer text + recording list) and audio/<prayId>/<file>.
 * @returns {Promise<Uint8Array>}
 */
export async function buildMyPraysZip(prayTime = [], onProgress = () => {}, { signal } = {}) {
    checkArchiveAbort(signal);
    const index = await readIndex();
    const files = {};
    const allRecs = Object.entries(index.recordings).flatMap(([prayId, list]) => list.map((rec) => ({ prayId, rec })));

    const allPraysMap = new Map();
    (index.guestPrays || []).forEach((p) => {
        if (p && p._id) allPraysMap.set(String(p._id), p);
    });
    (prayTime || []).forEach((p) => {
        if (p && p._id) {
            const existing = allPraysMap.get(String(p._id));
            allPraysMap.set(String(p._id), existing ? mergeRestoredPrayer({ ...existing, ...p }, existing) : p);
        }
    });
    const combinedPrays = Array.from(allPraysMap.values());
    const knownIds = new Set(combinedPrays.map((entry) => String(entry._id)));
    const zipPathFor = (prayId, rec) => `audio/${prayId}/${rec.id}.${rec.ext}`;

    let done = 0;
    for (const { prayId, rec } of allRecs) {
        checkArchiveAbort(signal);
        try {
            const bytes = await readAudioBytes(rec);
            if (!bytes) throw new Error('Recording unavailable');
            files[zipPathFor(prayId, rec)] = [bytes, { level: 0 }]; // audio is already compressed
        } catch (err) {
            throw new Error('A recording is missing or unreadable. Backup was not created; your previous backup has been kept.', { cause: err });
        }
        done++;
        onProgress(0.8 * done / Math.max(1, allRecs.length));
    }

    const withFile = (prayId) => (index.recordings[prayId] || [])
        .filter((rec) => files[zipPathFor(prayId, rec)])
        .map((rec) => ({ ...rec, file: zipPathFor(prayId, rec) }));

    const manifest = {
        type: 'my-prays-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        revokedPrayerShares: index.revokedPrayerShares || {},
        prays: combinedPrays.map((entry) => ({
            _id: entry._id,
            words: entry.words,
            feeling: entry.feeling,
            prayType: entry.prayType,
            churchId: entry.churchId,
            date: entry.date,
            sharedWith: entry.sharedWith || null,
            sharedFrom: entry.sharedFrom || null,
            _sync: entry._sync || null,
            recordings: withFile(String(entry._id)),
        })),
        // Recordings whose prayer is not in the currently loaded list (e.g. another team)
        otherRecordings: Object.keys(index.recordings)
            .filter((prayId) => !knownIds.has(prayId))
            .map((prayId) => ({ prayId, pendingWords: index.pendingWords?.[prayId], recordings: withFile(prayId) })),
    };
    const archive = await runPrayerArchive({ operation: 'pack', files, manifest }, { signal });
    onProgress(1);
    return archive;
}

/**
 * Restore prayer text, read/reply state and recordings from a "my prays.zip".
 * Existing history is merged by prayer/share identity; newer activity always wins.
 * @returns {Promise<{restored: number, prays: number}>}
 */
export async function restoreMyPraysZip(zipBytes, onProgress = () => {}, { ownerId, signal } = {}) {
    const { files, manifest } = await runPrayerArchive({ operation: 'unpack', bytes: zipBytes }, { signal });
    // Let the browser paint after receiving/cloning the decoded manifest before
    // beginning storage reads and reconciliation. The worker owns no live state.
    await yieldArchiveWork();
    checkArchiveAbort(signal);
    const manifestPrayers = new Map((manifest.prays || []).map(entry => [String(entry._id), entry]));

    const existing = await readIndex();
    const revokedPrayerShares = { ...existing.revokedPrayerShares, ...manifest.revokedPrayerShares };
    const revokedIds = new Set((manifest.prays || []).filter(entry => isRevokedPrayer({ revokedPrayerShares }, entry)).map(entry => String(entry._id)));
    const groups = [
        ...(manifest.prays || []).map((p) => ({ prayId: String(p._id), recordings: p.recordings || [] })),
        ...(manifest.otherRecordings || []).map((o) => ({ prayId: String(o.prayId), recordings: o.recordings || [], pendingWords: o.pendingWords })),
    ].filter((group) => group.recordings.length && !revokedIds.has(group.prayId) && !revokedPrayerShares[normalizeShareId(group.prayId)]);

    const existingIds = new Set(Object.values(existing.recordings).flat().map((rec) => rec.id));
    // Validate the complete archive before writing any audio or prayer metadata.
    // Even an already-present recording must exist in the archive being restored.
    for (const group of groups) for (const rec of group.recordings) {
        if (!rec.id || !rec.ext || [rec.id, rec.ext].some(value => typeof value !== 'string' || value === '.' || value === '..' || /[\\/]/.test(value))
            || typeof rec.file !== 'string' || !Object.hasOwn(files, rec.file)) {
            throw new Error('This prayer backup contains an invalid or missing recording. Nothing was restored.');
        }
    }
    const total = groups.reduce((sum, group) => sum + group.recordings.length, 0);
    const toAdd = [];
    let done = 0;

    for (const group of groups) {
        for (const { file, ...rec } of group.recordings) {
            checkArchiveAbort(signal);
            if (!existingIds.has(rec.id) && files[file]) {
                await writeAudio(rec, files[file]);
                toAdd.push({ prayId: group.prayId, rec, pendingWords: group.pendingWords });
            }
            done++;
            onProgress(done / Math.max(1, total));
        }
    }

    const revokedAudio = [];
    await updateIndex((index) => {
        revokedAudio.length = 0;
        checkArchiveAbort(signal);
        index.revokedPrayerShares = { ...index.revokedPrayerShares, ...revokedPrayerShares };
        index.prayerDeletionCursors = {}; // A restored backup must reconcile all server removals again.
        index.guestPrays = index.guestPrays.filter(entry => {
            if (!isRevokedPrayer(index, entry)) return true;
            revokedAudio.push(...(index.recordings[entry._id] || []));
            delete index.recordings[entry._id]; delete index.pendingWords[entry._id];
            return false;
        });
        const restoreTargets = new Map();
        if (Array.isArray(manifest.prays) && manifest.prays.length > 0) {
            const currentPrays = (index.guestPrays || []).filter(entry => !isRevokedPrayer(index, entry));
            const currentMap = new Map(), byShare = new Map();
            const merge = (prayer, fromBackup) => {
                const sourceId = String(prayer._id);
                const key = prayerShareKey(prayer);
                const id = byShare.get(key) || sourceId;
                const existing = currentMap.get(id);
                const merged = mergeRestoredPrayer(existing, prayer, fromBackup ? ownerId : undefined);
                merged._id = id;
                currentMap.set(id, merged);
                if (key) byShare.set(key, id);
                restoreTargets.set(sourceId, id);
            };
            currentPrays.forEach(prayer => merge(prayer, false));
            manifest.prays.filter(p => p && p._id && p.words && !isRevokedPrayer(index, p)).forEach(p => merge({
                _id: String(p._id), words: p.words, feeling: p.feeling, churchId: p.churchId,
                prayType: p.prayType || 'general', date: p.date || null,
                sharedWith: p.sharedWith || null, sharedFrom: p.sharedFrom || null,
                // Restoring a backup never silently resends an old action.
                _sync: p._sync ? { ...p._sync, state: 'failed', hidden: false, nextAttemptAt: 0 } : null,
            }, true));
            index.guestPrays = Array.from(currentMap.values()).sort(byNewest);
        }

        // Legacy local IDs can differ from received-<shareId>. Keep a single card
        // and all its clips; replayed inbox deliveries use this same canonical ID.
        for (const [source, target] of restoreTargets) {
            if (source === target) continue;
            const clips = index.recordings[target] || [];
            const known = new Set(clips.map(rec => rec.id));
            index.recordings[target] = [...clips, ...(index.recordings[source] || []).filter(rec => !known.has(rec.id))];
            if (index.pendingWords[source] && !index.pendingWords[target]) index.pendingWords[target] = index.pendingWords[source];
            delete index.recordings[source]; delete index.pendingWords[source];
        }
        for (const { prayId, rec, pendingWords } of toAdd) {
            const prayer = manifestPrayers.get(prayId);
            if (index.revokedPrayerShares[normalizeShareId(prayId)] || (prayer && isRevokedPrayer(index, prayer))) { revokedAudio.push(rec); continue; }
            const target = restoreTargets.get(prayId) || prayId;
            const clips = index.recordings[target] || [];
            if (!clips.some(clip => clip.id === rec.id)) index.recordings[target] = [...clips, rec];
            if (pendingWords) index.pendingWords[target] = pendingWords;
        }
    }, undefined, yieldArchiveWork);

    for (const rec of revokedAudio) await removeAudio(rec);
    const totalPraysCount = Math.max(
        new Set(toAdd.map((item) => item.prayId)).size,
        Array.isArray(manifest.prays) ? manifest.prays.length : 0
    );
    return { restored: toAdd.length, prays: totalPraysCount };
}
