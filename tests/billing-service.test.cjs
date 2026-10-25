const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const original = fs.readFileSync(path.join(__dirname, '../src/app/services/billingService.js'), 'utf8');
const source = original.replace(/^import .+;\r?\n/gm, '').replaceAll('export async function', 'async function').replaceAll('export function', 'function')
  .replace("await import('@capgo/native-purchases')", 'await importNativePurchases()');

function fixture(platform = 'android') {
  const requests = [], events = [], finished = [], disk = new Map([['user_Taspe7_ID', 'account-a'], ['user_Taspe7_Token', 'token-a']]);
  let respond = async () => ({ plan: 'plus', purchaseStatus: 'active' });
  const sdk = { configure: async () => {}, finishTransaction: async value => finished.push(value),
    purchaseProduct: async () => ({ purchaseToken: 'store-token', transactionId: '12345' }),
    restorePurchases: async () => {}, getPurchases: async () => ({ purchases: [] }), getUnfinishedTransactions: async () => ({ transactions: [] }) };
  const context = { Map, Set, Promise, Error, Object, Capacitor: { getPlatform: () => platform, isNativePlatform: () => platform !== 'web', isPluginAvailable: () => true },
    getApiBaseUrl: () => 'https://api.example.test/api', invalidateProfile: () => {},
    importNativePurchases: async () => ({ NativePurchases: sdk }),
    fetch: async (url, options) => { requests.push({ url, ...options }); return { ok: true, status: 200, json: () => respond(url, options) }; },
    localStorage: { getItem: key => disk.get(key) || null, setItem: (key, value) => disk.set(key, value) },
    window: { dispatchEvent: event => events.push(event.type) }, CustomEvent: class { constructor(type) { this.type = type; } } };
  vm.runInNewContext(source + ';globalThis.api = {billingPlatform, rememberBillingAccount, verifyStoreTransaction, storeProducts, subscribeNative, restoreStorePurchases};', context);
  return { api: context.api, sdk, requests, events, finished, disk, respond: value => { respond = value; } };
}

test('each platform uses its own payment provider', () => {
  assert.equal(fixture('web').api.billingPlatform(), 'paymob');
  assert.equal(fixture('android').api.billingPlatform(), 'google');
  assert.equal(fixture('ios').api.billingPlatform(), 'apple');
});

test('simultaneous transaction callbacks share one backend verification; no price or plan is trusted from the device', async () => {
  const f = fixture();
  await Promise.all([f.api.verifyStoreTransaction({ purchaseToken: 'verified-token' }, 'token-a', 'account-a'), f.api.verifyStoreTransaction({ purchaseToken: 'verified-token' }, 'token-a', 'account-a')]);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(JSON.parse(f.requests[0].body), { provider: 'google', reference: 'verified-token' });
  assert.equal(f.events.length, 1);
});

test('Apple transactions are finished only after successful backend fulfillment', async () => {
  const f = fixture('ios');
  f.respond(async () => { assert.equal(f.finished.length, 0); throw new Error('Backend unavailable'); });
  await assert.rejects(f.api.verifyStoreTransaction({ transactionId: '12345' }, 'token-a', 'account-a'), /Backend unavailable/);
  assert.equal(f.finished.length, 0);
  f.respond(async () => ({ plan: 'plus' }));
  await f.api.verifyStoreTransaction({ transactionId: '12345' }, 'token-a', 'account-a');
  assert.equal(f.finished[0].transactionId, '12345');
});

test('restore deduplicates unfinished purchases and compares UUID case without native filtering', async () => {
  const f = fixture('ios');
  f.api.rememberBillingAccount('account-a', 'abcd-1234');
  const own = { transactionId: '12345', appAccountToken: 'ABCD-1234' };
  f.sdk.getPurchases = async options => {
    assert.equal(options.onlyCurrentEntitlements, true);
    assert.equal(options.appAccountToken, undefined);
    return { purchases: [own, { transactionId: '99999', appAccountToken: 'other-user' }] };
  };
  f.sdk.getUnfinishedTransactions = async () => ({ transactions: [own] });
  assert.equal(await f.api.restoreStorePurchases('token-a', 'account-a'), 1);
  assert.equal(f.requests.length, 1);
  assert.equal(f.finished.length, 1);
});

