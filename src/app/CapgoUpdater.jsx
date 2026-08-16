'use client';

import { useEffect, useState } from 'react';

export default function CapgoUpdater() {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isApplying, setIsApplying] = useState(false);

    useEffect(() => {
        const checkSelfHostedUpdate = async () => {
            try {
                // 1. استدعاء ديناميكي للمكتبات عشان Next.js مايعملش مشكلة في الـ Build
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
                const res = await fetch('https://wasla-w.vercel.app/version.json', {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
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

                    // حفظ بيانات التحديث + הـ ID اللي رجع من التحميل عشان نستخدمه في التثبيت
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
            // استدعاء ديناميكي تاني وقت الضغط
            const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

            console.log('🔄 [OTA] Setting version ID:', updateInfo.downloadId || updateInfo.version);

            // الدالة دي بتعمل reload تلقائي للـ WebView بعد التثبيت
            await CapacitorUpdater.set({ id: updateInfo.downloadId || updateInfo.version });

        } catch (error) {
            console.error('💥 [OTA] Failed to apply update:', error);
            setIsApplying(false);
        }
    };

    if (!updateInfo) return null;

    return (
        <div className="fixed inset-x-0 bottom-6 z-[9999] mx-auto max-w-sm px-4 transition-all duration-500 ease-out animate-in slide-in-from-bottom-8">
            <div className="relative overflow-hidden rounded-2xl border border-sky-100/60 bg-white/80 p-4 shadow-xl shadow-sky-500/10 backdrop-blur-xl dark:border-sky-900/30 dark:bg-slate-900/85">
                <div className="absolute -top-12 -right-12 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl" />

                <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-400 to-sky-200 text-white shadow-md shadow-sky-400/30">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                className="h-6 w-6 animate-pulse"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                                />
                            </svg>
                        </div>

                        <div className="flex flex-col">
                            <span className="text-xs font-semibold tracking-wide text-sky-500 dark:text-sky-400">
                                تحديث جديد متوفر ✨
                            </span>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                وصلة جاهز للتحديث ({updateInfo.version})
                            </h4>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            onClick={() => setUpdateInfo(null)}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            title="تجاهل الآن"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>

                        <button
                            onClick={handleApplyUpdate}
                            disabled={isApplying}
                            className="relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:from-sky-600 hover:to-sky-500 hover:shadow-sky-500/40 active:scale-95 disabled:opacity-75"
                        >
                            {isApplying ? (
                                <div className="flex items-center gap-1.5">
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    <span>جاري التحديث...</span>
                                </div>
                            ) : (
                                'تحديث الآن'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}