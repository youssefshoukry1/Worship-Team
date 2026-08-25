'use client';
import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Loader2, CloudOff } from 'lucide-react';
import { useLocalMedia } from '../../hooks/useLocalMedia';

export default function AudioMessage({ mediaUrl, messageId }) {
    const waveformRef = useRef(null);
    const wavesurferRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const { localUrl, loading, error } = useLocalMedia(mediaUrl, messageId);

    useEffect(() => {
        if (!waveformRef.current || !localUrl) return;

        // تعديل الألوان لتناسب الـ Theme الجديد وتقليل الارتفاع (height)
        const wavesurfer = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: '#64748b',      // slate-500
            progressColor: '#818cf8',  // indigo-400
            cursorColor: '#6366f1',    // indigo-500
            barWidth: 2,
            barGap: 2,
            barRadius: 2,
            height: 24,                // تم تصغير الارتفاع من 30 لـ 24
            normalize: true,
        });

        wavesurferRef.current = wavesurfer;
        wavesurfer.load(localUrl);

        wavesurfer.on('ready', () => {
            setIsReady(true);
        });

        wavesurfer.on('play', () => setIsPlaying(true));
        wavesurfer.on('pause', () => setIsPlaying(false));
        wavesurfer.on('finish', () => setIsPlaying(false));

        return () => {
            if (wavesurferRef.current) {
                wavesurferRef.current.destroy();
            }
        };
    }, [localUrl]);

    const togglePlay = () => {
        if (wavesurferRef.current && isReady) {
            wavesurferRef.current.playPause();
        }
    };

    // تصغير رسالة الخطأ
    if (error) {
        return (
            <div className="flex items-center gap-2 p-1.5 px-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-400 mt-1 max-w-[180px]">
                <CloudOff size={16} className="shrink-0" />
                <span className="text-[10px] leading-tight">Audio expired.</span>
            </div>
        );
    }

    return (
        // تقليل الـ width العام للعنصر
        <div className="flex items-center gap-2.5 w-40 md:w-48 mt-1 relative">
            <button
                onClick={togglePlay}
                disabled={!isReady || loading}
                // تصغير الزرار من w-10 h-10 لـ w-8 h-8 وجعله أنعم
                className="w-8 h-8 shrink-0 bg-indigo-500/20 hover:bg-indigo-500/30 rounded-full flex items-center justify-center transition-all duration-300 ease-out active:scale-95 disabled:opacity-50 relative"
            >
                {loading ? (
                    <Loader2 size={14} className="text-indigo-200 animate-spin" />
                ) : isPlaying ? (
                    <Pause size={14} className="text-indigo-200" />
                ) : (
                    <Play size={14} className="text-indigo-200 ml-0.5" />
                )}
            </button>
            {/* تقليل مساحة الـ waveform */}
            <div className="flex-1 min-w-[100px] max-w-[150px]" ref={waveformRef}></div>
        </div>
    );
}