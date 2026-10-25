import { Capacitor } from '@capacitor/core';
import { getApiBaseUrl } from '../utils/apiBase';
import { invalidateProfile } from '../utils/profileCache';

const verifying = new Map();
let productQuery = Promise.resolve();
export function billingPlatform() {
  const platform = Capacitor.getPlatform();
  return platform === 'android' ? 'google' : platform === 'ios' ? 'apple' : 'paymob';
}
export async function billingRequest(path, { token, method = 'GET', body, signal } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/billing${path}`, {
    method, signal, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || 'The payment request could not be completed.'), { status: response.status });
  return result;
}
export async function nativePurchases() {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('NativePurchases')) throw new Error('Install the latest Wasla app to use store subscriptions.');
  const { NativePurchases } = await import('@capgo/native-purchases');
  await NativePurchases.configure({ autoFinishTransactions: false });
  return NativePurchases;
}
export function rememberBillingAccount(userId, accountToken) {
  if (userId && accountToken) {
    try { localStorage.setItem(`wasla_billing_account_${userId}`, accountToken); } catch { /* Restoring still works without the local hint. */ }
  }
}
export function cachedBillingAccount(userId) {
  try { return localStorage.getItem(`wasla_billing_account_${userId}`); } catch { return null; }
}
export async function verifyStoreTransaction(transaction, token, userId) {
  const provider = billingPlatform();
  if (provider === 'paymob') throw new Error('Store purchases are available in the native app.');
  const reference = provider === 'google' ? transaction.purchaseToken : transaction.transactionId;
  if (!reference) throw new Error('Your purchase is pending. Use Restore purchases after payment completes.');
  const expected = cachedBillingAccount(userId);
  if (expected && transaction.appAccountToken && transaction.appAccountToken.toLowerCase() !== expected.toLowerCase()) throw new Error('Sign in to the Wasla account that originally made this purchase.');
  const key = `${userId}:${provider}:${reference}`;
  if (verifying.has(key)) return verifying.get(key);
  const task = (async () => {
    const result = await billingRequest('/native/verify', { token, method: 'POST', body: { provider, reference } });
    if (provider === 'apple') {
      const purchases = await nativePurchases();
      await purchases.finishTransaction({ transactionId: transaction.transactionId });
    }
    invalidateProfile(getApiBaseUrl(), token);
    if (localStorage.getItem('user_Taspe7_ID') === userId && localStorage.getItem('user_Taspe7_Token') === token) {
      window.dispatchEvent(new CustomEvent('wasla:subscription-updated'));
    }
    return result;
  })().finally(() => verifying.delete(key));
  verifying.set(key, task);
  return task;
}
export async function storeProducts(catalog) {
  const provider = billingPlatform();
  if (provider === 'paymob' || !catalog.providers[provider]) return {};
  const purchases = await nativePurchases();
  const productIdentifiers = catalog.plans.map(plan => provider === 'google' ? plan.googleProductId : plan.appleProductId);
  // The native billing client supports one product query at a time.
  const query = productQuery.catch(() => {}).then(() => purchases.getProducts({ productIdentifiers, productType: 'subs' }));
  productQuery = query;
  const { products } = await query;
  return Object.fromEntries(catalog.plans.map(plan => {
    const candidates = products.filter(product => provider === 'apple' ? product.identifier === plan.appleProductId
      : product.planIdentifier === plan.googleProductId && product.identifier === plan.googleBasePlanId);
    return [plan.id, candidates.find(product => !product.offerId) || candidates[0] || null];
  }));
}
export async function subscribeNative(plan, product, token, userId) {
  const provider = billingPlatform();
  const lease = await billingRequest('/native/prepare', { token, method: 'POST', body: { provider, plan: plan.id } });
  rememberBillingAccount(userId, lease.accountToken);
  let received = false;
  try {
    const purchases = await nativePurchases();
    if (localStorage.getItem('user_Taspe7_ID') !== userId || localStorage.getItem('user_Taspe7_Token') !== token) {
      await billingRequest('/checkout/cancel', { token, method: 'POST', body: { id: lease.id } }).catch(() => {});
      throw new Error('Your account changed. Sign in again before purchasing.');
    }
    const transaction = await purchases.purchaseProduct({ productIdentifier: lease.productId,
      ...(provider === 'google' ? { planIdentifier: lease.basePlan, ...(product.offerToken ? { offerToken: product.offerToken } : {}) } : {}),
      productType: 'subs', quantity: 1, appAccountToken: lease.accountToken, autoAcknowledgePurchases: false });
    received = true;
    return await verifyStoreTransaction(transaction, token, userId);
  } catch (error) {
    // A network/verification failure may follow a real charge: keep it restorable, never report it as unpaid.
    if (!received && /cancel/i.test(`${error.code || ''} ${error.message || ''}`)) {
      await billingRequest('/checkout/cancel', { token, method: 'POST', body: { id: lease.id } }).catch(() => {});
    }
    if (!received && /pending/i.test(error.message || '')) return { purchaseStatus: 'pending' };
    throw error;
  }
}
export async function restoreStorePurchases(token, userId, explicit = true) {
  const purchases = await nativePurchases();
  const accountToken = cachedBillingAccount(userId);
  if (explicit) await purchases.restorePurchases();
  // Compare UUIDs below: StoreKit returns uppercase UUIDs and native filtering is case sensitive.
  const { purchases: current } = await purchases.getPurchases({ productType: 'subs', onlyCurrentEntitlements: true });
  const unfinished = typeof purchases.getUnfinishedTransactions === 'function' ? (await purchases.getUnfinishedTransactions()).transactions || [] : [];
  const seen = new Set();
  let restored = 0;
  let firstError;
  for (const transaction of [...current, ...unfinished]) {
    const key = transaction.purchaseToken || transaction.transactionId;
    if (!key || seen.has(key) || transaction.productType === 'inapp') continue;
    if (accountToken && transaction.appAccountToken && transaction.appAccountToken.toLowerCase() !== accountToken.toLowerCase()) continue;
    seen.add(key);
    try { await verifyStoreTransaction(transaction, token, userId); restored++; } catch (error) { firstError ||= error; }
  }
  if (!restored && firstError) throw firstError;
  return restored;
}
