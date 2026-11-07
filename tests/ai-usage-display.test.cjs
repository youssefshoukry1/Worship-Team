/* eslint-disable @typescript-eslint/no-require-imports -- Node regression suite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/utils/aiUsageDisplay.js'), 'utf8').replaceAll('export function', 'function');
const api = vm.runInNewContext(`${source}; ({ validAiQuota, aiResetLabel })`);
const now = Date.parse('2026-11-08T10:00:00Z');

test('countdown rounds up to minutes and handles hour boundaries in both languages', () => {
  assert.equal(api.aiResetLabel('2026-11-08T11:35:00Z', now), 'Resets in 1h 35m');
  assert.equal(api.aiResetLabel('2026-11-08T10:00:01Z', now), 'Resets in 1m');
  assert.equal(api.aiResetLabel('2026-11-08T11:00:00Z', now), 'Resets in 1h');
  assert.equal(api.aiResetLabel('2026-11-09T10:00:00Z', now), 'Resets in 24h');
  assert.equal(api.aiResetLabel('2026-11-08T11:35:00Z', now, 'ar'), 'يتجدد بعد ١ س ٣٥ د');
});

test('unused windows do not invent a reset deadline, expired windows request a refresh', () => {
  for (const reset of [null, undefined, 'invalid']) assert.equal(api.aiResetLabel(reset, now), 'Resets 24 hours after your first use.');
  for (const reset of ['2026-11-08T10:00:00Z', '2026-11-07T10:00:00Z']) assert.equal(api.aiResetLabel(reset, now), 'Updating your balance…');
});

test('quota accepts unlimited and exhausted accounts but rejects misleading or invalid balances', () => {
  const quota = { unit: 'tokens', limit: 14000, remaining: 12000 };
  assert.equal(api.validAiQuota(quota), true);
  assert.equal(api.validAiQuota({ ...quota, remaining: 0 }), true);
  assert.equal(api.validAiQuota({ unit: 'tokens', unlimited: true, limit: null, remaining: null }), true);
  for (const invalid of [null, {}, { ...quota, remaining: -1 }, { ...quota, remaining: 14001 }, { ...quota, remaining: NaN }, { ...quota, limit: 0 }, { ...quota, unit: 'requests' }]) assert.equal(api.validAiQuota(invalid), false);
});
