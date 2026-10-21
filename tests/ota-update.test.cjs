const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function load(file, context) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, ...context });
    return exports;
}

const versionTools = load('src/app/utils/appVersion.js', {});
const candidate = { version: '1.0.77', url: 'https://github.com/test/out.zip', showSplash: true };

function fixture({ release = candidate, version = '1.0.76', builtin = false, responses = [], offline = false } = {}) {
    const storage = new Map(), calls = [], requests = [], bundles = [];
    let sessionActive = true;
    const api = load('src/app/services/otaUpdateService.js', {
        require: name => name === '../utils/appVersion' ? versionTools : { getApiBaseUrl: () => 'https://api.test/api' },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        crypto: { randomUUID: () => 'installation-123456789' }, AbortSignal,
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (url.startsWith('/version.json')) return { ok: true, json: async () => ({ version }) };
            if (offline) throw new Error('offline');
            const value = responses.length ? responses.shift() : { release, currentRelease: null };
            return { ok: true, json: async () => value };
        },
    });
    const updater = {
        current: async () => ({ bundle: { id: builtin ? 'builtin' : 'current', version: builtin ? 'builtin' : version }, native: '1.0.6' }),
        list: async () => ({ bundles }),
        download: async options => {
            calls.push(['download', options]);
            const bundle = { id: 'downloaded', version: options.version, status: 'pending' };
            bundles.push(bundle); return bundle;
        },
        set: async options => calls.push(['set', options]),
        next: async () => { throw new Error('Controlled updates must never auto-queue with next()'); },
    };
    return { api, updater, storage, calls, requests, bundles,
        stopSession: () => { sessionActive = false; },
        run: () => api.runControlledOtaUpdate({ updater, token: 'signed-token', platform: 'android', isCurrentSession: () => sessionActive }),
    };
}

test('no approved release never downloads, even with a locally pending bundle', async () => {
    const f = fixture({ release: null });
    f.storage.set('wasla_ota_pending_bundle', JSON.stringify({ id: 'private-test', version: '1.0.77' }));
    f.bundles.push({ id: 'private-test', version: '1.0.77', status: 'success' });
    await f.run();
    assert.equal(f.calls.length, 0);
    assert.equal(f.requests.length, 1);
});

test('download stays inactive until a later freshly authorized check', async () => {
    const f = fixture();
    await f.run();
    assert.deepEqual(f.calls.map(call => call[0]), ['download']);
    assert.equal(f.api.shouldShowReleaseSplash('1.0.77'), true);
    await f.run();
    assert.deepEqual(f.calls.map(call => call[0]), ['download', 'set']);
    assert.equal(f.calls[1][1].id, 'downloaded');
});

test('holding a previously downloaded release prevents activation', async () => {
    const responses = [{ release: candidate }, { release: null }];
    const f = fixture({ responses });
    await f.run(); await f.run();
    assert.deepEqual(f.calls.map(call => call[0]), ['download']);
});

test('revocation during a check is revalidated before activation', async () => {
    const f = fixture({ responses: [{ release: candidate }, { release: null }] });
    f.bundles.push({ id: 'existing', version: '1.0.77', status: 'pending' });
    await f.run();
    assert.equal(f.calls.length, 0);
    assert.equal(f.requests.length, 2);
});

test('offline checks cannot activate stored bundles', async () => {
    const f = fixture({ offline: true });
    f.bundles.push({ id: 'existing', version: '1.0.77', status: 'pending' });
    await assert.rejects(f.run, /offline/);
    assert.equal(f.calls.length, 0);
});

test('equal and lower approved versions never download or downgrade', async () => {
    for (const version of ['1.0.77', '1.0.78']) {
        const f = fixture({ version }); await f.run();
        assert.equal(f.calls.length, 0);
    }
});

test('built-in apps report their bundled version, not the binary version', async () => {
    const f = fixture({ builtin: true }); await f.run();
    const report = JSON.parse(f.requests.find(request => request.options?.method === 'POST').options.body);
    assert.equal(report.version, '1.0.76');
    assert.equal(report.nativeVersion, '1.0.6');
    assert.equal(report.bundleId, 'builtin');
    assert.equal(report.platform, 'android');
    assert.equal(report.role, undefined);
});

test('intro permission is persisted per version, including false', async () => {
    const f = fixture({ release: { ...candidate, showSplash: false } });
    await f.run();
    assert.equal(f.api.shouldShowReleaseSplash('1.0.77'), false);
    assert.equal(f.api.shouldShowReleaseSplash('1.0.76'), false);
    f.api.rememberSplashPolicy({ version: '1.0.78', showSplash: true });
    assert.equal(f.api.shouldShowReleaseSplash('1.0.78'), true);
    assert.equal(f.api.shouldShowReleaseSplash('1.0.77'), false);
});

test('activation uses the latest intro setting rather than the downloaded setting', async () => {
    const f = fixture({ responses: [{ release: candidate }, { release: { ...candidate, showSplash: false } }] });
    f.bundles.push({ id: 'existing', version: '1.0.77', status: 'pending' });
    await f.run();
    assert.equal(f.calls[0][0], 'set');
    assert.equal(f.api.shouldShowReleaseSplash('1.0.77'), false);
});

test('session changes cannot start a privileged download or activation', async () => {
    const f = fixture();
    f.updater.list = async () => { f.stopSession(); return { bundles: [] }; };
    await f.run();
    assert.equal(f.calls.length, 0);
});

test('failed bundles are not reused as successful candidates', async () => {
    const f = fixture();
    f.bundles.push({ id: 'broken', version: '1.0.77', status: 'error' });
    await f.run();
    assert.deepEqual(f.calls.map(call => call[0]), ['download']);
});
