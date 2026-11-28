import { displayBookName } from './translationLanguages';

function normalize(value) {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}|ـ/gu, '')
    .replace(/ى/g, 'ي').replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 15))
    .trim().replace(/\s+/g, ' ');
}

export function parseBookReference(query, books) {
  const match = normalize(query).match(/^(.+?)(?:\s*(\d+)(?:\s*[:：]\s*(\d+))?)?$/u);
  if (!match) return null;
  const name = match[1].trim();
  const book = books.find(book => [book.bookName, displayBookName(book, 'KJV')]
    .some(label => label && normalize(label) === name));
  return book ? { book, chapter: Number(match[2] ?? 1), verse: match[3] ? Number(match[3]) : null } : null;
}
