/**
 * Normalizes GET /api/bible/books rows.
 * Legacy aggregate returns { _id: "<Arabic book name>", bookNumber, testament }.
 * Newer API returns { bookName, bookNumber, testament }.
 */
export function normalizeBibleBookFromApi(row) {
  if (!row || typeof row !== 'object') return null;
  const fromName = row.bookName != null ? String(row.bookName).trim() : '';
  const fromId = row._id != null ? String(row._id).trim() : '';
  const bookName = fromName || fromId;
  if (!bookName) return null;
  const n = Number(row.bookNumber);
  return {
    bookName,
    bookNumber: Number.isFinite(n) ? n : 0,
    testament: row.testament,
  };
}

export function normalizeBibleBooksFromApi(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeBibleBookFromApi)
    .filter(Boolean)
    .sort((a, b) => a.bookNumber - b.bookNumber);
}
