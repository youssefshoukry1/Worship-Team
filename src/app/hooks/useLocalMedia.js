import { useState, useEffect } from 'react';
import localforage from 'localforage';

export function useLocalMedia(mediaUrl, messageId) {
    const [localUrl, setLocalUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        let objectUrl = null;

        const loadMedia = async () => {
            if (!mediaUrl || !messageId) {
                if (isMounted) setLoading(false);
                return;
            }

            try {
                const cacheKey = `media_${messageId}`;
                
                // 1. Check local storage
                let cachedBlob = await localforage.getItem(cacheKey);

                if (!cachedBlob) {
                    // 2. Not in local storage, fetch from R2
                    const response = await fetch(mediaUrl);
                    if (!response.ok) {
                        throw new Error('Media expired or not found on server.');
                    }
                    cachedBlob = await response.blob();
                    
                    // 3. Save to local storage for future offline access
                    await localforage.setItem(cacheKey, cachedBlob);
                }

                if (isMounted) {
                    objectUrl = URL.createObjectURL(cachedBlob);
                    setLocalUrl(objectUrl);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Local media load error:", err);
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                }
            }
        };

        loadMedia();

        return () => {
            isMounted = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [mediaUrl, messageId]);

    // Expose a way to get the raw blob for direct downloading
    const getRawBlob = async () => {
        if (!messageId) return null;
        return await localforage.getItem(`media_${messageId}`);
    };

    return { localUrl, loading, error, getRawBlob };
}
