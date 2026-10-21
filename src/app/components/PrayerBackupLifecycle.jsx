'use client';
import { useContext, useEffect } from 'react';
import { UserContext } from '../context/User_Context';
import { configurePrayerBackup, hasNativeBackup } from '../services/prayerBackupService';

export default function PrayerBackupLifecycle() {
    const { isLogin, user_id } = useContext(UserContext);
    useEffect(() => {
        const sync = () => {
            if (hasNativeBackup()) configurePrayerBackup(user_id, isLogin).catch(() => {});
        };
        sync();
        const resume = () => { if (document.visibilityState === 'visible') sync(); };
        document.addEventListener('visibilitychange', resume);
        return () => document.removeEventListener('visibilitychange', resume);
    }, [user_id, isLogin]);
    return null;
}
