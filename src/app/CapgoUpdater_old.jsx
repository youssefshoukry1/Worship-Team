'use client';

import { useEffect, useState } from 'react';

export default function CapgoUpdater() {
    // idle: مفيش حاجة | downloading: بيحمل في الخلفية | applying: خلص وهيعمل ريستارت
    const [updateStatus, setUpdateStatus] = useState('idle');

    useEffect(() => {
        const checkSelfHostedUpdate = async () => {
            try {
                // 1. استدعاء ديناميكي للمكتبات
                const { Capacitor } = await import('@capacitor/core');

                const platform = Capacitor.getPlatform();
                const isNative = Capacitor.isNativePlatform();

                if (!isNative) return;

                const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
                await CapacitorUpdater.notifyAppReady();

                // 2. التحقق من وجود تحديث
                const res = await fetch(`https://wasla-w.vercel.app/version.json?t=${Date.now()}`, {
                    cache: 'no-store'
                });

                if (!res.ok) return;

                const serverData = await res.json();
                const currentBundle = await CapacitorUpdater.current();
                const currentVersion = currentBundle?.bundle?.version || 'builtin';

                // 3. المقارنة والتحميل التلقائي
                if (serverData.version !== currentVersion) {
                    console.log(`⏳ [OTA] Auto-updating to (${serverData.version})...`);

                    // إظهار إشعار التحميل
                    setUpdateStatus('downloading');

                    // تحميل التحديث في الخلفية
                    const downloadRes = await CapacitorUpdater.download({
                        url: serverData.url,
                        version: serverData.version,
                    });

                    // تغيير الإشعار لـ "تم التحديث"
                    setUpdateStatus('applying');

                    // تأخير بسيط (ثانيتين) عشان المستخدم يلحق يقرأ إن التحديث خلص قبل ما نعمل Reload
                    setTimeout(async () => {
                        await CapacitorUpdater.set({ id: downloadRes.id });
                    }, 2000);
                }
            } catch (error) {
                console.error('💥 [OTA] Error during auto-update:', error);
                setUpdateStatus('idle'); // إخفاء الإشعار لو حصل مشكلة
            }
        };

        checkSelfHostedUpdate();
    }, []);

    // لو مفيش تحديث بيحصل، مانعرضش أي UI
    if (updateStatus === 'idle') return null;

    return (
        <div className="fixed bottom-8 left-0 right-0 z-[99999] mx-auto flex max-w-[90%] justify-center sm:max-w-sm pointer-events-none">
            <div
                className={`flex w-full items-center gap-3 rounded-2xl bg-slate-900 p-3.5 text-white shadow-2xl transition-all duration-500 ease-out 
                ${updateStatus !== 'idle' ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}
            >
                {/* الأيقونة (بتتغير حسب الحالة) */}
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

                {/* النصوص */}
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