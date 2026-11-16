const MAX_BYTES = 64 * 1024 * 1024;
self.onmessage = async ({ data: { url, token, shareId, isAnonymous, reply } }) => {
    try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            self.postMessage({ error: 'Prayer download failed', status: response.status, code: error.code }); return;
        }
        if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Prayer download exceeds the supported size');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let size = 0, text = '';
        for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Prayer download exceeds the supported size'); }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        const bundle = JSON.parse(text); text = '';
        if (String(bundle.shareId) !== shareId) throw new Error('Prayer delivery identity mismatch');
        if (!reply && typeof bundle.words !== 'string') throw new Error('Prayer text is missing');
        if (!reply && (isAnonymous || bundle.isAnonymous)) Object.assign(bundle, { isAnonymous: true, senderId: null, senderUsername: 'Anonymous', senderName: 'Anonymous Friend', senderProfilePhoto: null });
        const transfers = [];
        if (!reply) for (const recording of bundle.recordings || []) {
            if (!recording.id || typeof recording.data !== 'string' || !recording.data) throw new Error('Prayer audio is incomplete');
            const binary = atob(recording.data), bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            recording.data = bytes; transfers.push(bytes.buffer);
        }
        self.postMessage({ bundle }, transfers);
    } catch (error) { self.postMessage({ error: error.message || 'Prayer download failed' }); }
};
