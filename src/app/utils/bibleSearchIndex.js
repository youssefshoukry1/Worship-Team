import { checkCancelled, forEachChunked } from './cooperativeWork';

export function normalizeBibleText(text) {
  return text.replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا')
    .replace(/[ىي]/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
}

function packed(values, max) {
  return max <= 65535 ? Uint16Array.from(values) : Uint32Array.from(values);
}

// Source order is the tie breaker, even for unsorted bundled/legacy downloads.
// Tokens retain their whitespace so exact multi-word and partial-word phrases
// can be checked without storing a second copy of every verse's original text.
export async function buildBibleSearchIndex(rows) {
  const dictionary = [], tokenIds = new Map(), lists = [], stream = [];
  const starts = new Uint32Array(rows.length + 1);
  const chapterKeys = [], chapters = new Map(), chapterRows = [];
  const chapterIds = [], offsets = new Uint32Array(rows.length);
  await forEachChunked(rows, (verse, doc) => {
    const chapterKey = encodeURIComponent(verse.bookName) + '/' + verse.chapter;
    if (!chapters.has(chapterKey)) {
      chapters.set(chapterKey, chapterKeys.length);
      chapterKeys.push(chapterKey);
      chapterRows.push([]);
    }
    const chapter = chapters.get(chapterKey);
    chapterIds.push(chapter);
    chapterRows[chapter].push(doc);
    const text = normalizeBibleText((verse.cleanText || '') + ' ' + (verse.text || ''));
    starts[doc] = stream.length;
    for (const token of text.match(/\S+\s*|\s+/g) || []) {
      let id = tokenIds.get(token);
      if (id === undefined) {
        id = dictionary.length;
        dictionary.push(token);
        tokenIds.set(token, id);
        lists.push([]);
      }
      stream.push(id);
      const list = lists[id];
      if (list[list.length - 1] !== doc) list.push(doc);
    }
  });
  starts[rows.length] = stream.length;
  let maxOffset = 0;
  await forEachChunked(chapterRows, docs => {
    docs.sort((a,b) => rows[a].verseNumber - rows[b].verseNumber);
    docs.forEach((doc, position) => { offsets[doc] = position; });
    maxOffset = Math.max(maxOffset, docs.length - 1);
  });
  const postingStarts = new Uint32Array(lists.length + 1);
  let count = 0;
  for (let i = 0; i < lists.length; i++) {
    postingStarts[i] = count;
    count += lists[i].length;
  }
  postingStarts[lists.length] = count;
  const postings = rows.length <= 65536 ? new Uint16Array(count) : new Uint32Array(count);
  await forEachChunked(lists, (docs,i) => postings.set(docs, postingStarts[i]));
  return { dictionary, stream: packed(stream, dictionary.length - 1), starts, postingStarts, postings,
    chapterKeys, chapterIds: packed(chapterIds, chapterKeys.length - 1), offsets: packed(offsets, maxOffset) };
}

export function validBibleSearchIndex(index, verseCount) {
  return index?.chapterIds?.length === verseCount && index.offsets?.length === verseCount &&
    Array.isArray(index.chapterKeys) && Array.isArray(index.dictionary) &&
    index.starts?.length === verseCount + 1 && index.stream?.length === index.starts[verseCount] &&
    index.postingStarts?.length === index.dictionary.length + 1 &&
    index.postings?.length === index.postingStarts[index.dictionary.length];
}

export async function findBibleSearchHits(index, phrase, words, signal) {
  const { dictionary, stream, starts, postingStarts, postings, chapterIds } = index;
  const scores = new Uint32Array(chapterIds.length);
  const seen = new Uint32Array(chapterIds.length);
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    await forEachChunked(dictionary, (token, id) => {
      if (!token.includes(words[wordIndex])) return;
      for (let i = postingStarts[id]; i < postingStarts[id + 1]; i++) {
        const doc = postings[i];
        if (seen[doc] !== wordIndex + 1) {
          seen[doc] = wordIndex + 1;
          scores[doc]++;
        }
      }
    }, {signal});
  }
  // Among all-word candidates, an exact phrase outranks every other result.
  // Partial matches only need the highest score buckets (up to 50 per score).
  const phrases = [], buckets = new Map();
  await forEachChunked(scores, (score, doc) => {
    if (!score) return;
    if (score === words.length) {
      let exact = words.length === 1 && words[0] === phrase;
      if (!exact) {
        let text = '';
        for (let i = starts[doc]; i < starts[doc + 1]; i++) text += dictionary[stream[i]];
        exact = text.includes(phrase);
      }
      if (exact) {
        phrases.push(doc);
        if (phrases.length === 50) return false;
      }
    }
    if (!phrases.length) {
      if (!buckets.has(score)) buckets.set(score, []);
      if (buckets.get(score).length < 50) buckets.get(score).push(doc);
    }
  }, {signal});
  checkCancelled(signal);
  if (phrases.length) return phrases;
  if (buckets.has(words.length)) return buckets.get(words.length);
  return [...buckets.keys()].sort((a,b) => b-a).flatMap(score => buckets.get(score)).slice(0,50);
}
