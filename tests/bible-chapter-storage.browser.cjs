/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node test entry point. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const utils = path.resolve(__dirname, '../src/app/utils');
const read = name => fs.readFileSync(path.join(utils, name + '.js'), 'utf8');
const scripts = ['cooperativeWork', 'bibleSearchIndex', 'bibleChapterStorage', 'bibleSync']
  .map(name => read(name).replace(/^import .*;$/gm, '').replace(/^export /gm, '')).join('\n');
const seed = path.resolve(__dirname, '../public/Taspe7.bibles.json');

for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  test(engine + ' stores, replaces and deletes verified Bible chapters atomically', async t => {
    const browser = await launcher.launch();
    t.after(() => browser.close());
    const context = await browser.newContext();
    await context.route('https://bible.test/**', route => route.request().url().endsWith('.json')
      ? route.fulfill({ path: seed, contentType: 'application/json' })
      : route.fulfill({ body: '<title>Offline reader storage</title>', contentType: 'text/html' }));
    async function open() {
      const page = await context.newPage();
      page.on('console', message => { if (message.type() === 'error') t.diagnostic(message.text()); });
      await page.goto('https://bible.test/');
      await page.addScriptTag({ path: require.resolve('localforage/dist/localforage.js') });
      await page.addScriptTag({ content: `
        localforage.config({name:'taspe7_app', storeName:'bible_store'});
        const storageReady = Promise.resolve(), isApp = true;
        const waitForNavigationIdle = async () => {}, isRetiredTranslation = () => false, removeLegacyStorageKeys = async () => {};
        const fixture = n => ({_id:'id'+n,bookName:'John',bookNumber:43,chapter:3,verseNumber:n,text:'Verse '+n,lang:'english',translation:'KJV'});
        const axios = { get: async () => ({data:[fixture(2), fixture(1)]}) };
        ${scripts}` });
      return page;
    }
    const page = await open();
    assert.deepEqual(await page.evaluate(async () => {
      await prepareLocalBible();
      const manifest = await readBibleContents('AVD');
      const john = manifest.books.find(b => b.bookNumber === 43);
      const chapter = await readBibleChapter('AVD', john.bookName, 3);
      return [manifest.schema, manifest.books.length, manifest.verseCount, chapter.length, typeof chapter[0]._id, chapter[0].verseNumber];
    }), [1, 66, 31102, 36, 'string', 1]);

    if (engine === 'chromium') {
      const cost = await page.evaluate(async () => {
        const query = 'نيقوديموس';
        const start = performance.now();
        const cold = await searchLocalBible(query,'AVD');
        const built = performance.now();
        const samples = [];
        for (let i=0; i<5; i++) {
          const before = performance.now();
          await searchLocalBible(query,'AVD');
          samples.push(Math.round(performance.now()-before));
        }
        const index = lastSearchIndex.index;
        const strings = [...index.dictionary, ...index.chapterKeys];
        const bytes = Object.values(index).reduce((n,field)=>n+(field.byteLength || 0),0)
          + new TextEncoder().encode(strings.join('')).byteLength;
        return {verses:index.chapterIds.length, hits:cold.length, payloadBytes:bytes,
          firstSearchMs:Math.round(built-start), warmMs:samples};
      });
      assert.equal(cost.verses,31102);
      assert.ok(cost.hits > 0);
      t.diagnostic('Bundled AVD search, desktop Chromium: '+JSON.stringify(cost));
    }

    assert.equal(await page.evaluate(() => downloadTranslationToLocal('KJV', '/api/bible')), true);
    const other = await open();
    assert.deepEqual(await other.evaluate(async () => {
      const reads = [];
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function(key) { reads.push(key); return get.call(this, key); };
      try {
        const codes = [...await getDownloadedTranslations(['KJV','AVD','X'])];
        const listReads = reads.length;
        const verses = await readBibleChapter('KJV', 'John', 3);
        return [codes, listReads, reads.length, verses.map(v => [v._id, v.text, v.lang])];
      } finally { IDBObjectStore.prototype.get = get; }
    }), [['KJV','AVD'], 0, 2, [['id1','Verse 1','english'],['id2','Verse 2','english']]]);

    // Read a chapter in one tab, replace its translation in another, then
    // access the same reference. Its cached text must follow the new version.
    const old = await page.evaluate(() => readBibleContents('KJV'));
    const ticket = await page.evaluate(() => beginBibleInstall('KJV'));
    assert.equal(await other.evaluate(async () => {
      const ticket = await beginBibleInstall('KJV');
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (String(key).endsWith('/manifest')) throw new DOMException('Injected disk failure', 'QuotaExceededError');
        return put.apply(this, arguments);
      };
      try { await commitBibleInstall('KJV', ticket, [fixture(9)]); }
      catch (error) { return error.name; }
      finally { IDBObjectStore.prototype.put = put; }
    }), 'QuotaExceededError');
    assert.equal(await page.evaluate(ticket => commitBibleInstall('KJV', ticket, [fixture(7)]), ticket), false);
    assert.deepEqual(await page.evaluate(async () => [(await readBibleContents('KJV')).version,
      (await readBibleChapter('KJV','John',3)).length, (await localforage.getItem(legacyKey('KJV'))).length,
      (await localforage.keys()).filter(k=>k.startsWith(base('KJV')+'data/')).length]), [old.version,2,2,1]);

    assert.equal(await other.evaluate(async () => commitBibleInstall('KJV', await beginBibleInstall('KJV'), [fixture(8)])), true);
    const replacement = await page.evaluate(() => readBibleContents('KJV'));
    assert.notEqual(replacement.version, old.version);
    assert.equal(await page.evaluate(async () => (await readBibleChapter('KJV','John',3))[0]._id), 'id8');
    assert.equal(await page.evaluate(async version => (await localforage.keys()).some(k=>k.startsWith(chapterPrefix('KJV', version))), old.version), false);
    assert.equal(await other.evaluate(async () => (await readLocalChapter('KJV','John',3))[0]._id), 'id8');
    assert.deepEqual(await other.evaluate(async () => {
      for (let chapter = 1; chapter <= 5; chapter++) {
        const book = (await readBibleContents('AVD')).books[0];
        await readLocalChapter('AVD',book.bookName,chapter);
      }
      return [recentChapters.size, [...recentChapters.keys()].some(key => key.startsWith(base('KJV')))];
    }), [4, false]);
    const pending = await page.evaluate(() => beginBibleInstall('KJV'));
    await other.evaluate(() => deleteTranslationFromLocal('KJV'));
    assert.equal(await page.evaluate(ticket => commitBibleInstall('KJV', ticket, [fixture(1)]), pending), false);
    assert.equal(await other.evaluate(() => isTranslationDownloaded('KJV')), false);
    assert.deepEqual(await page.evaluate(async () => [(await localforage.keys()).filter(k=>k.includes('KJV')), await readBibleContents('KJV'), await readBibleChapter('KJV','John',3)]), [[],null,null]);
  });
}
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  test(engine + ' migrates installed Bibles offline and recovers partial chapter batches', async t => {
    const browser = await launcher.launch();
    t.after(() => browser.close());
    const context = await browser.newContext();
    await context.route('https://migration.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Migration</title>' }));
    const platform = read('platform').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
    async function open(beforePlatform) {
      const page = await context.newPage();
      await page.goto('https://migration.test/');
      await page.addScriptTag({ path: require.resolve('localforage/dist/localforage.js') });
      if (beforePlatform) await page.evaluate(beforePlatform);
      await page.addScriptTag({ content: `
        const Capacitor = { isNativePlatform: () => true };
        ${platform}
        let pauseBatches = false;
        async function waitForNavigationIdle() {
          if (pauseBatches && (await localforage.keys()).some(k=>k.startsWith(base('X_EN')+'data/'))) {
            window.paused = true;
            await new Promise(resolve => { window.resume = resolve; });
          }
        }
        ${scripts}` });
      return page;
    }

    const first = await open(async () => {
      const previous = localforage.createInstance({ name: 'taspe7_app', storeName: 'hymns_store' });
      const rows = Array.from({length:40}, (_, i) => ({ _id: 'verse'+i, bookNumber:43, bookName:'John', chapter:i+1,
        verseNumber:1, text:'Verse '+i, lang:'english', translation:'X-EN' }));
      await previous.setItem('taspe7_bible_db_X_EN', rows);
      await previous.setItem('taspe7_bible_db_KEH', rows);
    });
    async function pauseAfterFirstBatch(page) {
      await page.evaluate(() => {
        window.paused = false;
        pauseBatches = true;
        window.migrationRun = migrateLegacyBibles();
      });
      await page.waitForFunction(() => window.paused);
    }
    await pauseAfterFirstBatch(first);
    assert.deepEqual(await first.evaluate(async () => [(await readBibleContents('X-EN')),
      (await localforage.getItem(legacyKey('X_EN'))).length,
      (await localforage.keys()).filter(k=>k.startsWith(base('X_EN')+'data/')).length]), [null,40,16]);
    await first.close(); // A committed batch with no published manifest survives restart.

    const page = await open();
    assert.equal(await page.evaluate(async () => {
      await storageReady;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (String(key).endsWith('/John/18')) throw new DOMException('Disk full', 'QuotaExceededError');
        return put.apply(this, arguments);
      };
      try { await migrateLegacyBibles(); }
      catch (e) { return e.name; }
      finally { IDBObjectStore.prototype.put = put; }
    }), 'QuotaExceededError');
    assert.deepEqual(await page.evaluate(async () => [(await readBibleContents('X-EN')),
      (await localforage.keys()).filter(k => k.startsWith(base('X_EN'))).length,
      (await localforage.getItem(legacyKey('X_EN'))).length]), [null,0,40]);
    await page.evaluate(() => migrateLegacyBibles());
    assert.deepEqual(await page.evaluate(async () => {
      const contents = await readBibleContents('X-EN');
      const verse = (await readBibleChapter('X-EN', 'John', 40))[0];
      return [contents.verseCount, contents.books[0].chapters.length, verse._id, verse.text, verse.lang,
        (await localforage.getItem(legacyKey('X_EN'))).length, await readBibleContents('KEH')];
    }), [40,40,'verse39','Verse 39','english',40,null]);
    assert.equal(await page.evaluate(async () => {
      const version = (await readBibleContents('X-EN')).version;
      await migrateLegacyBibles();
      return (await readBibleContents('X-EN')).version === version;
    }), true);

    // Replace the fixture with a legacy-only install and delete from another
    // tab between batches. Stale work must leave no chapters or manifest.
    await page.evaluate(async () => {
      const rows = await localforage.getItem(legacyKey('X_EN'));
      await removeBibleDataset('X-EN');
      await localforage.setItem(legacyKey('X_EN'), rows);
    });
    await pauseAfterFirstBatch(page);
    const other = await open();
    await other.evaluate(() => removeBibleDataset('X-EN'));
    await page.evaluate(async () => { pauseBatches = false; window.resume(); await window.migrationRun; });
    assert.deepEqual(await other.evaluate(async () => [(await readBibleContents('X-EN')),
      (await localforage.keys()).filter(k=>k.includes('X_EN'))]), [null,[]]);
    assert.equal(await other.evaluate(async () => {
      const legacy = localforage.createInstance({ name: 'taspe7_app', storeName: 'hymns_store' });
      return legacy.getItem(legacyKey('X_EN'));
    }), null);
  });
}
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  test(engine + ' offline search matches legacy ranking and reuses a versioned index', async t => {
    const browser = await launcher.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('https://search.test/**', route => route.fulfill({body:'<title>search</title>',contentType:'text/html'}));
    await page.goto('https://search.test/');
    async function load() {
      await page.addScriptTag({path:require.resolve('localforage/dist/localforage.js')});
      await page.addScriptTag({content:`
        localforage.config({name:'taspe7_app',storeName:'bible_store'});
        const storageReady = Promise.resolve(), isApp = true;
        const waitForNavigationIdle = async () => {}, isRetiredTranslation = () => false, removeLegacyStorageKeys = async () => {};
        ${scripts}
        const payloadReads = [];
        const rawGet = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function(key) {
          payloadReads.push(key);
          return rawGet.apply(this, arguments);
        };
      `});
    }
    await load();
    const expected = await page.evaluate(async () => {
      const texts = ['Light of LIFE','Life and light','light only','other life','أَلْحَيَاة نور','نور الحياة',
        'Nicodemus came by night','two   spaces','Life light light','light of life','no match'];
      const rows = Array.from({length:220}, (_,i) => ({ _id:'v'+i, bookName:'John', chapter:i%61+1,
        bookNumber:43,verseNumber:220-i,translation:'KJV',text:texts[i%texts.length],cleanText:i%10===0?'another reading':'' }));
      await localforage.setItem(legacyKey('KJV'),rows);
      window.queries = ['light of life','life light','life missing night','light','ight','light light','نور الحياه','النور',
        'يَاة','two  spaces','reading light','Nicod','missing','ُ','other  life'];
      const answers = {};
      for (const query of queries) answers[query] = (await searchLocalBible(query,'KJV')).map(v=>v._id);
      await migrateLegacyBibles();
      payloadReads.length = 0;
      return answers;
    });
    const measured = await page.evaluate(async () => {
      const answers = {};
      const cancel = new AbortController();
      const cancelled = searchLocalBible('light','KJV',{signal:cancel.signal}).then(()=>false, e=>e.name==='AbortError');
      const concurrent = searchLocalBible('Nicod','KJV');
      cancel.abort();
      await concurrent;
      for (const query of queries) answers[query] = (await searchLocalBible(query,'KJV')).map(v=>v._id);
      return {answers,cancelled:await cancelled,fullReads:payloadReads.filter(k=>k===legacyKey('KJV')).length};
    });
    assert.deepEqual(measured.answers,expected);
    assert.equal(measured.cancelled,true);
    assert.equal(measured.fullReads,1);

    await page.reload();
    await load();
    assert.deepEqual(await page.evaluate(async () => {
      const ids = (await searchLocalBible('light of life','KJV')).map(v=>v._id);
      const warm = [...payloadReads];
      payloadReads.length = 0;
      await searchLocalBible('absent needle','KJV');
      return [ids,warm.filter(k=>k===legacyKey('KJV')).length,warm.filter(k=>k.includes('/search/')).length,
        payloadReads.filter(k=>k.includes('/data/')||k.includes('/search/')||k===legacyKey('KJV')).length];
    }), [expected['light of life'],0,1,0]);
    await page.evaluate(async () => {
      const key = (await localforage.keys()).find(k=>k.includes('/search/'));
      await localforage.setItem(key, {chapterIds:[]});
    });
    await page.reload();
    await load();
    assert.deepEqual(await page.evaluate(async () => (await searchLocalBible('Nicod','KJV')).map(v=>v._id)), expected.Nicod);
    assert.deepEqual(await page.evaluate(async () => {
      const rows = [{_id:'new',bookName:'Mark',bookNumber:41,chapter:1,verseNumber:1,text:'replacement'}];
      await commitBibleInstall('KJV',await beginBibleInstall('KJV'),rows);
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value,key) {
        if (String(key).includes('/search/')) throw new DOMException('Disk full','QuotaExceededError');
        return put.apply(this,arguments);
      };
      let oldHits, newHits;
      try {
        payloadReads.length = 0;
        oldHits = await searchLocalBible('life','KJV');
        newHits = await searchLocalBible('placement','KJV');
      } finally { IDBObjectStore.prototype.put = put; }
      if (payloadReads.filter(k=>k===legacyKey('KJV')).length !== 1) throw new Error('Rebuilt index on a second query');
      await removeBibleDataset('KJV');
      return [oldHits.length,newHits.map(v=>v._id),(await searchLocalBible('replacement','KJV')).length,
        (await localforage.keys()).filter(k=>k.includes('/search/')).length];
    }), [0,['new'],0,0]);
  });
}
