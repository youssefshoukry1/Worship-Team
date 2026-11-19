'use client';
import { useContext, useEffect } from 'react';
import { UserContext } from '../context/User_Context';
import { configurePrayerBackup, hasNativeBackup } from '../services/prayerBackupService';
import { waitForNativeLaunch } from '../utils/nativeLaunch';

export default function PrayerBackupLifecycle() {
    const { isLogin, user_id } = useContext(UserContext);
    useEffect(() => {
        if (!hasNativeBackup()) return;
        let disposed = false;
        const sync = () => configurePrayerBackup(user_id, isLogin).catch(() => {});
        const resume = () => { if (document.visibilityState === 'visible') sync(); };
        const start = () => {
            if (disposed) return;
            sync();
            document.addEventListener('visibilitychange', resume);
        };
        // Suspend the old account's schedule immediately on logout.
        if (user_id && isLogin) void waitForNativeLaunch().then(start);
        else start();
        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', resume);
        };
    }, [user_id, isLogin]);
    return null;
}
