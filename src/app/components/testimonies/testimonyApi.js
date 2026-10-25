import { getApiBaseUrl } from '../../utils/apiBase';

export async function testimonyRequest(token, path = '', options = {}) {
  const response = await fetch(`${getApiBaseUrl()}/users/testimonies${path}`, {
    ...options,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
  return data;
}

export function announceTestimonyChange() {
  window.dispatchEvent(new Event('taspe7:testimonies-changed'));
}

export function profileHref(userId) {
  return `/friend-profile?user=${encodeURIComponent(userId)}`;
}

export function remainingTime(expiresAt, now = Date.now()) {
  const minutes = Math.ceil((new Date(expiresAt).getTime() - now) / 60000);
  if (minutes <= 0) return 'Saved on profile';
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.ceil(minutes / 60)}h left`;
}
