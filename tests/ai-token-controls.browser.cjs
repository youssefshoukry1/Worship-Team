/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression suite. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { start, stop, setup } = require('./helpers/swipe-browser.cjs');
before(() => start()); after(stop);
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const targetId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

async function open(t, engine, { role = 'PROGRAMER', width = 390, pending = false, unlimited = false, stale = false, href = '/ProgramerDashboard/ai-tokens/' } = {}) {
    const state = { posts: [], reads: [], searches: [], account: {
        user: { id: targetId, name: 'Youssef Shoukry', username: 'youssef' }, revision: 'a'.repeat(64), lastAdminResetAt: null,
        quota: { unit: 'tokens', plan: 'free', unlimited, limit: unlimited ? null : 20000, used: 8000,
            remaining: unlimited ? null : 12000, resetsAt: new Date(Date.now() + 3600000).toISOString(), pending }
    }, policy: { revision: 'b'.repeat(64), freeStandardTokenLimit: 14000, freeLaunchTokenLimit: 20000,
        dailyTokenLimits: { free: 14000, plus: 22000, pro: 50000 },
        launch: { startsAt: '2026-11-01T12:00:00Z', endsAt: '2027-05-01T12:00:00Z', status: 'active' } } };
    const fixture = await setup(t, engine, { href, platform: 'web', profile: { role }, contextOptions: { viewport: { width, height: 844 } }, beforeNavigate: async page => {
        // A cached role must not override the fresh account access check.
        await page.evaluate(() => localStorage.setItem('user_Taspe7_GlobalRole', 'PROGRAMER'));
        await page.route('**/ai/admin/**', async route => {
            const request = route.request();
            if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            const url = new URL(request.url());
            if (request.method() === 'POST') {
                const body = request.postDataJSON();
                state.posts.push({ path: url.pathname, body });
                assert.match(body.requestId, /^[a-f\d-]{36}$/i);
                assert.match(body.expectedRevision, /^[ab]{64}$/);
                if (url.pathname.endsWith('/reset')) {
                    if (stale) { stale = false; state.account.revision = 'b'.repeat(64); state.account.quota.used = 9000; state.account.quota.remaining = 11000;
                        return route.fulfill({ status: 409, headers, json: { message: 'This account’s usage changed. Refresh and review the reset again.' } }); }
                    state.account = { ...state.account, revision: 'b'.repeat(64), quota: { ...state.account.quota, used: 0, remaining: 20000 }, lastAdminResetAt: new Date().toISOString() };
                    return route.fulfill({ headers, json: state.account });
                }
                state.policy = { ...state.policy, revision: 'a'.repeat(64), launch: { startsAt: new Date().toISOString(), endsAt: '2027-05-08T12:00:00Z', status: 'active' } };
                return route.fulfill({ headers, json: state.policy });
            }
            state.reads.push(url.pathname);
            if (url.pathname.endsWith('/policy')) return route.fulfill({ headers, json: state.policy });
            if (url.pathname.endsWith('/users')) {
                state.searches.push(url.searchParams.get('username'));
                return route.fulfill({ headers, json: { users: [state.account.user] } });
            }
            return route.fulfill({ headers, json: state.account });
        });
    } });
    return { ...fixture, state };
}
async function findUser(page) {
    await page.getByLabel('Username', { exact: true }).fill('@Youssef');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: 'Youssef Shoukry @youssef' }).click();
    await page.getByRole('progressbar', { name: 'Account tokens remaining' }).waitFor();
}

