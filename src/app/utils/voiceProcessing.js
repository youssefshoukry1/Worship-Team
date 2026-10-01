// Natural voice recording processing (WhatsApp-style)
const createContext = () => {
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return null;
    try {
        return new AudioCtx({ latencyHint: 'interactive' });
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

// Standard browser voice constraints
const getMicStream = async () => {
    const audio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
    };
    try {
        return await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') throw err;
        return navigator.mediaDevices.getUserMedia({ audio: true });
    }
};

// Opens microphone with natural processing and normal volume
export async function openVoiceInput() {
    const mic = await getMicStream();
    const ctx = createContext();

    if (!ctx) {
        return { stream: mic, close: () => mic.getTracks().forEach((track) => track.stop()) };
    }

    try {
        if (ctx.state === 'suspended') await ctx.resume();
        const source = ctx.createMediaStreamSource(mic);

        // Low-cut rumble filter
        const lowCut = filter(ctx, 'highpass', 60, { Q: 0.707 });

        // Normal unity volume
        const volume = ctx.createGain();
        volume.gain.value = 1.0;

        // Transparent peak safety limiter
        const limiter = compressor(ctx, {
            threshold: -1,
            knee: 4,
            ratio: 12,
            attack: 0.002,
            release: 0.1,
        });

        const destination = ctx.createMediaStreamDestination();
        destination.channelCount = 1;

        source.connect(lowCut);
        lowCut.connect(volume);
        volume.connect(limiter);
        limiter.connect(destination);

        let closed = false;
        return {
            stream: destination.stream,
            close: () => {
                if (closed) return;
                closed = true;
                destination.stream.getTracks().forEach((track) => track.stop());
                mic.getTracks().forEach((track) => track.stop());
                ctx.close().catch(() => {});
            },
        };
    } catch (err) {
        ctx.close().catch(() => {});
        return { stream: mic, close: () => mic.getTracks().forEach((track) => track.stop()) };
    }
}
