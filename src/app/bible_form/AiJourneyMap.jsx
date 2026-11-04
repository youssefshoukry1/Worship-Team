'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

// The rail is decorative; the ordered list carries the same route for screen readers.
export default function AiJourneyMap({ journey }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const scrollRef = useRef(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0 });
  const [scrollbarVisible, setScrollbarVisible] = useState(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    let hideTimer;
    let touching = false;
    let hasScrolled = false;
    let overflowed = false;
    const updateThumb = () => {
      const { clientWidth, scrollWidth, scrollLeft } = scroller;
      const overflow = clientWidth > 0 && scrollWidth > clientWidth + 1;
      const width = overflow ? Math.max(12, clientWidth * clientWidth / scrollWidth * 0.65) : 0;
      // The route is RTL: zero is the right edge, and scrolling left gives negative offsets.
      const progress = overflow ? Math.min(1, Math.max(0, -scrollLeft / (scrollWidth - clientWidth))) : 0;
      setThumb({ width, left: overflow ? (clientWidth - width) * (1 - progress) : 0 });
      if (overflow && !overflowed) setScrollbarVisible(true);
      overflowed = overflow;
    };
    const show = () => { clearTimeout(hideTimer); setScrollbarVisible(true); };
    const hideAfterScrolling = () => {
      clearTimeout(hideTimer);
      if (hasScrolled && !touching) hideTimer = setTimeout(() => setScrollbarVisible(false), 800);
    };
    const handleScroll = () => { hasScrolled = true; updateThumb(); show(); hideAfterScrolling(); };
    const handleTouchStart = () => { touching = true; show(); };
    const handleTouchEnd = () => { touching = false; hideAfterScrolling(); };
    const observer = new ResizeObserver(updateThumb);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    scroller.addEventListener('touchstart', handleTouchStart, { passive: true });
    scroller.addEventListener('touchend', handleTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      observer.disconnect();
      clearTimeout(hideTimer);
      scroller.removeEventListener('scroll', handleScroll);
      scroller.removeEventListener('touchstart', handleTouchStart);
      scroller.removeEventListener('touchend', handleTouchEnd);
      scroller.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [journey]);

  const ys = [20, 20, 32, 32, 20];
  return <figure data-ai-journey aria-label={ar ? 'مخطط مسار الرحلة' : 'Journey diagram'} className="mt-4 rounded-xl bg-white/[0.03] p-3 whitespace-normal" dir="rtl">
    <div className={`relative ${thumb.width > 0 ? 'pb-2' : ''}`}>
    <div ref={scrollRef} data-ai-journey-scroll data-lenis-prevent className="overflow-x-auto overscroll-x-contain touch-auto hide-scrollbar">
    <ol className="grid grid-flow-col auto-cols-[minmax(96px,1fr)]" aria-label={ar ? 'محطات الرحلة بالترتيب' : 'Journey stops in order'}>
      {journey.stops.map((stop, index) => {
        const y = ys[index], previous = ys[Math.max(0, index - 1)];
        const first = index === 0, last = index === journey.stops.length - 1;
        const incoming = first ? '' : `M 112 ${previous} L 80 ${previous} L 66 ${y} L 56 ${y}`;
        return <li key={`${index}:${stop.place}`} className="relative min-w-0 text-center">
          <div aria-hidden="true" className="relative h-14 w-full">
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 112 56" preserveAspectRatio="none" fill="none">
              {incoming && <path d={incoming} stroke="currentColor" className="text-sky-400/80" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
              {!last && <path d={`M 56 ${y} L 0 ${y}`} stroke="currentColor" className="text-sky-400/80" strokeWidth="3" vectorEffect="non-scaling-stroke" />}
            </svg>
            <span style={{ top: y }} className={`absolute left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[9px] font-bold ${last ? 'border-sky-400 bg-sky-400 text-slate-950' : 'border-sky-400 bg-app-page text-sky-300'} ${last ? 'ring-4 ring-sky-400/10' : ''}`}>{index + 1}</span>
          </div>
          <div className="min-w-0 px-2 pb-1">
            <span className="text-xs font-semibold text-slate-100">{stop.place}</span>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-300">{stop.description}</p>
          </div>
        </li>;
      })}
    </ol>
    </div>
    {thumb.width > 0 && <span aria-hidden="true" data-ai-journey-scrollbar
      className="pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-full bg-white/30 transition-opacity duration-300"
      style={{ width: thumb.width, transform: `translateX(${thumb.left}px)`, opacity: scrollbarVisible ? 1 : 0 }} />}
    </div>
  </figure>;
}
