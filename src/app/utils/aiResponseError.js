export function readAiResponseError(error) {
  const data = error?.response?.data;
  const message = typeof data?.message === 'string' && data.message.trim()
    ? data.message
    : error?.code === 'ECONNABORTED'
      ? 'استغرق الرد وقتاً أطول من المعتاد. حاول مجدداً.'
      : 'تعذر الاتصال بخدمة الذكاء الاصطناعي. حاول مجدداً.';
  // A provider's 429 is not the user's daily allowance. Older server versions
  // identify real allowance failures with quota metadata rather than a code.
  const isLimit = error?.response?.status === 429
    && (data?.code === 'AI_DAILY_LIMIT' || Boolean(data?.quota));
  return { message, isLimit };
}
