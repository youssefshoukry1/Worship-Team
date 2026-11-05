/* eslint-disable @typescript-eslint/no-require-imports -- Node regression suite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/bible_form/useBibleForm.js'), 'utf8');
const handler = source.match(/  const handleAiAnalysis = async[\s\S]*?(?=\n  \/\/ Save Bible verses)/u)[0];
const clear = source.match(/  const clearAiAnalysis = React\.useCallback\([\s\S]*?\n  \}, \[\]\);/u)[0];
const selection = source.match(/  const setBibleSelectedVerseIds = React\.useCallback\([\s\S]*?\n  \}, \[clearAiAnalysis\]\);/u)[0];
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
function fixture({ authenticated = false, profile = Promise.resolve(null) } = {}) {
    const state = { calls: [], writes: [], profiles: 0, selections: [] };
    const context = { React: { useCallback: fn => fn }, aiRequestRef: { current: null },
        setAiAnalysis: value => state.writes.push(value), setShowAiOptions() {},
        setBibleSelectedVerseIdsState: value => state.selections.push(value),
        bibleModalVerses: [{ _id: 'verse-1', verseNumber: 1, text: 'نص الآية' }], bibleSelectedVerseIds: new Set(['verse-1']),
        bibleModalBook: { bookName: 'تكوين' }, bibleModalChapter: 1, getSelectedVersesRef: () => 'تكوين 1:1',
        API_ROOT: 'https://fixture.invalid/api', window: {},
        localStorage: { getItem: key => authenticated ? key.endsWith('Token') ? 'test-token' : 'test-account' : null },
        readAiStudyMode: () => 'normal', readCachedProfile: () => { state.profiles++; return profile; },
        prepareLocalAiOpening: async () => null, cancelLocalAiOpening: async () => {}, completeLocalAiRequest: async () => '',
        readAiResponseDiagrams: () => ({ journey: null, practicalFlow: null }),
        readAiResponseError: error => ({ message: error.code || 'Older request failed', isLimit: false }),
        axios: { post: (_url, body) => { const pending = deferred(); state.calls.push({ ...pending, body }); return pending.promise; } }
    };
    vm.runInNewContext(`${clear}\n${selection}\n${handler}\nglobalThis.api = { handleAiAnalysis, clearAiAnalysis, setBibleSelectedVerseIds };`, context);
    return { state, ...context.api };
}
const answer = text => ({ data: { success: true, explanation: text } });

test('duplicate taps before React flushes state still make only one API request', async () => {
    const { state, handleAiAnalysis } = fixture();
    const first = handleAiAnalysis('explain');
    await handleAiAnalysis('cross_reference');
    assert.equal(state.calls.length, 1);
    state.calls[0].resolve(answer('Current answer'));
    await first;
    assert.equal(state.writes.at(-1).text, 'Current answer');
    const next = handleAiAnalysis('practical');
    assert.equal(state.calls.length, 2, 'completed request releases the guard');
    state.calls[1].resolve(answer('Next answer'));
    await next;
});

test('a late failure from a cleared request cannot overwrite a newer successful answer', async () => {
    const { state, handleAiAnalysis, clearAiAnalysis } = fixture();
    const first = handleAiAnalysis('explain');
    clearAiAnalysis();
    const second = handleAiAnalysis('cross_reference');
    state.calls[1].resolve(answer('• تثنية 6:5'));
    await second;
    state.calls[0].reject(new Error('Old provider error'));
    await first;
    assert.equal(state.writes.at(-1).text, '• تثنية 6:5');
    assert.equal(state.writes.at(-1).type, 'cross_reference');
    assert.equal(state.writes.at(-1).error, null);
});

test('an old completion cannot release the guard belonging to a newer pending request', async () => {
    const { state, handleAiAnalysis, clearAiAnalysis } = fixture();
    const first = handleAiAnalysis('explain');
    clearAiAnalysis();
    const second = handleAiAnalysis('cross_reference');
    state.calls[0].resolve(answer('Old answer'));
    await first;
    await handleAiAnalysis('practical');
    assert.equal(state.calls.length, 2);
    state.calls[1].resolve(answer('Current references'));
    await second;
    assert.equal(state.writes.at(-1).text, 'Current references');
});

test('changing the verse selection discards the previous pending answer', async () => {
    const { state, handleAiAnalysis, setBibleSelectedVerseIds } = fixture();
    const pending = handleAiAnalysis('explain');
    setBibleSelectedVerseIds(new Set(['verse-2']));
    state.calls[0].resolve(answer('Answer for the old selection'));
    await pending;
    assert.equal(state.writes.at(-1).text, '');
    assert.equal(state.writes.at(-1).loading, false);
    assert.equal(state.selections.length, 1);
});

test('clearing during local profile lookup prevents an unwanted API request', async () => {
    const profile = deferred();
    const { state, handleAiAnalysis, clearAiAnalysis } = fixture({ authenticated: true, profile: profile.promise });
    const pending = handleAiAnalysis('explain');
    clearAiAnalysis();
    profile.resolve({ user: { Name: 'يوسف' } });
    await pending;
    assert.equal(state.calls.length, 0);
    assert.equal(state.writes.at(-1).text, '');
});

test('references skip unnecessary profile personalization and malformed HTTP 200 is not shown as a blank answer', async () => {
    const { state, handleAiAnalysis } = fixture({ authenticated: true });
    const pending = handleAiAnalysis('cross_reference');
    assert.equal(state.profiles, 0);
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].body.openingContext, undefined);
    state.calls[0].resolve({ data: { success: true } });
    await pending;
    assert.equal(state.writes.at(-1).error, 'AI_INVALID_API_RESPONSE');
    assert.equal(state.writes.at(-1).text, '');
});
