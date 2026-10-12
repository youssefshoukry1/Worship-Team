import localforage from 'localforage';

export const FRIENDS_CACHE_TTL_MS = 3 * 60 * 1000;

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
