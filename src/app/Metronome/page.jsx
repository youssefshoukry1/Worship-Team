"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";

/**
 * Parse time signature string → { numerator (beats/bar), denominator (note value) }
 */
function parseTimeSignature(timeSignature) {
    if (!timeSignature || typeof timeSignature !== 'string') {
        return { numerator: 4, denominator: 4 };
    }
    const parts = timeSignature.split('/');
    const numerator = parseInt(parts[0], 10);
    const denominator = parseInt(parts[1], 10);
    return {
        numerator: isNaN(numerator) || numerator <= 0 ? 4 : numerator,
        denominator: isNaN(denominator) || denominator <= 0 ? 4 : denominator,
    };
}

/**
 * Determine accent level for a given beat index within a bar.
 *
 * Supported time signatures: 2/2, 1/4, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 8/8, 9/8, 10/8
 *
 * Accent levels:
 *  2 = strong  (first beat of bar)
 *  1 = medium  (sub-group downbeat, e.g. beat 3 in 6/8 or beat 4 in 7/8)
 *  0 = weak    (all other beats)
 */
function getAccentLevel(beatIndex, timeSignature) {
    if (beatIndex === 0) return 2; // Always accent the first beat

    switch (timeSignature) {
        // Simple quadruple – secondary accent on beat 2 (index 2)
        case '4/4':
            return beatIndex === 2 ? 1 : 0;

        // Compound duple – 3+3: secondary accent on beat 3 (index 3)
        case '6/8':
            return beatIndex === 3 ? 1 : 0;

        // Compound triple – 3+3+3: secondary accents on beats 3 and 6
        case '9/8':
            return beatIndex === 3 || beatIndex === 6 ? 1 : 0;

        // Odd 5/4 – common grouping 3+2: secondary accent on beat 3 (index 3)
        case '5/4':
            return beatIndex === 3 ? 1 : 0;

        // Odd 7/8 – common grouping 2+2+3: secondary accents on beats 2 and 4
        case '7/8':
            return beatIndex === 2 || beatIndex === 4 ? 1 : 0;

        // 8/8 – grouping 3+3+2: secondary accents on beats 3 and 6
        case '8/8':
            return beatIndex === 3 || beatIndex === 6 ? 1 : 0;

        // 10/8 – grouping 3+3+2+2: secondary accents on beats 3, 6, and 8
        case '10/8':
            return beatIndex === 3 || beatIndex === 6 || beatIndex === 8 ? 1 : 0;

        // 2/2, 1/4, 2/4, 3/4 – no secondary accents needed
        default:
            return 0;
    }
}

export default function Metronome({ bpm = 130, timeSignature = "4/4", minimal = false, id }) {
    const { numerator: beats, denominator } = parseTimeSignature(timeSignature);

    const [isPlaying, setIsPlaying] = useState(false);
    const isRunningRef = useRef(false);

    const audioCtxRef = useRef(null);
    const nextNoteTimeRef = useRef(0);
    const currentBeatRef = useRef(0);
    const timerIdRef = useRef(null);

    // Keep latest prop values accessible inside the scheduler closure
    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beats);
    const denominatorRef = useRef(denominator);
    const timeSignatureRef = useRef(timeSignature);

    useEffect(() => {
        bpmRef.current = bpm;
        const parsed = parseTimeSignature(timeSignature);
        beatsRef.current = parsed.numerator;
        denominatorRef.current = parsed.denominator;
        timeSignatureRef.current = timeSignature;
    }, [bpm, timeSignature]);

    // Stop this metronome when another one starts
    useEffect(() => {
        const handleGlobalStop = (e) => {
            if (e.detail.id !== id && isRunningRef.current) {
                stopMetronome();
            }
        };
        window.addEventListener('metronome-start', handleGlobalStop);
        return () => window.removeEventListener('metronome-start', handleGlobalStop);
    }, [id]);

    /**
     * Schedule one click/tick sound.
     *
     * accentLevel:
     *  2 → strong accent  (1050 Hz, gain 1.0)
     *  1 → medium accent  (900 Hz,  gain 0.75)
     *  0 → weak beat      (750 Hz,  gain 0.55)
     */
    const scheduleNote = (beatIndex, time) => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;

        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        const accentLevel = getAccentLevel(beatIndex, timeSignatureRef.current);

        if (accentLevel === 2) {
            osc.frequency.value = 1050;
            gainNode.gain.setValueAtTime(1.0, time);
        } else if (accentLevel === 1) {
            osc.frequency.value = 900;
            gainNode.gain.setValueAtTime(0.75, time);
        } else {
            osc.frequency.value = 750;
            gainNode.gain.setValueAtTime(0.55, time);
        }

        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);
    };

    const scheduler = () => {
        if (!isRunningRef.current) return;
        const ctx = audioCtxRef.current;
        if (!ctx) return;

        const lookahead = 25.0;          // ms — how often scheduler is called
        const scheduleAheadTime = 0.1;   // seconds — how far ahead to schedule

        while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
            scheduleNote(currentBeatRef.current, nextNoteTimeRef.current);

            /**
             * Universal beat-duration formula:
             *
             *   secondsPerBeat = 240 / (BPM × denominator)
             *
             * Why it works:
             *  - BPM is always counted in quarter notes (the app convention).
             *  - A quarter note lasts  60/BPM  seconds.
             *  - The denominator note value lasts  (60/BPM) × (4/denominator)
             *                                    = 240 / (BPM × denominator)
             *
             * Examples at BPM = 60:
             *  /2  → 240/(60×2)  = 2.00 s per half-note click       ✓
             *  /4  → 240/(60×4)  = 1.00 s per quarter-note click     ✓
             *  /8  → 240/(60×8)  = 0.50 s per eighth-note click      ✓
             */
            const secondsPerBeat = 240 / (bpmRef.current * denominatorRef.current);

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
            window.dispatchEvent(new CustomEvent('metronome-start', { detail: { id } }));

            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
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

    // Cleanup on unmount
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
                {isPlaying
                    ? <Square className="w-3 h-3 fill-current" />
                    : <Play className="w-3 h-3 fill-current" />
                }
            </button>
        );
    }

    return (
        <button onClick={toggle}>
            {isPlaying ? "⏹ Stop" : "▶ Play Metronome"}
        </button>
    );
}