'use client';

import { useLanguage } from '../context/LanguageContext';

// The rail is decorative; the ordered list carries the same route for screen readers.
export default function AiJourneyMap({ journey }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const xs = [18, 18, 42, 42, 18];
  return <figure data-ai-journey className="mt-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3 whitespace-normal" dir="rtl">
    <figcaption className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-sky-300">
      <span>{ar ? 'مسار الرحلة' : 'Journey'}</span><span className="text-[10px] font-normal text-slate-400">{ar ? 'حسب تسلسل المقطع' : 'In passage order'}</span>
    </figcaption>
    <ol aria-label={ar ? 'محطات الرحلة بالترتيب' : 'Journey stops in order'}>
      {journey.stops.map((stop, index) => {
        const x = xs[index], previous = xs[Math.max(0, index - 1)];
        const first = index === 0, last = index === journey.stops.length - 1, destination = stop.kind === 'destination';
        const incoming = first ? '' : `M ${previous} 0 L ${previous} 12 L ${x} 32`;
        return <li key={`${index}:${stop.place}`} className="relative grid min-h-[72px] grid-cols-[60px_minmax(0,1fr)] items-center gap-1">
          <div aria-hidden="true" className="relative h-full w-[60px]">
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 60 64" preserveAspectRatio="none" fill="none">
              {incoming && <path d={incoming} stroke="currentColor" className={destination ? 'text-amber-300/70' : 'text-sky-400/80'} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={destination ? '4 4' : undefined} />}
              {!last && <path d={`M ${x} 32 L ${x} 64`} stroke="currentColor" className="text-sky-400/80" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
            </svg>
            <span style={{ left: x }} className={`absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[9px] font-bold ${destination ? 'border-dashed border-amber-300 bg-app-page text-amber-300' : first ? 'border-sky-400 bg-sky-400 text-slate-950' : 'border-sky-400 bg-app-page text-sky-300'} ${last ? 'ring-4 ring-sky-400/10' : ''}`}>{index + 1}</span>
          </div>
          <div className="min-w-0 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-xs font-semibold text-slate-100">{stop.place}</span>
              {destination && <span className="rounded-full bg-amber-300/10 px-1.5 py-0.5 text-[9px] text-amber-300">{ar ? 'الوجهة المذكورة' : 'Stated destination'}</span>}
            </div>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-300">{stop.description}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-sky-300/80"><bdi>{stop.reference}</bdi></p>
          </div>
        </li>;
      })}
    </ol>
    <p className="mt-2 text-[10px] leading-5 text-slate-400">{ar ? 'مخطط لتسلسل الرحلة، دون مقياس للمسافات.' : 'A schematic sequence, without a distance scale.'}</p>
  </figure>;
}
