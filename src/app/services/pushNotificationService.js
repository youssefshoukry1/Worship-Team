'use client';

let isInitialized = false;

/**
 * Initializes native push notifications & background listeners
 */
export async function initPushNotifications() {
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

        // Register device
        await PushNotifications.register();

        // Listen for token registration
        PushNotifications.addListener('registration', (token) => {
            console.log('[Push] Device token registered:', token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('[Push] Registration error:', error);
        });

        // Handle foreground notifications
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[Push] Notification received:', notification);
        });

        // Handle notification click
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('[Push] Action performed:', notification.actionId);
        });

        isInitialized = true;
    } catch (error) {
        console.error('[Push] Initialization failed:', error);
    }
}

