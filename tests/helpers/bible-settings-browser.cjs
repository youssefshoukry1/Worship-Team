/* eslint-disable @typescript-eslint/no-require-imports -- Shared CommonJS browser fixture. */
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./swipe-browser.cjs');
const verses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/Taspe7.bibles.json'), 'utf8'))
  .filter(verse => verse.bookNumber === 19 && verse.chapter === 119)
  .sort((a, b) => a.verseNumber - b.verseNumber)
  .map((verse, i) => ({ ...verse, _id: `settings-verse-${i}`, translation: 'AVD' }));

async function reader(t, engine, { mode = 'paragraph', reducedMotion = false, language = 'en', warmSettings = true, platform = 'ios', contextOptions, swipeEnabled = false } = {}) {
  const fixture = await setup(t, engine, { href: '/bible_form/', platform, contextOptions, deferIdle: !warmSettings, beforeNavigate: async page => {
  if (platform === 'web') await page.route('**/bible/**', route => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (url.pathname.endsWith('/translations')) return route.fulfill({ headers, json: ['AVD'] });
    if (url.pathname.endsWith('/books')) return route.fulfill({ headers, json: [{ _id: verses[0].bookName, bookName: verses[0].bookName, bookNumber: 19 }] });
    if (url.pathname.includes('/chapters/')) return route.fulfill({ headers, json: [119] });
    if (url.pathname.includes('/verses/')) return route.fulfill({ headers, json: verses });
    return route.fallback();
  });
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.evaluate(async ({ verses, mode, language, swipeEnabled }) => {
    localStorage.setItem('app-language', language);
    // This fixture isolates settings/search; adjacent tab preparation has its
    // own browser suite and should not distort opening-frame measurements.
    localStorage.setItem('wasla_swipe_navigation', swipeEnabled ? 'on' : 'off');
    localStorage.setItem('taspe7_category_hymns_tour_done', '1');
    localStorage.setItem('taspe7_storage_migrated_v1', '1');
    localStorage.setItem('taspe7_bible_translation', 'AVD');
    localStorage.setItem('taspe7_bible_downloaded_translations', JSON.stringify(['AVD']));
    localStorage.setItem('taspe7_bible_view_mode', mode);
    localStorage.setItem('taspe7_bible_last_position', JSON.stringify({ bookName: verses[0].bookName, chapter: 119 }));
    localStorage.setItem('taspe7_bible_last_verses', JSON.stringify({ bookName: verses[0].bookName, chapter: 119, translation: 'AVD', verses }));
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('taspe7_app');
      request.onupgradeneeded = () => request.result.createObjectStore('bible_store');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('bible_store', 'readwrite');
      tx.objectStore('bible_store').put(verses, 'taspe7_bible_db_AVD');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { verses, mode, language, swipeEnabled });
  await page.addInitScript(() => {
    // A data-specific counter catches a full chapter render even if React's
    // DOM diff produces no mutations. No production instrumentation is added.
    window.__chapterMaps = 0;
    const map = Array.prototype.map;
    Array.prototype.map = function (...args) {
      if (this.length === 176 && this[0]?._id === 'settings-verse-0') window.__chapterMaps++;
      return map.apply(this, args);
    };
  });
  } });
  const { page } = fixture;
  const surface = page.locator('[data-feature="bible-reader"].app-page .app-reading-surface');
  await surface.getByTitle(language === 'ar' ? '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a' : 'Settings', { exact: true }).waitFor();
  if (warmSettings) await surface.locator('[data-bible-settings]').waitFor({ state: 'attached' });
  await page.waitForTimeout(250);
  return { ...fixture, surface, verseCount: verses.length };
}

module.exports = { reader, verses };
