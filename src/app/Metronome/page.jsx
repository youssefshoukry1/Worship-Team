"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";

/**
 * Parse time signature string to extract beats per measure
 */
function parseTimeSignature(timeSignature) {
    if (!timeSignature || typeof timeSignature !== 'string') return 4;
    const parts = timeSignature.split('/');
    const numerator = parseInt(parts[0], 10);
    return isNaN(numerator) || numerator <= 0 ? 4 : numerator;
}

export default function Metronome({ bpm = 130, timeSignature = "4/4", minimal = false, id }) {
    const beats = parseTimeSignature(timeSignature);
    const [isPlaying, setIsPlaying] = useState(false);
    const isRunningRef = useRef(false);

    const audioCtxRef = useRef(null);
    const nextNoteTimeRef = useRef(0);
    const currentBeatRef = useRef(0);
    const timerIdRef = useRef(null);

    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beats);
    
    // مرجع للميزان النصي عشان نعرف نحسب نوع الميزان
    const timeSignatureRef = useRef(timeSignature);

    // Sync props to refs
    useEffect(() => {
        bpmRef.current = bpm;
        beatsRef.current = beats;
        timeSignatureRef.current = timeSignature; 
    }, [bpm, beats, timeSignature]);

    // Global Stop Listener
    useEffect(() => {
        const handleGlobalStop = (e) => {
            if (e.detail.id !== id && isRunningRef.current) {
                stopMetronome();
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('metronome-start', handleGlobalStop);
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('metronome-start', handleGlobalStop);
            }
        };
    }, [id]);

    const scheduleNote = (beatNumber, time) => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Accent Logic: First beat strong, others weak
        const isAccent = beatNumber === 0;

        if (isAccent) {
            osc.frequency.value = 1000; 
            gainNode.gain.setValueAtTime(1, time);
        } else {
            osc.frequency.value = 800;
            gainNode.gain.setValueAtTime(0.7, time);
        }

        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        osc.start(time);
        osc.stop(time + 0.05);
    };

    const scheduler = () => {
        if (!isRunningRef.current) return;
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        const lookahead = 25.0;
        const scheduleAheadTime = 0.1;

        while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
            scheduleNote(currentBeatRef.current, nextNoteTimeRef.current);

            // --- منطق حساب السرعة (Multiplier Logic) ---
            
            const [numStr, denStr] = timeSignatureRef.current.split('/');
            const numerator = parseInt(numStr, 10);
            const denominator = parseInt(denStr, 10);

            let multiplier = 1;

            // لو المقام 8 (يعني الوحدة هي الكروش)
            if (denominator === 8) {
                if (numerator % 3 === 0) {
                    // الحالة الأولى: موازين مركبة (زي 6/8, 9/8, 12/8)
                    // النبضة هنا بتساوي 3 كروش (نوار منقوط)
                    // يبقى لازم نسرع 3 أضعاف
                    multiplier = 3;
                } else {
                    // الحالة الثانية: موازين شاذة أو عادية (زي 7/8, 8/8, 10/8)
                    // بنفترض هنا إن الـ BPM محسوب على "النوار" (Quarter Note)
                    // والنوار جواه 2 كروش، يبقى نسرع ضعفين
                    multiplier = 2;
                }
            }
            // لو المقام 4 (زي 3/4, 4/4) -> الـ Multiplier بيفضل 1 زي ما هو

            const secondsPerBeat = 60.0 / (bpmRef.current * multiplier);
            
            nextNoteTimeRef.current += secondsPerBeat;
            currentBeatRef.current = (currentBeatRef.current + 1) % beatsRef.current;
        }

        timerIdRef.current = setTimeout(scheduler, lookahead);
    };

    const stopMetronome = () => {
        isRunningRef.current = false;
        setIsPlaying(false);

        if (timerIdRef.current) {
            clearTimeout(timerIdRef.current);
            timerIdRef.current = null;
        }

        if (audioCtxRef.current?.state === 'running') {
            audioCtxRef.current.suspend().catch(() => { });
        }
    };

    const startMetronome = async () => {
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('metronome-start', { detail: { id } }));
            }

            if (!audioCtxRef.current) {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                audioCtxRef.current = ctx;
            }

            if (audioCtxRef.current.state === 'suspended') {
                await audioCtxRef.current.resume();
            }

            currentBeatRef.current = 0;
            nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.05;

            scheduler();

        } catch (error) {
            console.error("Metronome error:", error);
            isRunningRef.current = false;
            setIsPlaying(false);
        }
    };

    const toggle = async (e) => {
        if (e) e.stopPropagation();

        if (isRunningRef.current) {
            stopMetronome();
        } else {
            isRunningRef.current = true;
            setIsPlaying(true);
            if (timerIdRef.current) clearTimeout(timerIdRef.current);
            await startMetronome();
        }
    };

    useEffect(() => {
        return () => {
            isRunningRef.current = false;
            if (timerIdRef.current) clearTimeout(timerIdRef.current);
            if (audioCtxRef.current) audioCtxRef.current.close().catch(() => { });
        };
    }, []);

    if (minimal) {
        return (
            <button
                onClick={toggle}
                className={`p-1.5 rounded-full transition-all duration-300 flex items-center justify-center border border-transparent
                    ${isPlaying
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-white/10 text-sky-400 hover:bg-white/20 hover:scale-110'
                    }`}
                title={isPlaying ? "Stop Metronome" : `Play Metronome (${bpm} BPM)`}
            >
                {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            </button>
        );
    }

    return (
        <button onClick={toggle}>
            {isPlaying ? "⏹ Stop" : "▶ Play Metronome"}
        </button>
    );
}