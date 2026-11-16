const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function fixture({ prayers = [], online = true, fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, shareId: 'server-id' }) }), store = new Map() } = {}) {
    if (!store.has('index')) store.set('index', { version: 1, guestPrays: prayers, recordings: {}, pendingWords: {} });
    let writes = 0, failWrite = false;
    const events = [];
    const storage = { getItem: async key => structuredClone(store.get(key)), removeItem: async key => store.delete(key),
        setItem: async (key, value) => { if (failWrite) throw new Error('Disk full'); store.set(key, structuredClone(value)); writes++; } };
    const context = { ...require('./archive-codec.cjs'), ...require('fflate'), Blob, Uint8Array, btoa, atob, crypto: webcrypto, AbortController,
        navigator: { onLine: online }, window: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        Capacitor: { isNativePlatform: () => false }, localforage: { createInstance: () => storage },
        getApiBaseUrl: () => 'https://example.test/api', fetch, clearTimeout,
        setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); if (delay > 1000) timer.unref(); return timer; } };
    vm.createContext(context);
    const source = ['utils/prayerActivity.js', 'utils/prayRecordings.js', 'services/prayerSync.js'].map(file =>
        fs.readFileSync(path.join(__dirname, '../../src/app', file), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '')).join('\n');
    vm.runInContext(source + '\n;globalThis.api = { configurePrayerSync, preparePrayerAction, retryPrayerAction, wakePrayerSync, newPrayerAction, getGuestPrays, getPrayerActions, settlePrayerAction, applyPrayerRevocations, getRecordingsIndex, buildMyPraysZip, restoreMyPraysZip, localPrayerOverlay, mergeIncomingPrayers, addExternalRecordings, applyPrayerReplies, markPrayerActivitySeen, getRecordingBase64, readAudioBytes };', context);
    return { api: context.api, store, events, context, get writes() { return writes; }, failWrite(value) { failWrite = value; } };
}
module.exports = { fixture };
