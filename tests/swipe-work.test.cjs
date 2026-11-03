/* eslint-disable @typescript-eslint/no-require-imports -- Node test and benchmark entry points use CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cooperativeWork } = require('./helpers/cooperative-work.cjs');

function load(file, names, values = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const context = { AbortController, setTimeout, clearTimeout, ...values };
  vm.runInNewContext(source + `;globalThis.api={${names.join(',')}};`, context);
  return context.api;
}
const navigation = () => load('navigationWork.js', ['holdNavigationWork', 'releaseNavigationWork', 'waitForNavigationIdle']);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('navigation work waits for release, tolerates cleanup twice, and observes an immediately restarted gesture', async () => {
  const gate = navigation(); let finished = false;
  gate.holdNavigationWork(); gate.holdNavigationWork();
  const job = gate.waitForNavigationIdle().then(() => { finished = true; });
  await flush(); assert.equal(finished, false);
  gate.releaseNavigationWork(); gate.holdNavigationWork();
  await flush(); assert.equal(finished, false);
  gate.releaseNavigationWork(); gate.releaseNavigationWork();
  await job; assert.equal(finished, true);
  await gate.waitForNavigationIdle();
});

test('responses do not parse or publish during a gesture; invalidation still prevents a delayed commit', async () => {
  const gate = navigation(); let parses = 0, commits = 0;
  const api = load('tabRequests.js', ['readTabResource', 'fetchTabJson', 'invalidateTabRead'], {
    waitForNavigationIdle: gate.waitForNavigationIdle,
    fetch: async () => ({ ok: true, json: async () => { parses++; return 'profile'; } }),
  });
  gate.holdNavigationWork();
  const response = api.fetchTabJson('/profile', 'token');
  const read = api.readTabResource('profile', async () => 'old', { onSuccess: () => commits++ });
  const rejection = assert.rejects(read, { name: 'AbortError' });
  await flush(); assert.equal(parses, 0); assert.equal(commits, 0);
  api.invalidateTabRead('profile'); gate.releaseNavigationWork();
  assert.equal(await response, 'profile'); await rejection;
  assert.equal(parses, 1); assert.equal(commits, 0);
  assert.equal(await api.readTabResource('profile', async () => 'new'), 'new');
});

test('large cooperative processing pauses before its first batch while navigation owns input', async () => {
  const gate = navigation(); let visits = 0;
  const api = cooperativeWork({ waitForNavigationIdle: gate.waitForNavigationIdle });
  gate.holdNavigationWork();
  const job = api.forEachChunked(new Array(1000).fill(0), () => { visits++; });
  await flush(); assert.equal(visits, 0);
  gate.releaseNavigationWork(); await job; assert.equal(visits, 1000);
});
