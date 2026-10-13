'use client';

import { getApiBaseUrl } from '../utils/apiBase';

let isInitialized = false;
let isInitializing = false;
let retryTimer;
let retryCount = 0;

const API_URL = getApiBaseUrl();

/**
 * Syncs the current FCM registration token with the backend for the logged-in user
 */
export async function syncFcmTokenWithBackend(fcmToken) {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('user_Taspe7_Token');
    const tokenToSync = fcmToken || localStorage.getItem('taspe7_fcm_token');
    if (!token || !tokenToSync) return;

    try {
        const response = await fetch(`${API_URL}/users/fcm-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ fcmToken: tokenToSync })
        });
        if (!response.ok) throw new Error(`Token registration failed: HTTP ${response.status}`);
        clearTimeout(retryTimer);
        retryCount = 0;
        console.log('[Push] Token synced with backend');
        return true;
    } catch (err) {
        console.warn('[Push] Failed to sync token with backend:', err);
        if (retryCount < 3) {
            clearTimeout(retryTimer);
            retryCount++;
            retryTimer = setTimeout(() => syncFcmTokenWithBackend(), 15000 * retryCount);
        }
        return false;
    }
}

/**
 * Initializes native push notifications, creates Android notification channel & registers listeners
 */
export async function initPushNotifications() {
    if (isInitialized || isInitializing) return;
    isInitializing = true;
    const listenerHandles = [];

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

        // Listen for token registration
        listenerHandles.push(await PushNotifications.addListener('registration', async (token) => {
            console.log('[Push] Device token registered');
            if (typeof window !== 'undefined') {
                localStorage.setItem('taspe7_fcm_token', token.value);
            }
            await syncFcmTokenWithBackend(token.value);
        }));

        listenerHandles.push(await PushNotifications.addListener('registrationError', (error) => {
            console.error('[Push] Registration error:', error);
        }));

        // Handle foreground notifications
        listenerHandles.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
            if (['PRAY_SHARED', 'PRAY_CONFIRMED'].includes(notification.data?.type)) {
                window.dispatchEvent(new Event('taspe7:prayer-push'));
            }
        }));

        // Handle notification click -> navigate to target URL
        listenerHandles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const data = action.notification?.data;
            if (data?.url && typeof window !== 'undefined') {
                window.location.href = data.url;
            }
        }));

        await PushNotifications.register();
        const resync = () => {
            if (document.visibilityState === 'visible') syncFcmTokenWithBackend();
        };
        window.addEventListener('online', resync);
        document.addEventListener('visibilitychange', resync);
        isInitialized = true;
    } catch (error) {
        console.error('[Push] Initialization failed:', error);
        await Promise.all(listenerHandles.map(handle => handle.remove()));
    } finally {
        isInitializing = false;
    }
}
