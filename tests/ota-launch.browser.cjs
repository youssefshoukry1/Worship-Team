const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, setup, getBase } = require('./helpers/swipe-browser.cjs');

before(() => start(['chromium', 'webkit']));
after(stop);

async function launch(t, engine, intro, holdApproval = false) {
    const { page: seed, context } = await setup(t, engine, { platform: 'web', waitForPrayReads: false });
    const version = '9.0.1', oldVersion = '9.0.0', url = 'https://github.com/test/ota.zip';
    const platform = engine === 'webkit' ? 'ios' : 'android';
    const report = { version: oldVersion, bundleId: 'old', platform, nativeVersion: '1', installationId: 'test-installation-123' };
    await seed.evaluate(({ version, url, report }) => {
        localStorage.setItem('wasla_splash_version', report.version);
        localStorage.setItem('wasla_ota_pending_bundle', JSON.stringify({ id: 'new', version, url, report }));
    }, { version, url, report });
    await seed.close();
    const page = await context.newPage();
    let resume;
    const approved = new Promise(resolve => { resume = resolve; });
    await page.route('**/*', async route => {
        if (route.request().url().startsWith(getBase())) return route.continue();
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
            'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*',
        } });
        if (holdApproval && route.request().url().endsWith('/ota/check')) await approved;
        return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { release: { version, url, showSplash: intro } } }).catch(() => {});
    });
    await page.addInitScript(({ platform, version, oldVersion }) => {
        const bundle = { id: 'new', version, status: 'pending' };
        const active = !!sessionStorage.switched;
        const native = {
            async current() { return { bundle: sessionStorage.switched ? bundle : { id: 'old', version: oldVersion }, native: '1' }; },
            async list() { return { bundles: [bundle] }; },
            async set() { sessionStorage.switched = '1'; location.reload(); },
            async notifyAppReady() {},
        };
        const ready = () => {
            const entry = { active, intro: !!document.querySelector('#wasla-splash-screen') };
            sessionStorage.reveals = JSON.stringify([...JSON.parse(sessionStorage.reveals || '[]'), entry]);
            return Promise.resolve();
        };
        window.CapacitorCustomPlatform = { name: platform };
        window.Capacitor = {
            Plugins: { WaslaLaunch: { ready }, CapacitorUpdater: native },
            PluginHeaders: [
                { name: 'WaslaLaunch', methods: [{ name: 'ready', rtype: 'promise' }] },
                { name: 'CapacitorUpdater', methods: Object.keys(native).map(name => ({ name, rtype: 'promise' })) },
            ],
            async nativePromise(plugin, method, args) {
                if (plugin === 'WaslaLaunch') return ready();
                if (plugin === 'CapacitorUpdater') return native[method](args);
                return {};
            },
        };
    }, { platform, version, oldVersion });
    await page.goto(getBase() + '/', { waitUntil: 'commit' });
    return { page, resume };
}

for (const engine of ['chromium', 'webkit']) {
    for (const intro of [true, false]) {
        test(engine + ' activates behind the cover with dashboard intro ' + intro, async t => {
            const { page } = await launch(t, engine, intro);
            await page.waitForFunction(() => JSON.parse(sessionStorage.reveals || '[]').some(r => r.active));
            const reveals = await page.evaluate(() => JSON.parse(sessionStorage.reveals));
            assert.deepEqual(reveals[0], { active: true, intro });
        });
    }
}

test('late approval, foreground return and reconnect preserve the open editor', async t => {
    const { page, resume } = await launch(t, 'chromium', false, true);
    try {
        await page.waitForFunction(() => sessionStorage.reveals);
        const editor = page.locator('[data-tab-active="true"] textarea[data-preview-content="pray"]');
        await editor.fill('keep this prayer');
        resume();
        await page.evaluate(() => {
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('online'));
            window.dispatchEvent(new Event('wasla_ota_check'));
        });
        await page.waitForFunction(() => !window.waslaPrayerPreview);
        assert.equal(await editor.inputValue(), 'keep this prayer');
        assert.equal(await page.evaluate(() => sessionStorage.switched), undefined);
    } finally { resume(); }
});
