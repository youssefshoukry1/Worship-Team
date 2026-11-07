'use client';

import { useEffect, useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getApiBaseUrl } from '../../utils/apiBase';
import { aiResetLabel, validAiQuota } from '../../utils/aiUsageDisplay';

export default function AiUsageSettings({ userId, token, active = true }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const titleId = useId();
  const [result, setResult] = useState(null);
  const [now, setNow] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  // Associate each result with its session so another account never sees it.
  const session = `${userId}:${token}`;
  const state = result?.session === session ? result : null;

  useEffect(() => {
    if (!active || !userId || !token) return;
    let disposed = false;
    let controller;
    let timeout;
    let inFlight = false;
    let lastRead = 0;
    let resetAt = null;
    let refreshedReset = null;

    async function refresh() {
      if (disposed || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 12000);
      setResult(previous => previous?.session === session ? { ...previous, refreshing: true } : { session, refreshing: true });
      try {
        const response = await fetch(`${getApiBaseUrl()}/billing/status`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error('Quota unavailable');
        const data = await response.json();
        if (!validAiQuota(data.quota)) throw new Error('Invalid quota');
        if (disposed) return;
        resetAt = data.quota.unlimited ? null : Date.parse(data.quota.resetsAt);
        setResult({ session, quota: data.quota });
      } catch {
        if (!disposed) setResult({ session, error: true });
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        lastRead = Date.now();
      }
    }

    function tick() {
      if (document.visibilityState === 'hidden') return;
      const time = Date.now();
      setNow(time);
      // Only one server read at expiry; the countdown itself never polls.
      if (Number.isFinite(resetAt) && time >= resetAt && refreshedReset !== resetAt) {
        refreshedReset = resetAt;
        refresh();
      }
    }
    function onVisible() {
      tick();
      if (Date.now() - lastRead >= 30000) refresh();
    }
    function onSubscriptionChange() { refresh(); }
    tick();
    refresh();
    const timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('wasla:subscription-updated', onSubscriptionChange);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timeout);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('wasla:subscription-updated', onSubscriptionChange);
    };
  }, [active, userId, token, session, refreshKey]);

  const quota = state?.quota;
  const percent = quota && !quota.unlimited ? quota.remaining / quota.limit * 100 : 0;
  const format = value => new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB').format(value);
  const plan = { free: ar ? 'مجاني' : 'Free', plus: 'Plus', pro: 'Pro' }[quota?.plan];

  return <section data-ai-usage-settings aria-labelledby={titleId} dir={ar ? 'rtl' : 'ltr'}>
    <h3 id={titleId} className="mb-2 px-1 text-xs font-medium text-slate-400">{ar ? 'استخدام الذكاء الاصطناعي' : 'AI usage'}</h3>
    <div className="app-card rounded-xl border p-4" aria-busy={!!state?.refreshing}>
      {!quota ? <div className="flex min-h-20 items-center justify-between gap-3 text-xs leading-5 text-slate-400">
        <p role={state?.error ? 'status' : undefined}>{state?.error
          ? (ar ? 'تعذّر تحميل الرصيد. حاول مجددًا.' : 'Couldn’t load your balance. Try again.')
          : (ar ? 'جارٍ تحميل الرصيد…' : 'Loading your balance…')}</p>
        {state?.error && <button type="button" className="min-h-11 shrink-0 px-2 font-medium text-sky-400" onClick={() => setRefreshKey(value => value + 1)}>{ar ? 'إعادة المحاولة' : 'Retry'}</button>}
      </div> : quota.unlimited ? <div className="space-y-2">
        <p className="text-xl font-semibold text-sky-400">{ar ? 'غير محدود' : 'Unlimited'}</p>
        <p className="text-xs leading-5 text-slate-400">{ar ? 'حسابك ليس له حد لاستخدام الذكاء الاصطناعي.' : 'Your account has no AI usage limit.'}</p>
      </div> : <>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-white">{format(quota.remaining)} <span className="text-xs font-normal text-slate-400">{ar ? 'توكن متبقية' : 'tokens left'}</span></p>
            <p className="mt-1 text-xs text-slate-400">{ar ? `من أصل ${format(quota.limit)} توكن` : `of ${format(quota.limit)} tokens`}</p>
          </div>
          {plan && <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-400">{plan}</span>}
        </div>
        <div role="progressbar" aria-label={ar ? 'رصيد الذكاء الاصطناعي المتبقي' : 'AI tokens remaining'} aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.remaining} aria-valuetext={ar ? `${format(quota.remaining)} من ${format(quota.limit)} توكن متبقية` : `${format(quota.remaining)} of ${format(quota.limit)} tokens remaining`} className="h-2 overflow-hidden rounded-full bg-slate-500/15">
          <div style={{ width: `${percent}%` }} className={`h-full rounded-full ${quota.remaining === 0 ? 'bg-rose-400' : percent < 20 ? 'bg-amber-400' : 'bg-sky-400'}`} />
        </div>
        <p data-ai-usage-reset className="mt-3 text-xs leading-5 text-slate-400">{aiResetLabel(quota.resetsAt, now, language)}</p>
        {quota.pending && <p className="mt-1 text-[11px] leading-5 text-slate-400">{ar ? 'يتحدث الرصيد بعد اكتمال الطلب الجاري.' : 'Your balance updates when the current request finishes.'}</p>}
      </>}
    </div>
  </section>;
}
