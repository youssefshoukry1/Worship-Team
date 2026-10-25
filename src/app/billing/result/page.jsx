'use client';
import { useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, Loader2, RefreshCw } from 'lucide-react';
import { UserContext } from '../../context/User_Context';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { billingRequest, billingPlatform } from '../../services/billingService';
import { getApiBaseUrl } from '../../utils/apiBase';
import { invalidateProfile } from '../../utils/profileCache';

export default function BillingResultPage() {
  const { isLogin } = useContext(UserContext);
  const { language } = useLanguage();
  const { isDark } = useTheme();
  const ar = language === 'ar';
  const text = (en, arabic) => ar ? arabic : en;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const check = useCallback(async (reconcile = false, signal) => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('order');
    if (!reference || !/^[a-f\d-]{36}$/i.test(reference)) throw new Error('The payment reference is missing. Your account can still be checked from the plans page.');
    // Query-string success flags never activate a plan. The server verifies the transaction itself.
    if (reconcile && /^\d{1,30}$/.test(params.get('id') || '')) {
      await billingRequest(`/orders/${reference}/recheck`, { token: isLogin, method: 'POST', body: { transactionId: params.get('id') }, signal });
    }
    const result = await billingRequest(`/orders/${reference}`, { token: isLogin, signal });
    setOrder(result);
    if (result.status === 'paid') {
      invalidateProfile(getApiBaseUrl(), isLogin);
      window.dispatchEvent(new CustomEvent('wasla:subscription-updated'));
    }
    return result;
  }, [isLogin]);
  useEffect(() => {
    if (!isLogin) return;
    const controller = new AbortController();
    let timer;
    let attempts = 0;
    async function poll() {
      try {
        const result = await check(attempts === 0, controller.signal);
        attempts++;
        if (['paid', 'failed', 'refunded'].includes(result.status) || attempts >= 8) { setWaiting(false); return; }
        timer = setTimeout(poll, Math.min(2000 + attempts * 500, 5000));
      } catch (error) { if (error.name !== 'AbortError') { setError(error.message); setWaiting(false); } }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [check, isLogin]);
  const paid = order?.status === 'paid';
  return <div className={`min-h-screen px-4 pb-28 pt-28 ${isDark ? 'bg-[#080d16] text-white' : 'bg-slate-50 text-slate-900'}`} dir={ar ? 'rtl' : 'ltr'}>
    <section className={`mx-auto max-w-lg rounded-3xl border p-7 sm:p-10 ${isDark ? 'border-white/10 bg-[#101722]' : 'border-slate-200 bg-white'}`}>
      {paid ? <CheckCircle2 className="mb-6 text-emerald-500" size={40} /> : waiting ? <Loader2 className="mb-6 animate-spin text-cyan-500" size={40} /> : <Clock3 className="mb-6 text-cyan-500" size={40} />}
      <h1 className="text-2xl font-bold">{paid ? text(`Your ${order.plan === 'pro' ? 'Pro' : 'Plus'} plan is ready.`, `اشتراك ${order.plan === 'pro' ? 'Pro' : 'Plus'} أصبح جاهزاً.`) : waiting ? text('Confirming your payment…', 'جارٍ تأكيد الدفع…') : order?.status === 'refunded' ? text('This payment was refunded.', 'تم استرداد هذه الدفعة.') : text('Your payment has not been confirmed yet.', 'لم يتم تأكيد دفعتك بعد.')}</h1>
      <p className={`mt-4 leading-7 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{paid ? text('You can return to Wasla using the same account. Your subscription is available on your devices.', 'يمكنك العودة إلى وصلة بنفس الحساب. اشتراكك متاح على أجهزتك.') : text('A successful redirect alone does not confirm payment. If you have been charged, avoid paying again and check the status or contact support.', 'العودة إلى هذه الصفحة لا تعني تأكيد الدفع وحدها. إذا خُصم المبلغ، لا تدفع مرة أخرى؛ تحقق من الحالة أو تواصل مع الدعم.')}</p>
      {paid && order.accessExpiresAt && <p className="mt-4 text-sm">{text('Access until ', 'متاح حتى ')}{new Date(order.accessExpiresAt).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
      {!paid && <button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await check(true); } catch (error) { setError(error.message); } finally { setBusy(false); } }} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 px-4 text-cyan-500 disabled:opacity-50"><RefreshCw className={busy ? 'animate-spin' : ''} size={16} />{text('Check payment status', 'التحقق من حالة الدفع')}</button>}
      <Link href="/plans" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-cyan-500 px-5 font-semibold text-slate-950">{text('View my plan', 'عرض خطتي')}</Link>
      {paid && billingPlatform() === 'paymob' && <a href="wasla://billing" className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-cyan-500/30 px-4 text-cyan-500">{text('Open the Wasla app', 'فتح تطبيق وصلة')}</a>}
      {order && <p className={`mt-6 break-all text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text('Payment reference: ', 'مرجع الدفع: ')}{order.reference}</p>}
    </section>
  </div>;
}
