export function readAiResponseError(error) {
  const data = error?.response?.data;
  const status = error?.response?.status;
  const fallbackMessages = {
    400: 'تعذّر إرسال طلب صحيح. أعد تحديد الآيات ثم حاول مجدداً.',
    401: 'انتهت جلسة تسجيل الدخول. سجّل الدخول مجدداً.',
    403: 'ليس لحسابك صلاحية تنفيذ هذا الطلب.',
    409: 'يوجد طلب ذكاء اصطناعي جارٍ لحسابك. انتظر انتهاءه ثم حاول مجدداً.',
    429: 'وصلت الطلبات إلى الحدّ المؤقت. انتظر قليلاً ثم حاول مجدداً.',
    500: 'حدث خطأ في خادم التطبيق أثناء تجهيز الرد. حاول مجدداً.',
    502: 'تعذّر على بوابة التطبيق الحصول على ردّ من الخادم. حاول مجدداً.',
    503: 'خادم التطبيق غير متاح حالياً. حاول بعد قليل.',
    504: 'انتهت مهلة انتظار خادم التطبيق. حاول مجدداً.'
  };
  const message = typeof data?.message === 'string' && data.message.trim()
    ? data.message
    : error?.code === 'AI_INVALID_API_RESPONSE' ? 'وصل ردّ غير مكتمل من خادم التطبيق. حاول مجدداً.'
      : fallbackMessages[status] || (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)
      ? 'انتهت مهلة اتصال جهازك بخادم التطبيق. حاول مجدداً.'
      : 'تعذّر اتصال جهازك بخادم التطبيق. تحقق من الإنترنت ثم حاول مجدداً.');
  // A provider's 429 is not the user's daily allowance. Older server versions
  // identify real allowance failures with quota metadata rather than a code.
  const isLimit = status === 429
    && (['AI_DAILY_LIMIT', 'AI_TOKEN_BUDGET'].includes(data?.code) || Boolean(data?.quota));
  const retryAfterSeconds = Number(data?.retryAfterSeconds);
  // This is a retry hint, not a guarantee that a daily provider quota resets then.
  const showWait = data?.retryable && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    && !['AI_PROVIDER_QUOTA_EXHAUSTED', 'AI_PROVIDER_BILLING_LIMIT'].includes(data?.code);
  const wait = Math.min(86400, Math.ceil(retryAfterSeconds));
  return { message: showWait ? `${message}\nيمكنك إعادة المحاولة بعد نحو ${wait < 60 ? `${wait} ثانية` : `${Math.ceil(wait / 60)} دقيقة`}.` : message, isLimit };
}
