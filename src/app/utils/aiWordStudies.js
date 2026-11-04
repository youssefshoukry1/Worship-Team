const normalize = value => value.normalize('NFKC').replace(/[\p{M}\u0640]/gu, '');

// Render only text and known spans. Model output is never interpreted as HTML or Markdown.
export function aiStudyTextSegments(text, studies) {
  const ranges = [];
  const seen = new Set();
  for (const study of Array.isArray(studies) ? studies.slice(0, 2) : []) {
    if (!study || typeof study.word !== 'string' || typeof study.original !== 'string' || typeof study.meaning !== 'string'
      || !study.meaning || !text.includes(study.meaning) || !['hebrew', 'greek'].includes(study.language)) continue;
    const key = normalize(study.word);
    if (!/^\p{Script=Arabic}+$/u.test(key) || seen.has(key)) continue;
    const match = Array.from(text.matchAll(/[\p{L}\p{M}\u0640]+/gu)).find(match => normalize(match[0]) === key);
    if (!match) continue;
    const originalIndex = study.original ? text.indexOf(study.original, match.index + match[0].length) : -1;
    if (originalIndex < 0) continue;
    ranges.push({ start: match.index, end: match.index + match[0].length, kind: 'word' });
    ranges.push({ start: originalIndex, end: originalIndex + study.original.length, kind: 'original', language: study.language });
    seen.add(key);
  }
  ranges.sort((a, b) => a.start - b.start);
  const segments = [];
  let offset = 0;
  for (const range of ranges) {
    if (range.start < offset) continue;
    if (range.start > offset) segments.push({ text: text.slice(offset, range.start), kind: 'text' });
    segments.push({ text: text.slice(range.start, range.end), kind: range.kind, language: range.language });
    offset = range.end;
  }
  if (offset < text.length) segments.push({ text: text.slice(offset), kind: 'text' });
  return segments;
}
