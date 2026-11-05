/* eslint-disable @typescript-eslint/no-require-imports -- Node regression suite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/app/utils/aiResponseError.js'), 'utf8').replace('export function', 'function') + ';globalThis.read = readAiResponseError;', context);

test('only actual daily allowance errors show the subscription controls', () => {
    for (const data of [{ code: 'AI_DAILY_LIMIT', message: 'Limit reached' }, { quota: { remaining: 0 }, message: 'Limit reached' }]) {
        assert.equal(context.read({ response: { status: 429, data } }).isLimit, true);
    }
    for (const status of [429, 503, 504]) {
        const value = context.read({ response: { status, data: { code: 'AI_PROVIDER_BUSY', message: 'Try later' } } });
        assert.equal(value.isLimit, false);
        assert.equal(value.message, 'Try later');
    }
});

test('missing or malformed error data still gives a readable message without crashing', () => {
    for (const error of [undefined, {}, { response: { data: { message: {} } } }, { code: 'ECONNABORTED' }]) {
        const value = context.read(error);
        assert.equal(typeof value.message, 'string');
        assert.ok(value.message.length > 0);
        assert.equal(value.isLimit, false);
    }
});
