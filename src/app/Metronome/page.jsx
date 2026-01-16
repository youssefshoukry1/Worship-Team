"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";

export default function Metronome({ bpm = 130, beats = 4, minimal = false, id }) {
    const [isPlaying, setIsPlaying] = useState(false); // UI State
    const isRunningRef = useRef(false); // Logic Guard (Sync source of truth)

    const audioCtxRef = useRef(null);

    // Timing refs
    const nextNoteTimeRef = useRef(0);
    const currentBeatRef = useRef(0);
    const timerIdRef = useRef(null);

    // BPM Refs
    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beats);

    // Sync props to refs
    useEffect(() => {
        bpmRef.current = bpm;
        beatsRef.current = beats;
    }, [bpm, beats]);

    // Global Event Listener for Exclusive Playback
    useEffect(() => {
        const handleGlobalStop = (e) => {
            // If another metronome started (different ID), stop this one
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

    // Professional Synthesized "Woodblock" Sound
    // This eliminates file loading drift and ensures 100% precision.
    const scheduleNote = (beatNumber, time) => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;

        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Frequencies: High for Downbeat (1), Low for others
        if (beatNumber === 0) {
            osc.frequency.value = 1000; // High Pitch (Beat 1)
            gainNode.gain.setValueAtTime(1, time);
        } else {
            osc.frequency.value = 800;  // Low Pitch (Other beats)
            gainNode.gain.setValueAtTime(0.7, time);
        }

        // Short, percussive envelope (Woodblock style)
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        osc.start(time);
        osc.stop(time + 0.05); // Stop automatically shortly after
    };

    const scheduler = () => {
        if (!isRunningRef.current) return;
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        const lookahead = 25.0;
        const scheduleAheadTime = 0.1;

        while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
            scheduleNote(currentBeatRef.current, nextNoteTimeRef.current);

            const secondsPerBeat = 60.0 / bpmRef.current;
            nextNoteTimeRef.current += secondsPerBeat;

            currentBeatRef.current = (currentBeatRef.current + 1) % beatsRef.current;
        }

        timerIdRef.current = setTimeout(scheduler, lookahead);
    };

    const stopMetronome = () => {
        // Immediate Synchronous Halt
        isRunningRef.current = false;
        setIsPlaying(false);

        if (timerIdRef.current) {
            clearTimeout(timerIdRef.current);
            timerIdRef.current = null;
        }

        if (audioCtxRef.current?.state === 'running') {
            // We use suspend to kill the audio engine timeline immediately
            // catch handles potential race conditions if already closed
            audioCtxRef.current.suspend().catch(() => { });
        }
    };

    const startMetronome = async () => {
        try {
            // Dispatch global event to stop others
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('metronome-start', { detail: { id } }));
            }

            // 1. Initialize Audio Context if missing
            if (!audioCtxRef.current) {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                audioCtxRef.current = ctx;
            }

            // 2. Resume Context (Wake up audio engine)
            if (audioCtxRef.current.state === 'suspended') {
                await audioCtxRef.current.resume();
            }

            // 3. Reset Timing Logic to "Now"
            currentBeatRef.current = 0;
            nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.05;

            // 4. Start Scheduler Loop
            // (isRunningRef was already set to true in toggle, keeping it locked)
            scheduler();

        } catch (error) {
            console.error("Metronome error:", error);
            // Revert UI if failure
            isRunningRef.current = false;
            setIsPlaying(false);
        }
    };

    const toggle = async (e) => {
        if (e) e.stopPropagation();

        // Check Sync Guard
        if (isRunningRef.current) {
            // STOP
            stopMetronome();
        } else {
            // PLAY
            // 1. Lock immediately to prevent race conditions (double-clicks)
            isRunningRef.current = true;
            setIsPlaying(true);

            // 2. Ensure clean state
            if (timerIdRef.current) clearTimeout(timerIdRef.current);

            // 3. Run Async Init
            await startMetronome();
        }
    };

    // Cleanup
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
