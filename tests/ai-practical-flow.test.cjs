/* eslint-disable @typescript-eslint/no-require-imports -- Node regression suite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/aiPracticalFlow.js'), 'utf8')
    .replace(/^import .*;\r?\n/m, '').replaceAll('export function', 'function');
const journeySource = fs.readFileSync(path.join(__dirname, '../src/app/utils/aiJourney.js'), 'utf8').replaceAll('export function', 'function');
const context = {};
vm.runInNewContext(journeySource + '\n' + source + ';globalThis.read = readAiPracticalFlow; globalThis.diagrams = readAiResponseDiagrams;', context);
const read = context.read;

test('a practical flow preserves two or three ordered action titles and ignores extra fields', () => {
    const steps = [{ title: 'صلِّ', place: 'مكان لا يعرض' }, { title: 'راجع قرارك' }, { title: 'نفّذ بهدوء' }];
    for (const count of [2, 3]) assert.deepEqual(JSON.parse(JSON.stringify(read({ steps: steps.slice(0, count) }))),
        { steps: steps.slice(0, count).map(({ title }) => ({ title: title.normalize('NFKC') })) });
});

test('a geographic journey or invalid action flow cannot render as practical steps', () => {
    for (const value of [null, {}, { stops: [{ place: 'السامرة' }, { place: 'الجليل' }] },
        { steps: [] }, { steps: [{ title: 'صلِّ' }] }, { steps: [null, { title: 'صلِّ' }] },
        { steps: [{ title: 'صلِّ' }, { title: 'صلِّ!' }] },
        { steps: [{ title: '<svg>نص</svg>' }, { title: 'صلِّ' }] },
        { steps: [{ title: 'راجع\nقرارك' }, { title: 'صلِّ' }] },
        { steps: [{ title: 'هذه عبارة طويلة جداً لا تصلح عنواناً' }, { title: 'صلِّ' }] }
    ]) assert.equal(read(value), null);
});

test('response selection keeps practical actions separate from historical routes in both modes', () => {
    const payload = {
        practicalFlow: { steps: [{ title: 'تمهّل' }, { title: 'راجع قرارك' }] },
        journey: { stops: [
            { place: 'اليهودية', description: 'غادرها', reference: 'يوحنا 4:3', kind: 'stop' },
            { place: 'السامرة', description: 'مر بها', reference: 'يوحنا 4:4', kind: 'stop' }
        ] }
    };
    for (const type of ['explain', 'cross_reference', 'practical']) {
        const selected = context.diagrams(payload, type, 'old_man');
        assert.equal(Boolean(selected.practicalFlow), type === 'practical');
        assert.equal(Boolean(selected.journey), type === 'explain');
        assert.deepEqual(JSON.parse(JSON.stringify(context.diagrams(payload, type, 'normal'))), { journey: null, practicalFlow: null });
    }
});

test('invalid or missing action flow never falls back to a place map in practical responses', () => {
    const journey = { stops: [
        { place: 'اليهودية', description: 'غادرها', reference: 'يوحنا 4:3', kind: 'stop' },
        { place: 'السامرة', description: 'مر بها', reference: 'يوحنا 4:4', kind: 'stop' }
    ] };
    for (const practicalFlow of [undefined, { steps: [] }, journey]) {
        assert.deepEqual(JSON.parse(JSON.stringify(context.diagrams({ journey, practicalFlow }, 'practical', 'old_man'))), { journey: null, practicalFlow: null });
    }
});
