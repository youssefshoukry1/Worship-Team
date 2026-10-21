const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const api = {};
vm.runInNewContext(ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/app/services/controlApi.js'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText, { exports: api, require: () => ({ getApiBaseUrl: () => 'https://api.test/api' }) });

test('HTML 404 reports missing backend routes without trying to parse HTML as JSON', async () => {
    const response = new Response('<!DOCTYPE html><html>Cannot GET /api/ui-controls/admin</html>',
        { status: 404, headers: { 'content-type': 'text/html' } });
    await assert.rejects(() => api.readControlResponse(response, 'UI animation controls'), error => {
        assert.equal(error.status, 404);
        assert.match(error.message, /Deploy the backend update/);
        assert.doesNotMatch(error.message, /Unexpected token|DOCTYPE/);
        return true;
    });
});

test('auth status remains available even when the backend returns HTML', async () => {
    for (const status of [401, 403]) {
        await assert.rejects(() => api.readControlResponse(new Response('<html>Denied</html>', { status }), 'App controls'),
            error => error.status === status);
    }
});

test('successful HTML responses and malformed JSON produce readable configuration errors', async () => {
    for (const response of [
        new Response('<!DOCTYPE html><html>Frontend page</html>', { headers: { 'content-type': 'text/html' } }),
        new Response('not-json', { headers: { 'content-type': 'application/json' } }),
        new Response('null', { headers: { 'content-type': 'application/json' } }),
    ]) {
        await assert.rejects(() => api.readControlResponse(response, 'App controls'), /Check the configured API address/);
    }
});

test('valid JSON and backend validation messages are preserved', async () => {
    const data = await api.readControlResponse(Response.json({ navbarIntro: null }), 'UI animation controls');
    assert.equal(data.navbarIntro, null);
    await assert.rejects(() => api.readControlResponse(Response.json({ message: 'Refresh this release.' }, { status: 409 }), 'OTA controls'),
        error => error.status === 409 && error.message === 'Refresh this release.');
});
