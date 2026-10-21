import { checkCancelled, forEachChunked, sortChunked } from './cooperativeWork';

const libraries = new WeakMap();
const searchText = new WeakMap();
const categoryNames = new WeakMap();
const MAX_RESULTS = 12;

export function normalizeHymnText(text) {
  if (!text) return '';
  return text.toString().toLowerCase().trim()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim();
}

function categoryKey(value) {
  const key = String(value || 'all').toLowerCase().trim();
  return key === 'christmass' ? 'christmas' : key;
}

function matchesCategory(hymn, category) {
  if (category === 'all') return true;
  let names = categoryNames.get(hymn);
  if (!names) {
    names = (Array.isArray(hymn.party) ? hymn.party : hymn.party ? [hymn.party] : []).map(categoryKey);
    categoryNames.set(hymn, names);
  }
  return names.includes(category);
}

function textFor(hymn) {
  let text = searchText.get(hymn);
  if (!text) {
    const lyrics = typeof hymn.lyrics === 'string' ? hymn.lyrics
      : Array.isArray(hymn.lyrics) ? hymn.lyrics.map(line => line.text).join(' ') : '';
    text = { title: normalizeHymnText(hymn.title || ''), lyrics: normalizeHymnText(lyrics) };
    searchText.set(hymn, text);
  }
  return text;
}

function libraryFor(hymns) {
  let library = libraries.get(hymns);
  if (!library) {
    library = { results: new Map(), popular: null };
    libraries.set(hymns, library);
  }
  return library;
}

function resultKey(category, query, presentation) {
  return JSON.stringify([categoryKey(category), normalizeHymnText(query), Boolean(query?.trim()), presentation]);
}

export function readLocalHymnsResult(hymns, options = {}) {
  return libraries.get(hymns)?.results.get(resultKey(options.category, options.query, Boolean(options.presentation)));
}

// Cache immutable rows, not IDs: edits and incremental sync replace row objects,
// so changed lyrics/category/popularity can never reuse an older search entry.
export async function selectLocalHymns(hymns, { category = 'all', query = '', presentation = false, signal } = {}) {
  checkCancelled(signal);
  const library = libraryFor(hymns);
  const key = resultKey(category, query, presentation);
  if (library.results.has(key)) return library.results.get(key);
  const target = categoryKey(category);
  const normalized = normalizeHymnText(query);
  const hasQuery = Boolean(query.trim());
  if (hasQuery && !normalized) return [];
  let source = hymns;
  if (!hasQuery && !presentation) {
    if (!library.popular) {
      library.popular = sortChunked(hymns, (a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .catch(error => { library.popular = null; throw error; });
    }
    source = await library.popular;
  }
  checkCancelled(signal);
  const matches = [];
  await forEachChunked(source, hymn => {
    if (!matchesCategory(hymn, target)) return;
    if (!hasQuery) { matches.push({ hymn, score: 0 }); return; }
    const text = textFor(hymn);
    if (presentation) {
      if (text.title.includes(normalized) || text.lyrics.includes(normalized)) matches.push({ hymn, score: 0 });
      if (matches.length === 15) return false;
      return;
    }
    let score = text.title === normalized ? 500 : text.title.startsWith(normalized) ? 200 : text.title.includes(normalized) ? 100 : 0;
    if (text.lyrics.includes(normalized)) score += 40;
    if (score > 0) score += Math.log10((hymn.usageCount || 0) + 1) * 20;
    if (score > 0) matches.push({ hymn, score });
  }, { signal });
  const ranked = hasQuery && !presentation ? await sortChunked(matches, (a, b) => b.score - a.score, { signal }) : matches;
  const unique = new Map();
  await forEachChunked(ranked, ({ hymn }) => { unique.set(hymn._id, hymn); }, { signal });
  const result = presentation ? ranked.map(({ hymn }) => hymn) : [...unique.values()];
  checkCancelled(signal);
  library.results.set(key, result);
  if (library.results.size > MAX_RESULTS) library.results.delete(library.results.keys().next().value);
  return result;
}
