const highlightsCache = new WeakMap();
const notesCache = new WeakMap();

function groupEntries(items, field, includeNoteIds, cache) {
  if (!items?.length) return [];
  if (cache.has(items)) return cache.get(items);
  const sorted = items.map(item => ({ item, time: new Date(item.date).getTime() })).sort((a, b) => a.time - b.time);
  const unordered = sorted.some(({ time }) => !Number.isFinite(time));
  const books = new Map();
  const groups = [];
  for (const { item, time } of sorted) {
    let chapters = books.get(item.bookName);
    if (!chapters) books.set(item.bookName, chapters = new Map());
    let values = chapters.get(item.chapter);
    if (!values) chapters.set(item.chapter, values = new Map());
    let bucket = values.get(item[field]);
    const matches = record => record.group.bookName === item.bookName && record.group.chapter === item.chapter
      && record.group[field] === item[field] && Math.abs(time - record.time) < 60000;
    // Invalid legacy dates are stable-sort ties and can interrupt chronological
    // order. Search only this key's bucket to retain its original grouping.
    let record = unordered ? bucket?.find(matches) : bucket?.at(-1);
    // Expired windows cannot match a later item in this ascending stream.
    if (!record || !matches(record)) {
      const group = { _id: item._id || item.verseId, verseIds: [], bookName: item.bookName, chapter: item.chapter,
        verseNumbers: [], [field]: item[field], date: item.date, verses: [], ...(includeNoteIds ? { noteIds: [] } : {}) };
      record = { group, time };
      if (!bucket) values.set(item[field], bucket = []);
      bucket.push(record);
      groups.push(record);
    }
    const group = record.group;
    if (includeNoteIds && item._id) group.noteIds.push(item._id);
    group.verseIds.push(item.verseId);
    group.verseNumbers.push(item.verseNumber);
    group.verses.push({ verseId: item.verseId, verseNumber: item.verseNumber, text: item.text, _id: item._id });
  }
  for (const { group } of groups) group.verses.sort((a, b) => a.verseNumber - b.verseNumber);
  groups.sort((a, b) => b.time - a.time);
  const result = groups.map(record => record.group);
  cache.set(items, result);
  return result;
}

export const groupHighlights = items => groupEntries(items, 'color', false, highlightsCache);
export const groupNotes = items => groupEntries(items, 'note', true, notesCache);
