/* eslint-disable @typescript-eslint/no-require-imports -- Node browser test. */
// Run against the frontend dev server or a served production export.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = process.env.WASLA_READER_TEST_URL || 'http://localhost:3000';

test('direct Bible entry, warm tap and swipe use only the requested chapter', async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__seed') return route.fulfill({ contentType: 'text/html', body: 'seed' });
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    const data = url.pathname.endsWith('/translations') ? ['AVD','KJV'] : {user:{_id:'tester',name:'Tester',bibleNotes:[],bibleHighlights:[]},inbox:[],updates:[],items:[]};
    return route.fulfill({json:data, headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  });
  await page.goto(origin + '/__seed');
  await page.evaluate(async () => {
    const open = indexedDB.open('taspe7_app');
    open.onupgradeneeded = () => open.result.createObjectStore('bible_store');
    const db = await new Promise(resolve => { open.onsuccess = () => resolve(open.result); });
    const tx = db.transaction('bible_store','readwrite'), store = tx.objectStore('bible_store');
    for (const translation of ['KJV','AVD']) {
      const prefix = 'wasla_bible_v1/' + translation + '/';
      const chapters = [], rows = [];
      for (const chapter of [3,4,5]) {
        const verse = {_id:translation+chapter, translation,bookName:'John',bookNumber:43,chapter,verseNumber:1,text:translation+' chapter '+chapter};
        store.put([verse],prefix+'data/test/John/'+chapter);
        chapters.push({chapter,key:'John/'+chapter,verseCount:1});
        rows.push(verse);
      }
      store.put({schema:1,version:'test',translation,verseCount:3,books:[{bookName:'John',bookNumber:43,chapters}]},prefix+'manifest');
      store.put(rows,'taspe7_bible_db_'+translation);
    }
    await new Promise(resolve => {tx.oncomplete=resolve;}); db.close();
    for(const [key,value] of Object.entries({user_Taspe7_Token:'fixture',user_Taspe7_ID:'tester',user_Taspe7_GlobalRole:'USER',
      user_Taspe7_Username:'tester','app-language':'en',wasla_splash_version:'2.0.15',wasla_swipe_navigation:'on',
      taspe7_storage_migrated_v1:'1',taspe7_removed_keh_erv_v1:'1',taspe7_bible_translation:'KJV',
      taspe7_bible_last_position:JSON.stringify({bookName:'John',chapter:3})})) localStorage.setItem(key,value);
  });
  await page.addInitScript(() => {
    // The fixture serves exported RSC paths directly in place of the worker.
    Object.defineProperty(navigator.serviceWorker, 'controller', {
      configurable: true, value: {scriptURL: '/sw.js?v=navigation-v2'},
    });
    window.verseReads = [];
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(key) {
      if (typeof key === 'string' && (key.includes('/data/') || key.startsWith('taspe7_bible_db_'))) window.verseReads.push(key);
      if (key === window.holdVerseKey) {
        const tx = this.transaction;
        const done = tx.oncomplete;
        tx.oncomplete = event => { window.releaseHeldRead = () => done.call(tx, event); };
        window.holdVerseKey = null;
      }
      return get.call(this,key);
    };
  });
  await page.goto(origin+'/bible_form/');
  const panel = page.locator('[data-tab-index="1"][data-tab-active="true"]');
  const verse = id => panel.locator('[data-bible-verse="'+id+'"]').first();
  const reads = () => page.evaluate(()=>window.verseReads);
  await verse('KJV3').waitFor();
  assert.deepEqual(await reads(),['wasla_bible_v1/KJV/data/test/John/3']);
  const nav = page.locator('nav[aria-label="Primary navigation"]');
  await nav.getByRole('link',{name:'Pray',exact:true}).tap();
  await page.locator('[data-tab-index="0"][data-tab-active="true"]').waitFor();
  await nav.getByRole('link',{name:'Bible',exact:true}).tap();
  await verse('KJV3').waitFor();

  await page.waitForTimeout(400);
  const cdp = await context.newCDPSession(page);
  for (const destination of [0,1]) {
    const start = destination===0 ? 75 : 305;
    const sign = destination===0 ? 1 : -1;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y:450}]});
    for(let i=1;i<=5;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+sign*i*36,y:450}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('[data-tab-active="true"][data-tab-index="'+destination+'"]').waitFor();
    await page.waitForTimeout(350);
  }
  await verse('KJV3').waitFor();
  const next = panel.locator('[data-bible-chapter-navigation] button').last();
  await next.press('Enter');
  await verse('KJV4').waitFor();
  await next.press('Enter');
  await verse('KJV5').waitFor();
  assert.deepEqual(await reads(),[3,4,5].map(n=>'wasla_bible_v1/KJV/data/test/John/'+n));

  // Finish an older AVD read after the user has switched back to KJV.
  await panel.getByTitle('Settings',{exact:true}).tap();
  const settings = page.getByRole('dialog',{name:'Settings',exact:true});
  await page.evaluate(() => { window.holdVerseKey = 'wasla_bible_v1/AVD/data/test/John/5'; });
  await settings.getByText('AVD',{exact:true}).tap();
  await page.waitForFunction(() => typeof window.releaseHeldRead === 'function');
  await settings.getByText('KJV',{exact:true}).tap();
  await verse('KJV5').waitFor({state:'attached'});
  await page.evaluate(async () => {
    window.releaseHeldRead();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await verse('AVD5').count(),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('taspe7_bible_last_verses')).translation),'KJV');
  assert.deepEqual(await reads(),[3,4,5].map(n=>'wasla_bible_v1/KJV/data/test/John/'+n).concat('wasla_bible_v1/AVD/data/test/John/5'));

  await settings.getByTitle('Close',{exact:true}).tap();
  await page.evaluate(() => Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
  await panel.getByTitle('Search Bible',{exact:true}).tap();
  const input = panel.locator('input[maxlength="512"]');
  await input.fill('KJV chapter 4');
  await panel.getByTitle('Data Show',{exact:true}).first().waitFor();
  assert.equal(await panel.getByTitle('Data Show',{exact:true}).count(),1);
  await input.fill('KJV chapter 3');
  await page.waitForFunction(() => document.querySelector('[data-tab-active=true] button[title="Data Show"]')
    ?.closest('button.group')?.textContent.includes('KJV chapter 3'));
  const searchReads = (await reads()).slice(4);
  assert.equal(searchReads.filter(key=>key.startsWith('taspe7_bible_db_')).length,1);
  assert.deepEqual(searchReads.filter(key=>key.includes('/data/')), [4,3].map(n=>'wasla_bible_v1/KJV/data/test/John/'+n));
});
