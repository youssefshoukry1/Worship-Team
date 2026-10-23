'use client';
import { useContext, useEffect } from 'react';
import { UserContext } from '../context/User_Context';
import { configurePrayerSync, wakePrayerSync } from '../services/prayerSync';

export default function PrayerSyncLifecycle() {
    const { user_id, isLogin } = useContext(UserContext);
    useEffect(() => {
        configurePrayerSync(user_id, isLogin);
        const resume = () => { if (document.visibilityState === 'visible') wakePrayerSync(); };
        window.addEventListener('online', wakePrayerSync);
        document.addEventListener('visibilitychange', resume);
        return () => {
            window.removeEventListener('online', wakePrayerSync);
            document.removeEventListener('visibilitychange', resume);
        };
    }, [user_id, isLogin]);
    return null;
}
