export function validAiQuota(quota) {
  return quota?.unit === 'tokens' && (quota.unlimited === true || (
    Number.isSafeInteger(quota.limit) && quota.limit > 0 &&
    Number.isSafeInteger(quota.remaining) && quota.remaining >= 0 && quota.remaining <= quota.limit
  ));
}

export function aiResetLabel(resetsAt, now, language = 'en') {
  const ar = language === 'ar';
  if (!resetsAt || !Number.isFinite(Date.parse(resetsAt))) {
    return ar ? 'يتجدد بعد ٢٤ ساعة من أول استخدام.' : 'Resets 24 hours after your first use.';
  }
  const minutes = Math.ceil((Date.parse(resetsAt) - now) / 60000);
  if (minutes <= 0) return ar ? 'جارٍ تحديث الرصيد…' : 'Updating your balance…';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const format = new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB');
  const duration = [hours ? `${format.format(hours)}${ar ? ' س' : 'h'}` : '', rest ? `${format.format(rest)}${ar ? ' د' : 'm'}` : ''].filter(Boolean).join(' ');
  return ar ? `يتجدد بعد ${duration}` : `Resets in ${duration}`;
}
