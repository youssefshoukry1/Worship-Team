import { getApiBaseUrl } from '../../utils/apiBase';

export const NOTE_ACTIVE_MESSAGE = 'Share again when your note disappears.';

export async function testimonyRequest(token, path = '', options = {}) {
  const response = await fetch(`${getApiBaseUrl()}/users/testimonies${path}`, {
    ...options,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || 'Something went wrong. Please try again.'), { status: response.status, code: data.code, publishing: data.publishing });
  return data;
}

export function announceTestimonyChange(detail) {
  window.dispatchEvent(new CustomEvent('taspe7:testimonies-changed', { detail }));
}

export function profileHref(userId) {
  return `/normal_UserProfile?user=${encodeURIComponent(userId)}`;
}

