import localforage from 'localforage';
import { fetchTabJson, invalidateTabRead, readTabResource, tabReadKey } from './tabRequests';

const snapshots = new Map();
const diskLoads = new Map();
const revisions = new Map();
const scopes = new Map();
const cacheKey = userId => `profile_data_${userId}`;

export function readCachedProfile(userId) {
  if (snapshots.has(userId)) return Promise.resolve(snapshots.get(userId));
  if (diskLoads.has(userId)) return diskLoads.get(userId);
  const pending = localforage.getItem(cacheKey(userId)).then(profile => {
    if (!snapshots.has(userId) && profile) snapshots.set(userId, profile);
    return snapshots.get(userId) || null;
  }).catch(() => null).finally(() => { if (diskLoads.get(userId) === pending) diskLoads.delete(userId); });
  diskLoads.set(userId, pending);
  return pending;
}

export function writeCachedProfile(userId, profile, { fromServer = false } = {}) {
  if (!fromServer) revisions.set(userId, (revisions.get(userId) || 0) + 1);
  snapshots.set(userId, profile);
  return localforage.setItem(cacheKey(userId), profile);
}

export function invalidateProfile(apiBase, token) {
  invalidateTabRead(tabReadKey(`${apiBase}/users/my-profile`, token));
  invalidateTabRead(tabReadKey(`${apiBase}/users/my-notes`, token));
}

export function refreshProfile(apiBase, token, userId, { force = false } = {}) {
  const url = `${apiBase}/users/my-profile`;
  const key = tabReadKey(url, token);
  const revision = revisions.get(userId) || 0;
  scopes.set(userId, key);
  return readTabResource(key, async signal => {
    const data = await fetchTabJson(url, token, signal);
    const sorted = items => [...(items || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
    return { user: data.user, bibleNotes: sorted(data.user?.bibleNotes), bibleHighlights: sorted(data.user?.bibleHighlights), prayTime: sorted(data.user?.prayTime) };
  }, { force, onSuccess: profile => {
    if ((revisions.get(userId) || 0) === revision && scopes.get(userId) === key) {
      writeCachedProfile(userId, profile, { fromServer: true }).catch(console.error);
    }
  } }).then(profile => {
    if ((revisions.get(userId) || 0) !== revision || scopes.get(userId) !== key) {
      const error = new Error('Profile refresh superseded');
      error.name = 'AbortError';
      throw error;
    }
    return profile;
  });
}
