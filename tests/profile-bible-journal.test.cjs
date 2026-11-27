const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const runtime = readFileSync(require.resolve('../public/bible-change-journal.js'), 'utf8');

test('queued annotation changes survive restart, serialize concurrent replay and isolate accounts', async t => {
    const browser = await chromium.launch({ channel: 'chrome' });
    t.after(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    const api = 'https://journal.test';
    let online = false;
    const calls = [];
    await context.route(api + '/**', route => {
        if (route.request().method() === 'GET') return route.fulfill({ contentType: 'text/html', body: '<title>Journal</title>' });
        if (!online) return route.abort();
        const change = route.request().postDataJSON();
        calls.push(change.sequence);
        return route.fulfill(change.entries[0].value === 'rejected' ? { status: 400 } :
            { json: { count: change.remove ? 0 : 1, version: calls.length } });
    });
    await context.addInitScript({ content: runtime });
    await page.goto(api);
    const queue = value => page.evaluate(async ({ api, value }) => {
        const j = window.waslaBibleJournal;
        const seq = await j.enqueue({ api, owner: 'A', team: '', kind: 'notes', token: 'fixture',
            entries: [{ verseId: '1', value }], remove: false });
        return seq;
    }, { api, value });
    const snapshot = owner => page.evaluate(async ({ api, owner }) => {
        const j = window.waslaBibleJournal;
        const scope = j.scope(api, owner, 'notes');
        return { rows: await j.list(scope), meta: await j.summary(scope) };
    }, { api, owner });
    const first = await queue('first'), next = await queue('last');
    assert.equal(await page.evaluate(() => window.waslaBibleJournal.flush()), false);
    await page.reload();
    assert.deepEqual((await snapshot('A')).rows.map(row => row.entries[0].value), ['first', 'last']);
    assert.equal((await snapshot('B')).rows.length, 0);
    assert.equal((await snapshot('A')).meta.pending, 2);
    const second = await context.newPage();
    await second.goto(api);
    online = true;
    await Promise.all([page, second].map(tab => tab.evaluate(() => window.waslaBibleJournal.flush())));
    assert.deepEqual(calls, [first, next]);
    assert.equal((await snapshot('A')).meta.pending, 0);
    const bad = await queue('rejected');
    await assert.rejects(page.evaluate(seq => window.waslaBibleJournal.flush(null, seq), bad), /rejected/);
    const accepted = await snapshot('A');
    assert.equal(accepted.rows.length, 2);
    assert.equal(accepted.meta.pending, 0);
    assert.equal(accepted.meta.count, 1);
    await page.evaluate(api => window.waslaBibleJournal.prune(window.waslaBibleJournal.scope(api, 'A', 'notes'), 2), api);
    assert.equal((await snapshot('A')).rows.length, 0);
});
