const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/hooks/usePresentation.js'), 'utf8')
  .replace(/^import .*;$/gm, '').replaceAll('export function', 'function')
  .replace("import('socket.io-client')", 'loadSocketClient()');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function setup(session, load) {
  const effects = [], events = new Map(), handlers = new Map(), emitted = [], intervals = new Map();
  let connections = 0, disconnects = 0, stateIndex = 0;
  const states = [];
  const socket = { id: 'controller-id',
    on(event, fn) { handlers.set(event, fn); return this; },
    emit(...args) { emitted.push(args); },
    disconnect() { disconnects++; },
  };
  const io = (url, options) => { connections++; assert.equal(options.transports[0], 'websocket'); return socket; };
  const context = {
    getApiBaseUrl: () => 'https://api.test/api', process: { env: {} }, console: { log() {}, error() {} },
    useRef: current => ({ current }), useCallback: fn => fn,
    useState(value) { const index = stateIndex++; states[index] = value; return [value, next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useEffect(fn) { effects.push(fn); },
    loadSocketClient: () => load ? load(io) : Promise.resolve({ io }),
    setInterval(fn, ms) { intervals.set(ms, fn); return ms; }, clearInterval: id => intervals.delete(id),
    localStorage: { removeItem() {} }, fetch: async () => ({}),
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  };
  vm.runInNewContext(source + ';globalThis.api=usePresentation(session, "controller");', { ...context, session });
  const cleanups = effects.map(effect => effect());
  return { io, handlers, emitted, events, intervals, states, get connections() { return connections; }, get disconnects() { return disconnects; },
    cleanup() { cleanups.forEach(fn => fn?.()); } };
}

test('ordinary Hymns browsing does not load the socket client or start keep-alive', async () => {
  let loads = 0;
  const h = setup(null, async () => { loads++; return {}; });
  await flush(); assert.equal(loads, 0); assert.equal(h.intervals.size, 0);
  h.cleanup();
});

test('an existing live session connects automatically and retains keep-alive, join and cleanup behavior', async () => {
  const h = setup('restored-session'); await flush();
  assert.equal(h.connections, 1);
  assert.equal(h.intervals.has(10 * 60 * 1000), true);
  h.handlers.get('connect')();
  assert.equal(h.states[0], true);
  assert.equal(h.emitted[0][0], 'join-session');
  assert.equal(h.emitted[0][1].dataShowId, 'restored-session');
  assert.equal(h.emitted[0][1].role, 'controller');
  h.cleanup(); assert.equal(h.disconnects, 1); assert.equal(h.events.size, 0); assert.equal(h.intervals.size, 0);
});

test('closing or switching sessions while the socket chunk loads cannot create an abandoned connection', async () => {
  const gate = deferred();
  const h = setup('old-session', async io => { await gate.promise; return { io }; });
  h.cleanup(); gate.resolve(); await flush();
  assert.equal(h.connections, 0); assert.equal(h.events.size, 0);
});

test('a failed socket import retries on reconnection instead of disabling the live session', async () => {
  let attempts = 0;
  const h = setup('restored-session', async io => { attempts++; if (attempts === 1) throw Error('offline'); return { io }; });
  await flush(); assert.equal(h.connections, 0);
  h.events.get('online')(); await flush();
  assert.equal(attempts, 2); assert.equal(h.connections, 1);
  h.handlers.get('connect')();
  assert.equal(h.emitted[0][1].dataShowId, 'restored-session');
  h.cleanup();
});
