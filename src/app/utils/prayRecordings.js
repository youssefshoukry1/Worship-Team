/**
 * prayRecordings.js — 100% local storage for prayer voice recordings.
 *
 * Native (Capacitor): files live in Directory.Data under `my_prays/`
 *   my_prays/index.json            → which recordings belong to which prayer
 *   my_prays/audio/<recId>.<ext>   → the audio itself
 * Web: the same index + blobs are kept in a dedicated localforage store.
 *
 * Nothing here talks to the backend — audio never leaves the device except
 * inside the "my prays.zip" backup the user uploads to their own Google Drive.
 */
import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

const ROOT = 'my_prays';
const INDEX_PATH = `${ROOT}/index.json`;
const AUDIO_DIR = `${ROOT}/audio`;
const BACKUP_JSON = 'prays.json';

const isNative = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();

let _webStore = null;
const webStore = () => {
    if (!_webStore) _webStore = localforage.createInstance({ name: 'my_prays' });
    return _webStore;
};

// guestPrays: prayer text for users who are not logged in (never sent to the server)
const emptyIndex = () => ({ version: 1, recordings: {}, pendingWords: {}, guestPrays: [] });

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

// ─── Index (serialized so concurrent writes never clobber each other) ───────
let _indexLock = Promise.resolve();

