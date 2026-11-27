export function testimonyNotificationHref(data) {
  if (data?.type !== 'TESTIMONY_LOVED' || typeof data.testimonyId !== 'string' || !/^[a-f\d]{24}$/i.test(data.testimonyId)) return null;
  return `/friends/?note=${encodeURIComponent(data.testimonyId)}`;
}
