const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/androidBack.js'), 'utf8').replace(/^export /gm, '');
const api = {};
vm.runInNewContext(source + '; globalThis.create = createAndroidBackController; globalThis.home = isHomePath;', api);
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function setup(overrides = {}) {
  const state = { path: '/', authenticated: true, scroll: 0, time: 100, refreshes: 0, routes: 0, exits: 0, hints: 0 };
  const controller = api.create({
    getPath: () => state.path, isAuthenticated: () => state.authenticated,
    isScrolled: () => state.scroll > 8, scrollToTop: () => { state.scroll = 0; },
    refreshHome: () => { state.refreshes++; }, goHome: () => { state.routes++; },
    exitApp: () => { state.exits++; }, notifyExit: () => { state.hints++; }, now: () => state.time,
    ...overrides,
  });
  return { state, ...controller };
}

test('all exported launch and Prayer addresses are Home', () => {
  for (const route of ['/', '/index.html', '/pray', '/pray/', '/pray/index.html']) assert.equal(api.home(route), true, route);
  for (const route of ['/friends/', '/normal_UserProfile/index.html', '/prayer', '/login/']) assert.equal(api.home(route), false, route);
});

test('Back on Home scrolls first, then exits without refreshing', () => {
  const h = setup(); h.state.scroll = 600;
  h.back(); assert.equal(h.state.scroll, 0); assert.equal(h.state.exits, 0); assert.equal(h.state.refreshes, 0);
  h.back(); h.back(); assert.equal(h.state.exits, 1, 'duplicate native events cannot exit twice');
});

test('Back at the top refreshes once and the second Back exits', () => {
  const h = setup(); h.back(); h.back();
  assert.equal(h.state.refreshes, 1); assert.equal(h.state.exits, 1); assert.equal(h.state.hints, 1);
});

test('expired confirmation, interaction, and scrolling down start a new sequence', () => {
  const h = setup(); h.back(); h.state.time += 2001; h.back();
  assert.equal(h.state.exits, 0); assert.equal(h.state.refreshes, 2);
  h.reset(); h.back(); assert.equal(h.state.exits, 0);
  h.state.scroll = 200; h.back(); assert.equal(h.state.scroll, 0); assert.equal(h.state.exits, 0);
});

test('Back from another page routes Home once, then requires a fresh two-step sequence', () => {
  const h = setup(); h.state.path = '/friends/'; h.back(); h.back();
  assert.equal(h.state.routes, 1); assert.equal(h.state.exits, 0);
  h.state.path = '/'; h.reset(); h.back();
  assert.equal(h.state.refreshes, 1); assert.equal(h.state.exits, 0);
  h.back(); assert.equal(h.state.exits, 1);
});

test('a cancelled worker wait cannot navigate after a newer interaction', () => {
  let isCurrent;
  const h = setup({ goHome: current => { isCurrent = current; } });
  h.state.path = '/friends'; h.back(); assert.equal(isCurrent(), true);
  h.reset(); assert.equal(isCurrent(), false);
});

test('signed-out Back does not navigate or fetch private Home data', () => {
  const h = setup(); h.state.authenticated = false; h.state.path = '/login/';
  h.back(); h.back();
  assert.equal(h.state.routes, 0); assert.equal(h.state.refreshes, 0); assert.equal(h.state.exits, 1);
});

test('failed navigation and native exit remain retryable', async () => {
  let routes = 0, exits = 0;
  const h = setup({ goHome: () => { routes++; return Promise.reject(new Error('navigation failed')); }, exitApp: () => { exits++; return Promise.reject(new Error('exit failed')); } });
  h.state.path = '/friends'; h.back(); await flush(); h.back(); await flush();
  assert.equal(routes, 2);
  h.state.path = '/'; h.reset(); h.back(); h.back(); await flush(); h.back(); h.back(); await flush();
  assert.equal(exits, 2);
});
