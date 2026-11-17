import { optimisticFriendRemoval } from './friendDirectory/useLocalFriends';
import { invalidatePeoplePages } from './usePeoplePage';
import { getApiBaseUrl } from './apiBase';
import { markFriendsCacheDirty } from './friendsCache';
import { invalidateTabRead, tabReadKey } from './tabRequests';

const idOf = value => String(value?._id || value || '').toLowerCase();

export async function readFriendship(token, targetId, { signal } = {}) {
  const request = async path => {
    const response = await fetch(`${getApiBaseUrl()}/users/${path}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.message || 'Could not check friendship. Please try again.');
    return data;
  };
  const target = idOf(targetId);
  const result = await request(`friendship/${target}`);
  if (!['self', 'friends', 'incoming', 'outgoing', 'none'].includes(result.relationship)) throw new Error('Could not check friendship. Please try again.');
  return result.relationship;
}

export async function changeFriendship(token, targetId, action) {
  const routes = {
    add: ['POST', `friend-request/${targetId}`],
    cancel: ['POST', `friend-request/cancel/${targetId}`],
    decline: ['POST', `friend-request/cancel/${targetId}`],
    accept: ['POST', `friend-request/accept/${targetId}`],
    remove: ['DELETE', `friends/${targetId}`],
  };
  const route = routes[action];
  if (!route) throw new Error('Invalid friendship action.');
  const settle = action === 'remove' ? optimisticFriendRemoval(token, targetId) : () => {};
  try {
  const response = await fetch(`${getApiBaseUrl()}/users/${route[1]}`, {
    method: route[0], headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || 'Could not update friendship. Please try again.');
    error.status = response.status;
    if (data.code === 'ALREADY_FRIENDS' || data.relationship === 'friends' || /^already friends\b/i.test(error.message)) error.relationship = 'friends';
    throw error;
  }
  settle(true);
  return data;
  } catch (error) { settle(false); throw error; }
}

export function invalidateFriendship(token, userId) {
  invalidatePeoplePages(token);
  markFriendsCacheDirty(userId);
  const base = getApiBaseUrl();
  for (const path of ['friends', 'friend-requests']) invalidateTabRead(tabReadKey(`${base}/users/${path}`, token));
  window.dispatchEvent(new Event('taspe7:friends-push'));
}
