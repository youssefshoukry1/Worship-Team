const DEFAULT_API_BASE = 'https://worship-team-api.onrender.com/api';

function ensureApiSuffix(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_BASE;

  // If base is domain-only (or missing /api), append /api so backend routes match.
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

export function getApiBaseUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    DEFAULT_API_BASE;

  return ensureApiSuffix(fromEnv);
}

export function getApiBaseCandidates() {
  const withApi = getApiBaseUrl();
  const withoutApi = withApi.replace(/\/api$/i, '');
  return withoutApi !== withApi ? [withApi, withoutApi] : [withApi];
}
