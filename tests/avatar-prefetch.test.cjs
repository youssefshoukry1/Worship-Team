const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('background avatar checks reuse confirmed photos and retry missing, changed and evicted photos', async () => {
  const records = new Map(), index = new Map();
  let reads = 0, downloads = 0, fail = false;
  const store = {
    getItem: async key => { reads++; return records.get(key); },
    setItem: async (key, value) => records.set(key, value),
    removeItem: async key => records.delete(key),
  };
  const navigator = { onLine: true, connection: {} };
  let storageEvent;
  const context = { navigator, Blob, window: {addEventListener:(_, callback)=>{storageEvent=callback;}}, localStorage: { getItem:k=>index.get(k), setItem:(k,v)=>index.set(k,v) },
    localforage: {createInstance:()=>store}, Capacitor:{isNativePlatform:()=>false},
    fetch: async () => { downloads++; return {ok:!fail, blob:async()=>new Blob(['photo'],{type:'image/png'})}; } };
  const source = fs.readFileSync(path.join(__dirname,'../src/app/utils/avatarStorage.js'),'utf8')
    .replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInNewContext(source+';globalThis.prefetch=cacheAvatarsInBackground;globalThis.remove=removeCachedAvatar;', context);
  const check = async (url = 'a.png') => {
    context.prefetch([{_id:'alice',profilePhoto:url}]);
    await new Promise(resolve=>setImmediate(resolve));
  };
  await check();
  assert.deepEqual([reads,downloads],[1,1]);
  for(let i=0;i<100;i++) await check();
  assert.deepEqual([reads,downloads],[1,1]);
  navigator.connection.saveData=true; await check('b.png'); navigator.connection.saveData=false;
  navigator.onLine=false; await check('b.png'); navigator.onLine=true;
  assert.deepEqual([reads,downloads],[1,1]);
  fail=true; await check('b.png'); fail=false; await check('b.png');
  assert.deepEqual([reads,downloads],[3,3]);
  await context.remove('alice','b.png');
  await check('b.png');
  assert.deepEqual([reads,downloads],[5,4]);
  storageEvent({key:'taspe7_avatar_cache_index_v1'});
  await check('b.png');
  assert.deepEqual([reads,downloads],[6,4]);
});
