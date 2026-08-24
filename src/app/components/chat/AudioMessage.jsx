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

        // Initialize wavesurfer
        const wavesurfer = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: '#38bdf8', // sky-400
            progressColor: '#0284c7', // sky-600
            cursorColor: '#0284c7',
            barWidth: 2,
            barGap: 2,
            barRadius: 2,
            height: 30,
            normalize: true,
        });

        wavesurferRef.current = wavesurfer;

        // Load the audio file from local storage object URL
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

    if (error) {
        return (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-white/5 text-gray-400 mt-1 max-w-[200px]">
                <CloudOff size={20} className="shrink-0" />
                <span className="text-[10px] leading-tight">Audio expired or deleted. Restore from backup.</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 w-48 md:w-56 mt-1 relative">
            <button
                onClick={togglePlay}
                disabled={!isReady || loading}
                className="w-10 h-10 shrink-0 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 relative"
            >
                {loading ? (
                    <Loader2 size={18} className="text-white animate-spin" />
                ) : isPlaying ? (
                    <Pause size={18} className="text-white" />
                ) : (
                    <Play size={18} className="text-white ml-1" />
                )}
            </button>
            <div className="flex-1 min-w-[120px] max-w-[200px]" ref={waveformRef}></div>
        </div>
    );
}
