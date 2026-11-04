const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/aiJourney.js'), 'utf8').replaceAll('export function', 'function');
const context = {};
vm.runInNewContext(source + ';globalThis.api = {buildAiNearbyVerses, readAiJourney};', context);
const { buildAiNearbyVerses, readAiJourney } = context.api;

test('nearby context uses at most four adjacent verses, excluding selected ones', () => {
    const verses = Array.from({ length: 12 }, (_, i) => ({ _id: `v${i + 1}`, verseNumber: i + 1, text: `نص ${i + 1}` }));
    const value = buildAiNearbyVerses(verses, new Set(['v5']));
    assert.deepEqual(Array.from(value, verse => verse.verseNumber), [3, 4, 6, 7]);
    assert.equal(buildAiNearbyVerses(verses, new Set()).length, 0);
    assert.equal(buildAiNearbyVerses(verses, new Set(verses.map(verse => verse._id))).length, 0);
});
test('unsupported map shapes and non-final destinations do not render', () => {
    const stop = { place: 'مكان', description: 'انتقل منه', reference: 'يوحنا 4:3', kind: 'stop' };
    for (const value of [null, {}, { stops: [] }, { stops: [stop] }, { stops: [null, stop] },
        { stops: [{ ...stop, kind: 'destination' }, stop] }, { stops: [{ ...stop, place: '<svg>' }, stop] }]) assert.equal(readAiJourney(value), null);
    assert.equal(readAiJourney({ stops: [stop, { ...stop, place: 'مكان آخر', kind: 'destination' }] }).stops.length, 2);
});
