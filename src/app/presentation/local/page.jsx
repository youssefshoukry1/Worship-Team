'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Suspense } from 'react';

const CHANNEL_NAME = 'taspe_presenter';

function LocalDisplayContent() {
  const [slideData, setSlideData] = useState(null);  // { text, title, type }
  const [hymnTitle, setHymnTitle] = useState('');
  const [slideIndex, setSlideIndex] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    const channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = (event) => {
      const { type, slide, hymn, index, total } = event.data || {};

      if (type === 'slide') {
        setSlideData(slide);
        setHymnTitle(hymn || '');
        setSlideIndex(index ?? 0);
        setTotalSlides(total ?? 0);
      } else if (type === 'clear') {
        setSlideData(null);
        setHymnTitle('');
      }
    };

    return () => channel.close();
  }, []);

  const text = slideData?.text ?? '';
  const title = slideData?.title ?? null;
  const isChorus = slideData?.type === 'chorus';

  const parseSegments = (line) => {
    const parts = line.split(/(\[.*?\])/g);
    const segments = [];
    let i = 0;
    while (i < parts.length) {
      const part = parts[i];
      if (part && part.startsWith('[') && part.endsWith(']')) {
        segments.push({ chord: part.slice(1, -1), text: parts[i + 1] ?? '' });
        i += 2;
      } else {
        if (part) segments.push({ chord: null, text: part });
        i++;
      }
    }
    return segments;
  };

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center select-none overflow-hidden"
      style={{ fontFamily: "'Georgia', serif" }}
    >
      {/* Hymn title — subtle top-left */}
      {hymnTitle && (
        <div className="absolute top-6 left-8 text-white/25 text-base font-light tracking-widest truncate max-w-[40vw]">
          {hymnTitle}
        </div>
      )}

      {/* Slide counter — subtle bottom */}
      {totalSlides > 0 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center">
          <span className="text-white/20 text-sm font-mono tracking-widest">
            {slideIndex + 1} / {totalSlides}
          </span>
        </div>
      )}

      {/* Main content */}
      <AnimatePresence mode="wait">
        {!ready || !slideData ? (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <div className="text-white/10 text-8xl mb-8 select-none">✝</div>
            <p className="text-white/20 text-xl font-light tracking-[0.3em] uppercase">
              Waiting for presenter
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={`${hymnTitle}-${slideIndex}`}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="relative w-full h-full flex flex-col items-center justify-center px-10 sm:px-16 text-center"
          >
            {/* Section label */}
            {title && (
              <div
                className="absolute top-8 left-1/2 -translate-x-1/2 text-white/40 text-base sm:text-xl font-black tracking-[0.4em] px-6 py-2 rounded-full border border-white/10 bg-white/5 uppercase select-none"
                dir="rtl"
              >
                {title}
              </div>
            )}

            {/* Lyric lines */}
            <div className="w-full flex flex-col items-center gap-0">
              {text.split('\n').map((line, i) => {
                if (!line.trim()) return <div key={i} className="h-[0.5em]" />;
                const segments = parseSegments(line);
                const anyChords = line.includes('[');

                return (
                  <div
                    key={i}
                    className={`flex flex-wrap justify-center items-end w-full ${anyChords ? 'mt-[1.2em]' : 'my-[0.2em]'}`}
                    dir="rtl"
                  >
                    {segments.map((seg, j) => (
                      <span key={j} className="inline-flex flex-col items-start min-w-[0.2em]">
                        {/* Chord row */}
                        <span
                          className="block font-black whitespace-nowrap overflow-visible leading-none select-none mb-2"
                          dir="ltr"
                          style={{
                            color: '#38BDF8',
                            fontSize: 'clamp(10px, 1.5vw, 22px)',
                            visibility: seg.chord ? 'visible' : 'hidden',
                            textShadow: '0 2px 8px rgba(0,0,0,0.8)'
                          }}
                        >
                          {seg.chord || '\u00A0'}
                        </span>
                        {/* Lyric row */}
                        <span
                          className={`font-bold whitespace-pre-wrap leading-tight select-none tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] ${isChorus ? 'text-yellow-300' : 'text-white'}`}
                          style={{ fontSize: 'clamp(28px, 7vw, 100px)' }}
                        >
                          {seg.text || '\u00A0'}
                        </span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LocalDisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-black flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      }
    >
      <LocalDisplayContent />
    </Suspense>
  );
}
