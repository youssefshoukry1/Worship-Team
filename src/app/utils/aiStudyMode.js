const STORAGE_PREFIX = 'wasla_ai_study_mode_v1:';
const CHANGE_EVENT = 'wasla:ai-study-mode';
const memory = new Map();

function preferenceKey(userId) {
  return typeof userId === 'string' && userId.trim() ? `${STORAGE_PREFIX}${userId.trim()}` : null;
}

export function readAiStudyMode(userId) {
  const key = preferenceKey(userId);
  if (!key || typeof window === 'undefined') return 'normal';
  if (memory.has(key)) return memory.get(key);
  try {
    const value = window.localStorage.getItem(key);
    return value === 'old_man' ? 'old_man' : 'normal';
  } catch {
    return memory.get(key) || 'normal';
  }
}

export function saveAiStudyMode(userId, mode) {
  const key = preferenceKey(userId);
  if (!key || !['normal', 'old_man'].includes(mode) || typeof window === 'undefined') return;
  memory.set(key, mode);
  try { window.localStorage.setItem(key, mode); memory.delete(key); } catch { /* Keep the choice for this session if storage is blocked. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeAiStudyMode(callback) {
  if (typeof window === 'undefined') return () => {};
  const changedInAnotherTab = event => { if (!event.key || event.key.startsWith(STORAGE_PREFIX)) callback(); };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', changedInAnotherTab);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', changedInAnotherTab);
  };
}
