// Run after npm run build: node --test tests/theme.browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../out');
const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/version.json'))).version;
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
let browser, safari, server, base;
before(async () => {
  server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    const pathname = requestUrl.pathname;
    const routePayload = requestUrl.searchParams.has('_rsc');
    if (pathname === '/__seed') { res.setHeader('Content-Type', 'text/html'); return res.end('<html></html>'); }
    let file = path.join(root, decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, routePayload ? 'index.txt' : 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', routePayload ? 'text/x-component' : (types[path.extname(file)] || 'application/octet-stream'));
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  safari = await webkit.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (safari) await safari.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function setup({ electron = false, api, engine = browser } = {}) {
  const context = await engine.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
    ...(electron ? { userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Electron/30.0.0' } : {}) });
  const page = await context.newPage();
  await page.route('**/*', async route => {
    if (route.request().url().startsWith(base)) return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (api) { const handled = await api(route); if (handled) return; }
    const url = route.request().url();
    if (url.includes('/my-teams') || url.includes('/hymns') || url.includes('/bible/')) return route.fulfill({ headers, json: [] });
    return route.fulfill({ headers, json: { user: { _id: 'tester', Name: 'Theme Reader', name: 'Theme Reader', username: 'tester', prayTime: [], bibleNotes: [], bibleHighlights: [] }, items: [], activeNotes: [], nextCursor: null, publishing: { allowed: true }, inbox: [], updates: [], accounts: [], friends: [], incoming: [], outgoing: [] } });
  });
  await page.goto(base + '/__seed');
  await page.evaluate(async version => {
    for (const [key, value] of Object.entries({ 'app-language': 'en', user_Taspe7_Token: 'test-token', user_Taspe7_ID: 'tester', user_Taspe7_Username: 'tester', wasla_splash_version: version, wasla_intro_last_time: String(Date.now()), taspe7_storage_migrated_v1: '1', taspe7_category_hymns_tour_done: '1', taspe7_hymns_sync_version: '1' })) localStorage.setItem(key, value);
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('taspe7_app', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('bible_store');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('bible_store', 'readwrite');
      tx.objectStore('bible_store').put([{ _id: 'old', title: 'Old hymn', party: ['all'], lyrics: [], usageCount: 1 }], 'taspe7_hymns_json');
      tx.objectStore('bible_store').put([{ _id: 'verse', bookName: 'Genesis', bookNumber: 1, chapter: 1, verseNumber: 1, text: 'Verse', translation: 'AVD' }], 'taspe7_bible_db_AVD');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, version);
  await page.addInitScript(() => { window.__navigationSession = Math.random(); });
  return { context, page };
}


const screenshotDir = path.join(require('node:os').tmpdir(), 'taspe7-theme-review');
fs.mkdirSync(screenshotDir, { recursive: true });

for (const engineName of ['chromium', 'webkit']) {
  test(`${engineName}: theme switches persist and all main pages share the selected background`, async () => {
    const { context, page } = await setup({ electron: true, engine: engineName === 'webkit' ? safari : browser });
    try {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const all = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/Taspe7.bibles.json'), 'utf8'));
      const verses = all.filter(v => v.bookNumber === 45 && v.chapter === 8 && v.verseNumber >= 29 && v.verseNumber <= 34)
        .sort((a,b) => a.verseNumber-b.verseNumber).map(v => ({...v, _id: `theme-verse-${v.verseNumber}`, translation: 'AVD'}));
      await page.evaluate(async verses => {
        localStorage.setItem('taspe7_bible_last_position', JSON.stringify({bookName: verses[0].bookName, chapter: 8}));
        localStorage.setItem('taspe7_bible_last_verses', JSON.stringify({bookName: verses[0].bookName, chapter: 8, translation: 'AVD', verses}));
        localStorage.setItem('taspe7_bible_view_mode', 'list');
        localStorage.setItem('taspe7_local_bible_highlights', JSON.stringify({'theme-verse-31':'#7ce6f5', 'theme-verse-32':'#7ce6f5', 'theme-verse-33':'#7ce6f5'}));
        const db = await new Promise(resolve => {const r=indexedDB.open('taspe7_app'); r.onsuccess=()=>resolve(r.result);});
        await new Promise(resolve => {const tx=db.transaction('bible_store','readwrite');tx.objectStore('bible_store').put(verses,'taspe7_bible_db_AVD');tx.oncomplete=resolve;});db.close();
      }, verses);
      await page.goto(base + '/normal_UserProfile/', { waitUntil: 'domcontentloaded' });
      const toggle = page.getByRole('switch', { name: 'Toggle Theme' });
      await toggle.waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(6, 11, 19)', 'Light retains the previous dark background');
      await toggle.click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      assert.equal(await toggle.getAttribute('aria-checked'), 'true');
      assert.equal(await page.evaluate(() => localStorage.getItem('taspe7_theme')), 'dark');
      assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#090c0f');
      let prayerSurface, prayerPage;
      const surfaceStyle = el => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, image: style.backgroundImage, blur: style.backdropFilter || style.webkitBackdropFilter, shadow: style.boxShadow };
      };
      for (const route of ['/', '/bible_form/', '/hymns/', '/friends/', '/normal_UserProfile/', '/WorkSpace/']) {
        await page.goto(base + route, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-startup-shell]').waitFor({ state: 'detached' });
        await page.locator('.app-page').first().waitFor();
        await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(9, 12, 15)');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        const background = await page.locator('.app-page').first().evaluate(el => getComputedStyle(el).backgroundColor);
        assert.equal(background, 'rgb(9, 12, 15)', `${route} shares the black theme`);
        if (route === '/') {
          prayerSurface = await page.locator('.app-card').first().evaluate(surfaceStyle);
          prayerPage = await page.locator('.app-page').first().evaluate(surfaceStyle);
        }
        if (route === '/bible_form/') {
          const glass = await page.locator('.app-reading-surface').evaluate(surfaceStyle);
          assert.equal(glass.background, 'rgba(0, 0, 0, 0)', 'Dark Bible must not add a lighter card tint over the Pray page background');
          assert.equal(glass.image, 'none');
          assert.equal(glass.blur, prayerSurface.blur, 'Keep the shared backdrop blur');
          const biblePage = await page.locator('[data-feature="bible-reader"].app-page').evaluate(surfaceStyle);
          assert.equal(biblePage.background, prayerPage.background, 'Dark Bible and Pray share the same base color');
          assert.equal(biblePage.image, prayerPage.image, 'Dark Bible and Pray share the same ambient background');
          await page.locator('.bible-verse').first().waitFor();
          assert.equal(await page.locator('.bible-verse p').first().evaluate(el => getComputedStyle(el).filter), 'none', 'Blur the backdrop while keeping verse text sharp');
        }
        const nav = page.locator('.app-bottom-nav').first();
        if (await nav.count()) {
          assert.equal(await nav.evaluate(el => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter), 'blur(12px)');
          assert.equal(await nav.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(10, 13, 15, 0.9)');
        }
        if (engineName === 'chromium') {
          if (route === '/bible_form/') await page.locator('.bible-verse').first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({path: path.join(screenshotDir, `dark-${route === '/' ? 'home' : route.split('/')[1]}.png`)});
        }
      }
      await page.goto(base + '/normal_UserProfile/', { waitUntil: 'domcontentloaded' });
      await toggle.click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('taspe7_theme')), 'light');
      await page.reload({waitUntil:'domcontentloaded'});
      await toggle.waitFor();
      assert.equal(await toggle.getAttribute('aria-checked'), 'false');
      await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(6, 11, 19)');
      if (engineName === 'chromium') await page.setViewportSize({width:1280,height:900});
      for (const route of ['/', '/bible_form/', '/hymns/', '/friends/', '/normal_UserProfile/', '/WorkSpace/']) {
        await page.goto(base+route,{waitUntil:'domcontentloaded'});
        await page.locator('[data-startup-shell]').waitFor({state:'detached'});
        await page.locator('.app-page').first().waitFor();
        assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
        assert.equal(await page.locator('.app-page').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(6, 11, 19)',`${route} retains the navy Light palette`);
        const nav=page.locator('.app-bottom-nav').first();
        if(await nav.count()) assert.equal(await nav.evaluate(el=>getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter),'blur(12px)',`${route} shares the Light glass treatment`);
        if(route==='/') {
          prayerSurface=await page.locator('.app-card').first().evaluate(surfaceStyle);
          prayerPage=await page.locator('.app-page').first().evaluate(surfaceStyle);
        }
        if(route==='/bible_form/') {
          const glass=await page.locator('.app-reading-surface').evaluate(surfaceStyle);
          assert.equal(glass.background,'rgba(0, 0, 0, 0)','Main Bible must not add a lighter card tint over the Pray page background');
          assert.equal(glass.image,'none');
          assert.equal(glass.blur,prayerSurface.blur,'Keep the shared backdrop blur');
          const biblePage=await page.locator('[data-feature="bible-reader"].app-page').evaluate(surfaceStyle);
          assert.equal(biblePage.background,prayerPage.background,'Main Bible and Pray share the same base color');
          assert.equal(biblePage.image,prayerPage.image,'Main Bible and Pray share the same ambient background');
        }
        if(engineName==='chromium' && (route==='/' || route==='/bible_form/')) {
          await page.evaluate(()=>document.fonts.ready);
          await page.screenshot({path:path.join(screenshotDir,`light-desktop-${route==='/'?'home':'bible'}.png`)});
        }
      }
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(engineName, (await page.locator('body').innerText()).slice(0, 1800));
      await page.screenshot({ path: path.join(screenshotDir, `${engineName}-failure.png`) });
      throw error;
    } finally { await context.close(); }
  });

  test(`${engineName}: the saved palette is visible before route JavaScript loads`, async () => {
    for (const mode of ['light','dark']) {
      const {context,page}=await setup({engine:engineName==='webkit'?safari:browser});
      let release; const pending = new Promise(resolve=>{release=resolve});
      try {
        await page.evaluate(mode=>localStorage.setItem('taspe7_theme',mode),mode);
        await page.route('**/_next/static/chunks/*.js', async route => {await pending;await route.continue().catch(()=>{});});
        await page.goto(base+'/',{waitUntil:'commit'});
        await page.locator('[data-startup-shell]').waitFor();
        assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
        assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),mode==='dark'?'rgb(9, 12, 15)':'rgb(6, 11, 19)');
      } finally {release();await context.close();}
    }
  });

  test(`${engineName}: prayer backup controls stay readable and fit the screen in both themes`, async () => {
    for (const mode of ['light', 'dark']) {
      const {context,page}=await setup({engine:engineName==='webkit'?safari:browser, api:async route=>{
        if(new URL(route.request().url()).pathname.endsWith('/backup/drive-accounts')) {
          await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{accounts:[
            {email:'reader@example.test',isDefault:true}, {email:'second.reader@example.test',isDefault:false},
          ]}});return true;
        }
        return false;
      }});
      try {
        await page.evaluate(mode=>localStorage.setItem('taspe7_theme',mode),mode);
        await page.goto(base+'/',{waitUntil:'domcontentloaded'});
        const trigger=page.getByRole('button',{name:'Settings',exact:true});
        await trigger.waitFor();
        assert.deepEqual(await trigger.evaluate(el=>{const c=getComputedStyle(el);return[c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth,c.boxShadow]}),['0px','0px','0px','0px','none'],'Three-dot button must not have a border or shadow');
        await trigger.click();
        const dialog=page.getByRole('dialog',{name:'My Prays Backup'});
        await dialog.waitFor();
        const changeAccount=dialog.getByRole('button',{name:'Change Drive Email: reader@example.test'});
        await changeAccount.waitFor();
        const contrast = el => {
          const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
          const ctx=canvas.getContext('2d');
          const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3)};
          const lum=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
          const a=lum(rgb(getComputedStyle(el).color)), b=lum(rgb(getComputedStyle(el.closest('dialog')).backgroundColor));
          return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        };
        for(const control of [dialog.getByText('My Prays Backup',{exact:true}),dialog.getByRole('button',{name:'Backup',exact:true}),dialog.getByRole('button',{name:'Restore',exact:true}),dialog.getByText('Off',{exact:true})]) {
          assert.ok(await control.evaluate(contrast)>=4.5,'Backup text must remain readable on the panel');
        }
        const picker=dialog.getByRole('group',{name:'Automatic backup'});
        assert.equal(await picker.getByRole('radio').count(),4);
        assert.equal(await picker.getByRole('radio',{name:'Off',exact:true}).isChecked(),true);
        for(const option of await picker.getByRole('radio').all()) assert.equal(await option.isDisabled(),true,'Keep scheduling unavailable when the native plugin is absent');
        assert.equal(await dialog.locator('select').count(),0,'Use custom schedule cards instead of a native dropdown');
        assert.equal(await dialog.getByRole('switch',{name:'Wi-Fi only'}).isDisabled(),true);
        await dialog.getByText('Auto backup is available in the mobile app.',{exact:true}).waitFor();
        const line=await dialog.locator(':scope > div').first().evaluate(el=>getComputedStyle(el).borderBottomColor);
        assert.match(line,/0\.1\)$/,'Use a subtle divider instead of the old white rule');
        await changeAccount.click();
        await dialog.getByText('second.reader@example.test',{exact:true}).waitFor();
        for(const size of [{width:390,height:844},{width:320,height:560},{width:1280,height:900}]) {
          await page.setViewportSize(size);
          await page.waitForFunction(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;const r=d.getBoundingClientRect();return r.left>=15&&r.right<=innerWidth-15&&r.top>=15&&r.bottom<=innerHeight-15});
          const dimensions=await dialog.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
          assert.ok(dimensions.scroll<=dimensions.client+1,'No horizontal overflow in the expanded accounts panel');
          if(engineName==='chromium') await page.screenshot({path:path.join(screenshotDir,`backup-${mode}-${size.width}.png`)});
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({state:'detached'});
        assert.equal(await trigger.getAttribute('aria-expanded'),'false');
        assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'Return focus to the settings button');
      } finally {await context.close();}
    }
  });


  test(`${engineName}: custom backup choices save native schedule and Wi-Fi settings`, async () => {
    const {context,page}=await setup({engine:engineName==='webkit'?safari:browser,api:async route=>{
      if(new URL(route.request().url()).pathname.endsWith('/backup/drive-accounts')) {
        await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{accounts:[{email:'reader@example.test',isDefault:true}]}});return true;
      }
      return false;
    }});
    try {
      await page.addInitScript(()=>{
        window.__backupConfigurations=[];
        window.CapacitorCustomPlatform={name:'android'};
        window.Capacitor={
          PluginHeaders:[
            {name:'App',methods:[{name:'addListener',rtype:'callback'},...['removeListener','getLaunchUrl','exitApp','getInfo'].map(name=>({name,rtype:'promise'}))]},
            {name:'PrayerBackup',methods:['configure','setOwner','suspend','runNow','getStatus'].map(name=>({name,rtype:'promise'}))},
          ],
          nativeCallback(plugin,method,options){return `${plugin}:${options.eventName}`},
          async nativePromise(plugin,method,options){
            if(plugin==='PrayerBackup' && method==='configure') {window.__backupConfigurations.push(options);return {nextBackupAt:Date.now()+options.intervalDays*86400000};}
            if(plugin==='PrayerBackup' && method==='getStatus')return {state:'idle'};
            return {};
          },
        };
      });
      await page.goto(base+'/',{waitUntil:'domcontentloaded'});
      const trigger=page.getByRole('button',{name:'Settings',exact:true});await trigger.click();
      const dialog=page.getByRole('dialog',{name:'My Prays Backup'});await dialog.waitFor();
      await dialog.getByRole('button',{name:'Change Drive Email: reader@example.test'}).waitFor();
      const picker=dialog.getByRole('group',{name:'Automatic backup'});
      const weekly=picker.getByRole('radio',{name:'Every 7 days',exact:true});
      assert.equal(await weekly.isDisabled(),false);
      await weekly.check();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('my_prays_schedule_tester')||'{}').intervalDays===7);
      assert.equal(await weekly.isChecked(),true);
      await page.waitForFunction(()=>document.activeElement?.matches('input[type="radio"][value="7"]'));
      // Native radio keyboard interaction also saves through the scheduling service.
      await weekly.press('ArrowRight');
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('my_prays_schedule_tester')||'{}').intervalDays===14);
      const wifi=dialog.getByRole('switch',{name:'Wi-Fi only'});await wifi.uncheck();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('my_prays_schedule_tester')||'{}').wifiOnly===false);
      await picker.getByRole('radio',{name:'Every 30 days',exact:true}).check();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('my_prays_schedule_tester')||'{}').intervalDays===30);
      const latest=await page.evaluate(()=>window.__backupConfigurations.at(-1));
      assert.equal(latest.intervalDays,30);assert.equal(latest.wifiOnly,false);assert.equal(latest.email,'reader@example.test');
      await page.screenshot({path:path.join(screenshotDir,`backup-custom-native-${engineName}.png`)});
      await page.reload({waitUntil:'domcontentloaded'});await trigger.click();await dialog.waitFor();
      assert.equal(await picker.getByRole('radio',{name:'Every 30 days',exact:true}).isChecked(),true);
      assert.equal(await wifi.isChecked(),false);
      await picker.getByRole('radio',{name:'Off',exact:true}).check();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('my_prays_schedule_tester')||'{}').intervalDays===0);
    } finally {await context.close();}
  });

}
