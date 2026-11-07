'use client';
import Link from 'next/link';
import { useLanguage } from '../context/LanguageContext';

export default function SubscriptionTerms() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const paragraphs = ar ? [
    'يوفر اشتراك Plus أو Pro رصيد توكنز للذكاء الاصطناعي. يظهر السعر والفترة والرصيد قبل الدفع. التفسير والمراجع والتطبيق تتشارك في رصيد واحد يتجدد بعد ٢٤ ساعة من أول طلب في النافذة. يُحسب النص المرسل والإجابة وتفكير النموذج ضمن الاستهلاك الفعلي للإجابة المكتملة. لا يتراكم الرصيد غير المستخدم، ولا تُخصم الطلبات الفاشلة أو محاولات الإصلاح الداخلية. قد يستهلك المقطع الأطول أو النمط الأعمق توكنز أكثر.',
    'تُحصّل اشتراكات Android وiOS من خلال متجر التطبيقات المعني. تتجدد الاشتراكات تلقائياً حتى إلغائها من إعدادات المتجر. يظل الوصول المدفوع متاحاً حتى نهاية الفترة المؤكدة، وقد تُزال الصلاحية قبل ذلك في حالة الاسترداد أو إلغاء المعاملة.',
    'تمنح مشتريات الموقع عبر Paymob مدة ٣٠ يوماً، ولا تتجدد تلقائياً. يظهر السعر النهائي قبل تأكيد الدفع. يضيف تجديد الخطة نفسها ٣٠ يوماً إلى المدة المتبقية بعد التحقق من الدفع.',
    'المشتريات مرتبطة بحساب وصلة الذي استخدمته عند الشراء. استخدم الحساب نفسه على أجهزتك، واستعادة المشتريات داخل تطبيق المتجر عند الحاجة. لا يمكن نقل إيصال شراء إلى حساب آخر تلقائياً.',
    'تنطبق سياسات الاسترداد وشروط الدفع الخاصة بجهة الشراء، بالإضافة إلى حقوقك القانونية المعمول بها. إذا خُصم مبلغ ولم يظهر الاشتراك، لا تكرر الدفع؛ احتفظ بمرجع العملية واستخدم استعادة المشتريات أو تواصل مع الدعم.',
    'الذكاء الاصطناعي أداة مساعدة للدراسة وقد يخطئ. راجع النص الكتابي وسياقه عند تقييم الإجابات.'
  ] : [
    'Plus and Pro provide an AI token allowance. The price, period and allowance are shown before purchase. Explanation, references and application share one balance that resets 24 hours after the first request in each window. Usage includes the input, response and model thinking tokens for the completed answer. Unused tokens do not roll over. Failed requests and internal repair attempts do not consume the allowance. Longer passages and deeper study may use more tokens.',
    'Android and iOS subscriptions are billed by the relevant app store. They renew automatically until canceled in store settings. Paid access continues until the verified period ends, unless a refund or revoked transaction removes access earlier.',
    'Website purchases through Paymob provide 30 days of access and do not renew automatically. The final price is shown before payment confirmation. Renewing the same plan adds 30 days to any remaining verified access after payment is confirmed.',
    'Purchases belong to the Wasla account used when buying. Use that account across your devices and Restore purchases in the store app when necessary. A purchase receipt cannot automatically be moved to a different Wasla account.',
    'The original payment provider’s refund and payment policies apply alongside your applicable statutory rights. If charged without receiving access, avoid paying again; keep the payment reference and use Restore purchases or contact support.',
    'AI is a study aid and can make mistakes. Consult the biblical text and context when assessing answers.'
  ];
  return <article className="app-page min-h-screen px-5 pb-24 pt-24 text-slate-100" dir={ar ? 'rtl' : 'ltr'}><div className="mx-auto max-w-2xl">
    <Link href="/plans" className="text-sm text-cyan-500">{ar ? 'العودة للخطط' : 'Back to plans'}</Link>
    <h1 className="mb-8 mt-6 text-3xl font-bold">{ar ? 'شروط الاشتراك' : 'Subscription terms'}</h1>
    {paragraphs.map(paragraph => <p key={paragraph} className={`mb-6 text-base leading-8 text-slate-300`}>{paragraph}</p>)}
    <Link href="/privacy-policy" className="text-cyan-500 underline">{ar ? 'سياسة الخصوصية' : 'Privacy policy'}</Link>
  </div></article>;
}
