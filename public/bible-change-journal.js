/* Shared by the WebView and its service worker. IDB assigns the write order.
 * Each account/team/collection has its own server replay checkpoint. */
(() => {
    let opening;
    function database() {
        if (!opening) opening = new Promise((resolve, reject) => {
            const request = indexedDB.open('wasla-bible-changes', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                db.createObjectStore('devices');
                db.createObjectStore('summaries');
                const edits = db.createObjectStore('edits', { keyPath: 'sequence', autoIncrement: true });
                edits.createIndex('scope', 'scope');
                edits.createIndex('status', 'status');
            };
            request.onerror = () => { opening = null; reject(request.error); };
            request.onsuccess = () => resolve(request.result);
        });
        return opening;
    }
    async function transaction(stores, mode, run) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            const result = run(tx);
            tx.oncomplete = () => resolve(result?.result);
            tx.onabort = () => reject(tx.error);
            tx.onerror = () => reject(tx.error);
        });
    }
    const scope = (api, owner, kind) => JSON.stringify([api, owner, kind]);
    const list = key => transaction('edits', 'readonly', tx => tx.objectStore('edits').index('scope').getAll(key));
    const summary = key => transaction('summaries', 'readonly', tx => tx.objectStore('summaries').get(key));
    function recordCount(tx, edit, delta) {
        const store = tx.objectStore('summaries');
        const get = store.get(edit.scope);
        get.onsuccess = () => {
            const meta = get.result || { pending: 0 };
            meta.pending = Math.max(0, meta.pending + delta);
            if (edit.version >= (meta.version || 0)) Object.assign(meta, { version: edit.version, count: edit.count });
            store.put(meta, edit.scope);
        };
    }
    function announce(edit, rejected = false) {
        const { scope, kind, owner, team, api, count, version } = edit;
        const detail = { scope, kind, owner, team, api, count, version, rejected, reconcile: edit.reconcile };
        globalThis.dispatchEvent(new CustomEvent('wasla:bible-change', { detail }));
        const channel = typeof BroadcastChannel === 'function' && new BroadcastChannel('wasla-bible-changes');
        if (channel) { channel.postMessage(detail); channel.close(); }
    }
    async function enqueue(edit) {
        edit.scope = scope(edit.api, edit.owner, edit.kind);
        edit.status = 'pending';
        edit.date = new Date().toISOString();
        const db = await database();
        const seq = await new Promise((resolve, reject) => {
            const tx = db.transaction(['devices', 'edits', 'summaries'], 'readwrite');
            const devices = tx.objectStore('devices');
            const lane = JSON.stringify([edit.scope, edit.team]);
            const get = devices.get(lane);
            let added;
            get.onsuccess = () => {
                edit.device = get.result || crypto.randomUUID();
                if (!get.result) devices.put(edit.device, lane);
                added = tx.objectStore('edits').add(edit);
                recordCount(tx, edit, 1);
            };
            tx.oncomplete = () => resolve(added.result);
            tx.onabort = () => reject(tx.error);
        });
        announce(edit);
        return seq;
    }
    async function settle(edit, rejected) {
        await transaction(['edits', 'summaries'], 'readwrite', tx => {
            const rows = tx.objectStore('edits');
            const get = rows.get(edit.sequence);
            get.onsuccess = () => {
                if (get.result?.status !== 'pending') return;
                if (rejected) rows.delete(edit.sequence);
                else rows.put(edit);
                recordCount(tx, edit, -1);
            };
        });
    }
    async function drain(credentials, requested) {
        const rows = await transaction('edits', 'readonly', tx => tx.objectStore('edits').index('status').getAll('pending'));
        const blocked = new Set();
        for (const edit of rows) {
            if (blocked.has(edit.device)) continue;
            const { owner, team, device, sequence, entries, remove } = edit;
            const token = credentials?.owner === owner && credentials.team === team ? credentials.token : edit.token;
            let response;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                response = await fetch(edit.api + '/users/profile-bible/' + edit.kind, {
                    method: 'POST', signal: controller.signal, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ owner, team, device, sequence, entries, remove }),
                });
            } catch { blocked.add(device); continue; }
            finally { clearTimeout(timer); }
            if (response.ok) {
                const { count, version } = await response.json();
                if (!Number.isInteger(count) || !Number.isInteger(version)) { blocked.add(device); continue; }
                delete edit.token;
                Object.assign(edit, { status: 'confirmed', count, version });
                await settle(edit, false);
                announce(edit);
            } else if ([400, 403, 422].includes(response.status)) {
                await settle(edit, true);
                announce(edit, true);
                if (sequence === requested) throw new Error('Annotation rejected (' + response.status + ')');
            } else blocked.add(device);
        }
        return blocked.size === 0;
    }
    let serial = Promise.resolve();
    function flush(credentials, requested) {
        const run = () => navigator.locks ? navigator.locks.request('wasla-bible-replay', () => drain(credentials, requested))
            : drain(credentials, requested);
        serial = serial.catch(() => {}).then(run);
        return serial;
    }
    async function prune(key, version) {
        await transaction('edits', 'readwrite', tx => {
            const req = tx.objectStore('edits').index('scope').openCursor(IDBKeyRange.only(key));
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) return;
                if (cursor.value.status === 'confirmed' && cursor.value.version <= version) cursor.delete();
                cursor.continue();
            };
        });
    }
    // Older installations can still have annotation requests in the original
    // queue. Both runners use one lock and notify the same collection observers.
    async function replayLegacy(db) {
        const run = async () => {
            const items = await new Promise((resolve, reject) => {
                const get = db.transaction('sync-queue').objectStore('sync-queue').getAll();
                get.onsuccess = () => resolve(get.result);
                get.onerror = () => reject(get.error);
            });
            for (const item of items.sort((a, b) => a.timestamp - b.timestamp)) {
                const response = await fetch(item.url, { method: item.method,
                    headers: { ...item.headers, 'Content-Type': 'application/json' },
                    body: item.payload ? JSON.stringify(item.payload) : undefined });
                if (!response.ok && (response.status < 400 || response.status >= 500 || [408, 429].includes(response.status))) {
                    throw new Error('Retry pending sync');
                }
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('sync-queue', 'readwrite');
                    tx.objectStore('sync-queue').delete(item.id);
                    tx.oncomplete = resolve;
                    tx.onabort = () => reject(tx.error);
                });
                const match = item.url.match(/^(.*)\/users\/bible-(note|highlight)(?:\/([^/?]+))?$/);
                if (match) announce({ api: match[1], kind: match[2] === 'note' ? 'notes' : 'highlights',
                    owner: item.payload?.userid || match[3], reconcile: true }, !response.ok);
            }
        };
        return navigator.locks ? navigator.locks.request('wasla-legacy-replay', run) : run();
    }
    globalThis.waslaBibleJournal = { scope, list, summary, enqueue, flush, prune, replayLegacy };
})();
