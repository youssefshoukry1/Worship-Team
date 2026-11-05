'use client';

import { useLanguage } from '../context/LanguageContext';

export default function AiPracticalFlow({ flow }) {
  const { language } = useLanguage();
  return (
    <figure data-ai-practical-flow aria-label={language === 'ar' ? 'خطوات التطبيق العملي' : 'Practical action steps'}
      className="mt-4 rounded-2xl bg-violet-400/[0.04] p-3 whitespace-normal" dir="rtl">
      <ol className="flex items-stretch gap-3">
        {flow.steps.map((step, index) => {
          const last = index === flow.steps.length - 1;
          return (
            <li key={index} data-ai-practical-step
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl px-2 py-3 text-center ring-1 ring-inset ${last ? 'bg-emerald-400/10 ring-emerald-300/15' : 'bg-white/[0.035] ring-white/5'}`}>
              <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold ${last ? 'bg-emerald-300 text-slate-950' : 'bg-violet-400/15 text-violet-200'}`}>{index + 1}</span>
              <span className="w-full break-words text-xs font-medium leading-5 text-slate-100">{step.title}</span>
              {!last && <span aria-hidden="true" className="pointer-events-none absolute -left-3 top-1/2 z-10 flex w-3 -translate-y-1/2 items-center justify-center text-sm text-violet-300/70">←</span>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
