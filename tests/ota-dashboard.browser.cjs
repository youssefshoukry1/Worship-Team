// After npm run build: node --test tests/ota-dashboard.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
let browser, server, base;

before(async () => {
    server = http.createServer((req, res) => {
        const requestedUrl = new URL(req.url, 'http://localhost');
        const pathname = decodeURIComponent(requestedUrl.pathname);
        let file = path.join(root, pathname);
        if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, requestedUrl.searchParams.has('_rsc') ? 'index.txt' : 'index.html');
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
        res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html', '.txt': 'text/x-component', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function setup(t, { width = 1280, role = 'PROGRAMER', forbidden = role !== 'PROGRAMER', candidateOffline = false, native = false, routePath = '/ProgramerDashboard/ota/', initialAnimation = null, missingUiBackend = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [], saves = [], reports = [], legacyManifestRequests = [], animationSaves = [];
    let animation = initialAnimation;
    let animationChecks = 0;
    let adminRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ role, native }) => {
        localStorage.setItem('user_Taspe7_Token', 'test-token');
        localStorage.setItem('user_Taspe7_GlobalRole', role);
        localStorage.setItem('user_Taspe7_ID', 'test-user');
        localStorage.setItem('user_Taspe7_Username', 'tester');
        // An old timer must no longer trigger the navbar intro.
        localStorage.setItem('wasla_intro_last_time', '1');
        window.__navbarIntroIds = [];
        new MutationObserver(() => {
            document.querySelectorAll('[data-navbar-intro]').forEach(node => {
                const id = node.getAttribute('data-intro-id');
                if (!window.__navbarIntroIds.includes(id)) window.__navbarIntroIds.push(id);
            });
        }).observe(document, { childList: true, subtree: true });
        if (native) {
            window.__otaCalls = [];
            const bundles = [];
            window.CapacitorCustomPlatform = { name: 'android' };
            window.Capacitor = {
                PluginHeaders: [{ name: 'CapacitorUpdater', methods: ['notifyAppReady', 'current', 'list', 'download', 'set'].map(name => ({ name, rtype: 'promise' })) }],
                nativePromise: async (plugin, method, options) => {
                    if (plugin !== 'CapacitorUpdater') return {};
                    window.__otaCalls.push({ method, options });
                    if (method === 'current') return { bundle: { id: 'active', version: '1.0.76' }, native: '1.0.6' };
                    if (method === 'list') return { bundles };
                    if (method === 'download') {
                        const bundle = { id: 'native-test-download', version: options.version, status: 'pending' };
                        bundles.push(bundle); return bundle;
                    }
                    return {};
                },
            };
        }
    }, { role, native });
    const url = version => `https://github.com/youssefshoukry1/Worship-Team/releases/download/v${version}/out.zip`;
    const data = {
        candidate: candidateOffline ? null : { version: '1.0.77', url: url('1.0.77') },
        ...(candidateOffline ? { candidateError: 'Manifest temporarily unavailable.' } : {}),
        publicRelease: { version: '1.0.76' }, programerRelease: { version: '1.0.76' },
        releases: [{ version: '1.0.76', url: url('1.0.76'), audience: 'all', showSplash: false, revision: 1, updatedAt: new Date().toISOString() }],
        versions: [{ version: '1.0.76', platform: 'android', role: 'USER', count: 24 }, { version: '1.0.76', platform: 'ios', role: 'USER', count: 8 }, { version: '1.0.77', platform: 'android', role: 'PROGRAMER', count: 1 }],
        devices: [], reportWindowDays: 30,
    };
    await page.route('**/*', async route => {
        const request = route.request();
        if (request.url().startsWith(base)) return route.continue();
        const reply = (json, status = 200) => route.fulfill({ status, json, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (request.method() === 'OPTIONS') return reply({});
        if (missingUiBackend && request.url().includes('/ui-controls/')) {
            return route.fulfill({ status: 404, contentType: 'text/html',
                headers: { 'access-control-allow-origin': '*' },
                body: '<!DOCTYPE html><html><body>Cannot GET /api/ui-controls/admin</body></html>' });
        }
        if (request.url().includes('/ui-controls/requests')) {
            animationChecks++;
            const eligible = animation?.id && Date.parse(animation.expiresAt) > Date.now() && (animation.audience === 'all' || role === 'PROGRAMER');
            return reply({ navbarIntro: eligible ? animation : null });
        }
        if (request.url().includes('/ui-controls/admin')) {
            if (forbidden) return reply({ message: 'Only PROGRAMER accounts can access these controls.' }, 403);
            if (request.method() === 'POST') {
                const payload = request.postDataJSON(); animationSaves.push(payload);
                animation = { id: `request-${animationSaves.length}`, audience: payload.audience, requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), revision: animationSaves.length };
            }
            if (request.method() === 'DELETE') animation = { ...animation, id: null, expiresAt: null };
            return reply({ navbarIntro: animation });
        }
        if (request.url().includes('wasla-w.vercel.app/version.json')) legacyManifestRequests.push(request.url());
        if (request.url().includes('/ota/check')) {
            reports.push(request.postDataJSON());
            return reply({ release: { ...data.candidate, showSplash: true }, currentRelease: { version: '1.0.76', showSplash: false } });
        }
        if (request.url().includes('/ota/admin')) {
            adminRequests++;
            if (forbidden) return reply({ message: 'Only PROGRAMER accounts can access release controls.' }, 403);
            if (request.method() === 'POST') {
                const payload = request.postDataJSON(); saves.push(payload);
                const release = { ...payload, revision: payload.expectedRevision + 1, updatedAt: new Date().toISOString() };
                data.releases = [release, ...data.releases.filter(row => row.version !== release.version)];
                if (release.audience === 'programer') data.programerRelease = release;
                if (release.audience === 'all') data.publicRelease = data.programerRelease = release;
                return reply({ release });
            }
            return reply(data);
        }
        if (request.url().includes('/my-teams')) return reply([]);
        return reply({ user: { username: 'tester', role }, data: [], version: 'test', inbox: [], friends: [] });
    });
    await page.goto(base + routePath, { waitUntil: 'domcontentloaded' });
    return { page, saves, errors, reports, legacyManifestRequests, animationSaves,
        setAnimation: value => { animation = value; },
        animationChecks: () => animationChecks, adminRequests: () => adminRequests };
}

