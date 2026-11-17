import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

test('real IndexedDB migrates legacy rows and isolates logout from other accounts and stale writes', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('http://localhost:3000/storage-test', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost:3000/storage-test');
    const source = readFileSync('src/app/utils/friendDirectory/storage.js', 'utf8').replace("import localforage from 'localforage';", '').replaceAll('export function', 'function');
    const result = await page.evaluate(async source => {
      const legacy = new Map([['friends_data_a', { friends: [{ _id: 'a1', Name: 'Saved friend' }], incoming: ['keep'] }]]), pages = new Map();
      const disk = map => ({ getItem: async key => map.get(key), setItem: async (key, value) => map.set(key, value), removeItem: async key => map.delete(key) });
      const api = new Function('localforage', source + '; return {friendDirectoryStorage, clearFriendDirectoryStorage};')({ ...disk(legacy), createInstance: () => disk(pages) });
      const a = api.friendDirectoryStorage('a'), b = api.friendDirectoryStorage('b');
      const migrated = await a.load();
      await a.save({ meta: { ...migrated.meta, complete: true } });
      const restored = await api.friendDirectoryStorage('a').load();
      await b.save({ upserts: [{ _id: 'b1', Name: 'Other account' }], meta: { version: 1, ids: ['b1'], complete: true } });
      const queued = a.save({ upserts: [{ _id: 'late', Name: 'Late' }] });
      await api.clearFriendDirectoryStorage('a'); await queued;
      await a.save({ upserts: [{ _id: 'later', Name: 'Later' }] });
      const cleared = await api.friendDirectoryStorage('a').load();
      return { restored, cleared, other: await b.load(), legacy: legacy.get('friends_data_a') };
    }, source);
    assert.equal(result.restored.items[0].Name, 'Saved friend');
    assert.equal(result.restored.meta.complete, true);
    assert.equal(result.cleared, null);
    assert.equal(result.other.items[0].Name, 'Other account');
    assert.deepEqual(result.legacy, { incoming: ['keep'] });
  } finally { await browser.close(); }
});
