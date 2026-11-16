'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { openVoiceInput } from '../utils/voiceProcessing';

const pickMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'].find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
};

const VOICE_BITRATE = 128000;

/**
 * One recorder shared by the general box and all section blocks — only one can record at a time.
 * onFinish(blockId, { blob, url, duration, mimeType }) is called when a recording is kept.
 */
export function usePrayRecorder(onFinish, onStart) {
    const [recordingBlockId, setRecordingBlockId] = useState(null);
    const [seconds, setSeconds] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [stream, setStream] = useState(null);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const voiceRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const cancelRef = useRef(false);
    const elapsedMsRef = useRef(0);
    const resumedAtRef = useRef(0);
    const onFinishRef = useRef(onFinish);
    const pendingRef = useRef(false);
    const generationRef = useRef(0);

    useEffect(() => {
        onFinishRef.current = onFinish;
    }, [onFinish]);

    const elapsedMs = () => elapsedMsRef.current + (resumedAtRef.current ? Date.now() - resumedAtRef.current : 0);

    const cleanup = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        voiceRef.current?.close();
        voiceRef.current = null;
        recorderRef.current = null;
        elapsedMsRef.current = 0;
        resumedAtRef.current = 0;
        setStream(null);
        setRecordingBlockId(null);
        setIsPaused(false);
        setSeconds(0);
    }, []);

    const start = async (blockId) => {
        if (recorderRef.current || pendingRef.current) return;
        pendingRef.current = true;
        const generation = generationRef.current;
        try {
            const voice = await openVoiceInput();
            if (generation !== generationRef.current) { voice.stream.getTracks().forEach(track => track.stop()); voice.close(); return; }
            voiceRef.current = voice;
            streamRef.current = voice.stream;
            const mimeType = pickMimeType();
            const options = { audioBitsPerSecond: VOICE_BITRATE, ...(mimeType && { mimeType }) };
            const recorder = new MediaRecorder(voice.stream, options);
            recorderRef.current = recorder;
            chunksRef.current = [];
            cancelRef.current = false;
            onStart?.();

            recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
            recorder.onstop = () => {
                const type = recorder.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type });
                const duration = elapsedMs() / 1000;
                chunksRef.current = [];
                if (!cancelRef.current && blob.size > 0) {
                    onFinishRef.current?.(blockId, { blob, url: URL.createObjectURL(blob), duration, mimeType: type });
                }
                cleanup();
            };

            elapsedMsRef.current = 0;
            resumedAtRef.current = Date.now();
            recorder.start();
            setStream(voice.stream);
            setRecordingBlockId(blockId);
            setIsPaused(false);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds(elapsedMs() / 1000), 250);
        } catch (err) {
            if (generation !== generationRef.current) return;
            console.error('Microphone error:', err);
            cleanup();
            alert('Could not access microphone.');
        } finally { if (generation === generationRef.current) pendingRef.current = false; }
    };

    const pause = () => {
        const recorder = recorderRef.current;
        if (recorder?.state !== 'recording' || typeof recorder.pause !== 'function') return;
        recorder.pause();
        elapsedMsRef.current = elapsedMs();
        resumedAtRef.current = 0;
        setIsPaused(true);
    };

    const resume = () => {
        const recorder = recorderRef.current;
        if (recorder?.state !== 'paused') return;
        recorder.resume();
        resumedAtRef.current = Date.now();
        setIsPaused(false);
    };

    const stop = () => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') return;
        elapsedMsRef.current = elapsedMs();
        resumedAtRef.current = 0;
        recorder.stop();
    };
    const cancel = () => { cancelRef.current = true; stop(); };

    // Stop the mic if the component unmounts mid-recording
    useEffect(() => () => {
        generationRef.current++;
        pendingRef.current = false;
        cancelRef.current = true;
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        voiceRef.current?.close();
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    return {
        recordingBlockId, seconds, isPaused, stream,
        canPause: typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function',
        start, pause, resume, stop, cancel,
        isRecording: Boolean(recordingBlockId),
    };
}

