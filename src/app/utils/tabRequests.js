// Session-only cache for repeatable GETs. Writes, prayer delivery/acknowledgement
// and version synchronization deliberately do not use this cache.
export const TAB_READ_FRESH_MS = 15000;
const reads = new Map();

export const tabReadKey = (url, token = '') => JSON.stringify([url, token]);

function cancelled() {
  const error = new Error('Read superseded');
  error.name = 'AbortError';
  return error;
}

export function invalidateTabRead(key) {
  const entry = reads.get(key);
  reads.delete(key);
  entry?.controller?.abort();
}

export function readTabResource(key, load, { force = false, maxAge = TAB_READ_FRESH_MS, onSuccess } = {}) {
  const previous = reads.get(key);
  if (previous?.pending) {
    if (!force) return previous.pending;
    // A focus/push refresh must observe changes that may have arrived after
    // the active GET started. Coalesce those signals into one fresh follow-up.
    if (!previous.followUp) {
      previous.followUp = previous.pending.catch(() => {}).then(() =>
        readTabResource(key, load, { force: true, maxAge, onSuccess }));
    }
    return previous.followUp;
  }
  if (!force && previous?.value !== undefined && Date.now() - previous.updatedAt < maxAge) return Promise.resolve(previous.value);

  // Bound session memory while keeping active work available to new views.
  if (reads.size >= 64) {
    const oldest = [...reads].find(([, entry]) => !entry.pending);
    if (oldest) reads.delete(oldest[0]);
  }
  const entry = { ...previous, controller: new AbortController(), followUp: null };
  reads.set(key, entry);
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { entry.controller.abort(); reject(new Error('Read timed out')); }, 20000);
  });
  entry.pending = Promise.race([Promise.resolve().then(() => load(entry.controller.signal)), deadline])
    .then(value => {
      if (reads.get(key) !== entry || entry.controller.signal.aborted) throw cancelled();
      entry.value = value;
      entry.updatedAt = Date.now();
      onSuccess?.(value);
      return value;
    }).finally(() => {
      clearTimeout(timer);
      entry.pending = null;
      entry.controller = null;
      // Delivery payloads may contain audio: callers using maxAge: 0 share
      // only the active read and leave no response body in the session cache.
      if (reads.get(key) === entry && (entry.value === undefined || maxAge <= 0)) reads.delete(key);
    });
  return entry.pending;
}

export async function fetchTabJson(url, token, signal) {
  const response = await fetch(url, { signal, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });
  if (!response.ok) {
    const error = new Error(`Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function readTabJson(url, token, options) {
  return readTabResource(tabReadKey(url, token), signal => fetchTabJson(url, token, signal), options);
}
