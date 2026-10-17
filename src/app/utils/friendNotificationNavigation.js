const FRIEND_TABS = { FRIEND_REQUEST_RECEIVED: 'requests', FRIEND_REQUEST_ACCEPTED: 'friends' };

export function friendNotificationHref(data) {
  if (!Object.prototype.hasOwnProperty.call(FRIEND_TABS, data?.type)) return null;
  const query = new URLSearchParams({ notificationType: data.type });
  if (typeof data.actorId === 'string' && data.actorId.trim()) query.set('actorId', data.actorId.trim());
  return `/friends/?${query}`;
}

export function readFriendNotificationTarget(search) {
  const query = new URLSearchParams(search);
  const type = query.get('notificationType');
  return Object.prototype.hasOwnProperty.call(FRIEND_TABS, type)
    ? { type, tab: FRIEND_TABS[type], actorId: query.get('actorId') || '' } : null;
}
