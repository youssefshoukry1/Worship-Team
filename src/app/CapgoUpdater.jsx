'use client';

import { useEffect } from 'react';
import { initPushNotifications } from './services/pushNotificationService';

export default function CapgoUpdater() {
    useEffect(() => {
        const setupUpdater = async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (!Capacitor.isNativePlatform()) return;

                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
                await CapacitorUpdater.notifyAppReady();

                // Approach B: Initialize push notifications and silent background OTA listeners
                await initPushNotifications();

                /*
                // ============================================================
                // Approach A (Polling / Check on Startup) - Retained for reference
                // ============================================================
                const res = await fetch(`https://wasla-w.vercel.app/version.json?t=${Date.now()}`, {
                    cache: 'no-store'
                });

                if (res.ok) {
                    const serverData = await res.json();
                    const currentBundle = await CapacitorUpdater.current();
                    const currentVersion = currentBundle?.bundle?.version || 'builtin';

                    if (serverData.version && serverData.version !== currentVersion) {
                        const downloadRes = await CapacitorUpdater.download({
                            url: serverData.url,
                            version: serverData.version,
                        });
                        await CapacitorUpdater.set({ id: downloadRes.id });
                    }
                }
                // ============================================================
                */
            } catch (error) {
                console.error('[OTA] Updater setup error:', error);
            }
        };

        setupUpdater();
    }, []);

    return null;
}