for (const width of [1280, 390]) {
    test(`dashboard saves private testing, intro preference and public promotion at ${width}px`, async t => {
        const { page, saves, errors } = await setup(t, { width });
        await page.getByRole('heading', { name: 'Version 1.0.77', exact: true }).waitFor();
        assert.equal(await page.getByRole('radio', { name: /Hold/ }).isChecked(), true);
        await page.getByRole('radio', { name: /PROGRAMER only/ }).check();
        await page.getByRole('switch', { name: 'Show update intro' }).check();
        await page.getByRole('button', { name: 'Release to PROGRAMER', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'programer only' }).waitFor();
        assert.equal(saves[0].audience, 'programer'); assert.equal(saves[0].showSplash, true);
        assert.equal(saves[0].expectedRevision, 0);
        await page.getByRole('radio', { name: /All users/ }).check();
        await page.getByRole('switch', { name: 'Show update intro' }).uncheck();
        await page.getByRole('button', { name: 'Release to all users', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'all users' }).waitFor();
        assert.equal(saves[1].audience, 'all'); assert.equal(saves[1].showSplash, false);
        assert.equal(saves[1].expectedRevision, 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (process.env.OTA_SCREENSHOT_DIR) {
            fs.mkdirSync(process.env.OTA_SCREENSHOT_DIR, { recursive: true });
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(process.env.OTA_SCREENSHOT_DIR, `dashboard-${width}.png`), fullPage: true });
        }
        assert.deepEqual(errors, []);
    });
}

test('regular users see no controls after authoritative access denial', async t => {
    const app = await setup(t, { role: 'USER' });
    await app.page.getByRole('heading', { name: 'Private dashboard' }).waitFor();
    assert.equal(await app.page.getByRole('radio').count(), 0);
    assert.equal(app.adminRequests(), 1);
});

test('backend denial remains visible even if the cached client role says PROGRAMER', async t => {
    const app = await setup(t, { forbidden: true });
    await app.page.getByRole('heading', { name: 'Private dashboard' }).waitFor();
    assert.equal(await app.page.getByRole('radio').count(), 0);
});

test('candidate outage preserves controls for existing release history', async t => {
    const app = await setup(t, { candidateOffline: true });
    await app.page.getByText('Manifest temporarily unavailable.').waitFor();
    await app.page.getByRole('button', { name: 'Manage', exact: true }).click();
    await app.page.getByRole('radio', { name: /Hold/ }).check();
    await app.page.getByRole('button', { name: 'Hold this version' }).click();
    await app.page.getByRole('status').filter({ hasText: 'on hold' }).waitFor();
    assert.equal(app.saves[0].version, '1.0.76');
    assert.equal(app.saves[0].audience, 'held');
});

