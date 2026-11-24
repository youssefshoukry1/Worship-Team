import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';

export const isApp = typeof window !== 'undefined' && (
  Capacitor.isNativePlatform() ||
  (window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes('Electron'))
);

// The only localforage.config() call in the app. Previously ReactQueryProvider (hymns_store)
// and bibleSync (bible_store) both configured the default instance; localforage silently
// ignores config() after first use, so the store depended on which page loaded first.
// bible_store is where data landed on a normal start at "/", so it stays the main store.
const MAIN_STORE = { name: 'taspe7_app', storeName: 'bible_store' };

// Where older builds could have written instead of MAIN_STORE.
const LEGACY_STORES = [
  { name: 'taspe7_app', storeName: 'hymns_store' },
  { name: 'localforage', storeName: 'keyvaluepairs' }, // localforage defaults (web, before any config ran)
];

// Written by the removed React Query persister; nothing reads it anymore.
const OBSOLETE_KEYS = ['REACT_QUERY_OFFLINE_CACHE'];

const MIGRATION_FLAG = 'taspe7_storage_migrated_v1';

const retiredCodes = ['KEH', 'ERV-AR', 'ERV_AR'];
export const isRetiredTranslation = code => retiredCodes.includes(String(code).toUpperCase());

function cleanBiblePreferences() {
  if (isRetiredTranslation(localStorage.getItem('taspe7_bible_translation'))) {
    localStorage.setItem('taspe7_bible_translation', 'AVD');
  }
  for (const key of ['taspe7_compare_translations', 'taspe7_bible_downloaded_translations']) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const current = JSON.parse(raw);
      const kept = current.filter(code => !isRetiredTranslation(code));
      if (kept.length !== current.length) localStorage.setItem(key, JSON.stringify(kept));
    } catch { localStorage.removeItem(key); }
  }
  const key = 'taspe7_bible_last_verses';
  const last = localStorage.getItem(key);
  if (last && retiredCodes.some(code => last.toUpperCase().includes(code))) {
    try {
      if (isRetiredTranslation(JSON.parse(last)?.translation)) localStorage.removeItem(key);
    } catch { localStorage.removeItem(key); }
  }
}

if (typeof window !== 'undefined') {
  localforage.config(MAIN_STORE);
  try { cleanBiblePreferences(); } catch { /* Storage can be unavailable. */ }
}

// Opens the database without creating it (or the store) when it doesn't exist.
function idbHasStore({ name, storeName }) {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(name);
    } catch {
      resolve(false);
      return;
    }
    req.onupgradeneeded = (e) => e.target.transaction.abort(); // DB did not exist
    req.onerror = () => resolve(false);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const has = db.objectStoreNames.contains(storeName);
      db.close();
      resolve(has);
    };
  });
}

async function migrateLegacyStores() {
  try {
    if (typeof indexedDB === 'undefined' || localStorage.getItem(MIGRATION_FLAG)) return;

    const mainKeys = new Set(await localforage.keys());
    for (const key of OBSOLETE_KEYS) {
      if (mainKeys.has(key)) await localforage.removeItem(key);
    }

    for (const source of LEGACY_STORES) {
      if (!(await idbHasStore(source))) continue;

      const legacy = localforage.createInstance(source);
      for (const key of await legacy.keys()) {
        if (OBSOLETE_KEYS.includes(key)) {
          await legacy.removeItem(key);
          continue;
        }
        if (mainKeys.has(key)) continue; // main store wins; legacy copy is left untouched
        const value = await legacy.getItem(key);
        if (value !== null) {
          await localforage.setItem(key, value);
          mainKeys.add(key);
        }
      }
    }

    localStorage.setItem(MIGRATION_FLAG, String(Date.now()));
  } catch (err) {
    console.warn('[Storage] Legacy store migration failed, will retry next launch:', err);
  }
}

// Resolves once data from legacy stores has been copied into MAIN_STORE. Await it before
// reading offline data that must not be re-seeded (hymns cache, downloaded Bibles).
export const storageReady = typeof window === 'undefined' ? Promise.resolve() : migrateLegacyStores().then(async () => {
  const flag = 'taspe7_removed_keh_erv_v1';
  if (localStorage.getItem(flag)) return;
  const stores = [localforage];
  for (const source of LEGACY_STORES) {
    if (await idbHasStore(source)) stores.push(localforage.createInstance(source));
  }
  for (const store of stores) {
    for (const code of retiredCodes) await store.removeItem(`taspe7_bible_db_${code}`);
  }
  localStorage.setItem(flag, '1');
}).catch(error => console.warn('[Storage] Bible cleanup will retry next launch', error));
