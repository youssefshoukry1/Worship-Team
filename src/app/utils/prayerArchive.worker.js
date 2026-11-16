import { processPrayerArchive } from './prayerArchiveCodec';

self.onmessage = ({ data }) => {
    try {
        const result = processPrayerArchive(data);
        const buffers = result instanceof Uint8Array ? [result.buffer] : Object.values(result.files).map(bytes => bytes.buffer);
        self.postMessage({ result }, [...new Set(buffers)]);
    } catch (error) {
        self.postMessage({ error: error.message || 'Could not process prayer archive' });
    }
};
