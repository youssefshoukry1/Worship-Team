/* eslint-disable @typescript-eslint/no-require-imports -- Node test and benchmark entry points use CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/bibleProfileGroups.js'), 'utf8').replace(/^export /gm, '');
const api = vm.runInNewContext(source + ';({groupHighlights,groupNotes})');
const plain = value => JSON.parse(JSON.stringify(value));
const item = (id, seconds, extra = {}) => ({ _id: id, verseId: `verse-${id}`, bookName: 'John', chapter: 1, color: 'blue', note: 'Prayer', verseNumber: Number(id) || 1, date: new Date(1700000000000 + seconds * 1000).toISOString(), text: `Text ${id}`, ...extra });

test('group windows remain anchored to the first item, exclude exactly 60 seconds, and sort verses without mutating input', () => {
  const entries = [item('3', 60), item('1', 0, { verseNumber: 3 }), item('2', 59, { verseNumber: 1 }), item('4', 119)];
  const before = plain(entries);
  for (const group of [api.groupHighlights(entries), api.groupNotes(entries)]) {
    assert.equal(group.length, 2);
    assert.deepEqual(plain(group.map(g => g.verseIds)), [['verse-3', 'verse-4'], ['verse-1', 'verse-2']]);
    assert.deepEqual(plain(group[1].verses.map(v => v.verseNumber)), [1, 3]);
    assert.deepEqual(plain(group[1].verseNumbers), [3, 1]);
  }
  assert.deepEqual(plain(api.groupNotes(entries)[1].noteIds), ['1', '2']);
  assert.deepEqual(plain(entries), before);
});

test('book, chapter, color and exact note values separate groups; missing IDs retain verse fallback', () => {
  const entries = [item('1', 0), item('2', 1, { chapter: 2 }), item('3', 2, { bookName: 'Mark' }), item('4', 3, { color: 'red', note: 'Other' }), item('5', 4, { color: null, note: null }), item('6', 5, { color: undefined, note: undefined, _id: undefined })];
  assert.equal(api.groupHighlights(entries).length, 6);
  const groups = api.groupNotes(entries);
  assert.equal(groups.length, 6);
  assert.equal(groups[0]._id, 'verse-6');
  assert.deepEqual(plain(groups[0].noteIds), []);
});

test('reuses an immutable array result and recomputes for replacement arrays after edits', () => {
  const entries = [item('1', 0), item('2', 1)];
  const grouped = api.groupNotes(entries);
  assert.equal(api.groupNotes(entries), grouped);
  const edited = entries.map(entry => ({ ...entry, note: entry._id }));
  assert.equal(api.groupNotes(edited).length, 2);
  assert.equal(grouped.length, 1);
  assert.deepEqual(plain(api.groupNotes(null)), []);
});

test('large collections preserve all IDs, chronological groups and separate note/highlight caches', () => {
  const entries = Array.from({ length: 5000 }, (_, i) => item(String(i + 1), i * 61));
  const highlights = api.groupHighlights(entries), notes = api.groupNotes(entries);
  assert.equal(highlights.length, entries.length); assert.equal(notes.length, entries.length);
  assert.equal(highlights[0]._id, '5000'); assert.equal(highlights.at(-1)._id, '1');
  assert.equal(notes[0].note, 'Prayer'); assert.equal(highlights[0].color, 'blue');
  assert.equal(new Set(notes.flatMap(group => group.noteIds)).size, entries.length);
});

test('malformed legacy dates preserve first matching groups even when stable-sort ties interrupt date order', () => {
  const entries = [item('1', 0), item('2', 0, { date: 'invalid' }), item('3', 121), item('4', 1)];
  // Preserve the previous algorithm's result for an arbitrary unsorted legacy
  // stream, including its stable ordering around invalid date comparisons.
  function reference(field) {
    const groups = [];
    for (const entry of [...entries].sort((a, b) => new Date(a.date) - new Date(b.date))) {
      let group = groups.find(g => g.value === entry[field] && Math.abs(new Date(g.date) - new Date(entry.date)) < 60000);
      if (!group) groups.push(group = { date: entry.date, value: entry[field], ids: [] });
      group.ids.push(entry.verseId);
    }
    return groups.sort((a, b) => new Date(b.date) - new Date(a.date)).map(g => g.ids);
  }
  assert.deepEqual(plain(api.groupHighlights(entries).map(g => g.verseIds)), reference('color'));
  assert.deepEqual(plain(api.groupNotes(entries).map(g => g.verseIds)), reference('note'));
});