test('native bridge confirms app health, reports the active version, and activates only on a later check', async t => {
    const app = await setup(t, { native: true });
    await app.page.waitForFunction(() => JSON.parse(localStorage.getItem('wasla_ota_pending_bundle') || 'null')?.id === 'native-test-download');
    let calls = await app.page.evaluate(() => window.__otaCalls);
    // The splash may inspect current() first; the updater must confirm health
    // before downloading and must not wait on the authenticated release API.
    const readyIndex = calls.findIndex(call => call.method === 'notifyAppReady');
    assert.ok(readyIndex >= 0 && readyIndex < calls.findIndex(call => call.method === 'download'));
    assert.equal(calls.some(call => call.method === 'set'), false);
    assert.equal(app.reports[0].version, '1.0.76');
    assert.equal(app.reports[0].platform, 'android');
    assert.equal(app.reports[0].nativeVersion, '1.0.6');
    assert.equal(app.legacyManifestRequests.length, 0);
    await app.page.evaluate(() => window.dispatchEvent(new CustomEvent('wasla_ota_check')));
    await app.page.waitForFunction(() => window.__otaCalls.some(call => call.method === 'set'));
    calls = await app.page.evaluate(() => window.__otaCalls);
    assert.equal(calls.find(call => call.method === 'set').options.id, 'native-test-download');
    assert.equal(await app.page.evaluate(() => JSON.parse(localStorage.getItem('wasla_ota_splash_policy'))['1.0.77']), true);
    assert.deepEqual(app.errors, []);
});

test('control center contains two entry buttons and opens the separate OTA page', async t => {
    const app = await setup(t, { routePath: '/ProgramerDashboard/' });
    await app.page.getByRole('link', { name: /OTA controll Hold a release/ }).waitFor();
    await app.page.getByRole('link', { name: /UI animations Request the navbar/ }).waitFor();
    assert.equal(await app.page.getByRole('heading', { name: 'Versions on devices' }).count(), 0);
    assert.equal(app.adminRequests(), 0);
    if (process.env.OTA_SCREENSHOT_DIR) await app.page.screenshot({ path: path.join(process.env.OTA_SCREENSHOT_DIR, 'control-center.png'), fullPage: true });
    await app.page.getByRole('link', { name: /OTA controll Hold a release/ }).click();
    await app.page.getByRole('heading', { name: 'Version 1.0.77', exact: true }).waitFor();
});

test('an undeployed UI backend cannot block the hub or local preview with an HTML JSON error', async t => {
    const app = await setup(t, { routePath: '/ProgramerDashboard/', missingUiBackend: true });
    await app.page.getByRole('link', { name: /OTA controll Hold a release/ }).waitFor();
    await app.page.getByRole('link', { name: /UI animations Request the navbar/ }).click();
    await app.page.getByRole('alert').filter({ hasText: 'Deploy the backend update' }).waitFor();
    assert.equal(await app.page.getByRole('button', { name: 'Request animation', exact: true }).isDisabled(), true);
    assert.equal(await app.page.getByRole('button', { name: 'Preview on this device' }).isEnabled(), true);
    await app.page.getByRole('button', { name: 'Preview on this device' }).click();
    await app.page.waitForSelector('[data-navbar-intro]');
    assert.equal((await app.page.locator('body').innerText()).includes('Unexpected token'), false);
    assert.deepEqual(app.errors, []);
});

test('navbar stays static despite an overdue timer; a local preview never broadcasts', async t => {
    const app = await setup(t, { routePath: '/ProgramerDashboard/animations/' });
    await app.page.getByRole('button', { name: 'Preview on this device' }).waitFor();
    assert.deepEqual(await app.page.evaluate(() => window.__navbarIntroIds), []);
    await app.page.getByRole('button', { name: 'Preview on this device' }).click();
    await app.page.waitForSelector('[data-navbar-intro]');
    await app.page.waitForSelector('[data-navbar-intro]', { state: 'detached' });
    assert.equal(app.animationSaves.length, 0);
    assert.equal(await app.page.evaluate(() => localStorage.getItem('wasla_navbar_intro_seen:test-user')), null);
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await app.page.getByRole('button', { name: 'Preview on this device' }).waitFor();
    assert.deepEqual(await app.page.evaluate(() => window.__navbarIntroIds), []);
});

