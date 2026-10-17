import localforage from 'localforage';

export const FRIENDS_CACHE_TTL_MS = 3 * 60 * 1000;

export function friendsDirtyKey(userId) {
  return `taspe7_friends_dirty_${userId || 'anonymous'}`;
}

export function markFriendsCacheDirty(userId) {
  try {
    const key = friendsDirtyKey(userId);
    localStorage.setItem(key, String((Number(localStorage.getItem(key)) || 0) + 1));
  } catch { /* A push still refreshes the mounted page when storage is unavailable. */ }
}

export function readFriendsInvalidation(userId) {
  try { return localStorage.getItem(friendsDirtyKey(userId)); } catch { return null; }
}

export function clearFriendsInvalidation(userId, version) {
  try {
    if (version && readFriendsInvalidation(userId) === version) localStorage.removeItem(friendsDirtyKey(userId));
  } catch { /* The next visit can retry refreshing the cache. */ }
}

export function getFriendsCacheKey(userId) {
  return `friends_data_${userId || 'anonymous'}`;
}

export function isFriendsCacheFresh(timestamp, now = Date.now()) {
  return Number(timestamp) > 0 && now - Number(timestamp) < FRIENDS_CACHE_TTL_MS;
}

export async function readFriendsCache(userId) {
  return localforage.getItem(getFriendsCacheKey(userId));
}

export async function writeFriendsCache(userId, value) {
  return localforage.setItem(getFriendsCacheKey(userId), value);
}
