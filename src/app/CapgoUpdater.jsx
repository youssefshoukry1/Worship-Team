'use client';

import { useEffect } from 'react';

export default function CapgoUpdater() {
    useEffect(() => {
        const checkSelfHostedUpdate = async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (!Capacitor.isNativePlatform()) return;

                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
                await CapacitorUpdater.notifyAppReady();

                const res = await fetch(`https://wasla-w.vercel.app/version.json?t=${Date.now()}`, {
                    cache: 'no-store'
                });

                if (!res.ok) return;

                const serverData = await res.json();
                const currentBundle = await CapacitorUpdater.current();
                const currentVersion = currentBundle?.bundle?.version || 'builtin';

                if (serverData.version && serverData.version !== currentVersion) {
                    const downloadRes = await CapacitorUpdater.download({
                        url: serverData.url,
                        version: serverData.version,
                    });

                    // Stage bundle for next app launch
                    await CapacitorUpdater.set({ id: downloadRes.id });
                }
            } catch (error) {
                console.error('[OTA] Background update error:', error);
            }
        };

        checkSelfHostedUpdate();
    }, []);

    return null;
}