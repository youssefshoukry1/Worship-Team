'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { getApiBaseUrl } from '../utils/apiBase';

const native = registerPlugin('PrayerBackup');
export const hasNativeBackup = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PrayerBackup');
export const backupSettingsKey = (userId) => `my_prays_schedule_${userId}`;
export function readBackupSettings(userId) {
    try {
        const settings = JSON.parse(localStorage.getItem(backupSettingsKey(userId)) || '{}');
        return { ...settings, intervalDays: [7, 14, 30].includes(settings.intervalDays) ? settings.intervalDays : 0, wifiOnly: settings.wifiOnly !== false };
    } catch { return { intervalDays: 0, wifiOnly: true }; }
}

// Serialize configuration so an earlier account's delayed call cannot replace newer settings.
let configuration = Promise.resolve();
export function configurePrayerBackup(userId, token, settings = readBackupSettings(userId)) {
    const operation = configuration.catch(() => {}).then(async () => {
        if (!hasNativeBackup()) return null;
        if (!userId || !token) { await native.suspend(); return null; }
        const lastSuccess = Date.parse(localStorage.getItem(`my_prays_last_backup_${userId}`) || '') || 0;
        return native.configure({ ...settings, userId, token, apiBase: getApiBaseUrl(), lastSuccess });
    });
    configuration = operation; return operation;
}
export async function saveBackupSettings(userId, token, settings) {
    const result = await configurePrayerBackup(userId, token, settings);
    localStorage.setItem(backupSettingsKey(userId), JSON.stringify(settings));
    window.dispatchEvent(new Event('prayer-backup-settings'));
    return result;
}
export async function prayerBackupStatus(userId) {
    const status = await native.getStatus();
    if (status.lastSuccess) localStorage.setItem(`my_prays_last_backup_${userId}`, new Date(status.lastSuccess).toISOString());
    return status;
}
export async function startPrayerBackup(userId, token, email) {
    await saveBackupSettings(userId, token, { ...readBackupSettings(userId), email });
    await native.runNow();
}

// Native workers read the current local prayer index and audio, not a prebuilt ZIP.
// This marker prevents an old account schedule from claiming another account's device backup.
let snapshotWrite = Promise.resolve();
export function cacheBackupOwner(userId) {
    if (!hasNativeBackup() || !userId) return Promise.resolve();
    snapshotWrite = snapshotWrite.catch(() => {}).then(async () => {
        if (localStorage.getItem('user_Taspe7_ID') !== userId) return;
        await native.setOwner({ userId });
    });
    return snapshotWrite;
}
