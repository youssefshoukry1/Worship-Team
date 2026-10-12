import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const avatarStore = localforage.createInstance({
  name: 'taspe7_app',
  storeName: 'avatar_cache',
});

const AVATAR_DIRECTORY = 'wasla_avatars';
const AVATAR_INDEX_KEY = 'taspe7_avatar_cache_index_v1';
const MAX_AVATAR_ENTRIES = 200;
const MAX_AVATAR_BYTES = 50 * 1024 * 1024;
const BACKGROUND_DOWNLOAD_CONCURRENCY = 4;
const isNative = Capacitor.isNativePlatform();
const avatarDownloads = new Map();
const backgroundAvatarQueue = [];
const queuedBackgroundAvatars = new Set();
let activeBackgroundDownloads = 0;
let cacheMaintenancePromise = Promise.resolve();

function stableKey(value) {
  const input = String(value || 'unknown');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `avatar_${(hash >>> 0).toString(36)}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

function readAvatarIndex() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(AVATAR_INDEX_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAvatarIndex(entries) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AVATAR_INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Avatar caching still works if the small cleanup index cannot be persisted.
  }
}

function upsertAvatarIndex(key, size) {
  const entries = readAvatarIndex().filter((entry) => entry.key !== key);
  entries.push({ key, size: Number(size) || 0, updatedAt: Date.now() });
  writeAvatarIndex(entries);
}

function removeAvatarFromIndex(key) {
  writeAvatarIndex(readAvatarIndex().filter((entry) => entry.key !== key));
}

async function deleteAvatarRecord(key) {
  const record = await avatarStore.getItem(key);
  if (isNative && record?.path) {
    try {
      await Filesystem.deleteFile({ path: record.path, directory: Directory.Data });
    } catch {
      // Missing files are already effectively removed.
    }
  }
  await avatarStore.removeItem(key);
}

async function pruneAvatarCache() {
  const entries = readAvatarIndex().sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  let totalBytes = entries.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0);
  const retained = [...entries];

  while (retained.length > MAX_AVATAR_ENTRIES || totalBytes > MAX_AVATAR_BYTES) {
    const oldest = retained.shift();
    if (!oldest) break;
    totalBytes -= Number(oldest.size) || 0;
    await deleteAvatarRecord(oldest.key);
  }

  writeAvatarIndex(retained);
}

function registerAvatarAndPrune(key, size) {
  cacheMaintenancePromise = cacheMaintenancePromise
    .catch(() => {})
    .then(async () => {
      upsertAvatarIndex(key, size);
      await pruneAvatarCache();
    });
  return cacheMaintenancePromise;
}

function unregisterAvatar(key) {
  cacheMaintenancePromise = cacheMaintenancePromise
    .catch(() => {})
    .then(async () => {
      await deleteAvatarRecord(key);
      removeAvatarFromIndex(key);
    });
  return cacheMaintenancePromise;
}

export function getAvatarCacheKey(userKey, remoteUrl) {
  return stableKey(userKey || remoteUrl);
}

export async function readCachedAvatar(userKey, remoteUrl) {
  const key = getAvatarCacheKey(userKey, remoteUrl);
  const record = await avatarStore.getItem(key);
  if (!record) return null;

  if (isNative) {
    if (!record.path) return null;
    try {
      const result = await Filesystem.getUri({ path: record.path, directory: Directory.Data });
      return { ...record, src: Capacitor.convertFileSrc(result.uri) };
    } catch {
      await unregisterAvatar(key);
      return null;
    }
  }

  if (!(record.blob instanceof Blob)) {
    await unregisterAvatar(key);
    return null;
  }
  return { ...record, src: URL.createObjectURL(record.blob), objectUrl: true };
}

export async function saveAvatarBlob(userKey, remoteUrl, blob) {
  if (!(blob instanceof Blob)) throw new Error('Avatar cache requires an image blob');

  const key = getAvatarCacheKey(userKey, remoteUrl);
  const baseRecord = {
    remoteUrl: remoteUrl || null,
    mimeType: blob.type || 'image/webp',
    updatedAt: Date.now(),
    size: blob.size,
  };

  if (isNative) {
    const path = `${AVATAR_DIRECTORY}/${key}.img`;
    try {
      await Filesystem.mkdir({ path: AVATAR_DIRECTORY, directory: Directory.Data, recursive: true });
    } catch {
      // The directory already exists.
    }
    await Filesystem.writeFile({
      path,
      data: await blobToBase64(blob),
      directory: Directory.Data,
    });
    await avatarStore.setItem(key, { ...baseRecord, path });
  } else {
    await avatarStore.setItem(key, { ...baseRecord, blob });
  }

  await registerAvatarAndPrune(key, blob.size);
  return baseRecord;
}

async function persistAvatarDownload(userKey, remoteUrl) {
  if (!remoteUrl) return null;
  const cacheKey = getAvatarCacheKey(userKey, remoteUrl);
  const downloadKey = `${cacheKey}:${remoteUrl}`;

  if (!avatarDownloads.has(downloadKey)) {
    const download = (async () => {
      const response = await fetch(remoteUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Avatar download failed (${response.status})`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Avatar response is not an image');
      await saveAvatarBlob(userKey, remoteUrl, blob);
    })().finally(() => {
      avatarDownloads.delete(downloadKey);
    });
    avatarDownloads.set(downloadKey, download);
  }

  await avatarDownloads.get(downloadKey);
}

export async function downloadAndCacheAvatar(userKey, remoteUrl) {
  if (!remoteUrl) return null;
  await persistAvatarDownload(userKey, remoteUrl);
  return readCachedAvatar(userKey, remoteUrl);
}

export async function ensureAvatarCached(userKey, remoteUrl) {
  if (!remoteUrl || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const key = getAvatarCacheKey(userKey, remoteUrl);
  const record = await avatarStore.getItem(key);
  if (record?.remoteUrl === remoteUrl) return;
  await persistAvatarDownload(userKey, remoteUrl);
}

function drainBackgroundAvatarQueue() {
  while (activeBackgroundDownloads < BACKGROUND_DOWNLOAD_CONCURRENCY && backgroundAvatarQueue.length > 0) {
    const item = backgroundAvatarQueue.shift();
    activeBackgroundDownloads += 1;
    ensureAvatarCached(item.userKey, item.remoteUrl)
      .catch(() => {
        // A failed background download can be retried by the avatar component later.
      })
      .finally(() => {
        queuedBackgroundAvatars.delete(item.queueKey);
        activeBackgroundDownloads -= 1;
        drainBackgroundAvatarQueue();
      });
  }
}

export function cacheAvatarsInBackground(users) {
  if (!Array.isArray(users) || users.length === 0) return;
  if (typeof navigator !== 'undefined' && (!navigator.onLine || navigator.connection?.saveData)) return;

  users.forEach((user) => {
    const userKey = user?._id || user?.username;
    const remoteUrl = user?.profilePhoto;
    const queueKey = `${userKey}:${remoteUrl}`;
    if (!userKey || !remoteUrl || queuedBackgroundAvatars.has(queueKey)) return;
    queuedBackgroundAvatars.add(queueKey);
    backgroundAvatarQueue.push({ queueKey, userKey, remoteUrl });
  });
  drainBackgroundAvatarQueue();
}

export async function removeCachedAvatar(userKey, remoteUrl) {
  const key = getAvatarCacheKey(userKey, remoteUrl);
  await unregisterAvatar(key);
}