const readIndex = async () => {
    try {
        if (isNative()) {
            const file = await Filesystem.readFile({ path: INDEX_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
            return { ...emptyIndex(), ...JSON.parse(file.data) };
        }
        return { ...emptyIndex(), ...((await webStore().getItem('index')) || {}) };
    } catch {
        return emptyIndex();
    }
};

const writeIndex = async (index) => {
    if (isNative()) {
        await Filesystem.writeFile({ path: INDEX_PATH, directory: Directory.Data, encoding: Encoding.UTF8, data: JSON.stringify(index), recursive: true });
    } else {
        await webStore().setItem('index', index);
    }
};

const updateIndex = (mutator) => {
    const run = _indexLock.then(async () => {
        const index = await readIndex();
        const result = await mutator(index);
        await writeIndex(index);
        return result;
    });
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

const readAudioBytes = async (rec) => {
    if (isNative()) {
        const file = await Filesystem.readFile({ path: audioPath(rec), directory: Directory.Data });
        return typeof file.data === 'string' ? base64ToUint8(file.data) : new Uint8Array(await file.data.arrayBuffer());
    }
    const blob = await webStore().getItem(`audio_${rec.id}`);
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
};

const removeAudio = async (rec) => {
    try {
        if (isNative()) await Filesystem.deleteFile({ path: audioPath(rec), directory: Directory.Data });
        else await webStore().removeItem(`audio_${rec.id}`);
    } catch { /* already gone */ }
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Returns `{ [prayId]: Recording[] }` */
export async function getRecordingsIndex() {
    return (await readIndex()).recordings;
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
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
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
        index.recordings[prayId] = [...(index.recordings[prayId] || []), ...saved];
        if (pendingWords) index.pendingWords[prayId] = pendingWords;
    });
}

// ─── Guest prayers (no account) ─────────────────────────────────────────────
const byNewest = (a, b) => new Date(b.date) - new Date(a.date);

export async function getGuestPrays() {
    return [...((await readIndex()).guestPrays || [])].sort(byNewest);
}

/** @returns {Promise<object>} the saved entry (with a local `_id`) */
export async function addGuestPray({ words, feeling, prayType }) {
    const entry = {
        _id: `local-${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        words, feeling, prayType, date: new Date().toISOString(),
    };
    await updateIndex((index) => { index.guestPrays = [...(index.guestPrays || []), entry]; });
    return entry;
}

export async function updateGuestPray(prayId, changes) {
    return updateIndex((index) => {
        index.guestPrays = (index.guestPrays || []).map((entry) => entry._id === prayId ? { ...entry, ...changes, date: new Date().toISOString() } : entry);
        return [...index.guestPrays].sort(byNewest);
    });
}

export async function deleteGuestPray(prayId) {
    await updateIndex((index) => { index.guestPrays = (index.guestPrays || []).filter((entry) => entry._id !== prayId); });
    await deleteRecordingsForPray(prayId);
}

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
export async function buildMyPraysZip(prayTime = [], onProgress = () => {}) {
    const index = await readIndex();
    const files = {};
    const allRecs = Object.entries(index.recordings).flatMap(([prayId, list]) => list.map((rec) => ({ prayId, rec })));
    const knownIds = new Set(prayTime.map((entry) => String(entry._id)));
    const zipPathFor = (prayId, rec) => `audio/${prayId}/${rec.id}.${rec.ext}`;

    let done = 0;
    for (const { prayId, rec } of allRecs) {
        try {
            const bytes = await readAudioBytes(rec);
            if (bytes) files[zipPathFor(prayId, rec)] = [bytes, { level: 0 }]; // audio is already compressed
        } catch (err) {
            console.warn('[MyPrays] Missing audio file, skipped:', rec.id, err);
        }
        done++;
        onProgress(done / Math.max(1, allRecs.length));
    }

    const withFile = (prayId) => (index.recordings[prayId] || [])
        .filter((rec) => files[zipPathFor(prayId, rec)])
        .map((rec) => ({ ...rec, file: zipPathFor(prayId, rec) }));

    const manifest = {
        type: 'my-prays-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        prays: prayTime.map((entry) => ({
            _id: entry._id,
            words: entry.words,
            feeling: entry.feeling,
            prayType: entry.prayType,
            churchId: entry.churchId,
            date: entry.date,
            recordings: withFile(String(entry._id)),
        })),
        // Recordings whose prayer is not in the currently loaded list (e.g. another team)
        otherRecordings: Object.keys(index.recordings)
            .filter((prayId) => !knownIds.has(prayId))
            .map((prayId) => ({ prayId, pendingWords: index.pendingWords?.[prayId], recordings: withFile(prayId) })),
    };
    files[BACKUP_JSON] = strToU8(JSON.stringify(manifest, null, 2));

    return zipSync(files, { level: 6 });
}

/**
 * Restore recordings from a "my prays.zip". Prayer text stays in MongoDB, so only
 * audio + the local index are restored. Existing recordings are kept (merged by id).
 * @returns {Promise<{restored: number, prays: number}>}
 */
export async function restoreMyPraysZip(zipBytes, onProgress = () => {}) {
    const files = unzipSync(zipBytes);
    if (!files[BACKUP_JSON]) throw new Error('This file is not a "my prays" backup.');
    const manifest = JSON.parse(strFromU8(files[BACKUP_JSON]));

    const groups = [
        ...(manifest.prays || []).map((p) => ({ prayId: String(p._id), recordings: p.recordings || [] })),
        ...(manifest.otherRecordings || []).map((o) => ({ prayId: String(o.prayId), recordings: o.recordings || [], pendingWords: o.pendingWords })),
    ].filter((group) => group.recordings.length);

    const existing = await readIndex();
    const existingIds = new Set(Object.values(existing.recordings).flat().map((rec) => rec.id));
    const total = groups.reduce((sum, group) => sum + group.recordings.length, 0);
    const toAdd = [];
    let done = 0;

    for (const group of groups) {
        for (const { file, ...rec } of group.recordings) {
            if (!existingIds.has(rec.id) && files[file]) {
                await writeAudio(rec, files[file]);
                toAdd.push({ prayId: group.prayId, rec, pendingWords: group.pendingWords });
            }
            done++;
            onProgress(done / Math.max(1, total));
        }
    }

    await updateIndex((index) => {
        for (const { prayId, rec, pendingWords } of toAdd) {
            index.recordings[prayId] = [...(index.recordings[prayId] || []), rec];
            if (pendingWords) index.pendingWords[prayId] = pendingWords;
        }
    });

    return { restored: toAdd.length, prays: new Set(toAdd.map((item) => item.prayId)).size };
}
