import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

// CPU-only code. Storage writes and live revocation checks stay with the caller.
export function processPrayerArchive({ operation, files, manifest, bytes }) {
    if (operation === 'pack') {
        files['prays.json'] = strToU8(JSON.stringify(manifest, null, 2));
        return zipSync(files, { level: 6 });
    }
    if (operation !== 'unpack') throw new Error('Unknown prayer archive operation');
    const unpacked = unzipSync(bytes);
    if (!unpacked['prays.json']) throw new Error('This file is not a "my prays" backup.');
    const parsed = JSON.parse(strFromU8(unpacked['prays.json']));
    if (parsed.type !== 'my-prays-backup' || parsed.version !== 1 || !Array.isArray(parsed.prays)) {
        throw new Error('This prayer backup is invalid or uses an unsupported version.');
    }
    delete unpacked['prays.json'];
    return { files: unpacked, manifest: parsed };
}
