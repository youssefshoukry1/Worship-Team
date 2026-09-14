// Copies the RNNoise worklet + wasm into public/audio so the static export (web + Capacitor) can load them.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules', '@sapphi-red', 'web-noise-suppressor', 'dist');
const out = join(root, 'public', 'audio');

mkdirSync(out, { recursive: true });
[
    ['rnnoise/workletProcessor.js', 'rnnoise-worklet.js'],
    ['rnnoise.wasm', 'rnnoise.wasm'],
    ['rnnoise_simd.wasm', 'rnnoise_simd.wasm'],
].forEach(([from, to]) => copyFileSync(join(pkg, from), join(out, to)));
console.log('Copied RNNoise audio worklet files to public/audio');
