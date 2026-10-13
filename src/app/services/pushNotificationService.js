'use client';

let isInitialized = false;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://worship-team-api.onrender.com/api';

/**
 * Syncs the current FCM registration token with the backend for the logged-in user
 */
export async function syncFcmTokenWithBackend(fcmToken) {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('user_Taspe7_Token');
    const tokenToSync = fcmToken || localStorage.getItem('taspe7_fcm_token');
    if (!token || !tokenToSync) return;

    try {
        await fetch(`${API_URL}/users/fcm-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ fcmToken: tokenToSync })
        });
        console.log('[Push] Token synced with backend');
    } catch (err) {
        console.warn('[Push] Failed to sync token with backend:', err);
    }
}

/**
 * Initializes native push notifications, creates Android notification channel & registers listeners
 */
export async function initPushNotifications() {
    if (isInitialized) return;

    try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Android high-importance notification channel for prayer & reply banners with avatars
        if (Capacitor.getPlatform() === 'android') {
            await PushNotifications.createChannel({
                id: 'prays_channel',
                name: 'Prayers & Replies',
                description: 'Notifications for shared prayers and replies',
                importance: 5,
                visibility: 1,
                sound: 'default',
                vibration: true,
            });
        }

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
        PushNotifications.addListener('registration', async (token) => {
            console.log('[Push] Device token registered:', token.value);
            if (typeof window !== 'undefined') {
                localStorage.setItem('taspe7_fcm_token', token.value);
            }
            await syncFcmTokenWithBackend(token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('[Push] Registration error:', error);
        });

        // Handle foreground notifications
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[Push] Notification received in foreground:', notification);
        });

        // Handle notification click -> navigate to target URL
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('[Push] Notification clicked:', action);
            const data = action.notification?.data;
            if (data?.url && typeof window !== 'undefined') {
                window.location.href = data.url;
            }
        });

        isInitialized = true;
    } catch (error) {
        console.error('[Push] Initialization failed:', error);
    }
}
