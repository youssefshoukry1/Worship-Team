const DAY = 24 * 60 * 60 * 1000;
const RETURN_AFTER = 7 * DAY;
const RETURN_WINDOW = DAY;
const OPENING_COOLDOWN = 12 * 60 * 60 * 1000;
const CHAPTER_WINDOW = 30 * 60 * 1000;
const CHAPTER_THRESHOLD = 4;
const STORAGE_PREFIX = 'wasla_ai_activity_v1:';

function timestamp(value) {
  if (!value) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export function firstRealName(name) {
  if (typeof name !== 'string') return '';
  const clean = name.trim().replace(/\s+/g, ' ');
  // Only profile.Name is supplied here; never infer a name from a handle or email.
  if (!clean || clean.length > 120 || !/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(clean)) return '';
  const words = clean.split(' ');
  const first = words[0] === 'عبد' && words[1] ? words.slice(0, 2).join(' ') : words[0];
  if (/^(user|guest|anonymous|مستخدم|ضيف)$/iu.test(first)) return '';
  return first.length <= 40 ? first : '';
}

export function getChapterKey(bookName, chapter) {
  if (typeof bookName !== 'string' || !Number.isSafeInteger(chapter) || chapter < 1 || chapter > 200) return null;
  const book = bookName.trim().replace(/\s+/g, ' ');
  return book && book.length <= 80 ? `${book}:${chapter}` : null;
}

// Activity and up to three short openings stay on-device; no verse text or full answer is stored.
export function planActivity(previous = {}, { realName, chapterKey = null, allowOpening = false } = {}, now = Date.now()) {
  const lastActive = timestamp(previous.lastActiveAt);
  const lastOpening = timestamp(previous.lastOpeningAt);
  let returnDetected = timestamp(previous.returnDetectedAt);
  if (lastActive !== null && now - lastActive >= RETURN_AFTER) returnDetected = now;
  if (returnDetected !== null && (now - returnDetected > RETURN_WINDOW || returnDetected > now)) returnDetected = null;

  const next = { ...previous, lastActiveAt: Math.max(now, lastActive ?? now), returnDetectedAt: returnDetected };
  if (chapterKey) {
    const started = timestamp(previous.chapterWindowAt);
    const sameWindow = previous.chapterKey === chapterKey && started !== null && now >= started && now - started < CHAPTER_WINDOW;
    next.chapterKey = chapterKey;
    next.chapterWindowAt = sameWindow ? started : now;
    next.chapterCount = sameWindow ? (previous.chapterCount || 0) + 1 : 1;
  }

  const name = firstRealName(realName);
  const cooledDown = lastOpening === null || now - lastOpening >= OPENING_COOLDOWN;
  let openingContext = null;
  if (allowOpening && name && cooledDown) {
    if (returnDetected !== null) {
      openingContext = { kind: 'return', firstName: name };
      next.returnDetectedAt = null;
    } else if (chapterKey && next.chapterCount >= CHAPTER_THRESHOLD) {
      openingContext = { kind: 'chapter', firstName: name };
    }
    if (openingContext) {
      openingContext.recentOpenings = Array.isArray(previous.recentOpenings) ? previous.recentOpenings.slice(-3) : [];
      next.lastOpeningAt = now;
    }
  }
  return { next, openingContext };
}

async function withLocalActivity(userId, operation) {
  if (!userId || typeof window === 'undefined') return null;
  const key = `${STORAGE_PREFIX}${userId}`;
  const update = () => {
    let previous = {};
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) previous = parsed;
      } catch { /* A broken record starts fresh without inventing an absence. */ }
    }
    const { next, result = null } = operation(previous, Date.now());
    window.localStorage.setItem(key, JSON.stringify(next));
    return result;
  };
  try {
    // Serialize updates across tabs where supported; no network or background polling.
    if (window.navigator?.locks?.request) return await window.navigator.locks.request(key, update);
    return update();
  } catch {
    return null;
  }
}

export function recordLocalAppActivity(userId) {
  return withLocalActivity(userId, (previous, now) => planActivity(previous, {}, now));
}

export function prepareLocalAiOpening({ userId, realName, bookName, chapter }) {
  return withLocalActivity(userId, (previous, now) => {
    const { next } = planActivity(previous, {}, now);
    if (previous.pendingOpening?.until > now) return { next };
    const { openingContext } = planActivity(next, { realName, chapterKey: getChapterKey(bookName, chapter), allowOpening: true }, now);
    if (!openingContext) return { next };
    const id = window.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`;
    next.pendingOpening = { id, until: now + 5 * 60 * 1000, kind: openingContext.kind };
    return { next, result: { id, context: openingContext } };
  });
}

export function completeLocalAiRequest({ userId, bookName, chapter, reservationId, generatedOpening }) {
  return withLocalActivity(userId, (previous, now) => {
    const { next } = planActivity(previous, { chapterKey: getChapterKey(bookName, chapter) }, now);
    const pending = previous.pendingOpening;
    let opening = '';
    if (reservationId && pending?.id === reservationId) {
      const text = typeof generatedOpening === 'string' ? generatedOpening.trim() : '';
      if (pending.until > now && text && text.length <= 120 && !/[\r\n]/.test(text)) {
        opening = text;
        next.lastOpeningAt = now;
        if (pending.kind === 'return') next.returnDetectedAt = null;
        const recent = Array.isArray(previous.recentOpenings) ? previous.recentOpenings : [];
        next.recentOpenings = [...recent, text].slice(-3);
      }
      delete next.pendingOpening;
    }
    return { next, result: opening };
  });
}

export function cancelLocalAiOpening(userId, reservationId) {
  if (!reservationId) return Promise.resolve(null);
  return withLocalActivity(userId, previous => {
    const next = { ...previous };
    if (next.pendingOpening?.id === reservationId) delete next.pendingOpening;
    return { next };
  });
}
