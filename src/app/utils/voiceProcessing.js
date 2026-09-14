/**
 * Voice-note processing for microphone recordings.
 *
 * mic → mono → low-cut (24 dB/oct @ 80 Hz) → RNNoise (ML noise removal) → EQ (mud cut, presence, de-hiss)
 *     → smart leveler (speech-only AGC + soft expander) → gentle compressor → make-up gain → limiter
 *
 * The browser's own noise suppression / auto gain are turned off when our chain is active: they gate
 * and pump the signal, which is what chopped words and raised background noise before.
 * Assets live in public/audio (copied by scripts/copy-audio-worklets.mjs).
 */
const ASSET_BASE = '/audio';
const RNNOISE_SAMPLE_RATE = 48000;

// The package extends AudioWorkletNode at import time, which doesn't exist during server prerendering,
// so it is loaded only in the browser when recording starts
const loadSuppressor = () => import('@sapphi-red/web-noise-suppressor');

// Downloaded once per session and shared by every recording
let rnnoiseWasmPromise = null;
const getRnnoiseWasm = () => {
    rnnoiseWasmPromise ||= loadSuppressor()
        .then(({ loadRnnoise }) => loadRnnoise({ url: `${ASSET_BASE}/rnnoise.wasm`, simdUrl: `${ASSET_BASE}/rnnoise_simd.wasm` }))
        .catch((err) => { rnnoiseWasmPromise = null; throw err; });
    return rnnoiseWasmPromise;
};

const createContext = () => {
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return null;
    try {
        return new AudioCtx({ sampleRate: RNNOISE_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
        return new AudioCtx();
    }
};

const filter = (ctx, type, frequency, { Q = 0.707, gain = 0 } = {}) => {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = Q;
    node.gain.value = gain;
    return node;
};

const compressor = (ctx, { threshold, knee, ratio, attack, release }) => {
    const node = ctx.createDynamicsCompressor();
    node.threshold.value = threshold;
    node.knee.value = knee;
    node.ratio.value = ratio;
    node.attack.value = attack;
    node.release.value = release;
    return node;
};

// Browser processing is only enabled for the parts our own chain can't provide
const getMicStream = async ({ denoise, level }) => {
    const audio = {
        echoCancellation: false, noiseSuppression: !denoise, autoGainControl: !level, channelCount: 1, sampleRate: RNNOISE_SAMPLE_RATE,
    };
    try {
        return await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') throw err;
        return navigator.mediaDevices.getUserMedia({ audio: true });
    }
};

/**
 * Opens the microphone with voice processing.
 * Must be called from a user gesture (tap) so the AudioContext may start on iOS.
 * @returns {Promise<{ stream: MediaStream, close: () => void }>}
 */
export async function openVoiceInput() {
    const ctx = createContext();
    ctx?.resume?.().catch(() => {});

    // No Web Audio worklets (very old browsers): let the browser do its own processing
    if (!ctx?.audioWorklet) {
        ctx?.close?.().catch(() => {});
        const mic = await getMicStream({ denoise: false, level: false });
        return { stream: mic, close: () => mic.getTracks().forEach((track) => track.stop()) };
    }

    let levelerReady = false;
    let rnnoiseWasm = null;
    try {
        await ctx.audioWorklet.addModule(`${ASSET_BASE}/voice-leveler-worklet.js`);
        levelerReady = true;
        if (ctx.sampleRate === RNNOISE_SAMPLE_RATE) {
            [rnnoiseWasm] = await Promise.all([getRnnoiseWasm(), ctx.audioWorklet.addModule(`${ASSET_BASE}/rnnoise-worklet.js`)]);
        }
    } catch (err) {
        console.warn('Voice processing assets failed to load, using fallback processing:', err);
    }

    let mic;
    try {
        mic = await getMicStream({ denoise: Boolean(rnnoiseWasm), level: levelerReady });
    } catch (err) {
        ctx.close().catch(() => {});
        throw err;
    }

    try {
        if (ctx.state === 'suspended') await ctx.resume();
        const source = ctx.createMediaStreamSource(mic);

        const mono = ctx.createGain();
        mono.channelCount = 1;
        mono.channelCountMode = 'explicit';
        mono.channelInterpretation = 'speakers';

        const chain = [
            mono,
            filter(ctx, 'highpass', 80),
            filter(ctx, 'highpass', 80),
        ];
        let rnnoise = null;
        if (rnnoiseWasm) {
            const { RnnoiseWorkletNode } = await loadSuppressor();
            rnnoise = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: rnnoiseWasm });
            chain.push(rnnoise);
        }
        chain.push(
            filter(ctx, 'peaking', 250, { Q: 1, gain: -2.5 }),  // boxiness / mud
            filter(ctx, 'peaking', 3000, { Q: 0.9, gain: 3 }),  // presence & intelligibility
            filter(ctx, 'highshelf', 9000, { gain: -3 }),       // residual hiss
        );
        if (levelerReady) chain.push(new AudioWorkletNode(ctx, 'voice-leveler', { outputChannelCount: [1] }));
        const makeup = ctx.createGain();
        makeup.gain.value = levelerReady ? 1.6 : 1.3;
        chain.push(
            compressor(ctx, { threshold: -18, knee: 8, ratio: 3, attack: 0.01, release: 0.25 }),
            makeup,
            compressor(ctx, { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.08 }), // peak limiter, headroom for the codec
        );

        const destination = ctx.createMediaStreamDestination();
        destination.channelCount = 1;
        chain.push(destination);
        chain.reduce((from, to) => from.connect(to), source);

        let closed = false;
        return {
            stream: destination.stream,
            close: () => {
                if (closed) return;
                closed = true;
                destination.stream.getTracks().forEach((track) => track.stop());
                mic.getTracks().forEach((track) => track.stop());
                rnnoise?.destroy();
                ctx.close().catch(() => {});
            },
        };
    } catch (err) {
        console.warn('Voice processing unavailable, recording raw microphone:', err);
        ctx.close().catch(() => {});
        return { stream: mic, close: () => mic.getTracks().forEach((track) => track.stop()) };
    }
}
