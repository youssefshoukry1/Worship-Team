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
    const env = {
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
    };
    const launch = load('public/ota-launch.js', env);
    const api = load('src/app/services/otaUpdateService.js', { ...env, require: name =>
        name.includes('public/ota-launch') ? launch : env.require(name) });
    env.localStorage.setItem('user_Taspe7_Token', 'signed-token');
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
        activate: (commit = () => sessionActive) => launch.activatePreparedRelease({
            apiBase: 'https://api.test/api', updater, token: 'signed-token', signal: new AbortController().signal,
            pending: JSON.parse(storage.get(launch.PENDING_KEY)), commit,
        }),
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

test('foreground checks only stage and only a freshly authorized launch activates', async () => {
    const f = fixture();
    await f.run();
    assert.deepEqual(f.calls.map(call => call[0]), ['download']);
    assert.equal(f.api.shouldShowReleaseSplash('1.0.77'), true);
    await f.run();
    assert.deepEqual(f.calls.map(call => call[0]), ['download']);
    await f.activate();
    assert.deepEqual(f.calls.map(call => call[0]), ['download', 'set']);
    assert.equal(f.calls[1][1].id, 'downloaded');
});

test('holding a previously downloaded release prevents activation', async () => {
    const responses = [{ release: candidate }, { release: null }];
    const f = fixture({ responses });
    await f.run(); await f.activate();
    assert.deepEqual(f.calls.map(call => call[0]), ['download']);
});

test('revocation during a check is revalidated before activation', async () => {
    const f = fixture({ responses: [{ release: candidate }, { release: null }] });
    f.bundles.push({ id: 'existing', version: '1.0.77', status: 'pending' });
    await f.run(); await f.activate();
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
    await f.activate();
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

test('late authorization after the screen opened cannot reload the session', async () => {
    const f = fixture();
    await f.run();
    await f.activate(() => false);
    assert.deepEqual(f.calls.map(call => call[0]), ['download']);
});

test('a changed account, changed running bundle or failed staged bundle cannot activate', async () => {
    for (const change of [
        f => f.storage.set('user_Taspe7_Token', 'different'),
        f => { f.updater.current = async () => ({ bundle: { id: 'other', version: '1.0.80' } }); },
        f => { f.bundles[0].status = 'error'; },
    ]) {
        const f = fixture();
        await f.run();
        change(f);
        await f.activate();
        assert.deepEqual(f.calls.map(call => call[0]), ['download']);
    }
});

test('a ready Pray screen waits for a staged release decision, including slower approvals', async () => {
    const { otaLaunchScript } = load('src/app/utils/otaLaunchScript.js', {});
    for (const outcome of ['approved', 'timeout', 'background', 'no update']) {
        let now = 0, activation, finish;
        const timers = new Map(), document = new EventTarget(), window = new EventTarget();
        window.Capacitor = { Plugins: { WaslaLaunch: { ready() {} }, CapacitorUpdater: {} } };
        const pending = JSON.stringify({ report: {} });
        const module = { activatePreparedRelease: args => {
            activation = args;
            return new Promise(resolve => { finish = resolve; });
        } };
        const script = otaLaunchScript('https://api.test').replace("import('/ota-launch.js')", 'Promise.resolve(module)');
        vm.runInNewContext(script, {
            window, document, module, AbortController, navigator: { onLine: true }, location: { pathname: '/pray/' },
            sessionStorage: { getItem() {}, setItem() {} },
            localStorage: { getItem: key => ({
                user_Taspe7_Token: 'test', wasla_ota_pending_bundle: outcome === 'no update' ? null : pending,
            })[key] },
            performance: { now: () => now, getEntriesByType: () => [{ type: 'navigate' }] },
            setTimeout: (fn, ms) => { timers.set(fn, ms); return fn; }, clearTimeout: fn => timers.delete(fn),
        });
        if (outcome === 'no update') {
            assert.equal(window.waslaBeforeReveal, undefined);
            assert.equal(timers.size, 0);
            continue;
        }
        const decision = window.waslaBeforeReveal();
        assert.equal(window.waslaBeforeReveal(), decision);
        await Promise.resolve();
        now = outcome === 'timeout' ? 4000 : 600;
        for (const [fn, ms] of timers) if (ms <= now) fn();
        if (outcome === 'background') document.dispatchEvent(new Event('visibilitychange'));
        assert.equal(activation.commit(), outcome === 'approved');
        if (outcome !== 'approved') {
            await decision;
            assert.equal(activation.signal.aborted, true);
        }
        finish(outcome === 'approved');
    }
});
