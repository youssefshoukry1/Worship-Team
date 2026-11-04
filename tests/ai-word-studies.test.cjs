const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/aiWordStudies.js'), 'utf8').replace('export function', 'function');
const context = {};
vm.runInNewContext(source + ';globalThis.split = aiStudyTextSegments;', context);
const study = { word: 'الناموس', original: 'תּוֹרָה', language: 'hebrew', meaning: 'تعليم يوجه الحياة' };
const text = 'يوضح النَّاموس (بالعبرية: תּוֹרָה — تعليم يوجه الحياة) المعنى، ويذكر الناموس مجدداً.';

test('highlights only the first complete Arabic word and isolates its original script without changing text', () => {
    const parts = context.split(text, [study]);
    assert.equal(parts.map(part => part.text).join(''), text);
    assert.equal(parts.filter(part => part.kind === 'word').length, 1);
    assert.equal(parts.find(part => part.kind === 'word').text, 'النَّاموس');
    assert.equal(parts.find(part => part.kind === 'original').language, 'hebrew');
    assert.equal(parts.find(part => part.kind === 'original').text, study.original);
});

test('no word is highlighted without a complete inline study or for a partial match', () => {
    for (const [body, metadata] of [[text, []], [text, null], [text, [null, {}]], ['المحبة فقط', [{ word: 'محبة', original: 'ἀγάπη', language: 'greek', meaning: 'محبة' }]],
        ['الناموس فقط', [study]], [text, [{ ...study, meaning: 'غير موجود' }]]]) {
        const parts = context.split(body, metadata);
        assert.equal(parts.map(part => part.text).join(''), body);
        assert.equal(parts.filter(part => part.kind === 'word').length, 0);
    }
});

test('duplicate metadata is ignored and HTML-like text is preserved as plain text segments', () => {
    const body = '<img src=x onerror=alert(1)> ' + text;
    const parts = context.split(body, [study, study]);
    assert.equal(parts.filter(part => part.kind === 'word').length, 1);
    assert.equal(parts[0].text.includes('<img'), true);
    assert.equal(parts.map(part => part.text).join(''), body);
});
