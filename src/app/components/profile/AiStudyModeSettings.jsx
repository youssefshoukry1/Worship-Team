'use client';

import { useSyncExternalStore } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { readAiStudyMode, saveAiStudyMode, subscribeAiStudyMode } from '../../utils/aiStudyMode';

const defaultMode = () => 'normal';

export default function AiStudyModeSettings({ userId }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const mode = useSyncExternalStore(subscribeAiStudyMode, () => readAiStudyMode(userId), defaultMode);
  const choices = [
    { id: 'normal', title: ar ? '????' : 'Light',
      description: ar ? '?????? ????? ??????? ????????? ??????. ?????? ????? ???.' : 'Quick, concise answers for everyday questions. Uses fewer tokens.' },
    { id: 'old_man', title: ar ? '?????' : 'Medium',
      description: ar ? '??? ???? ?? ???? ??????. ?????? ????? ???? ??????? ????? ????.' : 'Deeper explanations with historical context. Takes longer and uses more tokens.' }
  ];

  return <section aria-labelledby="ai-study-mode-title" dir={ar ? 'rtl' : 'ltr'}>
    <h3 id="ai-study-mode-title" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{ar ? 'نمط إجابات الذكاء الاصطناعي' : 'AI response mode'}</h3>
    <fieldset className="app-card overflow-hidden rounded-xl border p-3">
      <legend className="sr-only">{ar ? 'اختر نمط الإجابة' : 'Choose an AI response mode'}</legend>
      <div className="grid grid-cols-2 gap-2">
        {choices.map(({ id, title, description }) => <label key={id} className="relative block min-w-0 cursor-pointer">
          <input className="peer sr-only" type="radio" name="ai-study-mode" value={id} checked={mode === id} onChange={() => saveAiStudyMode(userId, id)} />
          <div className={`h-full rounded-lg border p-3 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 ${mode === id ? 'border-transparent bg-[#14232e]' : 'border-white/10 hover:bg-white/5'}`}>
            <div className="flex flex-wrap items-center gap-1.5"><span className="text-sm font-semibold text-white">{title}</span>
              {id === 'normal' && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">{ar ? 'الافتراضي' : 'Default'}</span>}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
          </div>
        </label>)}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">{ar ? 'يُحفظ اختيارك على هذا الجهاز ويُطبّق على التفسير والمراجع والتطبيق.' : 'Saved on this device for explanation, references and application.'}</p>
    </fieldset>
  </section>;
}
