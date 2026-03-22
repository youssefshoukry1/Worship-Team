'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresentation } from '../../hooks/usePresentation';
import { useSearchParams } from 'next/navigation';
import { Wifi, WifiOff } from 'lucide-react';
import { Suspense } from 'react';
import ChordLyrics from '../../components/ChordLyrics';

// Inner component that uses useSearchParams (must be inside Suspense)
function DisplayContent() {
    const searchParams = useSearchParams();
    const dataShowId = searchParams.get('dataShowId') || '';
    const { isConnected, displayState, remoteAudioStream } = usePresentation(dataShowId, 'display');
    const audioRef = useRef(null);

    useEffect(() => {
        if (audioRef.current && remoteAudioStream) {
            audioRef.current.srcObject = remoteAudioStream;
            audioRef.current.play().catch(e => console.log('Autoplay blocked:', e));
        }
    }, [remoteAudioStream]);

    // Local slide counter from state
    const slideData =
        displayState?.slides?.[displayState?.currentSlide] ?? null;
    const slideText = typeof slideData === 'string' ? slideData : slideData?.text;
    const slideTitle = typeof slideData === 'string' ? null : slideData?.title;
    const slideType = typeof slideData === 'string' ? 'verse' : slideData?.type;

    const hymnTitle = displayState?.currentHymnTitle ?? null;
    const currentSlide = displayState?.currentSlide ?? 0;
    const totalSlides = displayState?.slides?.length ?? 0;
    const isCleared = displayState?.type === 'clear' || (!displayState?.currentHymnId && displayState?.type !== 'sync');


    return (
        <div
            className="fixed inset-0 bg-black flex flex-col items-center justify-center select-none overflow-hidden"
            style={{ fontFamily: "'Georgia', serif" }}
        >
            {/* Connection badge */}
            <div className="absolute top-5 right-5 flex items-center gap-1.5 z-50">
                {isConnected ? (
                    <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-900/30 border border-green-700/40 px-3 py-1 rounded-full backdrop-blur-sm">
                        <Wifi size={12} className="animate-pulse" />
                        Live · {dataShowId}
                    </span>
                ) : (
                    <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-900/30 border border-red-700/40 px-3 py-1 rounded-full backdrop-blur-sm">
                        <WifiOff size={12} />
                        Connecting…
                    </span>
                )}
            </div>

            {/* Audio Stream Player */}
            {remoteAudioStream && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 px-3 py-1 rounded-full text-xs animate-pulse flex items-center gap-1">
                    🎤 Live Audio
                </div>
            )}
            <audio ref={audioRef} autoPlay />

            {/* Slide counter (bottom center) */}
            {totalSlides > 0 && (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                    <span className="text-white/30 text-sm font-mono tracking-widest">
                        {currentSlide + 1} / {totalSlides}
                    </span>
                </div>
            )}

            {/* Hymn title (top left corner, subtle) */}
            {hymnTitle && (
                <div className="absolute top-5 left-5 text-white/25 text-sm font-light tracking-wide">
                    {hymnTitle}
                </div>
            )}

            {/* Main content */}
            <AnimatePresence mode="wait">
                {!isConnected ? (
                    <motion.div
                        key="connecting"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-center"
                    >
                        <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mx-auto mb-6" />
                        <p className="text-white/30 text-lg font-light tracking-widest">Connecting…</p>
                    </motion.div>
                ) : isCleared || !slideData ? (
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
                        {dataShowId && (
                            <p className="text-white/10 text-sm mt-4 tracking-widest font-mono">
                                Room: {dataShowId}
                            </p>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key={`${displayState?.currentHymnId}-${currentSlide}`}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="w-full h-full flex flex-col items-center justify-center px-12 text-center"
                    >
                        {slideTitle && (
                            <div className="absolute top-10 left-1/2 -translate-x-1/2 text-white/40 text-lg sm:text-2xl font-black tracking-[0.4em] px-8 py-2 rounded-full border border-white/5 bg-white/5 uppercase" dir="rtl">
                                {slideTitle}
                            </div>
                        )}

                        {/* First Line Chords Display */}
                        {Array.isArray(slideData) && slideData[0]?.lines?.[0] && (
                            <div className="absolute top-32 left-1/2 -translate-x-1/2 flex gap-4 items-center justify-center flex-wrap max-w-xl">
                                {slideData[0].lines[0].segments
                                    .filter(seg => seg.chord)
                                    .map((seg, idx) => (
                                        <div
                                            key={idx}
                                            className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 backdrop-blur-sm"
                                        >
                                            <span className="text-xl sm:text-2xl font-black text-cyan-300" dir="ltr">
                                                {seg.chord}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        )}

                        <ChordLyrics
                            chordedLyrics={Array.isArray(slideData) ? slideData : [slideData]}
                            showChords={true} // Display always shows chords if they exist in broadcast
                            presentation={true}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function DisplayPage() {
    return (
        <Suspense fallback={
            <div className="fixed inset-0 bg-black flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
        }>
            <DisplayContent />
        </Suspense>
    );
}