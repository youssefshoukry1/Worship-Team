'use client';

import { useEffect, useState } from 'react';

export default function CapgoUpdater() {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isApplying, setIsApplying] = useState(false);

    useEffect(() => {
        const checkSelfHostedUpdate = async () => {
            try {
                // 1. استدعاء ديناميكي للمكتبات
                const { Capacitor } = await import('@capacitor/core');

                const platform = Capacitor.getPlatform();
                const isNative = Capacitor.isNativePlatform();
                console.log('📱 [OTA Check] Platform:', platform, '| isNative:', isNative);

                if (!isNative) {
                    console.log('⚠️ [OTA] Skipped: Not running on a native platform.');
                    return;
                }

                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

                console.log('🚀 [OTA] 1. Notifying app ready...');
                await CapacitorUpdater.notifyAppReady();

                console.log('🚀 [OTA] 2. Fetching version.json...');

                const res = await fetch(`https://wasla-w.vercel.app/version.json?t=${Date.now()}`, {
                    cache: 'no-store'
                });

                if (!res.ok) {
                    console.error('❌ [OTA] Failed to fetch version.json, status:', res.status);
                    return;
                }

                const serverData = await res.json();
                console.log('📦 [OTA] Server version data:', serverData);

                // 2. قراءة نسخة الـ Bundle الحالية بأمان
                const currentBundle = await CapacitorUpdater.current();
                console.log('📱 [OTA] Raw current bundle:', currentBundle);

                const currentVersion = currentBundle?.bundle?.version || 'builtin';
                console.log('📱 [OTA] Current resolved version:', currentVersion);

                // 3. المقارنة والتنزيل
                if (serverData.version !== currentVersion) {
                    console.log(`⏳ [OTA] New update found (${serverData.version}). Downloading...`);

                    const downloadRes = await CapacitorUpdater.download({
                        url: serverData.url,
                        version: serverData.version,
                    });

                    console.log('✅ [OTA] Download successful:', downloadRes);

                    setUpdateInfo({
                        ...serverData,
                        downloadId: downloadRes.id
                    });
                } else {
                    console.log('🎉 [OTA] App is already up to date.');
                }
            } catch (error) {
                console.error('💥 [OTA] Error during update check:', error);
            }
        };

        checkSelfHostedUpdate();
    }, []);

    const handleApplyUpdate = async () => {
        if (!updateInfo) return;
        setIsApplying(true);
        try {
            const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
            console.log('🔄 [OTA] Setting version ID:', updateInfo.downloadId || updateInfo.version);

            // تطبيق التحديث وإعادة تحميل الـ WebView
            await CapacitorUpdater.set({ id: updateInfo.downloadId || updateInfo.version });

        } catch (error) {
            console.error('💥 [OTA] Failed to apply update:', error);
            setIsApplying(false);
        }
    };

    if (!updateInfo) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-end justify-center bg-slate-950/60 p-4 transition-opacity duration-200 sm:items-center">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                {/* Header */}
                <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500 dark:bg-sky-400/15 dark:text-sky-400">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                            className="h-6 w-6"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                            />
                        </svg>
                    </div>

                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                            تحديث مطلوب
                        </span>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            إصدار جديد متوفر ({updateInfo.version})
                        </h3>
                    </div>
                </div>

                {/* Body Text */}
                <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    يتوفر تحديث جديد يحتوي على تحسينات ملموسة وإصلاحات للتطبيق. يرجى التحديث الآن للمتابعة.
                </p>

                {/* CTA Button */}
                <div className="mt-5">
                    <button
                        onClick={handleApplyUpdate}
                        disabled={isApplying}
                        className="w-full rounded-xl bg-sky-500 py-3 text-xs font-bold text-white shadow-md shadow-sky-500/20 transition-transform active:scale-[0.98] disabled:opacity-75 dark:bg-sky-400 dark:text-slate-950"
                    >
                        {isApplying ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                <span>جاري تثبيت التحديث...</span>
                            </div>
                        ) : (
                            'تحديث الآن'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}