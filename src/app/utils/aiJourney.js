export function buildAiNearbyVerses(verses, selectedIds) {
  const numbers = verses.filter(verse => selectedIds.has(verse._id)).map(verse => Number(verse.verseNumber));
  if (!numbers.length) return [];
  return verses.filter(verse => !selectedIds.has(verse._id) && typeof verse.text === 'string'
    && numbers.some(number => Math.abs(Number(verse.verseNumber) - number) <= 2))
    .map(verse => ({ verseNumber: Number(verse.verseNumber), text: verse.text }))
    .filter(verse => Number.isSafeInteger(verse.verseNumber) && verse.text.length <= 800)
    .sort((a, b) => Math.min(...numbers.map(number => Math.abs(a.verseNumber - number)))
      - Math.min(...numbers.map(number => Math.abs(b.verseNumber - number))) || a.verseNumber - b.verseNumber)
    .slice(0, 4).sort((a, b) => a.verseNumber - b.verseNumber);
}

export function readAiJourney(value) {
  if (!value || !Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > 5) return null;
  const valid = value.stops.every((stop, index) => stop && ['stop', 'destination'].includes(stop.kind)
    && (stop.kind !== 'destination' || index === value.stops.length - 1)
    && [['place', 48], ['description', 90], ['reference', 80]].every(([key, max]) => typeof stop[key] === 'string'
      && stop[key].trim() && stop[key].length <= max && !/[<>\u0000-\u001f]/u.test(stop[key])));
  return valid ? { stops: value.stops.map(({ place, description, reference, kind }) => ({ place, description, reference, kind })) } : null;
}
