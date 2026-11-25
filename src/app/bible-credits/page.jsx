'use client';

import { useLanguage } from '../context/LanguageContext';
import { returnFromSettings } from '../utils/profileNavigation';

export default function BibleCredits() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  return (
    <article dir={ar ? 'rtl' : 'ltr'} className="app-page min-h-screen px-5 pb-24 pt-24 text-slate-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <button type="button" onClick={returnFromSettings} className="text-sm text-sky-400">
          {ar ? 'العودة إلى الإعدادات' : 'Back to settings'}
        </button>
        <h1 className="text-2xl font-bold">{ar ? 'حقوق ترجمات الكتاب المقدس' : 'Bible translation credits'}</h1>
        <section className="space-y-2">
          <h2 className="font-bold">{ar ? 'الترجمة العربية المبسطة' : 'Arabic Easy-to-Read Version'} (ERV-AR)</h2>
          <p dir="ltr">Taken from the Arabic HOLY BIBLE: EASY-TO-READ VERSION. © 2007 by World Bible Translation Center, Inc. and used by permission.</p>
          <a className="text-sm text-sky-400 underline" href="/erv-ar-credits.html">{ar ? 'إشعار حقوق النشر الكامل' : 'Full copyright notice'}</a>
        </section>
        <section className="space-y-2">
          <h2 className="font-bold">{ar ? 'كتاب الحياة المجاني' : 'Biblica® Open New Arabic Version'} (KEHM / ONAV)</h2>
          <p dir="ltr">Copyright © 1988, 1997, 2012 by Biblica, Inc.®</p>
          <a className="text-sm text-sky-400 underline" href="/onav-license.html">{ar ? 'حقوق النشر وترخيص CC BY-SA 4.0' : 'Full copyright notice and CC BY-SA 4.0 license'}</a>
        </section>
      </div>
    </article>
  );
}
