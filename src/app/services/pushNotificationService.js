'use client';

let isInitialized = false;

/**
 * Initializes native push notifications & background listeners
 */
export async function initPushNotifications({ onOtaUpdate } = {}) {
    if (isInitialized) return;

    try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Request permissions
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('[Push] Permission not granted');
            return;
        }

        // Register with Apple / Google APNs/FCM
        await PushNotifications.register();

        // Listen for token registration
        PushNotifications.addListener('registration', (token) => {
            console.log('[Push] Device token registered:', token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('[Push] Registration error:', error);
        });

        // Handle incoming notifications in foreground or background
        PushNotifications.addListener('pushNotificationReceived', async (notification) => {
            const data = notification?.data;

            // Handle Silent OTA Update
            if (data?.type === 'OTA_UPDATE' && data?.url && data?.version) {
                if (onOtaUpdate) {
                    await onOtaUpdate(data);
                } else {
                    await handleBackgroundOta(data);
                }
            }
        });

        // Handle user clicking on notification
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('[Push] Action performed:', notification.actionId);
        });

        isInitialized = true;
    } catch (error) {
        console.error('[Push] Initialization failed:', error);
    }
}

/**
 * Downloads and stages OTA update silently
 */
export async function handleBackgroundOta({ url, version }) {
    try {
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
        const currentBundle = await CapacitorUpdater.current();
        const currentVersion = currentBundle?.bundle?.version || 'builtin';

        if (version && version !== currentVersion) {
            const downloadRes = await CapacitorUpdater.download({ url, version });
            await CapacitorUpdater.set({ id: downloadRes.id });
        }
    } catch (error) {
        console.error('[Push-OTA] Download failed:', error);
    }
}
