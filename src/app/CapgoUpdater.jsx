'use client';

import { useEffect, useState, useRef } from 'react';
import { initPushNotifications } from './services/pushNotificationService';

export default function CapgoUpdater() {
    const [updateStatus, setUpdateStatus] = useState('idle');
    const isCheckingRef = useRef(false);

    useEffect(() => {
        // Initialize push notifications independently
        initPushNotifications();

        const checkForUpdates = async () => {
            if (isCheckingRef.current) return;
            isCheckingRef.current = true;

            try {
                const { Capacitor } = await import('@capacitor/core');
                if (!Capacitor.isNativePlatform()) {
                    isCheckingRef.current = false;
                    return;
                }

                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
                // Confirm app is healthy to prevent automatic rollback
                await CapacitorUpdater.notifyAppReady();

                // Fetch latest version info
                const res = await fetch(`https://wasla-w.vercel.app/version.json?t=${Date.now()}`, {
                    cache: 'no-store'
                });
                if (!res.ok) {
                    isCheckingRef.current = false;
                    return;
                }

                const serverData = await res.json();
                const currentBundle = await CapacitorUpdater.current();
                const currentVersion = currentBundle?.bundle?.version || 'builtin';

                if (serverData?.version && serverData.version !== currentVersion) {
                    setUpdateStatus('downloading');

                    // Download new bundle
                    const downloadRes = await CapacitorUpdater.download({
                        url: serverData.url,
                        version: serverData.version,
                    });

                    setUpdateStatus('applying');

                    // Apply update and reload webview
                    setTimeout(async () => {
                        try {
                            await CapacitorUpdater.set({ id: downloadRes.id });
                        } catch (err) {
                            console.error('[OTA] Failed to apply update bundle:', err);
                            setUpdateStatus('idle');
                        }
                    }, 1500);
                }
            } catch (error) {
                console.error('[OTA] Update check failed:', error);
                setUpdateStatus('idle');
            } finally {
                isCheckingRef.current = false;
            }
        };

        checkForUpdates();

        // Check for updates when app returns to foreground
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkForUpdates();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    if (updateStatus === 'idle') return null;

    return (
        <div className="fixed bottom-8 left-0 right-0 z-[99999] mx-auto flex max-w-[90%] justify-center sm:max-w-sm pointer-events-none">
            <div
                className={`flex w-full items-center gap-3 rounded-2xl bg-slate-900 p-3.5 text-white shadow-2xl transition-all duration-500 ease-out 
                ${updateStatus !== 'idle' ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
            >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                    {updateStatus === 'downloading' ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                    ) : (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-emerald-400 animate-in zoom-in duration-300"
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>

                <div className="flex flex-col">
                    <h4 className="text-sm font-bold text-slate-100">
                        {updateStatus === 'downloading'
                            ? 'جاري تحسين التطبيق...'
                            : 'تم التحديث بنجاح!'}
                    </h4>
                    <p className="text-[11px] font-medium text-slate-400">
                        {updateStatus === 'downloading'
                            ? 'يتم الآن تنزيل أحدث الميزات في الخلفية'
                            : 'جاري إعادة التهيئة لضمان أفضل تجربة...'}
                    </p>
                </div>
            </div>
        </div>
    );
}