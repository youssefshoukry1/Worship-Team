import axios from 'axios';

// Public verse results only, kept briefly in memory. Keep exact query spelling:
// changing Arabic text or operators here could change server relevance.
const cache = new Map();
const cooldowns = new Map();
let bytes = 0;
const remove = key => {
  const entry = cache.get(key);
  if (entry) bytes -= entry.bytes;
  cache.delete(key);
};

export async function searchOnlineBible(base, query, translation, { signal } = {}) {
  signal?.throwIfAborted();
  const q = query.trim();
  const key = JSON.stringify([base, q, translation]);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached?.expires > now) {
    cache.delete(key); cache.set(key, cached);
    return cached.value;
  }
  remove(key);
  if ((cooldowns.get(base) || 0) > now) throw Object.assign(new Error('Search is busy'), { status: 503 });
  try {
    const { data } = await axios.get(`${base}/search`, { params: { q, translation }, signal, timeout: 8000 });
    signal?.throwIfAborted();
    if (!Array.isArray(data)) throw new Error('Invalid Bible search response');
    const size = new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if (size <= 128 * 1024) {
      while (cache.size && (cache.size >= 32 || bytes + size > 512 * 1024)) remove(cache.keys().next().value);
      cache.set(key, { value: data, bytes: size, expires: Date.now() + 10000 }); bytes += size;
    }
    return data;
  } catch (error) {
    if ([429, 503].includes(error.response?.status)) {
      const header = error.response.headers?.['retry-after'];
      const seconds = /^\d+$/.test(String(header)) ? Number(header) : (Date.parse(header) - Date.now()) / 1000;
      if (cooldowns.size >= 8) cooldowns.delete(cooldowns.keys().next().value);
      cooldowns.set(base, Date.now() + Math.max(1, Math.min(30, seconds || 1)) * 1000);
    }
    throw error;
  }
}
