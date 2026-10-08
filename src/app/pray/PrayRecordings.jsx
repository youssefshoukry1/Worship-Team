'use client';

import { Check, CloudUpload, CloudDownload, HardDrive, Loader2, Mic, Pause, Play, Trash2, ArrowRightLeft, Plus, X, MoreVertical } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { buildMyPraysZip, deleteRecording, getRecordingUrl, restoreMyPraysZip } from '../utils/prayRecordings';
import {
    DriveNotLinkedError, downloadDriveFile, ensureDriveFolder, findDriveFile, getDriveAccessToken, getDriveAccounts, getDriveAuthUrl, setDefaultDriveAccount, disconnectDriveAccount, uploadDriveFile,
} from '../utils/googleDriveClient';
import { showToast } from '../components/ToastContainer';
import { openVoiceInput } from '../utils/voiceProcessing';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

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

const pickMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return '';
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'].find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
};

const VOICE_BITRATE = 96000;

// Only one clip plays at a time across the whole page
let activePlayer = null;

/**
 * One recorder shared by the general box and all section blocks — only one can record at a time.
 * onFinish(blockId, { blob, url, duration, mimeType }) is called when a recording is kept.
 */
export function usePrayRecorder(onFinish) {
    const [recordingBlockId, setRecordingBlockId] = useState(null);
    const [seconds, setSeconds] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [stream, setStream] = useState(null);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const voiceRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const cancelRef = useRef(false);
    const elapsedMsRef = useRef(0);
    const resumedAtRef = useRef(0);
    const onFinishRef = useRef(onFinish);

    useEffect(() => {
        onFinishRef.current = onFinish;
    }, [onFinish]);

    const elapsedMs = () => elapsedMsRef.current + (resumedAtRef.current ? Date.now() - resumedAtRef.current : 0);

    const cleanup = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        voiceRef.current?.close();
        voiceRef.current = null;
        recorderRef.current = null;
        elapsedMsRef.current = 0;
        resumedAtRef.current = 0;
        setStream(null);
        setRecordingBlockId(null);
        setIsPaused(false);
        setSeconds(0);
    }, []);

    const start = async (blockId) => {
        if (recorderRef.current) return;
        try {
            const voice = await openVoiceInput();
            voiceRef.current = voice;
            streamRef.current = voice.stream;
            const mimeType = pickMimeType();
            const options = { audioBitsPerSecond: VOICE_BITRATE, ...(mimeType && { mimeType }) };
            const recorder = new MediaRecorder(voice.stream, options);
            recorderRef.current = recorder;
            chunksRef.current = [];
            cancelRef.current = false;
            activePlayer?.pause();

            recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
            recorder.onstop = () => {
                const type = recorder.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(chunksRef.current, { type });
                const duration = elapsedMs() / 1000;
                chunksRef.current = [];
                if (!cancelRef.current && blob.size > 0) {
                    onFinishRef.current?.(blockId, { blob, url: URL.createObjectURL(blob), duration, mimeType: type });
                }
                cleanup();
            };

            elapsedMsRef.current = 0;
            resumedAtRef.current = Date.now();
            recorder.start();
            setStream(voice.stream);
            setRecordingBlockId(blockId);
            setIsPaused(false);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds(elapsedMs() / 1000), 250);
        } catch (err) {
            console.error('Microphone error:', err);
            cleanup();
            alert('Could not access microphone.');
        }
    };

    const pause = () => {
        const recorder = recorderRef.current;
        if (recorder?.state !== 'recording' || typeof recorder.pause !== 'function') return;
        recorder.pause();
        elapsedMsRef.current = elapsedMs();
        resumedAtRef.current = 0;
        setIsPaused(true);
    };

    const resume = () => {
        const recorder = recorderRef.current;
        if (recorder?.state !== 'paused') return;
        recorder.resume();
        resumedAtRef.current = Date.now();
        setIsPaused(false);
    };

    const stop = () => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') return;
        elapsedMsRef.current = elapsedMs();
        resumedAtRef.current = 0;
        recorder.stop();
    };
    const cancel = () => { cancelRef.current = true; stop(); };

    // Stop the mic if the component unmounts mid-recording
    useEffect(() => () => {
        cancelRef.current = true;
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        voiceRef.current?.close();
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    return {
        recordingBlockId, seconds, isPaused, stream,
        canPause: typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function',
        start, pause, resume, stop, cancel,
        isRecording: Boolean(recordingBlockId),
    };
}

/** Live recording bar with a scrolling microphone waveform. */
function LiveRecordingBar({ recorder, tone }) {
    const waveRef = useRef(null);
    const pluginRef = useRef(null);

    useEffect(() => {
        if (!waveRef.current || !recorder.stream) return;
        const wavesurfer = WaveSurfer.create({
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
        const micView = plugin.renderMicStream(recorder.stream);
        return () => {
            micView.onDestroy();
            pluginRef.current = null;
            wavesurfer.destroy();
        };
    }, [recorder.stream, tone.hex]);

    useEffect(() => {
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
export function VoiceClip({ url, fallbackDuration = 0, tone, label, onDelete }) {
    const waveRef = useRef(null);
    const wavesurferRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [failed, setFailed] = useState(false);
    const [duration, setDuration] = useState(fallbackDuration);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        if (!waveRef.current || !url) return;
        let active = true;
        const wavesurfer = WaveSurfer.create({
            container: waveRef.current,
            waveColor: 'rgba(148, 163, 184, 0.35)',
            progressColor: tone.hex,
            cursorWidth: 0,
            height: 32,
            barWidth: 3,
            barGap: 2,
            barRadius: 3,
            normalize: true,
            dragToSeek: true,
            url,
        });
        wavesurferRef.current = wavesurfer;
        wavesurfer.on('ready', (seconds) => {
            if (!active) return;
            setIsReady(true);
            if (seconds && Number.isFinite(seconds)) setDuration(seconds);
        });
        wavesurfer.on('timeupdate', (seconds) => { if (active) setCurrentTime(seconds); });
        wavesurfer.on('play', () => {
            if (activePlayer && activePlayer !== wavesurfer) activePlayer.pause();
            activePlayer = wavesurfer;
            if (active) setIsPlaying(true);
        });
        wavesurfer.on('pause', () => { if (active) setIsPlaying(false); });
        wavesurfer.on('finish', () => {
            if (active) {
                setIsPlaying(false);
                wavesurfer.seekTo(0);
                setCurrentTime(0);
            }
        });
        wavesurfer.on('error', () => { if (active) setFailed(true); });
        return () => {
            active = false;
            if (activePlayer === wavesurfer) activePlayer = null;
            wavesurfer.destroy();
            wavesurferRef.current = null;
        };
    }, [url, tone.hex]);

    const showTime = isPlaying || currentTime > 0 ? currentTime : duration;

    return (
        <div className={`group flex items-center gap-2.5 sm:gap-3 rounded-2xl border ${tone.frame} bg-white/[0.04] p-1.5 sm:p-2 pr-2 sm:pr-3`}>
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
                    ? <p className="h-8 flex items-center text-[11px] text-slate-500">Recording unavailable on this device</p>
                    : <div ref={waveRef} className="h-8 w-full cursor-pointer" />}
            </div>
            <span className="text-[11px] font-semibold text-slate-400 tabular-nums shrink-0 w-9 text-right">{formatSeconds(showTime)}</span>
            {onDelete && (
                <button type="button" onClick={onDelete} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/15 transition-all" title="Delete recording">
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
                        className={`inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border text-xs font-bold transition-all active:scale-95 disabled:opacity-35 disabled:pointer-events-none ${tone.soft}`}
                    >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${tone.solid}`}><Mic className="w-3.5 h-3.5" /></span>
                        {recordings.length ? t('recordAnother') : t('recordVoice')}
                    </button>
                    {recordings.length > 0 && <span className="text-[10px] text-slate-500">{recordings.length} {t('records')} · {t('savedOnDeviceTitle')}</span>}
                </div>
            )}
        </div>
    );
}

function SavedVoiceClip({ rec, label, onDelete }) {
    const { t } = useLanguage();
    const [url, setUrl] = useState(null);
    const [missing, setMissing] = useState(false);
    useEffect(() => {
        let active = true;
        let revokeUrl = null;
        getRecordingUrl(rec).then(({ url: resolved, revoke }) => {
            if (revoke) revokeUrl = resolved;
            if (!active) { if (revoke && resolved) URL.revokeObjectURL(resolved); return; }
            setUrl(resolved);
            setMissing(!resolved);
        }).catch(() => { if (active) setMissing(true); });
        return () => { active = false; if (revokeUrl) URL.revokeObjectURL(revokeUrl); };
    }, [rec]);
    const tone = getVoiceTone(rec.blockType);
    if (missing) {
        return (
            <div className={`flex items-center justify-between gap-2 rounded-2xl border ${tone.frame} bg-white/[0.02] px-3 py-2 text-[11px] text-slate-500`}>
                {t('recordingUnavailableOnDevice')}
                <button type="button" onClick={onDelete} className="p-1 rounded-full hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
        );
    }
    return <VoiceClip url={url} fallbackDuration={rec.duration} tone={tone} label={label} onDelete={onDelete} />;
}

/** Recordings saved on this device for a prayer card. */
export function SavedPrayRecordings({ prayId, recordings, getBlockLabel, onChanged }) {
    const { t } = useLanguage();
    if (!recordings?.length) return null;
    const handleDelete = async (recId) => {
        if (!window.confirm(t('deleteVoiceRecordingConfirm'))) return;
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
export function MyPraysBackup({ prayTime, token, userId, onRestored }) {
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
    const menuRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                if (!busy) setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isOpen, busy]);

    useEffect(() => {
        if (openPanel) {
            panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [openPanel]);

    useEffect(() => {
        try { setLastBackup(localStorage.getItem(lastBackupKey)); } catch { }
    }, [lastBackupKey]);

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
            setStatus('Finish connecting, then try again.');
        } catch (err) { fail(err); }
    };

    const defaultAccount = accounts.find((a) => a.isDefault) || accounts[0];
    const activeEmail = defaultAccount?.email || null;

    const handleBackup = async (targetEmail = null) => {
        setBusy('backup'); setProgress(0); setNeedsLink(false);
        try {
            const emailToUse = targetEmail || activeEmail;
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
        } catch (err) { fail(err); } finally { setBusy(null); }
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
            const result = await restoreMyPraysZip(bytes, (ratio) => setProgress(50 + Math.round(ratio * 50)));
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
            await loadAccounts();
            showToast({ message: 'Drive account disconnected', type: 'info', duration: 3000 });
        } catch (err) {
            showToast({ message: err.message, type: 'error', duration: 4000 });
        }
    };

    const isError = status.startsWith('Error');

    return (
        <div ref={menuRef} className="relative inline-block text-left">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all border border-white/10 active:scale-95 flex items-center justify-center shadow-sm"
                title="Settings"
                aria-label="Settings"
            >
                <MoreVertical className="w-4 h-4" />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.65)] p-3 z-50 animate-in fade-in zoom-in-95">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-bold text-white truncate">{t('myPraysBackupTitle')}</span>
                            {activeEmail && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title={activeEmail} />
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => !busy && setIsOpen(false)}
                            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {!token ? (
                        <div className="p-3 text-center text-xs text-slate-400 space-y-1">
                            <HardDrive className="h-5 w-5 mx-auto text-sky-400" />
                            <p className="font-semibold text-white">{t('savedOnDeviceTitle')}</p>
                            <p className="text-[10px] text-slate-400 leading-tight">{t('savedOnDeviceDesc')}</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
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

                            {/* Active Drive Account Row */}
                            {activeEmail && (
                                <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400 px-1">
                                    <span className="truncate max-w-[130px]" title={activeEmail}>{activeEmail}</span>
                                    <button
                                        type="button"
                                        onClick={() => setOpenPanel(prev => prev === 'accounts' ? null : 'accounts')}
                                        className="text-sky-400 hover:underline flex items-center gap-1"
                                    >
                                        <ArrowRightLeft className="w-3 h-3" />
                                        <span>{t('changeDriveEmail')}</span>
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
                                <div className="mt-2 pt-2 border-t border-white/10 px-1">
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
                                                        if (openPanel === 'restore') executeRestore(acc.email);
                                                        else if (!isDef && !isActivating) handleSetDefault(acc.email);
                                                    }}
                                                    className={`flex items-center justify-between p-1.5 rounded-lg border text-[10px] transition-colors ${
                                                        isActivating
                                                            ? 'border-sky-500/50 bg-sky-500/10 cursor-wait'
                                                            : 'border-white/5 bg-white/[0.02] hover:bg-white/5 cursor-pointer'
                                                    }`}
                                                >
                                                    <span className="text-white truncate max-w-[120px]">{acc.email}</span>
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
                </div>
            )}
        </div>
    );
}

