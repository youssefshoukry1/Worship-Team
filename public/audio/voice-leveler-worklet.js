/**
 * Voice leveler for prayer recordings (runs after RNNoise).
 *
 * - Tracks the noise floor and detects speech against it.
 * - Smart AGC: brings speech to a target loudness, and only adapts while someone is speaking,
 *   so the gain never climbs during pauses and never pumps up background noise.
 * - Soft downward expander: pauses are gently lowered (max -18 dB) instead of hard-gated,
 *   so quiet word endings are not chopped off.
 */
const dbToLin = (db) => Math.pow(10, db / 20);
const linToDb = (lin) => 20 * Math.log10(Math.max(lin, 1e-9));
const coef = (ms, rate) => Math.exp(-1 / ((ms / 1000) * rate));

class VoiceLevelerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.targetDb = -20;      // speech loudness target (RMS)
        this.maxGainDb = 18;      // never boost more than this
        this.minGainDb = -6;
        this.expanderRangeDb = 18; // deepest reduction in pauses
        this.holdMs = 160;        // keep open after speech so word tails survive

        this.env = 0;             // fast RMS envelope (power)
        this.slowEnv = 0;
        this.speechPower = dbToLin(this.targetDb) ** 2;
        this.noiseFloorDb = -60;
        this.gainDb = 6;
        this.expDb = 0;
        this.holdSamples = 0;
        this.outGain = dbToLin(this.gainDb);
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || !input.length) return true;

        const rate = sampleRate;
        const envAtk = coef(5, rate);
        const envRel = coef(60, rate);
        const speechCoef = coef(400, rate);
        const gainSmooth = coef(15, rate);
        const agcUpPerSample = 4 / rate;    // +4 dB/s — slow, natural rise
        const agcDownPerSample = 24 / rate; // -24 dB/s — quick when too loud
        const expOpenPerSample = 300 / rate;
        const expClosePerSample = 100 / rate;
        const slowCoef = coef(250, rate);
        const floorRisePerSample = 1.5 / rate;
        const floorFallPerSample = 40 / rate;
        const holdTotal = Math.round((this.holdMs / 1000) * rate);

        const frames = input[0].length;
        for (let i = 0; i < frames; i++) {
            let sum = 0;
            for (let ch = 0; ch < input.length; ch++) sum += input[ch][i] * input[ch][i];
            const power = sum / input.length;

            this.env = power > this.env ? envAtk * this.env + (1 - envAtk) * power : envRel * this.env + (1 - envRel) * power;
            const levelDb = linToDb(Math.sqrt(this.env));

            // Noise floor from a slow (250 ms) level so brief dips in the noise don't fool it:
            // follows quieter levels quickly, rises very slowly
            this.slowEnv = slowCoef * this.slowEnv + (1 - slowCoef) * power;
            const slowDb = linToDb(Math.sqrt(this.slowEnv));
            if (slowDb < this.noiseFloorDb) this.noiseFloorDb = Math.max(slowDb, this.noiseFloorDb - floorFallPerSample);
            else this.noiseFloorDb = Math.min(this.noiseFloorDb + floorRisePerSample, -35);
            this.noiseFloorDb = Math.max(this.noiseFloorDb, -90);

            const isSpeech = levelDb > Math.max(this.noiseFloorDb + 9, -60);
            if (isSpeech) this.holdSamples = holdTotal;
            else if (this.holdSamples > 0) this.holdSamples--;
            const isOpen = this.holdSamples > 0;

            if (isSpeech) {
                this.speechPower = speechCoef * this.speechPower + (1 - speechCoef) * power;
                const speechDb = linToDb(Math.sqrt(this.speechPower));
                const wanted = Math.min(this.maxGainDb, Math.max(this.minGainDb, this.targetDb - speechDb));
                if (wanted > this.gainDb) this.gainDb = Math.min(wanted, this.gainDb + agcUpPerSample);
                else this.gainDb = Math.max(wanted, this.gainDb - agcDownPerSample);
            }

            if (isOpen) this.expDb = Math.min(0, this.expDb + expOpenPerSample);
            else {
                const depth = -Math.min(this.expanderRangeDb, Math.max(0, (this.noiseFloorDb + 9 - levelDb) * 1.5 + 6));
                this.expDb = Math.max(depth, this.expDb - expClosePerSample);
            }

            const target = dbToLin(this.gainDb + this.expDb);
            this.outGain = gainSmooth * this.outGain + (1 - gainSmooth) * target;
            for (let ch = 0; ch < output.length; ch++) {
                const src = input[ch] || input[0];
                output[ch][i] = src[i] * this.outGain;
            }
        }
        return true;
    }
}

registerProcessor('voice-leveler', VoiceLevelerProcessor);
