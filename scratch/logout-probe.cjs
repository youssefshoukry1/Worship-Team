const { chromium } = require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('out');
(async()=>{
 const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.txt':'text/plain','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage();const requests=[];let logout=false;
 await page.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){Object.entries({'app-language':'en',user_Taspe7_Token:'logout-token',user_Taspe7_ID:'tester',user_Taspe7_Username:'tester',user_Taspe7_GlobalRole:'PROGRAMER',wasla_splash_version:'1.0.6',taspe7_theme:'dark'}).forEach(([k,v])=>localStorage.setItem(k,v));sessionStorage.setItem('seeded','1');}});
 await page.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(base)){if(logout)requests.push(url.replace(base,''));return route.continue();}if(url.includes('/my-teams'))return route.fulfill({json:[]});return route.fulfill({json:{user:{_id:'tester',Name:'Logout Tester',username:'tester',prayTime:[],bibleNotes:[],bibleHighlights:[]},friends:[],incoming:[],outgoing:[],items:[],accounts:[]}})});
 page.on('pageerror',e=>console.log('ERROR',e.message));await page.goto(base+'/normal_UserProfile/');await page.getByRole('heading',{name:'Logout Tester',exact:true}).waitFor();
 console.log((await page.locator('body').innerText()).slice(-2700));
 const settings=page.getByRole('button',{name:/settings/i});console.log('settings',await settings.count());
 
 const btn=page.getByRole('button',{name:'Log Out',exact:true});await btn.scrollIntoViewIfNeeded();
 await page.evaluate(()=>{window.__frames=[];const frame=()=>{window.__frames.push({t:performance.now(),token:!!localStorage.getItem('user_Taspe7_Token'),auth:document.body.textContent.includes('Sign in to Wasla'),nav:!!document.querySelector('nav'),scroll:scrollY,focus:document.activeElement.tagName});if(window.__frames.length<100)requestAnimationFrame(frame)};requestAnimationFrame(frame)});
 logout=true;await btn.click();await page.getByRole('heading',{name:'Sign in to Wasla'}).waitFor();await page.waitForTimeout(1000);console.log(JSON.stringify({url:page.url(),requests,frames:await page.evaluate(()=>window.__frames)},null,2));await page.screenshot({path:'scratch/logout-video/baseline.png'});await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});

