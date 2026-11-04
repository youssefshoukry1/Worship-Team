/* eslint-disable @typescript-eslint/no-require-imports -- Node test entry point. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/onlineBibleSearch.js'), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function fixture(load) {
  let time = 1000, calls = 0;
  const context = { TextEncoder, Date: { now: () => time, parse: Date.parse }, axios: { get: async (...args) => { calls++; return load(...args); } } };
  vm.runInNewContext(source + ';globalThis.search=searchOnlineBible;', context);
  return { search: (q = 'query', translation = 'AVD', options) => context.search('https://api.test/bible', q, translation, options),
    advance(ms) { time += ms; }, calls: () => calls };
}

test('recent public results are reused and exact query spelling and translation remain separate', async () => {
  const f = fixture(async (url, options) => ({ data: [{ text: options.params.q, translation: options.params.translation }] }));
  const first = await f.search('  Test  ');
  assert.equal(await f.search('Test'), first); assert.equal(f.calls(), 1);
  await f.search('test'); await f.search('Test', 'KEH'); assert.equal(f.calls(), 3);
  f.advance(10001); await f.search('Test'); assert.equal(f.calls(), 4);
});

test('failed and malformed responses are never cached; the existing request timeout and signal are retained', async () => {
  let attempt = 0; const controller = new AbortController();
  const f = fixture(async (url, options) => {
    assert.equal(options.timeout, 8000); assert.equal(options.signal, controller.signal);
    if (++attempt === 1) throw Error('offline');
    return { data: attempt === 2 ? { invalid: true } : [] };
  });
  await assert.rejects(f.search('query', 'AVD', { signal: controller.signal }), /offline/);
  await assert.rejects(f.search('query', 'AVD', { signal: controller.signal }), /Invalid Bible/);
  assert.equal((await f.search('query', 'AVD', { signal: controller.signal })).length, 0);
  await f.search('query'); assert.equal(f.calls(), 3);
});

test('Retry-After pauses repeated API calls during overload and allows recovery afterwards', async () => {
  let overloaded = true;
  const f = fixture(async () => {
    if (overloaded) throw Object.assign(Error('busy'), { response: { status: 503, headers: { 'retry-after': '2' } } });
    return { data: [] };
  });
  await assert.rejects(f.search(), /busy/); overloaded = false;
  await assert.rejects(f.search('different'), { status: 503 }); assert.equal(f.calls(), 1);
  f.advance(2001); await f.search('different'); assert.equal(f.calls(), 2);
});

test('aborted requests never populate the result cache even if their transport completes late', async () => {
  let release; const response = new Promise(resolve => { release = resolve; });
  const f = fixture(() => response), controller = new AbortController();
  const pending = f.search('query', 'AVD', { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort(); release({ data: [] }); await rejected;
  await f.search(); assert.equal(f.calls(), 2);
});

test('client cache evicts old entries and skips oversized responses', async () => {
  const f = fixture(async (url, options) => ({ data: [{ text: options.params.q === 'large' ? 'x'.repeat(140000) : options.params.q }] }));
  for (let i = 0; i < 33; i++) await f.search(String(i));
  await f.search('0'); assert.equal(f.calls(), 34);
  await f.search('large'); await f.search('large'); assert.equal(f.calls(), 36);
});
