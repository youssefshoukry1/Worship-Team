'use client';
import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause } from 'lucide-react';

export default function AudioMessage({ mediaUrl }) {
    const waveformRef = useRef(null);
    const wavesurferRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!waveformRef.current || !mediaUrl) return;

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

        // Load the audio file
        wavesurfer.load(mediaUrl);

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
    }, [mediaUrl]);

    const togglePlay = () => {
        if (wavesurferRef.current && isReady) {
            wavesurferRef.current.playPause();
        }
    };

    return (
        <div className="flex items-center gap-3 w-48 md:w-56 mt-1">
            <button 
                onClick={togglePlay}
                disabled={!isReady}
                className="w-10 h-10 shrink-0 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
            >
                {isPlaying ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white ml-1" />}
            </button>
            <div className="flex-1 w-full" ref={waveformRef}></div>
        </div>
    );
}