test('a wrong local account hint is rejected before verification', async () => {
  const f = fixture('ios');
  f.api.rememberBillingAccount('account-a', 'my-account');
  await assert.rejects(f.api.verifyStoreTransaction({ transactionId: '12345', appAccountToken: 'another-account' }, 'token-a', 'account-a'), /originally made/);
  assert.equal(f.requests.length, 0);
});

test('native products use store prices and batch/serialize product queries', async () => {
  const f = fixture();
  let active = 0, maxActive = 0;
  f.sdk.getProducts = async options => {
    active++; maxActive = Math.max(active, maxActive);
    assert.equal(options.productIdentifiers.length, 2);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { products: [{ identifier: 'monthly', planIdentifier: 'wasla_plus', priceString: 'EGP 123.00', offerToken: 'offer-token' }] };
  };
  const catalog = { providers: { google: true }, plans: [{ id: 'plus', googleProductId: 'wasla_plus', googleBasePlanId: 'monthly' }, { id: 'pro', googleProductId: 'wasla_pro', googleBasePlanId: 'monthly' }] };
  const [first] = await Promise.all([f.api.storeProducts(catalog), f.api.storeProducts(catalog)]);
  assert.equal(maxActive, 1);
  assert.equal(first.plus.priceString, 'EGP 123.00');
  assert.equal(first.pro, null);
});

test('store cancellation releases checkout while a verification failure retains the recoverable purchase', async () => {
  const f = fixture();
  const lease = { id: 'lease-a', accountToken: 'owner-uuid', productId: 'wasla_plus', basePlan: 'monthly' };
  f.respond(async url => url.endsWith('/native/prepare') ? lease : { success: true });
  f.sdk.purchaseProduct = async () => { throw new Error('User canceled'); };
  await assert.rejects(f.api.subscribeNative({ id: 'plus' }, {}, 'token-a', 'account-a'), /canceled/);
  assert.equal(f.requests[1].url.endsWith('/checkout/cancel'), true);
  f.requests.length = 0;
  f.sdk.purchaseProduct = async options => {
    assert.equal(options.autoAcknowledgePurchases, false);
    assert.equal(options.appAccountToken, lease.accountToken);
    return { purchaseToken: 'paid-token' };
  };
  f.respond(async url => { if (url.endsWith('/native/prepare')) return lease; throw new Error('Offline after payment'); });
  await assert.rejects(f.api.subscribeNative({ id: 'plus' }, {}, 'token-a', 'account-a'), /Offline after payment/);
  assert.ok(f.requests.every(request => !request.url.endsWith('/checkout/cancel')));
});

test('account change before the native sheet cancels the unused lease without starting payment', async () => {
  const f = fixture();
  f.respond(async () => { f.disk.set('user_Taspe7_ID', 'account-b'); return { id: 'lease-a', accountToken: 'uuid' }; });
  f.sdk.purchaseProduct = async () => { assert.fail('Must never charge after an account change'); };
  await assert.rejects(f.api.subscribeNative({ id: 'plus' }, {}, 'token-a', 'account-a'), /account changed/);
  assert.equal(f.requests[1].url.endsWith('/checkout/cancel'), true);
});

test('pending native purchase keeps its lease and does not grant local access', async () => {
  const f = fixture();
  f.respond(async () => ({ id: 'lease-a', accountToken: 'uuid' }));
  f.sdk.purchaseProduct = async () => { throw new Error('Purchase is pending'); };
  assert.equal((await f.api.subscribeNative({ id: 'plus' }, {}, 'token-a', 'account-a')).purchaseStatus, 'pending');
  assert.equal(f.requests.length, 1);
  assert.equal(f.events.length, 0);
});
