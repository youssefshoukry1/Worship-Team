'use client';
import { useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { UserContext } from '../context/User_Context';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { billingPlatform, billingRequest, nativePurchases, rememberBillingAccount, restoreStorePurchases, storeProducts, subscribeNative } from '../services/billingService';

export default function PlansPage() {
  const { isLogin, user_id } = useContext(UserContext);
  const { isDark } = useTheme();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const text = (en, arabic) => ar ? arabic : en;
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [billing, setBilling] = useState({ firstName: '', lastName: '', phone: '', city: '', street: '', state: '' });
  const refresh = useCallback(async signal => {
    if (!isLogin || !user_id) return;
    const [catalog, current] = await Promise.all([billingRequest('/catalog', { signal }), billingRequest('/status', { token: isLogin, signal })]);
    if (localStorage.getItem('user_Taspe7_ID') !== user_id || localStorage.getItem('user_Taspe7_Token') !== isLogin) return;
    rememberBillingAccount(user_id, current.accountToken);
    let products = {};
    try { products = await storeProducts(catalog); } catch { /* Products remain disabled until the store is ready. */ }
    if (signal?.aborted || localStorage.getItem('user_Taspe7_ID') !== user_id || localStorage.getItem('user_Taspe7_Token') !== isLogin) return;
    setData({ catalog, current, products, platform: billingPlatform() });
  }, [isLogin, user_id]);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    const changed = () => refresh(controller.signal).catch(() => {});
    window.addEventListener('wasla:subscription-updated', changed);
    return () => { controller.abort(); window.removeEventListener('wasla:subscription-updated', changed); };
  }, [refresh]);
  async function perform(key, operation) {
    if (busy) return;
    setBusy(key); setError(''); setNotice('');
    try { await operation(); } catch (error) { setError(error.message); } finally { setBusy(''); }
  }
  async function purchase(plan) {
    if (data.platform === 'paymob') { setSelected(plan); setAccepted(false); return; }
    await perform(plan.id, async () => {
      const result = await subscribeNative(plan, data.products[plan.id], isLogin, user_id);
      setNotice(result.purchaseStatus === 'pending' ? text('Your payment is pending. Access starts after confirmation.', 'دفعتك قيد الانتظار. يبدأ الاشتراك بعد تأكيدها.') : text('Your subscription is ready.', 'اشتراكك أصبح جاهزاً.'));
      await refresh();
    });
  }
  const panel = isDark ? 'bg-[#101722] border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-600';
  const input = `w-full rounded-xl border px-3 py-3 outline-none focus:ring-2 focus:ring-cyan-400 ${isDark ? 'bg-black/20 border-white/15 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`;
  return <div className={`min-h-screen px-4 pb-28 pt-24 ${isDark ? 'bg-[#080d16] text-white' : 'bg-slate-50 text-slate-900'}`} dir={ar ? 'rtl' : 'ltr'}>
    <div className="mx-auto max-w-4xl">
      <Link href="/normal_UserProfile" className={`mb-7 inline-flex items-center gap-2 text-sm ${muted}`}><ArrowLeft size={16} />{text('Back to profile', 'العودة للحساب')}</Link>
      <div className="mb-8"><span className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-cyan-500"><Sparkles size={18} />Wasla</span>
        <h1 className="text-3xl font-bold">{text('A little more room to explore.', 'مساحة أكبر للفهم والتأمل.')}</h1>
        <p className={`mt-3 max-w-xl leading-7 ${muted}`}>{text('Choose the AI allowance that fits your reading. Every plan includes explanation, references and practical application.', 'اختر رصيد الذكاء الاصطناعي المناسب لقراءتك. التفسير والمراجع والتطبيق متاحة في كل الخطط.')}</p>
      </div>
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-500">{error}<button type="button" className="ms-3 underline" onClick={() => perform('refresh', refresh)}>{text('Try again', 'حاول مجدداً')}</button></div>}
      {notice && <p role="status" className="mb-5 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-500">{notice}</p>}
      {!data ? !error && <div className={`flex items-center gap-3 py-10 ${muted}`}><Loader2 className="animate-spin" size={20} />{text('Loading your plans…', 'جارٍ تحميل الخطط…')}</div> : <>
        {data.catalog.testMode && Object.values(data.catalog.providers).some(Boolean) && <p className="mb-5 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-600">{text('Test purchases only. Live subscriptions are not on sale yet.', 'المشتريات تجريبية فقط. الاشتراكات الفعلية ليست متاحة للبيع بعد.')}</p>}
        <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${panel}`}>
          <div><p className={`text-xs ${muted}`}>{text('Your account', 'حسابك')}</p><p className="mt-1 text-lg font-semibold">{data.current.unlimited ? text('Unlimited AI access', 'استخدام غير محدود للذكاء الاصطناعي') : data.current.plan === 'free' ? text('Free', 'مجاني') : data.current.plan === 'pro' ? 'Pro' : 'Plus'}</p>
            {data.current.expiresAt && <p className={`mt-1 text-sm ${muted}`}>{text('Access until ', 'متاح حتى ')}{new Date(data.current.expiresAt).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}</p>}</div>
          {data.platform !== 'paymob' && <div className="flex flex-wrap gap-2">
            <button disabled={!!busy} type="button" onClick={() => perform('restore', async () => {
              const count = await restoreStorePurchases(isLogin, user_id);
              setNotice(count ? text('Purchases restored.', 'تمت استعادة المشتريات.') : text('No purchases were found for this account.', 'لا توجد مشتريات لهذا الحساب.')); await refresh();
            })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-500/30 px-4 text-sm text-cyan-500 disabled:opacity-50"><RefreshCw size={15} />{text('Restore purchases', 'استعادة المشتريات')}</button>
            {data.current.provider === data.platform && data.current.plan !== 'free' && <button disabled={!!busy} type="button" onClick={() => perform('manage', async () => (await nativePurchases()).manageSubscriptions())} className="min-h-11 rounded-xl border border-cyan-500/30 px-4 text-sm text-cyan-500">{text('Manage subscription', 'إدارة الاشتراك')}</button>}
          </div>}
        </div>
        {data.current.pendingProvider && <div role="status" className={`mb-5 rounded-xl border p-4 text-sm ${panel}`}>
          {text('A purchase is pending. Please finish it before starting another.', 'هناك عملية شراء قيد الانتظار. أكملها قبل بدء عملية أخرى.')}
          {data.platform === 'paymob' && data.current.pendingReference && <button type="button" disabled={!!busy} className="ms-3 text-cyan-500 underline" onClick={() => perform('resume', async () => {
            const result = await billingRequest(`/orders/${data.current.pendingReference}/checkout`, { token: isLogin }); window.location.assign(result.checkoutUrl);
          })}>{text('Continue checkout', 'استكمال الدفع')}</button>}
        </div>}
        <div className="grid gap-4 md:grid-cols-3">
          <div className={`rounded-2xl border p-6 ${panel}`}><h2 className="text-lg font-semibold">{text('Free', 'مجاني')}</h2><p className="mt-5 text-3xl font-bold">{text('Free', 'مجاناً')}</p>
            <p className={`mt-2 text-sm ${muted}`}>{data.catalog.freeDailyLimit} {text('AI answers per 24 hours', 'إجابات كل ٢٤ ساعة')}</p>
            {data.catalog.launchBonusEndsAt && <p className={`mt-4 text-xs leading-6 ${muted}`}>{text('Includes a temporary launch bonus until ', 'يشمل مكافأة الإطلاق المؤقتة حتى ')}{new Date(data.catalog.launchBonusEndsAt).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}</p>}
            <p className={`mt-6 flex items-center gap-2 text-sm ${muted}`}><Check size={16} />{text('Available without a subscription', 'متاح دون اشتراك')}</p>
          </div>
          {data.catalog.plans.map(plan => {
            const product = data.products[plan.id];
            const current = data.current.plan === plan.id;
            const web = data.platform === 'paymob';
            const ready = data.current.testAllowed && data.catalog.providers[data.platform] && (web ? plan.webPriceCents !== null : !!product);
            const anotherActive = data.current.plan !== 'free' && !(web && data.current.provider === 'paymob' && current);
            const price = web ? plan.webPriceCents === null ? null : new Intl.NumberFormat(ar ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP' }).format(plan.webPriceCents / 100) : product?.priceString;
            return <div key={plan.id} className={`relative rounded-2xl border p-6 ${panel} ${current ? 'ring-1 ring-cyan-500' : ''}`}>
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{plan.title}</h2>{current && <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-xs text-cyan-500">{text('Current plan', 'خطتك الحالية')}</span>}</div>
              <p className="mt-5 text-3xl font-bold">{price || text('Coming soon', 'قريباً')}</p><p className={`mt-1 text-sm ${muted}`}>{web ? text('30 days · renew manually', '٣٠ يوماً · تجديد يدوي') : text('per month · auto-renews', 'شهرياً · يتجدد تلقائياً')}</p>
              <p className="mt-6 flex items-start gap-2 text-sm leading-6"><Check size={17} className="mt-1 shrink-0 text-cyan-500" />{plan.dailyLimit} {text('AI answers per 24 hours, shared across all three options.', 'إجابة كل ٢٤ ساعة، مشتركة بين الخيارات الثلاثة.')}</p>
              <p className={`mt-3 text-sm ${muted}`}>{text('The same account works on your devices.', 'اشتراكك مرتبط بحسابك على أجهزتك.')}</p>
              <button type="button" disabled={!!busy || !ready || anotherActive || !!data.current.pendingProvider || data.current.unlimited} onClick={() => purchase(plan)} className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:bg-slate-500/15 disabled:text-slate-500">
                {busy === plan.id && <Loader2 size={16} className="animate-spin" />}{!ready ? text('Not available yet', 'غير متاح حالياً') : anotherActive ? current ? text('Plan active', 'الخطة مفعّلة') : text('Manage your current plan first', 'أدر خطتك الحالية أولاً') : current ? text('Extend by 30 days', 'تمديد ٣٠ يوماً') : text(`Subscribe to ${plan.title}`, `اشترك في ${plan.title}`)}
              </button>
            </div>;
          })}
        </div>
        <div className={`mt-6 flex items-start gap-2 text-sm leading-6 ${muted}`}><ShieldCheck className="mt-1 shrink-0" size={17} /><p>{text('Your daily AI allowance resets every 24 hours. Failed AI requests do not use your allowance.', 'يتجدد رصيد الذكاء الاصطناعي كل ٢٤ ساعة. الطلبات الفاشلة لا تُخصم من رصيدك.')}</p></div>
        <p className={`mt-4 text-sm leading-7 ${muted}`}>{data.platform === 'paymob' ? text('Website payments use Paymob. Card and wallet options depend on availability at checkout. Your pass does not renew automatically.', 'الدفع على الموقع عبر Paymob. تظهر البطاقات والمحافظ المتاحة أثناء الدفع. لا تتجدد الباقة تلقائياً.') : text('Subscriptions are billed by your app store and renew automatically until canceled in store settings. Cancellation keeps access until the paid period ends.', 'يُحصّل متجر التطبيقات قيمة الاشتراك ويتجدد تلقائياً حتى إلغائه من إعدادات المتجر. يظل الوصول متاحاً حتى نهاية الفترة المدفوعة.')}</p>
        <div className={`mt-5 flex flex-wrap gap-5 text-sm ${muted}`}><Link href="/subscription-terms" className="underline">{text('Subscription terms', 'شروط الاشتراك')}</Link><Link href="/privacy-policy" className="underline">{text('Privacy policy', 'سياسة الخصوصية')}</Link>{data.catalog.supportEmail && <a href={`mailto:${data.catalog.supportEmail}`} className="underline">{text('Contact support', 'تواصل مع الدعم')}</a>}</div>
      </>}
      {selected && <section className={`mt-8 rounded-2xl border p-6 ${panel}`} aria-label={text('Billing details', 'بيانات الدفع')}>
        <h2 className="text-xl font-semibold">{text(`Subscribe to ${selected.title}`, `الاشتراك في ${selected.title}`)}</h2>
        <form onSubmit={event => { event.preventDefault(); perform('checkout', async () => {
          const result = await billingRequest('/checkout/paymob', { token: isLogin, method: 'POST', body: { plan: selected.id, billing } }); window.location.assign(result.checkoutUrl);
        }); }} className="mt-5 grid gap-4 sm:grid-cols-2">
          {[['firstName', text('First name', 'الاسم الأول'), 'given-name'], ['lastName', text('Last name', 'اسم العائلة'), 'family-name'], ['phone', text('Phone number', 'رقم الهاتف'), 'tel'], ['city', text('City', 'المدينة'), 'address-level2'], ['state', text('Governorate', 'المحافظة'), 'address-level1'], ['street', text('Address', 'العنوان'), 'street-address']].map(([name, label, autoComplete]) => <label key={name} className="block text-sm">{label}<input className={`mt-2 ${input}`} autoComplete={autoComplete} required maxLength={150} type={name === 'phone' ? 'tel' : 'text'} value={billing[name]} onChange={event => setBilling({ ...billing, [name]: event.target.value })} /></label>)}
          <label className="flex items-start gap-3 text-sm leading-6 sm:col-span-2"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1 size-4" /><span>{text('I agree to the subscription terms and understand this purchase provides 30 days of access without automatic renewal.', 'أوافق على شروط الاشتراك، وأفهم أن هذه العملية تمنحني ٣٠ يوماً دون تجديد تلقائي.')}</span></label>
          <button disabled={!!busy || !accepted} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 font-semibold text-slate-950 disabled:opacity-50" type="submit">{busy === 'checkout' && <Loader2 size={17} className="animate-spin" />}{text('Continue to payment', 'المتابعة إلى الدفع')}</button>
          <button className={`min-h-12 rounded-xl border ${isDark ? 'border-white/10' : 'border-slate-200'}`} type="button" onClick={() => setSelected(null)}>{text('Cancel', 'إلغاء')}</button>
        </form>
      </section>}
    </div>
  </div>;
}