test('dashboard requests play once per device and a new request can replay the intro', async t => {
    const app = await setup(t, { width: 390, routePath: '/ProgramerDashboard/animations/' });
    await app.page.getByRole('button', { name: 'Request animation', exact: true }).waitFor();
    if (process.env.OTA_SCREENSHOT_DIR) await app.page.screenshot({ path: path.join(process.env.OTA_SCREENSHOT_DIR, 'animation-controls-390.png'), fullPage: true });
    await app.page.getByRole('button', { name: 'Request animation', exact: true }).click();
    await app.page.waitForSelector('[data-navbar-intro]');
    await app.page.waitForSelector('[data-navbar-intro]', { state: 'detached' });
    assert.equal(await app.page.evaluate(() => localStorage.getItem('wasla_navbar_intro_seen:test-user')), 'request-1');
    assert.equal(app.animationSaves[0].audience, 'programer');
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await app.page.getByRole('button', { name: 'Request animation', exact: true }).waitFor();
    assert.deepEqual(await app.page.evaluate(() => window.__navbarIntroIds), []);
    await app.page.getByRole('radio', { name: /All users/ }).check();
    await app.page.getByRole('button', { name: 'Request animation', exact: true }).click();
    await app.page.waitForFunction(() => localStorage.getItem('wasla_navbar_intro_seen:test-user') === 'request-2');
    assert.equal(app.animationSaves[1].audience, 'all');
    await app.page.getByRole('button', { name: 'Cancel pending request' }).click();
    await app.page.getByRole('status').filter({ hasText: 'Pending request cancelled' }).waitFor();
    assert.equal(await app.page.getByRole('button', { name: 'Cancel pending request' }).isDisabled(), true);
});

test('regular users receive only all-user animation requests, never private test requests', async t => {
    const command = { id: 'remote-command', audience: 'programer', expiresAt: new Date(Date.now() + 60000).toISOString() };
    const privateApp = await setup(t, { role: 'USER', initialAnimation: command });
    await privateApp.page.getByRole('heading', { name: 'Private dashboard' }).waitFor();
    assert.equal(await privateApp.page.locator('[data-navbar-intro]').count(), 0);
    const publicApp = await setup(t, { role: 'USER', initialAnimation: { ...command, audience: 'all' } });
    await publicApp.page.waitForSelector('[data-navbar-intro]');
    assert.equal(await publicApp.page.evaluate(() => localStorage.getItem('wasla_navbar_intro_seen:test-user')), command.id);
});

for (const cancelWhileWaiting of [false, true]) {
    test(`navbar request waits for the OTA splash${cancelWhileWaiting ? ' and respects cancellation before it finishes' : ''}`, async t => {
        const app = await setup(t, { routePath: '/ProgramerDashboard/animations/' });
        await app.page.getByRole('button', { name: 'Request animation', exact: true }).waitFor();
        app.setAnimation({ id: 'waiting-command', audience: 'all', expiresAt: new Date(Date.now() + 60000).toISOString() });
        await Promise.all([
            app.page.waitForResponse(response => response.url().includes('/ui-controls/requests')),
            app.page.evaluate(() => {
                window.__wasla_splash_done = false;
                window.__wasla_splash_active = true;
                window.dispatchEvent(new CustomEvent('wasla_ui_controls_changed'));
            }),
        ]);
        assert.equal(await app.page.locator('[data-navbar-intro]').count(), 0);
        assert.equal(await app.page.evaluate(() => localStorage.getItem('wasla_navbar_intro_seen:test-user')), null);
        if (cancelWhileWaiting) app.setAnimation(null);
        await Promise.all([
            app.page.waitForResponse(response => response.url().includes('/ui-controls/requests')),
            app.page.evaluate(() => {
                window.__wasla_splash_active = false;
                window.__wasla_splash_done = true;
                window.dispatchEvent(new CustomEvent('wasla_splash_done'));
            }),
        ]);
        if (cancelWhileWaiting) {
            await app.page.waitForTimeout(100);
            assert.deepEqual(await app.page.evaluate(() => window.__navbarIntroIds), []);
        } else {
            await app.page.waitForSelector('[data-navbar-intro]');
            assert.equal(await app.page.evaluate(() => localStorage.getItem('wasla_navbar_intro_seen:test-user')), 'waiting-command');
        }
    });
}
