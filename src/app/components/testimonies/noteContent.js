export const NOTE_CHARACTER_LIMIT = 1200;

export function noteContentLength({ title = '', body = '', verse } = {}) {
  const text = body.trim();
  const heading = title.trim();
  return text.length + (text.startsWith(heading) ? 0 : heading.length)
    + (verse?.text?.trim().length || 0) + (verse?.reference?.trim().length || 0);
}
