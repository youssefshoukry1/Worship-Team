'use client';

import { Check, CloudUpload, CloudDownload, HardDrive, Loader2, Mic, Pause, Play, Trash2, ArrowRightLeft, Plus, MoreVertical, Wifi } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { buildMyPraysZip, deleteRecording, getRecordingUrl, restoreMyPraysZip } from '../utils/prayRecordings';
import {
    DriveNotLinkedError, downloadDriveFile, ensureDriveFolder, findDriveFile, getDriveAccessToken, getDriveAccounts, getDriveAuthUrl, setDefaultDriveAccount, disconnectDriveAccount, uploadDriveFile,
} from '../utils/googleDriveClient';
import { showToast } from '../components/ToastContainer';
import { useTabPageActive } from '../components/TabPageActivity';
import { usePrayerSession } from './PrayerSessionProvider';
import React, { useEffect, useRef, useState, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import backupStyles from './PrayerBackup.module.css';
import BackupFrequency from './BackupFrequency';
import { useLanguage } from '../context/LanguageContext';
import { cacheBackupOwner, hasNativeBackup, prayerBackupStatus, readBackupSettings, saveBackupSettings, startPrayerBackup } from '../services/prayerBackupService';

const BACKUP_FOLDER = 'my-prays-backups';
const BACKUP_FILE = 'my prays.zip';

export const formatSeconds = (total = 0) => {
    const seconds = Math.max(0, Math.floor(total));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const VOICE_TONES = {
    general: {
        hex: '#38bdf8',
        solid: 'bg-sky-500 hover:bg-sky-400 shadow-sky-500/30',
        soft: 'bg-sky-500/10 text-sky-300 border-sky-500/25 hover:bg-sky-500/20',
        frame: 'border-sky-500/20',
        text: 'text-sky-300',
    },
    'prayer for me': {
        hex: '#60a5fa',
        solid: 'bg-blue-500 hover:bg-blue-400 shadow-blue-500/30',
        soft: 'bg-blue-500/10 text-blue-300 border-blue-500/25 hover:bg-blue-500/20',
        frame: 'border-blue-500/20',
        text: 'text-blue-300',
    },
    'prayer for other': {
        hex: '#34d399',
        solid: 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/30',
        soft: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20',
        frame: 'border-emerald-500/20',
        text: 'text-emerald-300',
    },
};

export const getVoiceTone = (type) => VOICE_TONES[(type || 'general').toLowerCase()] || VOICE_TONES.general;

/** Live recording bar with a scrolling microphone waveform. */
function LiveRecordingBar({ recorder, tone }) {
    const pageActive = useTabPageActive();
    const waveRef = useRef(null);
    const pluginRef = useRef(null);
    const pausedRef = useRef(recorder.isPaused);

    useEffect(() => {
        if (!pageActive || !waveRef.current || !recorder.stream) return;
        let active = true, wavesurfer, micView;
        // Recording already owns the microphone; only its visual waveform waits
        // for these modules, so loading never delays permission or captures.
        Promise.all([import('wavesurfer.js'), import('wavesurfer.js/dist/plugins/record.esm.js')]).then(([{ default: WaveSurfer }, { default: RecordPlugin }]) => {
            if (!active || !waveRef.current) return;
            wavesurfer = WaveSurfer.create({
                container: waveRef.current,
                waveColor: tone.hex,
                progressColor: tone.hex,
                height: 36,
                barWidth: 3,
                barGap: 2,
                barRadius: 3,
                cursorWidth: 0,
                interact: false,
            });
            const plugin = wavesurfer.registerPlugin(RecordPlugin.create({ scrollingWaveform: true, scrollingWaveformWindow: 4, renderRecordedAudio: false }));
            pluginRef.current = plugin;
            micView = plugin.renderMicStream(recorder.stream);
            plugin.isWaveformPaused = pausedRef.current;
        }).catch(error => { if (active) console.warn('Recording waveform unavailable:', error); });
        return () => {
            active = false;
            micView?.onDestroy();
            pluginRef.current = null;
            wavesurfer?.destroy();
        };
    }, [pageActive, recorder.stream, tone.hex]);

    useEffect(() => {
        pausedRef.current = recorder.isPaused;
        if (pluginRef.current) pluginRef.current.isWaveformPaused = recorder.isPaused;
    }, [recorder.isPaused]);

    return (
        <div className={`flex items-center gap-2 sm:gap-3 rounded-2xl border ${tone.frame} bg-black/40 p-1.5 sm:p-2 animate-in fade-in zoom-in-95 duration-200`}>
            <button type="button" onClick={recorder.cancel} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/15 transition-all active:scale-95" title="Discard recording">
                <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 shrink-0 w-[52px]">
                <span className={`w-2 h-2 rounded-full ${recorder.isPaused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`} />
                <span className={`text-xs font-bold tabular-nums ${recorder.isPaused ? 'text-amber-300' : 'text-white'}`}>{formatSeconds(recorder.seconds)}</span>
            </div>
            <div ref={waveRef} className={`flex-1 min-w-0 h-9 transition-opacity ${recorder.isPaused ? 'opacity-40' : ''}`} />
            {recorder.canPause && (
                <button type="button" onClick={recorder.isPaused ? recorder.resume : recorder.pause} className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white/5 text-slate-200 hover:bg-white/10 transition-all active:scale-95" title={recorder.isPaused ? 'Resume recording' : 'Pause recording'}>
                    {recorder.isPaused ? <Mic className="w-4 h-4" /> : <Pause className="w-4 h-4 fill-current" />}
                </button>
            )}
            <button type="button" onClick={recorder.stop} className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 ${tone.solid}`} title="Done — keep recording">
                <Check className="w-5 h-5" strokeWidth={3} />
            </button>
        </div>
    );
}

/** A voice clip with a wavesurfer waveform, play/pause and seek. */
export function VoiceClip({ url, savedRec, fallbackDuration = 0, tone, label, onDelete }) {
    const { t } = useLanguage();
    const session = usePrayerSession();
    const playbackKey = savedRec ? `saved:${savedRec.id}` : `draft:${url}`;
    const waveRef = useRef(null);
    const wavesurferRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [failed, setFailed] = useState(false);
    const [duration, setDuration] = useState(fallbackDuration);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        if (!waveRef.current || (!url && !savedRec)) return;
        let attached = true, lease;
        const unsubscribe = [];
        session.playback.acquire(playbackKey, async () => {
            const source = savedRec ? await getRecordingUrl(savedRec) : { url, revoke: false };
            if (!source.url) throw new Error('Recording unavailable');
            let player;
            // Keep the media element outside the row's DOM. Removing a DOM-owned
            // <audio> can pause it even when the WaveSurfer instance is retained.
            const media = new Audio();
            const clearMedia = () => { media.pause(); media.removeAttribute('src'); media.load(); };
            const container = document.createElement('div');
            try {
                const { default: WaveSurfer } = await import('wavesurfer.js');
                player = WaveSurfer.create({ container, media, waveColor: 'rgba(148, 163, 184, 0.35)', progressColor: tone.hex,
                    cursorWidth: 0, height: 32, barWidth: 3, barGap: 2, barRadius: 3, normalize: true, dragToSeek: true, url: source.url });
                const resource = { player, container, ready: false, failed: false,
                    destroy() { player.destroy(); clearMedia(); container.remove(); if (source.revoke) URL.revokeObjectURL(source.url); } };
                player.on('ready', () => { resource.ready = true; });
                player.on('error', () => { resource.failed = true; });
                player.on('finish', () => player.seekTo(0));
                return resource;
            } catch (error) { player?.destroy(); clearMedia(); if (source.revoke) URL.revokeObjectURL(source.url); throw error; }
        }).then(value => {
            lease = value;
            if (!attached) { lease.release(); return; }
            const { player, container } = lease.resource;
            waveRef.current?.appendChild(container);
            wavesurferRef.current = player;
            const refresh = () => {
                if (!attached) return;
                setIsReady(lease.resource.ready); setFailed(lease.resource.failed);
                setIsPlaying(player.isPlaying()); setCurrentTime(player.getCurrentTime());
                setDuration(player.getDuration() || fallbackDuration);
            };
            for (const event of ['ready', 'play', 'pause', 'finish', 'timeupdate', 'error']) unsubscribe.push(player.on(event, refresh));
            refresh();
        }).catch(() => { if (attached) setFailed(true); });
        return () => {
            attached = false;
            unsubscribe.forEach(off => off());
            wavesurferRef.current = null;
            lease?.release();
        };
    }, [url, savedRec, tone.hex, session, playbackKey, fallbackDuration]);

    const showTime = isPlaying || currentTime > 0 ? currentTime : duration;

    return (
        <div data-prayer-playing={isPlaying ? 'true' : undefined} className={`group flex items-center gap-2.5 sm:gap-3 rounded-2xl border ${tone.frame} bg-white/[0.04] p-1.5 sm:p-2 pr-2 sm:pr-3`}>
            <button
                type="button"
                onClick={() => wavesurferRef.current?.playPause()}
                disabled={!isReady || failed}
                className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 ${tone.solid}`}
                title={isPlaying ? 'Pause' : 'Play'}
            >
                {!isReady && !failed ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
                {label && <p className={`text-[9px] font-black uppercase tracking-wider mb-0.5 ${tone.text}`}>{label}</p>}
                {failed
                    ? <p className="h-8 flex items-center text-[11px] text-slate-500">{t('recordingUnavailableOnDevice')}</p>
                    : <div ref={waveRef} className="h-8 w-full cursor-pointer" />}
            </div>
            <span className="text-[11px] font-semibold text-slate-400 tabular-nums shrink-0 w-9 text-right">{formatSeconds(showTime)}</span>
            {onDelete && (
                <button type="button" onClick={async () => { if (await onDelete() !== false) session.playback.stop(playbackKey); }} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/15 transition-all" title="Delete recording">
                    <Trash2 className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

/** Pending clips + record button / live bar for the general box or a section block while writing. */
export function VoiceRecorderPanel({ blockId, recorder, recordings = [], onRemove, prayType = 'general' }) {
    const { t } = useLanguage();
    const tone = getVoiceTone(prayType);
    const isThisBlock = recorder.recordingBlockId === blockId;

    return (
        <div className="flex flex-col gap-2">
            {recordings.map((rec) => (
                <VoiceClip key={rec.id} url={rec.url} fallbackDuration={rec.duration} tone={tone} onDelete={() => onRemove(rec.id)} />
            ))}
            {isThisBlock ? (
                <LiveRecordingBar recorder={recorder} tone={tone} />
            ) : (
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => recorder.start(blockId)}
                        disabled={recorder.isRecording}
                        aria-label={recordings.length ? t('recordAnother') : t('recordVoice')}
                        title={recordings.length ? t('recordAnother') : t('recordVoice')}
                        className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border-0 transition-all active:scale-95 disabled:opacity-35 disabled:pointer-events-none ${backupStyles.matteButton}`}
                    >
                        <span className="w-6 h-6 rounded-full flex items-center justify-center"><Mic className="w-3.5 h-3.5" /></span>
                    </button>
                    {recordings.length > 0 && <span className="text-[10px] text-slate-500">{recordings.length} {t('records')} · {t('savedOnDeviceTitle')}</span>}
                </div>
            )}
        </div>
    );
}

function SavedVoiceClip({ rec, label, onDelete }) {
    const containerRef = useRef(null);
    const [nearViewport, setNearViewport] = useState(() => typeof IntersectionObserver === 'undefined');
    useEffect(() => {
        if (nearViewport) return;
        if (typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) { setNearViewport(true); observer.disconnect(); }
        }, { rootMargin: '150px 0px' });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [nearViewport]);
    const tone = getVoiceTone(rec.blockType);
    return <div ref={containerRef} onFocusCapture={() => setNearViewport(true)}>
        <VoiceClip savedRec={nearViewport ? rec : null} fallbackDuration={rec.duration} tone={tone} label={label} onDelete={onDelete} />
    </div>;
}

/** Recordings saved on this device for a prayer card. */
export function SavedPrayRecordings({ prayId, recordings, getBlockLabel, onChanged }) {
    const { t } = useLanguage();
    if (!recordings?.length) return null;
    const handleDelete = async (recId) => {
        if (!window.confirm(t('deleteVoiceRecordingConfirm'))) return false;
        await deleteRecording(prayId, recId);
        onChanged?.();
    };
    return (
        <div className="mt-2 flex flex-col gap-2">
            {recordings.map((rec) => (
                <SavedVoiceClip key={rec.id} rec={rec} label={getBlockLabel?.(rec.blockType)} onDelete={() => handleDelete(rec.id)} />
            ))}
        </div>
    );
}

/** Backup / restore settings dropdown menu with multi-account support. */
export function MyPraysBackup({ prayTime, token, userId, onRestored, privacySettings }) {
    const pageActive = useTabPageActive();
    const { t, language } = useLanguage();
    const lastBackupKey = `my_prays_last_backup_${userId}`;
    const [isOpen, setIsOpen] = useState(false);
    const [busy, setBusy] = useState(null); // 'backup' | 'restore' | null
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [needsLink, setNeedsLink] = useState(false);
    const [lastBackup, setLastBackup] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [openPanel, setOpenPanel] = useState(null); // 'accounts' | 'restore' | null
    const [activatingEmail, setActivatingEmail] = useState(null);
    const [schedule, setSchedule] = useState({ intervalDays: 0, wifiOnly: true });
    const [nextBackup, setNextBackup] = useState(0);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const scheduleFocusRef = useRef(null);
    const nativeBackup = hasNativeBackup();
    const labels = language === 'ar' ? {
        automatic: 'النسخ الاحتياطي التلقائي', off: 'إيقاف', days: n => `كل ${n} أيام`, wifi: 'Wi-Fi فقط',
        next: 'النسخة التالية', last: 'آخر نسخة ناجحة',
        native: 'النسخ التلقائي متاح في تطبيق الهاتف بعد تحديثه.', queued: 'بانتظار الاتصال والبطارية المناسبة…', running: 'جارٍ النسخ الاحتياطي…', complete: 'اكتمل النسخ الاحتياطي',
    } : language === 'de' ? {
        automatic: 'Automatische Sicherung', off: 'Aus', days: n => `Alle ${n} Tage`, wifi: 'Nur WLAN',
        next: 'Nächste Sicherung', last: 'Letzte erfolgreiche Sicherung',
        native: 'Automatische Sicherungen sind in der aktualisierten mobilen App verfügbar.', queued: 'Warten auf Verbindung und Akku…', running: 'Sicherung läuft…', complete: 'Sicherung abgeschlossen',
    } : {
        automatic: 'Automatic backup', off: 'Off', days: n => `Every ${n} days`, wifi: 'Wi-Fi only',
        next: 'Next backup due', last: 'Last successful backup',
        native: 'Auto backup is available in the mobile app.', queued: 'Waiting for connection and battery…', running: 'Backup in progress…', complete: 'Backup completed',
    };
    const triggerRef = useRef(null);
    const dialogRef = useRef(null);
    const dialogId = useId();
    const [panelPosition, setPanelPosition] = useState({});
    const positionPanel = useCallback(() => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const width = Math.min(320, window.innerWidth - 32);
        const height = dialogRef.current?.getBoundingClientRect().height || Math.min(520, window.innerHeight * 0.7);
        const next = {
            left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
            top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - height - 16)),
        };
        setPanelPosition(current => current.left === next.left && current.top === next.top ? current : next);
    }, []);
    const panelRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const dialog = dialogRef.current;
        const trigger = triggerRef.current;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog?.showModal();
        positionPanel();
        const observer = new ResizeObserver(positionPanel);
        if (dialog) observer.observe(dialog);
        window.addEventListener('resize', positionPanel);
        return () => {
            observer.disconnect();
            dialog?.close();
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('resize', positionPanel);
            trigger?.focus({ preventScroll: true });
        };
    }, [isOpen, positionPanel]);

    useEffect(() => {
        if (openPanel) {
            panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [openPanel]);

    useEffect(() => {
        try { setLastBackup(localStorage.getItem(lastBackupKey)); } catch { }
        setSchedule(readBackupSettings(userId));
    }, [lastBackupKey, userId]);

    useEffect(() => { cacheBackupOwner(userId).catch(() => {}); }, [userId]);

    useEffect(() => {
        if (!savingSchedule && scheduleFocusRef.current && dialogRef.current?.open) {
            scheduleFocusRef.current.focus({ preventScroll: true });
            scheduleFocusRef.current = null;
        }
    }, [savingSchedule]);

    useEffect(() => {
        if (!pageActive || !isOpen || !nativeBackup || !token || !userId) return;
        let cancelled = false;
        const refresh = async () => {
            try {
                const value = await prayerBackupStatus(userId);
                if (cancelled) return;
                setNextBackup(value.nextBackupAt || 0);
                if (value.lastSuccess) setLastBackup(new Date(value.lastSuccess).toISOString());
                if (['queued', 'running'].includes(value.state)) {
                    setBusy(current => current === 'restore' ? current : 'backup'); setProgress(value.progress || 0);
                    setStatus(value.state === 'queued' ? labels.queued : labels.running);
                } else {
                    setBusy(current => current === 'backup' ? null : current);
                    if (value.state === 'complete') setStatus(labels.complete);
                    if (value.state === 'error') setStatus(`Error: ${value.error}`);
                }
            } catch { /* Older app builds keep the existing manual backup flow. */ }
        };
        refresh();
        const timer = setInterval(refresh, 1500);
        return () => { cancelled = true; clearInterval(timer); };
    }, [pageActive, nativeBackup, token, userId, isOpen, busy, labels.complete, labels.queued, labels.running]);

    const loadAccounts = useCallback(async () => {
        if (!token) return;
        try {
            const list = await getDriveAccounts(token);
            setAccounts(list);
            if (list.length > 0) setNeedsLink(false);
        } catch {
            // failed silently
        }
    }, [token]);

    useEffect(() => {
        loadAccounts();
    }, [loadAccounts]);

    useEffect(() => {
        const handleMessage = (e) => {
            if (e.data && e.data.type === 'GOOGLE_DRIVE_LINKED') {
                loadAccounts();
                showToast({ message: e.data.email ? `Connected: ${e.data.email}` : 'Google Drive linked successfully.', type: 'success', duration: 4000 });
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [loadAccounts]);

    const fail = (err) => {
        console.error('My prays backup error:', err);
        if (err instanceof DriveNotLinkedError) setNeedsLink(true);
        setStatus(`Error: ${err.message}`);
    };

    const handleLink = async () => {
        try {
            const authUrl = await getDriveAuthUrl(token);
            if (Capacitor.isNativePlatform()) {
                await Browser.open({ url: authUrl });
                const listener = await Browser.addListener('browserFinished', () => {
                    loadAccounts();
                    listener.remove();
                });
            } else {
                window.open(authUrl, '_blank');
            }
            setNeedsLink(false);
            setStatus(t('prayFinishConnecting'));
        } catch (err) { fail(err); }
    };

    const defaultAccount = accounts.find((a) => a.isDefault) || accounts[0];
    const activeEmail = defaultAccount?.email || null;

    const changeSchedule = async (patch) => {
        if (savingSchedule) return;
        if (!activeEmail) { setNeedsLink(true); return; }
        setSavingSchedule(true);
        try {
            await cacheBackupOwner(userId);
            const next = { ...schedule, ...patch, email: activeEmail };
            const result = await saveBackupSettings(userId, token, next);
            setSchedule(next); setNextBackup(result?.nextBackupAt || 0);
        } catch (err) { fail(err); } finally { setSavingSchedule(false); }
    };

    const handleBackup = async (targetEmail = null) => {
        setBusy('backup'); setProgress(0); setNeedsLink(false);
        try {
            const emailToUse = targetEmail || activeEmail;
            if (nativeBackup) {
                await cacheBackupOwner(userId);
                await startPrayerBackup(userId, token, emailToUse || '');
                setStatus(labels.queued);
                return;
            }
            const targetLabel = emailToUse ? ` (${emailToUse})` : '';
            setStatus(`Connecting to Google Drive${targetLabel}...`);
            const accessToken = await getDriveAccessToken(token, emailToUse);
            setProgress(5);
            setStatus('Packing prayers and recordings...');
            const bytes = await buildMyPraysZip(prayTime || [], (ratio) => setProgress(5 + Math.round(ratio * 40)));
            setStatus('Preparing Drive folder...');
            const folderId = await ensureDriveFolder(accessToken, BACKUP_FOLDER);
            setProgress(50);
            setStatus('Uploading "my prays"...');
            await uploadDriveFile(accessToken, {
                name: BACKUP_FILE, folderId, bytes, mimeType: 'application/zip',
                onProgress: (ratio) => setProgress(50 + Math.round(ratio * 50)),
            });
            const now = new Date().toISOString();
            try { localStorage.setItem(lastBackupKey, now); } catch { }
            setLastBackup(now);
            setProgress(100);
            setStatus('Backup completed successfully!');
            showToast({ message: '"my prays" backed up to Google Drive.', type: 'success', duration: 4000 });
        } catch (err) { fail(err); setBusy(null); } finally { if (!nativeBackup) setBusy(null); }
    };

    const executeRestore = async (accountEmail = null) => {
        setOpenPanel(null);
        setBusy('restore'); setProgress(0); setNeedsLink(false);
        try {
            const targetLabel = accountEmail ? ` (${accountEmail})` : '';
            setStatus(`Connecting to Google Drive${targetLabel}...`);
            const accessToken = await getDriveAccessToken(token, accountEmail);
            const folder = await findDriveFile(accessToken, { name: BACKUP_FOLDER, mimeType: 'application/vnd.google-apps.folder' });
            const file = folder && await findDriveFile(accessToken, { name: BACKUP_FILE, parentId: folder.id });
            if (!file) throw new Error(`No "my prays" backup found on ${accountEmail || 'Google Drive'}.`);
            setProgress(10);
            setStatus('Downloading "my prays"...');
            const bytes = await downloadDriveFile(accessToken, file.id);
            setProgress(50);
            setStatus('Restoring recordings...');
            const result = await restoreMyPraysZip(bytes, (ratio) => setProgress(50 + Math.round(ratio * 50)), { ownerId: userId || 'guest' });
            setProgress(100);
            setStatus(`Restored ${result.restored} recording(s) across ${result.prays} prayer(s).`);
            showToast({ message: `Restored ${result.restored} recording(s) successfully.`, type: 'success', duration: 4000 });
            onRestored?.();
        } catch (err) { fail(err); } finally { setBusy(null); }
    };

    const handleRestoreClick = () => {
        if (accounts.length > 1) {
            setOpenPanel((prev) => (prev === 'restore' ? null : 'restore'));
        } else {
            const singleEmail = accounts[0]?.email || null;
            if (!window.confirm(`Restore voice recordings from your "my prays" backup on Google Drive${singleEmail ? ` (${singleEmail})` : ''}? Recordings already on this device are kept.`)) return;
            executeRestore(singleEmail);
        }
    };

    const handleSetDefault = async (email) => {
        if (activatingEmail || email === activeEmail) return;
        setActivatingEmail(email);
        try {
            await setDefaultDriveAccount(token, email);
            if (nativeBackup) {
                const next = { ...schedule, email };
                await saveBackupSettings(userId, token, next); setSchedule(next);
            }
            await loadAccounts();
            showToast({ message: `Active account switched to ${email}`, type: 'success', duration: 3000 });
        } catch (err) {
            showToast({ message: err.message, type: 'error', duration: 4000 });
        } finally {
            setActivatingEmail(null);
        }
    };

    const handleDisconnect = async (email) => {
        if (!window.confirm(`Disconnect Google Drive account (${email})?`)) return;
        try {
            await disconnectDriveAccount(token, email);
            if (nativeBackup && schedule.email === email) {
                const next = { ...schedule, intervalDays: 0, email: '' };
                await saveBackupSettings(userId, token, next); setSchedule(next); setNextBackup(0);
            }
            await loadAccounts();
            showToast({ message: 'Drive account disconnected', type: 'info', duration: 3000 });
        } catch (err) {
            showToast({ message: err.message, type: 'error', duration: 4000 });
        }
    };

    const isError = status.startsWith('Error');

    const closePanel = () => {
        if (busy === 'restore') return;
        setIsOpen(false);
        setOpenPanel(null);
    };
    const scheduleDisabled = !nativeBackup || savingSchedule || Boolean(busy);

    return (
        <>
            <button
                type="button"
                ref={triggerRef}
                onClick={() => { positionPanel(); setIsOpen(true); }}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className={backupStyles.trigger}
                title="Settings"
                aria-label="Settings"
            >
                <MoreVertical className="w-4 h-4" />
            </button>

            {pageActive && isOpen && createPortal(
                <dialog ref={dialogRef} style={panelPosition} className={backupStyles.panel}
                    aria-label={t('myPraysBackupTitle')} aria-modal="true"
                    onCancel={event => { event.preventDefault(); closePanel(); }}
                    onClick={event => {
                        if (event.target !== event.currentTarget) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
                    }}>
                    {privacySettings}
                    {/* Header */}
                    <div className="flex items-center justify-between pb-1 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span id={dialogId} className="text-xs font-bold text-slate-100 truncate">{t('backup')}</span>
                        </div>
                    </div>

                    {!token ? (
                        <div className="p-3 text-center text-xs text-slate-400 space-y-1">
                            <HardDrive className="h-5 w-5 mx-auto text-sky-400" />
                            <p className="font-semibold text-slate-100">{t('savedOnDeviceTitle')}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{t('savedOnDeviceDesc')}</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="px-1 pb-2 mb-1 border-b border-white/10 space-y-2">
                                <fieldset className={backupStyles.schedulePicker} aria-busy={savingSchedule} disabled={scheduleDisabled} dir={language === 'ar' ? 'rtl' : undefined}>
                                    <legend className={backupStyles.scheduleLegend}>{labels.automatic}</legend>
                                    <BackupFrequency value={schedule.intervalDays} labels={labels} disabled={scheduleDisabled}
                                        onChange={(days, trigger) => { scheduleFocusRef.current = trigger; changeSchedule({ intervalDays: days }); }} />
                                </fieldset>
                                <label className={backupStyles.wifiRow}>
                                    <span className={backupStyles.wifiLabel}><Wifi className="w-4 h-4" />{labels.wifi}</span>
                                    <span className={backupStyles.wifiSwitch}>
                                        <input className={backupStyles.wifiInput} type="checkbox" role="switch" checked={schedule.wifiOnly} disabled={scheduleDisabled} onChange={event => { scheduleFocusRef.current = event.currentTarget; changeSchedule({ wifiOnly: event.target.checked }); }} />
                                        <span className={backupStyles.wifiTrack} />
                                    </span>
                                </label>
                                <p hidden={nativeBackup} className="text-[10px] leading-relaxed text-slate-400">{language === 'ar' ? 'النسخ التلقائي متاح في تطبيق الهاتف' : language === 'de' ? 'Automatisch nur in der mobilen App' : 'Auto backup requires the mobile app'}</p>
                                {lastBackup && <p title={new Date(lastBackup).toLocaleString(language)} className="text-[10px] text-slate-400">{language === 'ar' ? 'آخر نسخة' : language === 'de' ? 'Letztes Backup' : 'Last backup'} · {new Date(lastBackup).toLocaleDateString(language, { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                                {schedule.intervalDays > 0 && nextBackup > 0 && <p className="text-[10px] text-slate-400">{labels.next}: {new Date(nextBackup).toLocaleDateString(language)}</p>}
                            </div>
                            <div className={backupStyles.backupActions}>
                            {/* Backup Button */}
                            <button
                                type="button"
                                onClick={() => handleBackup()}
                                disabled={Boolean(busy)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50 group"
                            >
                                <div className="flex items-center gap-2.5">
                                    {busy === 'backup' ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                                    ) : (
                                        <CloudUpload className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                                    )}
                                    <span>{t('backup')}</span>
                                </div>
                            </button>

                            {/* Restore Button */}
                            <button
                                type="button"
                                onClick={handleRestoreClick}
                                disabled={Boolean(busy)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50 group"
                            >
                                <div className="flex items-center gap-2.5">
                                    {busy === 'restore' ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                                    ) : (
                                        <CloudDownload className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                                    )}
                                    <span>{t('restore')}</span>
                                </div>
                            </button>

                            </div>
                            {/* Active Drive Account Row */}
                            {activeEmail && (
                                <div className="pt-2 mt-1 border-t border-white/5 flex flex-wrap gap-2 items-center justify-between text-[10px] text-slate-400 px-1">
                                    <span className="truncate max-w-[130px]" title={activeEmail}>{activeEmail}</span>
                                    <button
                                        type="button"
                                        onClick={() => setOpenPanel(prev => prev === 'accounts' ? null : 'accounts')}
                                        aria-label={`${t('changeDriveEmail')}: ${activeEmail}`}
                                        aria-expanded={openPanel === 'accounts'}
                                        className="text-sky-400 hover:underline flex items-center gap-1"
                                    >
                                        <ArrowRightLeft className="w-3 h-3" />
                                        <span>{language === 'ar' ? 'تغيير' : language === 'de' ? 'Wechseln' : 'Change'}</span>
                                    </button>
                                </div>
                            )}

                            {needsLink && (
                                <button
                                    type="button"
                                    onClick={handleLink}
                                    className="mt-2 w-full py-1.5 px-2 bg-white text-gray-900 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors"
                                >
                                    {t('connectGoogleDrive')}
                                </button>
                            )}

                            {/* Status & Progress Indicator */}
                            {(busy || status) && (
                                <div role="status" className="mt-2 pt-2 border-t border-white/10 px-1">
                                    <div className="flex justify-between text-[10px] mb-1">
                                        <span className={`truncate ${isError ? 'text-red-400' : 'text-sky-400'}`}>{status}</span>
                                        {busy && <span className="text-slate-400 ml-1">{progress}%</span>}
                                    </div>
                                    {busy && (
                                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Multi-Account Selector Modal / Subpanel */}
                            {openPanel && (
                                <div ref={panelRef} className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
                                    <div className="text-[10px] font-bold text-slate-300">
                                        {openPanel === 'restore' ? t('selectAccountToRestore') : t('connectedGoogleAccounts')}
                                    </div>
                                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                        {accounts.map((acc) => {
                                            const isActivating = activatingEmail === acc.email;
                                            const isDef = acc.isDefault || acc.email === activeEmail;
                                            return (
                                                <div
                                                    key={acc.email}
                                                    onClick={() => {
                                                        if (busy) return;
                                                        if (openPanel === 'restore') executeRestore(acc.email);
                                                        else if (!isDef && !isActivating) handleSetDefault(acc.email);
                                                    }}
                                                    className={`flex items-center justify-between p-1.5 rounded-lg border text-[10px] transition-colors ${
                                                        isActivating
                                                            ? 'border-sky-500/50 bg-sky-500/10 cursor-wait'
                                                            : 'border-white/5 bg-white/[0.02] hover:bg-white/5 cursor-pointer'
                                                    }`}
                                                >
                                                    <span className="text-slate-100 truncate max-w-[120px]">{acc.email}</span>
                                                    {isActivating ? (
                                                        <span className="flex items-center gap-1 text-sky-400 font-bold">
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                            <span>{t('activating')}</span>
                                                        </span>
                                                    ) : openPanel === 'restore' ? (
                                                        <span className="text-sky-400 font-bold">{t('restore')}</span>
                                                    ) : isDef ? (
                                                        <span className="text-emerald-400 font-bold">{t('activeStatus')}</span>
                                                    ) : null}
                                                    {openPanel !== 'restore' && <button type="button" disabled={Boolean(busy)}
                                                        aria-label={`Disconnect ${acc.email}`} title={`Disconnect ${acc.email}`}
                                                        onClick={event => { event.stopPropagation(); handleDisconnect(acc.email); }}
                                                        className="p-1 rounded text-slate-400 hover:text-red-400 disabled:opacity-40">
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleLink}
                                        className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 pt-1"
                                    >
                                        <Plus className="w-3 h-3" />
                                        <span>{t('connectAnotherAccount')}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </dialog>, document.body
            )}
        </>
    );
}

