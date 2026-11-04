'use client';

import { useSyncExternalStore } from 'react';
import { BookOpen, Check, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { readAiStudyMode, saveAiStudyMode, subscribeAiStudyMode } from '../../utils/aiStudyMode';

const defaultMode = () => 'normal';

export default function AiStudyModeSettings({ userId }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const mode = useSyncExternalStore(subscribeAiStudyMode, () => readAiStudyMode(userId), defaultMode);
  const choices = [
    { id: 'normal', title: ar ? 'العادي' : 'Normal', Icon: Sparkles,
      description: ar ? 'شرح مباشر وبسيط في ٢–٤ أسطر.' : 'Clear, straightforward answers in 2–4 short lines.' },
    { id: 'old_man', title: ar ? 'الرجل الحكيم' : 'Old Man', Icon: BookOpen,
      description: ar ? 'دراسة أعمق للسياق التاريخي والأماكن والرحلات، مع شرح الكلمات العبرية أو اليونانية المهمة بالعربية.'
        : 'A closer look at history, places and journeys, with important Hebrew or Greek words explained in Arabic.' }
  ];

  return <section aria-labelledby="ai-study-mode-title" dir={ar ? 'rtl' : 'ltr'}>
    <h3 id="ai-study-mode-title" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{ar ? 'نمط إجابات الذكاء الاصطناعي' : 'AI response mode'}</h3>
    <fieldset className="app-card overflow-hidden rounded-2xl border p-4 shadow-xl shadow-black/20">
      <legend className="sr-only">{ar ? 'اختر نمط الإجابة' : 'Choose an AI response mode'}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map(({ id, title, Icon, description }) => <label key={id} className="relative block cursor-pointer">
          <input className="peer sr-only" type="radio" name="ai-study-mode" value={id} checked={mode === id} onChange={() => saveAiStudyMode(userId, id)} />
          <div className={`h-full rounded-xl border p-4 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 ${mode === id ? 'border-sky-400/50 bg-sky-400/10' : 'border-white/10 hover:bg-white/5'}`}>
            <div className="flex items-center gap-2.5"><Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-sky-300" /><span className="text-sm font-semibold text-white">{title}</span>
              {id === 'normal' && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">{ar ? 'الافتراضي' : 'Default'}</span>}
              {mode === id && <Check aria-hidden="true" className="ms-auto h-4 w-4 shrink-0 text-sky-300" />}
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-400">{description}</p>
            {id === 'old_man' && <p className="mt-2 text-xs leading-6 text-sky-300/90">{ar ? '٢–٤ أسطر عادةً، وقد تمتد إلى ٦–١٠ عند الحاجة فقط.' : 'Usually 2–4 lines; expands to 6–10 only when needed.'}</p>}
          </div>
        </label>)}
      </div>
      <p className="mt-3 text-xs leading-6 text-slate-400">{ar ? 'يُحفظ اختيارك على هذا الجهاز ويُطبّق على التفسير والمراجع والتطبيق.' : 'Saved on this device for explanation, references and application.'}</p>
    </fieldset>
  </section>;
}
