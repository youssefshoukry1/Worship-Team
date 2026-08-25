import { useState, useEffect } from 'react';
import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const isNative = Capacitor.isNativePlatform();

// Helper to convert blob to base64 for Capacitor Filesystem
const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.readAsDataURL(blob);
    });
};

// Helper to convert base64 to blob (for downloads on native if needed)
const base64ToBlob = (base64, mimeType) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

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

            const filename = String(messageId);

            try {
                if (isNative) {
                    // --- Capacitor Native Path ---
                    let fileExists = false;
                    try {
                        await Filesystem.stat({
                            path: `wasla_media/${filename}`,
                            directory: Directory.Data
                        });
                        fileExists = true;
                    } catch (e) {
                        fileExists = false;
                    }

                    if (fileExists) {
                        const fileUri = await Filesystem.getUri({
                            path: `wasla_media/${filename}`,
                            directory: Directory.Data
                        });
                        const nativeSrc = Capacitor.convertFileSrc(fileUri.uri);
                        if (isMounted) {
                            setLocalUrl(nativeSrc);
                            setLoading(false);
                        }
                    } else {
                        // Fetch from R2 transit layer
                        const response = await fetch(mediaUrl);
                        if (!response.ok) {
                            throw new Error('Media expired or not found on server.');
                        }
                        const blob = await response.blob();
                        const base64 = await blobToBase64(blob);

                        // Ensure parent directory exists
                        try {
                            await Filesystem.mkdir({
                                path: 'wasla_media',
                                directory: Directory.Data,
                                recursive: true
                            });
                        } catch (e) { }

                        // Save permanently to native disk
                        await Filesystem.writeFile({
                            path: `wasla_media/${filename}`,
                            data: base64,
                            directory: Directory.Data
                        });

                        const fileUri = await Filesystem.getUri({
                            path: `wasla_media/${filename}`,
                            directory: Directory.Data
                        });
                        const nativeSrc = Capacitor.convertFileSrc(fileUri.uri);

                        if (isMounted) {
                            setLocalUrl(nativeSrc);
                            setLoading(false);
                        }
                    }
                } else {
                    // --- Web localForage Path ---
                    const cacheKey = `media_${messageId}`;
                    let cachedBlob = await localforage.getItem(cacheKey);

                    if (!cachedBlob) {
                        const response = await fetch(mediaUrl);
                        if (!response.ok) {
                            throw new Error('Media expired or not found on server.');
                        }
                        cachedBlob = await response.blob();
                        await localforage.setItem(cacheKey, cachedBlob);
                    }

                    if (isMounted) {
                        objectUrl = URL.createObjectURL(cachedBlob);
                        setLocalUrl(objectUrl);
                        setLoading(false);
                    }
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
        if (isNative) {
            try {
                const readFile = await Filesystem.readFile({
                    path: `wasla_media/${messageId}`,
                    directory: Directory.Data
                });
                return base64ToBlob(readFile.data, 'image/webp');
            } catch (e) {
                console.error("Error reading file to blob:", e);
                return null;
            }
        } else {
            return await localforage.getItem(`media_${messageId}`);
        }
    };

    return { localUrl, loading, error, getRawBlob };
}
