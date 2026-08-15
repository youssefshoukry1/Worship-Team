'use client';

import { useEffect, useState } from 'react';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

export default function CapgoUpdater() {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [isApplying, setIsApplying] = useState(false);

    useEffect(() => {
        // 1. طباعة حالة المنصة
        console.log('📱 Platform:', Capacitor.getPlatform());
        console.log('📱 isNative:', Capacitor.isNativePlatform());

        // مؤقتاً: علّق هذا السطر لضمان تنفيذ الكود أثناء التجربة عبر DevTools
        // if (!Capacitor.isNativePlatform()) return;

        const checkSelfHostedUpdate = async () => {
            try {
                console.log('🚀 [OTA] Starting check...');
                await CapacitorUpdater.notifyAppReady();

                const res = await fetch('https://wasla-app.vercel.app/version.json', {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
                });

                const serverData = await res.json();
                console.log('📦 Server Data:', serverData);

                const currentBundle = await CapacitorUpdater.current();
                console.log('Current Bundle:', currentBundle);

            } catch (error) {
                console.error('💥 OTA Error:', error);
            }
        };

        checkSelfHostedUpdate();
    }, []);


    const handleApplyUpdate = async () => {
        if (!updateInfo) return;
        setIsApplying(true);
        try {
            // 1. تطبيق النسخة التي تم تنزيلها
            await CapacitorUpdater.set({ version: updateInfo.version });

            // 2. إعادة إقلاع التطبيق بالنسخة الجديدة فوراً
            await CapacitorUpdater.reload();
        } catch (error) {
            console.error('Failed to apply update:', error);
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