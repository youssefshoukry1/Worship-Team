'use client';

import { useEffect, useRef } from 'react';
import { initPushNotifications } from './services/pushNotificationService';

const PENDING_UPDATE_KEY = 'wasla_ota_pending_bundle';

function readStoredPendingUpdate() {
    try {
        const value = JSON.parse(localStorage.getItem(PENDING_UPDATE_KEY));

        if (
            typeof value?.id === 'string' &&
            value.id &&
            typeof value?.version === 'string' &&
            value.version
        ) {
            return value;
        }
    } catch (error) {
        console.warn('[OTA] Ignoring an invalid pending-update marker:', error);
    }

    return null;
}

function storePendingUpdate(bundle) {
    try {
        localStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify({
            id: bundle.id,
            version: bundle.version,
        }));
    } catch (error) {
        console.warn('[OTA] Could not persist the pending-update marker:', error);
    }
}

function clearStoredPendingUpdate() {
    try {
        localStorage.removeItem(PENDING_UPDATE_KEY);
    } catch (error) {
        console.warn('[OTA] Could not clear the pending-update marker:', error);
    }
}

export default function CapgoUpdater() {
    const isCheckingRef = useRef(false);
    const appReadyWasNotifiedRef = useRef(false);

    useEffect(() => {
        // Push notifications are independent from the OTA update lifecycle.
        initPushNotifications();

        const runUpdater = async () => {
            if (isCheckingRef.current) return;
            isCheckingRef.current = true;

            try {
                const { Capacitor } = await import('@capacitor/core');
                if (!Capacitor.isNativePlatform()) return;

                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

                // Confirm each newly loaded bundle before doing any network work.
                if (!appReadyWasNotifiedRef.current) {
                    await CapacitorUpdater.notifyAppReady();
                    appReadyWasNotifiedRef.current = true;
                }

                const currentBundle = await CapacitorUpdater.current();
                const currentId = currentBundle?.bundle?.id || 'builtin';
                const currentVersion = currentBundle?.bundle?.version || 'builtin';
                const storedPending = readStoredPendingUpdate();

                let nativePending = null;
                try {
                    nativePending = await CapacitorUpdater.getNextBundle();
                } catch (error) {
                    console.warn('[OTA] Could not read the native pending bundle:', error);
                }

                // Capgo normally applies a bundle queued with next() while the app is
                // backgrounded. If that did not happen, set() is the fallback on the
                // next cold launch or the next time the app becomes visible.
                const pendingBundle = nativePending || storedPending;
                if (pendingBundle) {
                    const pendingIsCurrent =
                        pendingBundle.id === currentId ||
                        pendingBundle.version === currentVersion;

                    if (pendingIsCurrent) {
                        clearStoredPendingUpdate();
                    } else {
                        let pendingBundleExists = Boolean(nativePending);
                        let pendingBundleWasVerified = pendingBundleExists;

                        if (!pendingBundleExists) {
                            try {
                                const { bundles = [] } = await CapacitorUpdater.list();
                                pendingBundleExists = bundles.some(
                                    (bundle) =>
                                        bundle.id === pendingBundle.id &&
                                        (bundle.status === 'success' || bundle.status === 'pending')
                                );
                                pendingBundleWasVerified = true;
                            } catch (error) {
                                console.warn('[OTA] Could not verify the stored pending bundle:', error);
                            }
                        }

                        if (pendingBundleExists) {
                            // Also persist native-only pending bundles so the fallback
                            // survives another interrupted activation attempt.
                            storePendingUpdate(pendingBundle);
                            // This is terminal when successful: Capgo reloads the WebView.
                            await CapacitorUpdater.set({ id: pendingBundle.id });
                            return;
                        }

                        if (!pendingBundleWasVerified) {
                            // Preserve the marker after a transient native error and
                            // retry it on the next launch/foreground transition.
                            return;
                        }

                        // The marker is stale (for example, the OS removed the bundle).
                        // Clear it so the bundle can be downloaded again below.
                        clearStoredPendingUpdate();
                    }
                }

                const response = await fetch(
                    `https://wasla-w.vercel.app/version.json?t=${Date.now()}`,
                    { cache: 'no-store' }
                );
                if (!response.ok) return;

                const serverData = await response.json();
                if (
                    typeof serverData?.version !== 'string' ||
                    !serverData.version ||
                    typeof serverData?.url !== 'string' ||
                    !serverData.url ||
                    serverData.version === currentVersion
                ) {
                    return;
                }

                // Recover a bundle that finished downloading in an earlier run but
                // was not queued (for example, if the app was killed at that moment).
                try {
                    const { bundles = [] } = await CapacitorUpdater.list();
                    const existingBundle = bundles.find(
                        (bundle) =>
                            bundle.version === serverData.version &&
                            bundle.id !== currentId &&
                            bundle.status === 'success'
                    );

                    if (existingBundle) {
                        storePendingUpdate(existingBundle);
                        // It was downloaded before this updater run, so this is already
                        // a later app opening. Apply it now instead of delaying again.
                        await CapacitorUpdater.set({ id: existingBundle.id });
                        return;
                    }
                } catch (error) {
                    console.warn('[OTA] Could not inspect downloaded bundles:', error);
                }

                // Download silently. Do not activate it during this app opening.
                const downloadedBundle = await CapacitorUpdater.download({
                    url: serverData.url,
                    version: serverData.version,
                });

                // Persist first so a process kill between these operations is recoverable.
                storePendingUpdate(downloadedBundle);
                await CapacitorUpdater.next({ id: downloadedBundle.id });
            } catch (error) {
                // OTA failures must never block normal app usage. A later launch or
                // foreground transition will retry the check or pending activation.
                console.error('[OTA] Update check failed:', error);
            } finally {
                isCheckingRef.current = false;
            }
        };

        runUpdater();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                runUpdater();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // OTA updates are intentionally invisible to the user.
    return null;
}