for (const engine of ['chromium', 'webkit']) {
    test(`${engine}: programmer can find usage and confirm an account reset and shared launch`, async t => {
        const { page, state, errors } = await open(t, engine, { width: 320 });
        await page.getByRole('heading', { name: 'Six-month Free launch offer' }).waitFor();
        await page.getByLabel('Username', { exact: true }).fill('@Youssef');
        assert.equal(state.searches.length, 0, 'Typing does not make search requests');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.getByRole('button', { name: 'Youssef Shoukry @youssef' }).click();
        const bar = page.getByRole('progressbar', { name: 'Account tokens remaining' });
        await bar.waitFor();
        assert.equal(await bar.getAttribute('aria-valuenow'), '12000');
        assert.deepEqual(state.searches, ['youssef']);
        await page.getByRole('button', { name: 'Reset allowance', exact: true }).click();
        assert.equal(state.posts.length, 0);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(state.posts.length, 0);
        await page.getByRole('button', { name: 'Reset allowance', exact: true }).click();
        await page.getByRole('button', { name: 'Confirm account reset', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-ai-admin-account] [role="progressbar"]')?.getAttribute('aria-valuenow') === '20000');
        assert.equal(state.posts.length, 1);
        assert.equal(state.posts[0].path, `/api/ai/admin/users/${targetId}/reset`);
        await page.getByRole('button', { name: 'Restart six-month offer', exact: true }).click();
        assert.equal(state.posts.length, 1);
        await page.getByRole('button', { name: 'Confirm launch offer', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'The six-month Free offer has started.' }).waitFor();
        assert.equal(state.posts.length, 2);
        assert.equal(state.posts[1].path, '/api/ai/admin/policy/launch');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        if (process.env.AI_CONTROL_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.AI_CONTROL_SCREENSHOT_DIR, `ai-controls-${engine}.png`), fullPage: true });
    });

    test(`${engine}: normal accounts cannot open controls even with a cached programmer role`, async t => {
        const { page, state, errors } = await open(t, engine, { role: 'USER' });
        await page.getByRole('heading', { name: 'Private dashboard' }).waitFor();
        assert.equal(await page.getByLabel('Username', { exact: true }).count(), 0);
        assert.equal(state.reads.length, 0);
        assert.equal(state.posts.length, 0);
        assert.deepEqual(errors, []);
    });

    test(`${engine}: active answers disable resetting and stale confirmations require a fresh review`, async t => {
        const { page, state, errors } = await open(t, engine, { pending: true, stale: true });
        await findUser(page);
        assert.equal(await page.getByRole('button', { name: 'Reset allowance', exact: true }).isDisabled(), true);
        state.account.quota.pending = false;
        await page.getByRole('button', { name: 'Refresh usage', exact: true }).click();
        const reset = page.getByRole('button', { name: 'Reset allowance', exact: true });
        await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Reset allowance' && !button.disabled));
        await reset.click();
        await page.getByRole('button', { name: 'Confirm account reset', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'usage changed' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Confirm account reset' }).count(), 0);
        assert.equal(state.posts.length, 1);
        await page.waitForFunction(() => document.querySelector('[data-ai-admin-account] [role="progressbar"]')?.getAttribute('aria-valuenow') === '11000');
        await reset.click();
        await page.getByRole('button', { name: 'Confirm account reset', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-ai-admin-account] [role="progressbar"]')?.getAttribute('aria-valuenow') === '20000');
        assert.equal(state.posts.length, 2);
        assert.notEqual(state.posts[0].body.expectedRevision, state.posts[1].body.expectedRevision);
        assert.deepEqual(errors, []);
    });

    test(`${engine}: app control center links to AI token controls`, async t => {
        const { page, errors } = await open(t, engine, { href: '/ProgramerDashboard/' });
        await page.getByRole('link', { name: /AI token controls/ }).waitFor();
        assert.equal(await page.getByRole('link', { name: /AI token controls/ }).getAttribute('href'), '/ProgramerDashboard/ai-tokens/');
        assert.deepEqual(errors, []);
    });

    test(`${engine}: unlimited accounts show their status without a reset action`, async t => {
        const { page, state, errors } = await open(t, engine, { unlimited: true });
        await page.getByLabel('Username', { exact: true }).fill('youssef');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.getByRole('button', { name: 'Youssef Shoukry @youssef' }).click();
        await page.getByText('This account has unlimited AI access. No reset is needed.').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Reset allowance', exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('progressbar').count(), 0);
        assert.equal(state.posts.length, 0);
        assert.deepEqual(errors, []);
    });
}
