'use client';

import { useContext, useEffect, useRef } from 'react';
import { UserContext } from './context/User_Context';
import { initPushNotifications } from './services/pushNotificationService';
import { runControlledOtaUpdate } from './services/otaUpdateService';

export default function CapgoUpdater() {
    const { isLogin } = useContext(UserContext);
    const appReadyWasNotifiedRef = useRef(false);

    useEffect(() => { initPushNotifications(); }, []);

    useEffect(() => {
        let cancelled = false;
        let checking = false;
        const isCurrentSession = () => !cancelled && localStorage.getItem('user_Taspe7_Token') === isLogin;

        const runUpdater = async () => {
            if (checking || cancelled) return;
            checking = true;
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (cancelled || !Capacitor.isNativePlatform()) return;
                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

                // Bundle health confirmation must work offline and before sign-in.
                if (!appReadyWasNotifiedRef.current) {
                    await CapacitorUpdater.notifyAppReady();
                    appReadyWasNotifiedRef.current = true;
                }
                if (!isLogin || !isCurrentSession()) return;
                await runControlledOtaUpdate({
                    updater: CapacitorUpdater, token: isLogin,
                    platform: Capacitor.getPlatform(), isCurrentSession,
                });
            } catch (error) {
                console.warn('[OTA] Controlled update check failed:', error);
            } finally { checking = false; }
        };

        const onVisible = () => { if (document.visibilityState === 'visible') runUpdater(); };
        runUpdater();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', runUpdater);
        window.addEventListener('wasla_ota_check', runUpdater);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', runUpdater);
            window.removeEventListener('wasla_ota_check', runUpdater);
        };
    }, [isLogin]);

    return null;
}
