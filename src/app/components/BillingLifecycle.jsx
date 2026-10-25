'use client';
import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { UserContext } from '../context/User_Context';
import { cachedBillingAccount, nativePurchases, restoreStorePurchases, verifyStoreTransaction } from '../services/billingService';

export default function BillingLifecycle() {
  const { isLogin, user_id } = useContext(UserContext);
  const router = useRouter();
  useEffect(() => {
    if (!isLogin || !user_id || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('NativePurchases')) return;
    let disposed = false;
    const listeners = [];
    let recovering = false;
    let nextRecoveryAt = 0;
    const sameAccount = () => !disposed && localStorage.getItem('user_Taspe7_ID') === user_id && localStorage.getItem('user_Taspe7_Token') === isLogin;
    const recover = async () => {
      if (!sameAccount() || recovering || Date.now() < nextRecoveryAt || !cachedBillingAccount(user_id)) return;
      recovering = true;
      nextRecoveryAt = Date.now() + 60 * 1000;
      try { await restoreStorePurchases(isLogin, user_id, false); }
      catch { /* Verified backend notifications and explicit Restore purchases can retry. */ }
      finally { recovering = false; }
    };
    const add = async promise => {
      const listener = await promise;
      if (disposed) await listener.remove(); else listeners.push(listener);
    };
    (async () => {
      const purchases = await nativePurchases();
      await add(purchases.addListener('transactionUpdated', transaction => {
        if (sameAccount()) verifyStoreTransaction(transaction, isLogin, user_id).catch(() => {});
      }));
      const { App } = await import('@capacitor/app');
      await add(App.addListener('appStateChange', state => { if (state.isActive) recover(); }));
      const openBilling = event => {
        try { const url = new URL(event.url); if (sameAccount() && url.protocol === 'wasla:' && url.hostname === 'billing') { router.push('/plans'); recover(); } } catch { /* Ignore other app links. */ }
      };
      await add(App.addListener('appUrlOpen', openBilling));
      const launch = await App.getLaunchUrl();
      if (launch) openBilling(launch);
      await recover();
    })().catch(() => {});
    return () => { disposed = true; listeners.forEach(listener => listener.remove()); };
  }, [isLogin, user_id, router]);
  return null;
}
