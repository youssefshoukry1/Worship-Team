// Storage-unit tests use the real CPU codec directly. Worker lifecycle and
// transferable behavior are exercised separately in worker/browser tests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ ...require('fflate'), Uint8Array });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/app/utils/prayerArchiveCodec.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '') + '\nglobalThis.process = processPrayerArchive;', context);
const checkArchiveAbort = signal => { if (signal?.aborted) throw new DOMException('Prayer archive cancelled', 'AbortError'); };
module.exports = { yieldArchiveWork: async () => {}, checkArchiveAbort, runPrayerArchive: async (payload, { signal } = {}) => { checkArchiveAbort(signal); return context.process(payload); } };
