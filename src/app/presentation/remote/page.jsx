'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { usePresentation } from '../../hooks/usePresentation';
import { ChevronLeft, ChevronRight, XCircle, Wifi, WifiOff } from 'lucide-react';

function RemoteContent() {
    const searchParams = useSearchParams();
    const dataShowId = searchParams.get('dataShowId') || '';
    const { isConnected, broadcastSlide, clearDisplay, displayState, remoteAudioStream } =
        usePresentation(dataShowId, 'remote');

    const audioRef = useRef(null);

    useEffect(() => {
        if (audioRef.current && remoteAudioStream) {
            audioRef.current.srcObject = remoteAudioStream;
            audioRef.current.play().catch(e => console.log('Autoplay blocked:', e));
        }
    }, [remoteAudioStream]);

    const currentSlide = displayState?.currentSlide ?? 0;
    const totalSlides = displayState?.slides?.length ?? 0;
    const hymnTitle = displayState?.currentHymnTitle ?? null;

    return (
        <div className="min-h-screen bg-[#0a0a14] text-white flex flex-col items-center justify-center gap-8 p-6">
            <div className="text-center">
                <h1 className="text-xl font-bold text-sky-400 mb-1">Mobile Remote</h1>
                {hymnTitle ? (
                    <p className="text-sm text-gray-400">{hymnTitle}</p>
                ) : (
                    <p className="text-sm text-gray-600">No hymn active</p>
                )}
                {totalSlides > 0 && (
                    <p className="text-xs text-gray-600 mt-1 font-mono">
                        {currentSlide + 1} / {totalSlides}
                    </p>
                )}
            </div>

            {/* Connection dot */}
            <div className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full border ${isConnected
                ? 'text-green-400 border-green-700/40 bg-green-900/20'
                : 'text-red-400 border-red-700/40 bg-red-900/20'}`}>
                {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                {isConnected ? `Live · ${dataShowId}` : 'Connecting…'}
            </div>

            {remoteAudioStream && (
                <div className="text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 px-3 py-1 rounded-full text-xs font-bold animate-pulse flex items-center gap-1 mt-[-10px]">
                    🎤 Host is broadcasting Audio
                </div>
            )}
            <audio ref={audioRef} autoPlay />

            {/* Navigation */}
            <div className="flex items-center gap-6">
                <button
                    onClick={() => broadcastSlide(currentSlide - 1)}
                    disabled={currentSlide === 0}
                    className="w-20 h-20 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white disabled:opacity-20 active:scale-95 transition-all"
                >
                    <ChevronRight size={40} />
                </button>
                <button
                    onClick={() => broadcastSlide(currentSlide + 1)}
                    disabled={currentSlide >= totalSlides - 1}
                    className="w-20 h-20 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white disabled:opacity-20 active:scale-95 transition-all"
                >
                    <ChevronLeft size={40} />
                </button>
            </div>

            {/* Next Slide Preview */}
            <div className="w-full max-w-sm px-6">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2 text-center">Next Slide</p>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 min-h-24 flex items-center justify-center text-center">
                    {currentSlide < totalSlides - 1 && displayState?.slides ? (
                        <p className="text-gray-400 text-sm whitespace-pre-line line-clamp-3" dir="rtl">
                            {displayState.slides[currentSlide + 1].replace(/\[|\]/g, '')}
                        </p>
                    ) : (
                        <p className="text-gray-600 text-sm italic">End of presentation</p>
                    )}
                </div>
            </div>

            <button
                onClick={clearDisplay}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-900/20 border border-red-700/30 text-red-400 text-sm hover:bg-red-900/40 active:scale-95 transition-all mt-4"
            >
                <XCircle size={16} /> End/Clear Display
            </button>
        </div>
    );
}

export default function RemotePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
        }>
            <RemoteContent />
        </Suspense>
    );
}
