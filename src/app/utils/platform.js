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

if (typeof window !== 'undefined') {
  localforage.config(MAIN_STORE);
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
export const storageReady = typeof window === 'undefined' ? Promise.resolve() : migrateLegacyStores();
