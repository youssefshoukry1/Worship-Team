/* eslint-disable @typescript-eslint/no-require-imports -- Node browser test entry point. */
// Build first: node --test tests/bible-online-search.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop } = require('./helpers/swipe-browser.cjs');
const { reader, verses } = require('./helpers/bible-settings-browser.cjs');
before(() => start());
after(stop);
const headers = { 'access-control-allow-origin': '*' };
const hit = (text = 'Cloud-only search result', translation = 'AVD') => ({ _id: 'cloud-result', bookName: 'Genesis', bookNumber: 1, chapter: 3, verseNumber: 16, translation, text });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function openSearch(surface) {
  await surface.getByTitle('Search Bible', { exact: true }).click();
  return surface.locator('input[type="text"]');
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: online results are used even with a downloaded Bible, preserving highlights and request parameters`, async t => {
    const { page, surface, errors } = await reader(t, engine);
    const requests = [];
    await page.route('**/bible/search?*', route => {
      requests.push(new URL(route.request().url()));
      return route.fulfill({ headers, json: [hit('Cloud-only <b>search</b> result')] });
    });
    const input = await openSearch(surface);
    await input.fill('cloud & search');
    await surface.getByText('Cloud-only search result', { exact: true }).waitFor();
    assert.equal(await surface.locator('b').textContent(), 'search');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].searchParams.get('q'), 'cloud & search');
    assert.equal(requests[0].searchParams.get('translation'), 'AVD');
    assert.equal(requests[0].searchParams.has('lang'), false, 'do not impose a mismatching Arabic language code');
    assert.deepEqual(errors, []);
  });
}

test('online search works without a downloaded selected translation', async t => {
  const { page, surface, errors } = await reader(t, 'chromium');
  await page.evaluate(() => localStorage.setItem('taspe7_bible_translation', 'KEH'));
  await page.reload();
  let requestedTranslation;
  await page.route('**/bible/search?*', route => {
    requestedTranslation = new URL(route.request().url()).searchParams.get('translation');
    return route.fulfill({ headers, json: [hit('Online KEH result', 'KEH')] });
  });
  const input = await openSearch(surface);
  await input.fill('online translation');
  await surface.getByText('Online KEH result', { exact: true }).waitFor();
  assert.equal(requestedTranslation, 'KEH');
  assert.deepEqual(errors, []);
});

test('API failures and invalid responses fall back to downloaded verses', async t => {
  const { page, surface, errors } = await reader(t, 'chromium');
  let failure = 'http';
  await page.route('**/bible/search?*', route => failure === 'http'
    ? route.fulfill({ headers, status: 500, json: { message: 'Unavailable' } })
    : route.fulfill({ headers, json: { unexpected: true } }));
  const input = await openSearch(surface);
  await input.fill(verses[0].text);
  await surface.getByText(verses[0].text, { exact: true }).waitFor();
  failure = 'invalid';
  await input.fill(verses[1].text);
  await surface.getByText(verses[1].text, { exact: true }).waitFor();
  assert.equal(await surface.getByText(/Search is unavailable/).count(), 0);
  assert.deepEqual(errors, []);
});

test('offline searches use downloaded verses without calling the online API', async t => {
  const { page, context, surface, errors } = await reader(t, 'chromium');
  let requests = 0;
  await page.route('**/bible/search?*', route => { requests++; return route.fulfill({ headers, json: [] }); });
  await context.setOffline(true);
  const input = await openSearch(surface);
  await input.fill(verses[0].text);
  await surface.getByText(verses[0].text, { exact: true }).waitFor();
  assert.equal(requests, 0);
  assert.deepEqual(errors, []);
});

test('a successful empty online response remains empty even if the offline Bible contains a match', async t => {
  const { page, surface, errors } = await reader(t, 'chromium');
  await page.route('**/bible/search?*', route => route.fulfill({ headers, json: [] }));
  const input = await openSearch(surface);
  await input.fill(verses[0].text);
  await surface.getByText('No results found', { exact: true }).waitFor();
  assert.equal(await surface.getByText(verses[0].text, { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});

test('an unavailable API without a local translation is distinguished from no matches, and a later search can recover', async t => {
  const { page, surface, errors } = await reader(t, 'chromium');
  await page.evaluate(() => localStorage.setItem('taspe7_bible_translation', 'KEH'));
  await page.reload();
  let recovered = false;
  await page.route('**/bible/search?*', route => route.fulfill({ headers, status: recovered ? 200 : 500, json: recovered ? [hit('Recovered result', 'KEH')] : {} }));
  const input = await openSearch(surface);
  await input.fill('unavailable');
  await surface.getByText(/Search is unavailable right now/).waitFor();
  assert.equal(await surface.getByText('No results found', { exact: true }).count(), 0);
  recovered = true;
  await input.fill('recovered');
  await surface.getByText('Recovered result', { exact: true }).waitFor();
  assert.equal(await surface.getByText(/Search is unavailable/).count(), 0);
  assert.deepEqual(errors, []);
});

test('changing the query or closing search cancels pending results', async t => {
  const { page, surface, errors } = await reader(t, 'chromium');
  const seen = deferred(), release = deferred(), closedSeen = deferred();
  t.after(() => release.resolve());
  await page.route('**/bible/search?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query !== 'latest') {
      (query === 'old' ? seen : closedSeen).resolve();
      await release.promise;
    }
    await route.fulfill({ headers, json: [hit(query === 'latest' ? 'Latest result' : 'Stale result')] }).catch(() => {});
  });
  const input = await openSearch(surface);
  await input.fill('old'); await seen.promise;
  await input.fill('latest');
  await surface.getByText('Latest result', { exact: true }).waitFor();
  await input.fill('closing'); await closedSeen.promise;
  await surface.getByTitle('Close Search', { exact: true }).click();
  release.resolve();
  await page.waitForTimeout(100);
  assert.equal(await surface.getByText('Stale result', { exact: true }).count(), 0);
  assert.equal(await surface.locator('input[type="text"]').count(), 0);
  await surface.getByTitle('Search Bible', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('busy responses respect Retry-After, avoid duplicate traffic and offer an explicit retry without changing the query', async t => {
  const { page, surface, errors } = await reader(t, 'chromium');
  await page.evaluate(() => localStorage.setItem('taspe7_bible_translation', 'KEH'));
  await page.reload();
  let requests = 0, recovered = false;
  await page.route('**/bible/search?*', route => {
    requests++;
    return route.fulfill({ headers: { ...headers, 'access-control-expose-headers': 'Retry-After', 'retry-after': '3' }, status: recovered ? 200 : 503, json: recovered ? [hit('Recovered busy search', 'KEH')] : {} });
  });
  const input = await openSearch(surface);
  await input.fill('unchanged query');
  await surface.getByText('Search is temporarily busy. Please try again shortly.', { exact: true }).waitFor();
  await page.waitForTimeout(1100);
  await surface.getByRole('button', { name: 'Try again', exact: true }).click();
  await surface.getByText('Search is temporarily busy. Please try again shortly.', { exact: true }).waitFor();
  assert.equal(requests, 1, 'retrying before Retry-After must not hit the API');
  await page.waitForTimeout(2100);
  recovered = true;
  await surface.getByRole('button', { name: 'Try again', exact: true }).click();
  await surface.getByText('Recovered busy search', { exact: true }).waitFor();
  assert.equal(requests, 2); assert.equal(await input.inputValue(), 'unchanged query');
  assert.deepEqual(errors, []);
});
