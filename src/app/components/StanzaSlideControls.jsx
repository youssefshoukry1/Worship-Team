'use client';

import { Monitor, Rows3, Scissors } from 'lucide-react';
import {
  countStanzaSlides,
  getLyricLines,
  sanitizeSlideBreaks,
  toggleSlideBreak,
} from '../utils/hymnSlides';

export default function StanzaSlideControls({ stanza, stanzaIndex, onChange }) {
  const lines = getLyricLines(stanza.text);
  const slideMode = stanza.slideMode === 'manual' ? 'manual' : 'auto';
  const slideBreaks = sanitizeSlideBreaks(stanza.slideBreaks, lines.length);
  const slideCount = countStanzaSlides(
    { ...stanza, slideMode, slideBreaks },
    { showChords: true }
  );

  const updateStanza = (patch) => {
    onChange(stanzaIndex, { ...stanza, ...patch });
  };

  const setSlideMode = (mode) => {
    updateStanza({
      slideMode: mode,
      slideBreaks: mode === 'manual' ? slideBreaks : [],
    });
  };

  const handleToggleBreak = (lineIndex) => {
    updateStanza({
      slideMode: 'manual',
      slideBreaks: toggleSlideBreak(slideBreaks, lineIndex, lines.length),
    });
  };

  if (!lines.length) return null;

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-400 flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5" />
          شرائح العرض
        </span>
        <span className="text-[10px] font-bold text-sky-300/80 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
          ≈ {slideCount} {slideCount === 1 ? 'شريحة' : 'شرائح'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSlideMode('auto')}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all ${
            slideMode === 'auto'
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
          }`}
        >
          <Rows3 className="w-3 h-3 inline-block ml-1 -mt-0.5" />
          تلقائي (حسب المساحة)
        </button>
        <button
          type="button"
          onClick={() => setSlideMode('manual')}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all ${
            slideMode === 'manual'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
          }`}
        >
          <Scissors className="w-3 h-3 inline-block ml-1 -mt-0.5" />
          يدوي
        </button>
      </div>

      {slideMode === 'manual' && lines.length > 1 && (
        <div className="rounded-lg bg-black/30 border border-white/5 p-2 space-y-1" dir="rtl">
          <p className="text-[10px] text-gray-500 mb-1">اضغط بين السطور لتحديد فصل الشريحة:</p>
          {lines.map((line, lineIdx) => (
            <div key={lineIdx}>
              <div
                className="text-[11px] text-gray-300 truncate px-1"
                title={line.replace(/\[.*?\]/g, '')}
              >
                {line.replace(/\[.*?\]/g, '')}
              </div>
              {lineIdx < lines.length - 1 && (
                <button
                  type="button"
                  onClick={() => handleToggleBreak(lineIdx)}
                  className={`w-full my-0.5 py-1 rounded-md text-[10px] font-bold border border-dashed transition-all ${
                    slideBreaks.includes(lineIdx)
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-transparent border-white/10 text-gray-500 hover:border-amber-500/30 hover:text-amber-300/80'
                  }`}
                >
                  {slideBreaks.includes(lineIdx) ? '✂ شريحة جديدة هنا' : '+ فصل شريحة'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {slideMode === 'auto' && (
        <p className="text-[10px] text-gray-500 leading-relaxed">
          يتم تقسيم الشرائح تلقائياً حسب مساحة الشاشة وطول كل سطر — بدون فراغات في النص.
        </p>
      )}
    </div>
  );
}
