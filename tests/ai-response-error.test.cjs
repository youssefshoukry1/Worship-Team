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

test('proxy, authentication, client timeout and device connection errors have distinct messages', () => {
    const errors = [400, 401, 403, 429, 500, 502, 503, 504].map(status => ({ response: { status, data: '<html>Proxy failure</html>' } }));
    errors.push({ code: 'ECONNABORTED' }, { code: 'ERR_NETWORK' }, { code: 'AI_INVALID_API_RESPONSE' });
    const messages = errors.map(error => context.read(error).message);
    assert.equal(new Set(messages).size, errors.length);
    for (const error of errors) assert.equal(context.read(error).isLimit, false);
    assert.match(messages[8], /مهلة اتصال جهازك/);
    assert.match(messages[9], /تحقق من الإنترنت/);
});

test('provider errors keep their precise server messages and show a bounded retry hint', () => {
    for (const [code, seconds, expected] of [
        ['AI_PROVIDER_RATE_LIMIT', 8, '8 ثانية'], ['AI_PROVIDER_BUSY', 90, '2 دقيقة'],
        ['AI_PROVIDER_CONNECTION_ERROR', 3, '3 ثانية']
    ]) {
        const value = context.read({ response: { status: 503, data: { code, retryable: true, retryAfterSeconds: seconds, message: 'سبب محدد.' } } });
        assert.ok(value.message.startsWith('سبب محدد.'));
        assert.ok(value.message.includes(expected));
        assert.equal(value.isLimit, false);
    }
    for (const data of [
        { code: 'AI_PROVIDER_QUOTA_EXHAUSTED', retryable: true }, { code: 'AI_PROVIDER_BILLING_LIMIT', retryable: false },
        { code: 'AI_PROVIDER_AUTHENTICATION', retryable: false }, { code: 'AI_PROVIDER_BUSY', retryable: true, retryAfterSeconds: 'invalid' }
    ]) {
        assert.equal(context.read({ response: { status: 503, data: { retryAfterSeconds: 60, ...data, message: 'سبب محدد.' } } }).message, 'سبب محدد.');
    }
});
