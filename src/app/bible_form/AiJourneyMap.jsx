'use client';

import { useLanguage } from '../context/LanguageContext';

// The rail is decorative; the ordered list carries the same route for screen readers.
export default function AiJourneyMap({ journey }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const ys = [20, 20, 32, 32, 20];
  return <figure data-ai-journey aria-label={ar ? 'مخطط مسار الرحلة' : 'Journey diagram'} className="mt-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3 whitespace-normal" dir="rtl">
    <div data-ai-journey-scroll data-lenis-prevent className="overflow-x-auto overscroll-x-contain touch-auto hide-scrollbar">
    <ol className="grid grid-flow-col auto-cols-[minmax(96px,1fr)]" aria-label={ar ? 'محطات الرحلة بالترتيب' : 'Journey stops in order'}>
      {journey.stops.map((stop, index) => {
        const y = ys[index], previous = ys[Math.max(0, index - 1)];
        const first = index === 0, last = index === journey.stops.length - 1, destination = stop.kind === 'destination';
        const incoming = first ? '' : `M 112 ${previous} L 80 ${previous} L 66 ${y} L 56 ${y}`;
        return <li key={`${index}:${stop.place}`} className="relative min-w-0 text-center">
          <div aria-hidden="true" className="relative h-14 w-full">
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 112 56" preserveAspectRatio="none" fill="none">
              {incoming && <path d={incoming} stroke="currentColor" className={destination ? 'text-amber-300/70' : 'text-sky-400/80'} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={destination ? '4 4' : undefined} />}
              {!last && <path d={`M 56 ${y} L 0 ${y}`} stroke="currentColor" className="text-sky-400/80" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
            </svg>
            <span style={{ top: y }} className={`absolute left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[9px] font-bold ${destination ? 'border-dashed border-amber-300 bg-app-page text-amber-300' : first ? 'border-sky-400 bg-sky-400 text-slate-950' : 'border-sky-400 bg-app-page text-sky-300'} ${last ? 'ring-4 ring-sky-400/10' : ''}`}>{index + 1}</span>
          </div>
          <div className="min-w-0 px-2 pb-1">
            <span className="text-xs font-semibold text-slate-100">{stop.place}</span>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-300">{stop.description}</p>
          </div>
        </li>;
      })}
    </ol>
    </div>
  </figure>;
}
