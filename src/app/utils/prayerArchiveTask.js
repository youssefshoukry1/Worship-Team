export function checkArchiveAbort(signal) {
    if (signal?.aborted) throw new DOMException('Prayer archive cancelled', 'AbortError');
}

// MessageChannel yields a task without WebKit's nested-timer clamping delay.
export const yieldArchiveWork = () => new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        channel.port1.close(); channel.port2.close(); resolve();
    };
    channel.port2.postMessage(null);
});

// One worker per operation: no retained archive, pooled worker, or UI-thread fallback.
export function runPrayerArchive(payload, { signal } = {}) {
    return new Promise((resolve, reject) => {
        let worker, timeout, settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            worker?.terminate();
            if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(new DOMException('Prayer archive cancelled', 'AbortError'));
        try {
            checkArchiveAbort(signal);
            worker = new Worker(new URL('./prayerArchive.worker.js', import.meta.url));
            worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.result);
            worker.onerror = event => { event.preventDefault(); finish(new Error('Could not process prayer archive. Please retry.')); };
            worker.onmessageerror = () => finish(new Error('Could not read the archive worker response. Please retry.'));
            signal?.addEventListener('abort', abort, { once: true });
            timeout = setTimeout(() => finish(new Error('Prayer archive processing timed out. Please retry.')), 120000);
            // Unpack keeps the caller's bytes reusable for another restore attempt.
            const request = payload.operation === 'unpack' ? { ...payload, bytes: payload.bytes.slice() } : payload;
            const buffers = request.operation === 'unpack' ? [request.bytes.buffer]
                : Object.values(request.files).map(value => (Array.isArray(value) ? value[0] : value).buffer);
            worker.postMessage(request, [...new Set(buffers)]);
        } catch (error) { finish(error); }
    });
}
