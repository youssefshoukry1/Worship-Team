'use client';

import { useEffect, useState } from 'react';
import { initPushNotifications } from './services/pushNotificationService';

export default function CapgoUpdater() {
    const [updateStatus, setUpdateStatus] = useState('idle');

    useEffect(() => {
        const setupUpdater = async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (!Capacitor.isNativePlatform()) return;

                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
                await CapacitorUpdater.notifyAppReady();

                // Initialize push notifications for messages/alerts (fire and forget)
                initPushNotifications();

                // 1. Get current running version
                const currentBundle = await CapacitorUpdater.current();
                const currentVersion = currentBundle?.bundle?.version || 'builtin';

                // 2. Check if we just updated by comparing with last saved version
                const lastVersion = localStorage.getItem('wasla_last_version');
                
                if (lastVersion && lastVersion !== currentVersion) {
                    // App just woke up on a new version
                    setUpdateStatus('applied');
                    setTimeout(() => setUpdateStatus('idle'), 4000); // Hide toast after 4 seconds
                }
                
                // Save current version to localStorage for next time
                localStorage.setItem('wasla_last_version', currentVersion);

                // 3. Silently check for future updates in background
                const res = await fetch(`https://wasla-w.vercel.app/version.json?t=${Date.now()}`, {
                    cache: 'no-store'
                });

                if (res.ok) {
                    const serverData = await res.json();
                    if (serverData.version && serverData.version !== currentVersion) {
                        // Download silently
                        const downloadRes = await CapacitorUpdater.download({
                            url: serverData.url,
                            version: serverData.version,
                        });
                        // Stage for next app restart (no UI shown)
                        await CapacitorUpdater.next({ id: downloadRes.id });
                    }
                }
            } catch (error) {
                console.error('[OTA] Updater setup error:', error);
            }
        };

        setupUpdater();
    }, []);

    // Hide UI entirely if not showing success message
    if (updateStatus === 'idle') return null;

    return (
        <div className="fixed bottom-8 left-0 right-0 z-[99999] mx-auto flex max-w-[90%] justify-center sm:max-w-sm pointer-events-none">
            <div
                className={`flex w-full items-center gap-3 rounded-2xl bg-slate-900 p-3.5 text-white shadow-2xl transition-all duration-500 ease-out 
                ${updateStatus === 'applied' ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
            >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 text-emerald-400 animate-in zoom-in duration-300"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <div className="flex flex-col">
                    <h4 className="text-sm font-bold text-slate-100">
                        تم التحديث بنجاح!
                    </h4>
                    <p className="text-[11px] font-medium text-slate-400">
                        تم إضافة أحدث الميزات والتحسينات للتطبيق.
                    </p>
                </div>
            </div>
        </div>
    );
}

