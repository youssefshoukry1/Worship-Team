export default function AiTokenBalance({ quota, language = 'ar' }) {
  if (quota?.unit !== 'tokens') return null;
  const ar = language === 'ar';
  const format = value => new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB').format(value);
  if (quota.unlimited) return <p data-ai-token-balance className="mt-3 text-xs text-slate-400">{ar ? 'رصيد ذكاء اصطناعي غير محدود' : 'Unlimited AI tokens'}</p>;
  if (!Number.isSafeInteger(quota.remaining) || !Number.isSafeInteger(quota.limit)) return null;
  const reset = quota.resetsAt ? new Date(quota.resetsAt) : null;
  return <div data-ai-token-balance dir={ar ? 'rtl' : 'ltr'} className="mt-3 space-y-1 border-t border-current/10 pt-2 text-[11px] leading-5 text-slate-400">
    <p>{ar ? `المتبقي ${format(Math.max(0, quota.remaining))} من ${format(quota.limit)} توكن` : `${format(Math.max(0, quota.remaining))} of ${format(quota.limit)} tokens remaining`}</p>
    {reset && Number.isFinite(reset.getTime()) ? <p>{ar ? 'يتجدد في ' : 'Resets '}{reset.toLocaleString(ar ? 'ar-EG' : 'en-GB', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
      : <p>{quota.plan === 'guest' ? (ar ? 'رصيد الضيف لا يتجدد. سجّل الدخول لرصيد يومي.' : 'Guest tokens do not reset. Sign in for a daily allowance.')
        : (ar ? 'تبدأ نافذة ٢٤ ساعة مع أول طلب.' : 'Your 24-hour window starts with your first request.')}</p>}
    {quota.pending && <p>{ar ? 'يوجد طلب جارٍ؛ يتحدث الرصيد عند اكتماله.' : 'A request is in progress; the balance updates when it finishes.'}</p>}
  </div>;
}
