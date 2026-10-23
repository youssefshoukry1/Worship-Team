'use client';

import { memo, useMemo, useCallback, useEffect, useLayoutEffect, useState, useContext, useRef } from 'react';
import { UserContext } from '../context/User_Context';
import { Check, Clock3, CircleAlert, Heart, Loader2, Trash2, X, Share2, Search, Users, ChevronRight, ArrowRight, Send, Inbox, Lock, Layers, EyeOff, SlidersHorizontal } from 'lucide-react';
import Portal from '../Portal/Portal';
import { getApiBaseUrl } from '../utils/apiBase';
import {
    addGuestPray, getGuestPrays, getRecordingsIndex, updateGuestPray, addExternalRecording,
    mergeIncomingPrayers, applyPrayerReplies, markPrayerActivitySeen, migratePrayerReadState, getPrayerDeletionState, applyPrayerRevocations
} from '../utils/prayRecordings';
import { MyPraysBackup, SavedPrayRecordings, VoiceRecorderPanel, usePrayRecorder } from './PrayRecordings';
import { useLanguage } from '../context/LanguageContext';
import { useOfflineAvatar } from '../hooks/useOfflineAvatar';
import { isFriendsCacheFresh, readFriendsCache, writeFriendsCache } from '../utils/friendsCache';
import { findNotificationPrayer, readPrayerNotificationTarget } from '../utils/prayerNotificationNavigation';
import { readCachedProfile, refreshProfile } from '../utils/profileCache';
import { readTabJson, tabReadKey } from '../utils/tabRequests';
import { runSessionTask } from '../utils/sessionTasks';
import RetainedPrayerList from './RetainedPrayerList';
import { incomingPrayerActivity, isPrayerUnread, reconcilePrayerEntries, reconcilePrayerRecordings, seenPrayerChanges, sortPrayerActivity } from '../utils/prayerActivity';
import { prayerCircleText, formatActivityTime } from './prayerCircleText';
import usePrayerCircleOrder from './usePrayerCircleOrder';
import { newPrayerAction, preparePrayerAction, retryPrayerAction, localPrayerOverlay, PRAYER_SYNC_EVENT } from '../services/prayerSync';
import usePrayerDeleteWindow, { prayerDeleteAvailable } from './usePrayerDeleteWindow';

const API_URL = getApiBaseUrl();

const GENERAL_BLOCK_ID = 'general';
// Skip offscreen style/paint without unmounting saved audio players or cards.
const PRAYER_CARD_RENDERING = { contentVisibility: 'auto', containIntrinsicSize: 'auto 180px' };

const isReceivedPrayer = (entry) => Boolean(
    (entry.sharedFrom?.username || entry.sharedFrom?.originalPrayId || entry.sharedFrom?.userId) &&
    !entry.sharedWith?.username
);
const isSentPrayer = (entry) => Boolean(
    entry.sharedWith?.username || entry.sharedWith?.userId
);
const isPersonalPrayer = (entry) => !isReceivedPrayer(entry) && !isSentPrayer(entry);



const getPrayTypeStyle = (type) => {
    const t = (type || 'general').toLowerCase();
    switch (t) {
        case 'prayer for me': return { activeBtn: 'bg-blue-500/20 text-blue-200 border-blue-400/40', textareaFocus: 'focus:border-blue-400/50 focus:ring-blue-400/30', cardBg: 'bg-blue-900/10 border-blue-500/20 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]', badge: 'bg-blue-500/20 text-blue-200 border-blue-500/20', accent: 'text-blue-400', glass: 'bg-blue-500/5 border-blue-500/10' };
        case 'prayer for other':
        case 'prayer for others': return { activeBtn: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40', textareaFocus: 'focus:border-emerald-400/50 focus:ring-emerald-400/30', cardBg: 'bg-emerald-900/10 border-emerald-500/20 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]', badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/20', accent: 'text-emerald-400', glass: 'bg-emerald-500/5 border-emerald-500/10' };
        case 'chapter':
        case 'chapter reflection': return { activeBtn: 'bg-purple-500/20 text-purple-200 border-purple-400/40', textareaFocus: 'focus:border-purple-400/50 focus:ring-purple-400/30', cardBg: 'bg-purple-900/10 border-purple-500/20 shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]', badge: 'bg-purple-500/20 text-purple-200 border-purple-500/20', accent: 'text-purple-400', glass: 'bg-purple-500/5 border-purple-500/10' };
        default: return { activeBtn: 'bg-sky-500/20 text-sky-200 border-sky-400/40', textareaFocus: 'focus:border-sky-400/50 focus:ring-sky-400/30', cardBg: 'bg-black/20 border-white/5 hover:bg-white/5', badge: 'bg-sky-500/20 text-sky-200 border-sky-500/20', accent: 'text-sky-400', glass: 'bg-sky-500/5 border-sky-500/10' };
    }
};

const dateFormatters = new Map();
const formatDate = (value, fallback = 'N/A', lang = 'ar') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    const locale = lang === 'ar' ? 'ar-EG' : undefined;
    if (!dateFormatters.has(locale)) dateFormatters.set(locale, new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }));
    return dateFormatters.get(locale).format(date);
};

// Section markers written into the saved text by the block editor ("Pray for me" blocks write "[ PRAY FOR ME ]")
const SECTION_MARKERS = [
    { pattern: /^\[ PRAYE?R? FOR ME \]$/i, type: 'prayer for me', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    { pattern: /^\[ PRAYER FOR OTHERS \]$/i, type: 'prayer for other', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    { pattern: /^\[ CHAPTER REFLECTION \]$/i, type: 'chapter', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
];
// Delimiter marker helper for database serialization
const getPrayTypeMarker = (type) => {
    const t = (type || 'general').toLowerCase();
    switch (t) {
        case 'prayer for me': return 'PRAY FOR ME';
        case 'prayer for other':
        case 'prayer for others': return 'PRAYER FOR OTHERS';
        case 'chapter':
        case 'chapter reflection': return 'CHAPTER REFLECTION';
        default: return 'GENERAL';
    }
};
// Saved for voice-only sections because the API requires non-empty words; never shown to the user
const VOICE_ONLY_TEXT = '🎙️ Voice prayer';
const stripVoiceOnlyText = (text = '') => text.split(VOICE_ONLY_TEXT).join('');
const prayerPreview = entry => typeof entry.words === 'string' && entry.words.startsWith('enc:v1:') ? '...' : stripVoiceOnlyText(entry.words);
const SECTION_SPLIT = /(\[ PRAY FOR ME \]|\[ PRAYER FOR ME \]|\[ PRAYER FOR OTHERS \]|\[ CHAPTER REFLECTION \])/gi;

/** Split saved prayer text into ordered sections: general words first, then each marked block. */
const parsePraySections = (content) => {
    if (!content) return [];
    const sections = [];
    let current = { type: 'general', marker: null, markerClass: '', text: '' };
    content.split(SECTION_SPLIT).forEach((part) => {
        const marker = SECTION_MARKERS.find((item) => item.pattern.test(part.trim()));
        if (!marker) { current.text += part; return; }
        if (current.marker || current.text.trim()) sections.push(current);
        current = { type: marker.type, marker: part.trim(), markerClass: marker.className, text: '' };
    });
    if (current.marker || current.text.trim()) sections.push(current);
    return sections;
};

/** Assign each recording to its section: by saved position, else first section of the same type. */
const groupRecordingsBySection = (sections, recordings = []) => {
    const grouped = sections.map(() => []);
    const leftovers = [];
    recordings.forEach((rec) => {
        const byIndex = Number.isInteger(rec.sectionIndex) && sections[rec.sectionIndex]?.type === (rec.blockType || 'general') ? rec.sectionIndex : -1;
        const target = byIndex >= 0 ? byIndex : sections.findIndex((section) => section.type === (rec.blockType || 'general'));
        if (target >= 0) grouped[target].push(rec); else leftovers.push(rec);
    });
    return { grouped, leftovers };
};

function UserAvatar({ photo, name, username, size = 'sm', className = '' }) {
    const { src, markFailed } = useOfflineAvatar(username || name || photo, photo);
    const initial = (name || username || 'U').charAt(0).toUpperCase();

    const sizeClasses = {
        xs: 'w-5 h-5 text-[10px]',
        sm: 'w-7 h-7 text-xs',
        md: 'w-9 h-9 text-xs',
        lg: 'w-11 h-11 text-sm'
    }[size] || 'w-7 h-7 text-xs';

    if (src) {
        return (
            <div className={`relative rounded-full overflow-hidden shrink-0 border border-sky-400/30 bg-sky-950/40 shadow-sm ${sizeClasses} ${className}`}>
                <img
                    src={src}
                    alt={name || username || 'User'}
                    onError={markFailed}
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
            </div>
        );
    }

    return (
        <div className={`relative rounded-full bg-gradient-to-tr from-sky-500/25 via-blue-600/30 to-indigo-600/30 border border-sky-400/30 flex items-center justify-center font-bold text-sky-200 uppercase shrink-0 shadow-sm select-none ${sizeClasses} ${className}`}>
            {initial}
        </div>
    );
}

const PrayEntryContent = memo(function PrayEntryContent({ entry, recordings, onRecordingsChanged, getPrayTypeLabel }) {
    const rawWords = (entry.words && typeof entry.words === 'string' && entry.words.startsWith('enc:v1:')) ? '' : entry.words;
    const sections = useMemo(() => parsePraySections(rawWords), [rawWords]);
    const { grouped, leftovers } = useMemo(() => groupRecordingsBySection(sections, recordings), [sections, recordings]);
    return (
        <div className="mt-2 flex flex-col gap-3">
            {sections.map((section, index) => (
                <div key={index} className="text-sm text-slate-200 font-medium leading-relaxed">
                    {section.marker && section.type !== 'general' && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black border mb-1 ${section.markerClass}`}>{getPrayTypeLabel ? getPrayTypeLabel(section.type) : section.marker}</span>}
                    {stripVoiceOnlyText(section.text).trim() && <p dir="auto" className="opacity-90 whitespace-pre-wrap">{stripVoiceOnlyText(section.text).trim()}</p>}
                    <SavedPrayRecordings prayId={entry._id} recordings={grouped[index]} onChanged={onRecordingsChanged} />
                </div>
            ))}
            <SavedPrayRecordings prayId={entry._id} recordings={leftovers} getBlockLabel={getPrayTypeLabel} onChanged={onRecordingsChanged} />
        </div>
    );
});

function PrayerSyncStatus({ entry, language, actions }) {
    const job = entry._sync;
    if (!job) return null;
    const ar = language === 'ar', de = language === 'de';
    const failed = job.state === 'failed';
    const label = failed ? (ar ? '\u062a\u0639\u0630\u0631' : de ? 'Fehlgeschlagen' : 'Failed') :
        job.kind === 'save' ? (ar ? '\u062d\u0641\u0638' : de ? 'Speichern' : 'Saving') : (ar ? '\u062c\u0627\u0631\u064a \u0627\u0644\u0625\u0631\u0633\u0627\u0644' : de ? 'Senden' : 'Sending');
    return <span role="status" className={`inline-flex items-center gap-1 text-[10px] ${failed ? 'text-amber-300' : 'text-slate-400'}`}>
        {failed ? <CircleAlert className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}<span>{label}</span>
        {failed && job.retryable !== false && <button type="button" onClick={event => { event.stopPropagation(); void actions.retryPrayerAction(entry); }} className="underline underline-offset-2 font-semibold px-1 py-0.5">{ar ? '\u0625\u0639\u0627\u062f\u0629' : de ? 'Erneut' : 'Retry'}</button>}
    </span>;
}

const PrayerCard = memo(function PrayerCard({ entry, canDelete, isExpanded, isUnread, recordings, responseValue, resolveFriendProfile, myProfilePhoto, myUsername, getPrayTypeLabel, t, language, actions }) {
    const { handleConfirmSharedPrayer, handleDeletePrayTime, refreshRecordings, toggleFriendPrayerExpand, onResponseChange } = actions;
    const formattedDate = useMemo(() => formatDate(entry.date, 'N/A', language), [entry.date, language]);

    const isReceived = isReceivedPrayer(entry);
    const isSent = isSentPrayer(entry);
    const isPersonal = !isReceived && !isSent;
    const isPendingConfirmation = isReceived && (entry.sharedFrom?.status || 'pending').toLowerCase() !== 'confirmed';
    const isConfirmedReceived = isReceived && !isPendingConfirmation;
    const isSnapRow = isReceived;

    const expandedContentRef = useRef(null);
    const replyContentRef = useRef(null);
    const incomingActivity = incomingPrayerActivity(entry);
    const circleText = prayerCircleText(language);
    const sentTime = Date.parse(entry.date || '');
    const activityLabel = isUnread ? (isSent ? circleText.newReply : circleText.newPrayer) : null;
    const sentTimeLabel = useMemo(() => formatActivityTime(sentTime, language), [sentTime, language]);

    // Only expanded content actually visible on screen counts as read. Offscreen pre-rendering does not.
    useEffect(() => {
        if (!isExpanded || !isUnread) return;
        const element = isSent && entry.sharedWith?.responseWords ? replyContentRef.current : expandedContentRef.current;
        if (!element) return;
        let visible = false;
        const markVisible = () => {
            if (visible && document.visibilityState === 'visible') actions.markSeen(entry._id, incomingActivity);
        };
        const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
            visible = entries.some(item => item.isIntersecting);
            markVisible();
        });
        if (observer) observer.observe(element);
        const checkViewport = () => {
            const rect = element.getBoundingClientRect();
            visible = rect.bottom > 0 && rect.top < innerHeight;
            markVisible();
        };
        if (!observer) {
            checkViewport();
            window.addEventListener('scroll', checkViewport, { passive: true });
            window.addEventListener('resize', checkViewport);
        }
        document.addEventListener('visibilitychange', markVisible);
        return () => {
            observer?.disconnect();
            window.removeEventListener('scroll', checkViewport);
            window.removeEventListener('resize', checkViewport);
            document.removeEventListener('visibilitychange', markVisible);
        };
    }, [entry._id, entry.sharedWith?.responseWords, incomingActivity, isSent, isExpanded, isUnread, actions]);

    const senderInfo = resolveFriendProfile(entry.sharedFrom, true);
    const targetInfo = resolveFriendProfile(entry.sharedWith, false);
    const senderUsername = senderInfo.username || 'friend';
    const targetUsername = targetInfo.username || 'friend';
    const isAnonReceived = Boolean(senderInfo.isAnonymous || entry.sharedFrom?.isAnonymous);

    if (isPersonal) {
        return (
            <div key={entry._id} data-prayer-id={String(entry._id)} style={PRAYER_CARD_RENDERING} className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 ${getPrayTypeStyle(entry.prayType).cardBg}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        {entry.prayType && entry.prayType !== 'general' && (
                            <span className="bg-white/10 text-white/80 text-[10px] font-black px-2 py-0.5 rounded-md border border-white/10">{getPrayTypeLabel(entry.prayType)}</span>
                        )}
                        <span className="text-[10px] text-slate-500 font-bold">{formattedDate}</span>
                        <PrayerSyncStatus entry={entry} language={language} actions={actions} />
                    </div>
                    {canDelete && <div className="flex gap-2">
                        <button onClick={() => handleDeletePrayTime(entry._id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5" title={t('deleteNote')}><Trash2 className="w-4 h-4" /></button>
                    </div>}
                </div>
                <PrayEntryContent entry={entry} recordings={recordings} onRecordingsChanged={refreshRecordings} getPrayTypeLabel={getPrayTypeLabel} />
            </div>
        );
    }

    if (isSent) {
        const isConfirmed = (targetInfo.status || entry.sharedWith?.status) === 'confirmed';
        const isAnonSent = Boolean(entry.sharedWith?.isAnonymous);
        return (
            <div key={entry._id} data-prayer-id={String(entry._id)} data-prayer-unread={isUnread ? 'true' : 'false'} style={isExpanded ? undefined : PRAYER_CARD_RENDERING}
                className="rounded-2xl border transition-colors duration-150 overflow-hidden bg-white/[0.03] border-white/10 hover:border-sky-400/30">
                <div
                    onClick={() => toggleFriendPrayerExpand(entry._id)}
                    className="flex items-center justify-between p-3.5 sm:p-4 cursor-pointer hover:bg-white/[0.04] transition-colors gap-3 select-none"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                            <UserAvatar
                                photo={myProfilePhoto}
                                username={myUsername}
                                size="md"
                            />
                            {isConfirmed ? (
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center ring-2 ring-slate-900 shadow-sm" title="Replied">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </span>
                            ) : (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-500 ring-2 ring-slate-900" />
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-xs sm:text-sm font-bold text-white truncate">
                                    You:
                                </span>
                                {isAnonSent && (
                                    <span className="bg-indigo-500/15 text-indigo-300 text-[9px] font-semibold px-2 py-0.5 rounded-md border border-indigo-500/20 shrink-0 inline-flex items-center gap-1">
                                        <EyeOff className="w-2.5 h-2.5" />
                                        Anonymous
                                    </span>
                                )}
                                {entry.prayType && entry.prayType !== 'general' && (
                                    <span className="bg-white/10 text-white/70 text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-md border border-white/10 shrink-0">
                                        {getPrayTypeLabel(entry.prayType)}
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-medium">
                                {isAnonSent ? circleText.sentAnonymouslyTo : circleText.sentTo} @{targetUsername}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                                {activityLabel && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-300">{activityLabel}</span>}
                                <time className="text-[10px] text-slate-500" dateTime={sentTime ? new Date(sentTime).toISOString() : undefined}>{sentTimeLabel}</time>
                                <PrayerSyncStatus entry={entry} language={language} actions={actions} />
                            </div>
                        </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                        {canDelete && <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePrayTime(entry._id);
                            }}
                            className="p-1.5 sm:p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5"
                            title={t('deleteNote')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>}
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-[#00C2FF]' : ''}`} />
                    </div>
                </div>

                {isExpanded && (
                    <div ref={expandedContentRef} className="p-4 sm:p-5 pt-3.5 border-t border-white/5">
                        <PrayEntryContent entry={entry} recordings={recordings} onRecordingsChanged={refreshRecordings} getPrayTypeLabel={getPrayTypeLabel} />
                        {isConfirmed && (entry.sharedWith?.responseWords || targetInfo.responseWords) && (
                            <div ref={replyContentRef} className="mt-3.5 pt-3 border-t border-white/10 flex flex-col gap-2 text-xs bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                <div className="flex items-center gap-2">
                                    <UserAvatar
                                        photo={targetInfo.profilePhoto}
                                        name={targetInfo.name}
                                        username={targetInfo.username}
                                        size="xs"
                                    />
                                    <span className="text-[11px] text-[#00C2FF] font-semibold flex items-center gap-1.5">
                                        @{targetUsername} replay:
                                    </span>
                                </div>
                                <p dir="auto" className="text-xs text-slate-300 italic leading-relaxed whitespace-pre-wrap pl-2 border-l-2 border-[#00C2FF]/40">
                                    {entry.sharedWith?.responseWords || targetInfo.responseWords}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div key={entry._id} data-prayer-id={String(entry._id)} data-prayer-unread={isUnread ? 'true' : 'false'} style={isExpanded ? undefined : PRAYER_CARD_RENDERING}
            className="rounded-2xl border transition-colors duration-150 overflow-hidden bg-white/[0.03] border-white/10 hover:border-sky-400/30">
            {isSnapRow && (
                <div
                    onClick={() => toggleFriendPrayerExpand(entry._id)}
                    className="flex items-center justify-between p-3.5 sm:p-4 cursor-pointer hover:bg-white/[0.04] transition-colors gap-3 select-none"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                            {isAnonReceived ? (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 shadow-sm" title="Anonymous">
                                    <EyeOff className="w-4 h-4" />
                                </div>
                            ) : (
                                <UserAvatar
                                photo={senderInfo.profilePhoto}
                                name={senderInfo.name}
                                username={senderInfo.username}
                                size="md"
                            />
                        )}
                            {isConfirmedReceived ? (
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center ring-2 ring-slate-900 shadow-sm" title="Replied">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </span>
                            ) : isUnread ? (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-400 ring-2 ring-slate-900" aria-hidden="true" />
                            ) : (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-500 ring-2 ring-slate-900" />
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                {isAnonReceived ? (
                                    <span className="bg-indigo-500/15 text-indigo-300 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md border border-indigo-500/20 shrink-0 inline-flex items-center gap-1">
                                        <EyeOff className="w-3 h-3" />
                                        Anonymous
                                    </span>
                                ) : (
                                    <span className={`text-xs sm:text-sm truncate ${isUnread ? 'font-bold text-sky-300' : 'font-semibold text-slate-200'}`}>
                                        @{senderUsername}
                                    </span>
                                )}
                                {entry.prayType && entry.prayType !== 'general' && (
                                    <span className="bg-white/10 text-white/70 text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-md border border-white/10 shrink-0">
                                        {getPrayTypeLabel(entry.prayType)}
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-medium">{isAnonReceived ? circleText.sentAnonymous : circleText.sentPrayer}</span>
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                                {activityLabel && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-300">{activityLabel}</span>}
                                <time className="text-[10px] text-slate-500" dateTime={sentTime ? new Date(sentTime).toISOString() : undefined}>{sentTimeLabel}</time>
                                <PrayerSyncStatus entry={entry} language={language} actions={actions} />
                            </div>
                        </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-[#00C2FF]' : ''}`} />
                    </div>
                </div>
            )}

            {(!isSnapRow || isExpanded) && (
                <div ref={expandedContentRef} className={isSnapRow ? 'p-4 sm:p-5 pt-3.5 border-t border-white/5' : ''}>
                    {!isSnapRow && (
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {isAnonReceived ? (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 shadow-sm" title="Anonymous">
                                        <EyeOff className="w-4 h-4" />
                                    </div>
                                ) : (
                                    <UserAvatar
                                    photo={senderInfo.profilePhoto}
                                    name={senderInfo.name}
                                    username={senderInfo.username}
                                    size="md"
                                />
                            )}
                                <div className="min-w-0 flex flex-col">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {isAnonReceived ? (
                                            <span className="bg-indigo-500/15 text-indigo-300 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md border border-indigo-500/20 shrink-0 inline-flex items-center gap-1">
                                                <EyeOff className="w-3 h-3" />
                                                Anonymous
                                            </span>
                                        ) : (
                                            <span className="text-xs sm:text-sm font-bold text-[#00C2FF] truncate">
                                                @{senderUsername}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-medium">
                                        {formattedDate}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {isConfirmedReceived ? (
                        <>
                            <div className="mt-2 text-sm text-slate-100 font-medium leading-relaxed whitespace-pre-wrap">
                                {(typeof entry.words === 'string' && entry.words.startsWith('enc:v1:')) ? '...' : stripVoiceOnlyText(entry.words).trim()}
                            </div>
                            <SavedPrayRecordings prayId={entry._id} recordings={recordings} onChanged={refreshRecordings} />

                            {entry.sharedFrom?.responseWords && (
                                <div className="mt-3.5 pt-3 border-t border-white/10 flex flex-col gap-2 text-xs bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <UserAvatar
                                            photo={myProfilePhoto}
                                            username={myUsername}
                                            size="xs"
                                        />
                                        <span className="text-[11px] text-[#00C2FF] font-semibold flex items-center gap-1.5">
                                            You:
                                        </span>
                                    </div>
                                    <p dir="auto" className="text-xs text-slate-300 italic leading-relaxed whitespace-pre-wrap pl-2 border-l-2 border-[#00C2FF]/40">
                                        {entry.sharedFrom?.responseWords}
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div dir="auto" className="mt-2 text-sm text-slate-100 font-medium leading-relaxed whitespace-pre-wrap">
                                {(typeof entry.words === 'string' && entry.words.startsWith('enc:v1:')) ? '...' : stripVoiceOnlyText(entry.words).trim()}
                            </div>
                            <SavedPrayRecordings prayId={entry._id} recordings={recordings} onChanged={refreshRecordings} />

                            <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2.5">
                                <div className="flex items-start gap-2.5">
                                    <UserAvatar
                                        photo={myProfilePhoto}
                                        username={myUsername}
                                        size="sm"
                                    />
                                    <div className="flex-1 flex flex-col gap-2">
                                        <textarea
                                            dir="auto"
                                            rows={3}
                                            value={responseValue}
                                            onChange={(e) => onResponseChange(entry._id, e.target.value)}
                                            placeholder={`Write prayer response to ${isAnonReceived ? 'Anonymous Friend' : `@${senderUsername}`}...`}
                                            className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2FF]/60 transition-all resize-none leading-relaxed"
                                        />
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => handleConfirmSharedPrayer(entry._id)}
                                                className="px-4 py-2 text-xs font-bold bg-[#00C2FF] text-[#020817] hover:brightness-110 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-[#00C2FF]/20 disabled:opacity-50"
                                            >
                                                <span>Send reply</span>
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );

});

const ListPanel = memo(function ListPanel({ title, icon: Icon, items, emptyText, renderItem, forceRenderId }) {
    return (
        <div className="flex flex-col rounded-3xl border border-white/5 bg-white/[0.03] backdrop-blur-2xl shadow-xl shadow-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 p-4 sm:p-5 bg-black/20">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">{title}</h2>
            </div>
            <div className="flex-1 p-3 sm:p-5 space-y-2.5">
                {items.length > 0 ? <RetainedPrayerList items={items} renderItem={renderItem} forceRenderId={forceRenderId} preview={prayerPreview} /> : (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-[200px]">
                        <Icon className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-xs font-semibold">{emptyText}</p>
                    </div>
                )}
            </div>
        </div>
    );
});

export default function PrayPage() {
    const mountedRef = useRef(true);
    const deletionSyncRef = useRef(null);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);
    const { user_id: userId, isLogin: token, username: contextUsername, profilePhoto: contextProfilePhoto } = useContext(UserContext);
    const [profile, setProfile] = useState(null);
    const [pageLoading, setPageLoading] = useState(true);

    const myUsername = profile?.user?.username || contextUsername || (typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Username') : null) || 'me';
    const myProfilePhoto = profile?.user?.profilePhoto || contextProfilePhoto || (typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_ProfilePhoto') : null) || null;

    const [isShareOpen, setIsShareOpen] = useState(false);
    const [selectedShareUser, setSelectedShareUser] = useState(null);
    const [isAnonymousShare, setIsAnonymousShare] = useState(false);
    const [showShareSettings, setShowShareSettings] = useState(false);
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(false);
    const [shareSearchQuery, setShareSearchQuery] = useState('');
    const [systemSearchResults, setSystemSearchResults] = useState([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);

    const fetchFriends = useCallback(async () => {
        if (!token) return;
        try {
            setLoadingFriends(true);
            const cached = await readFriendsCache(userId);
            if (cached?.friends) {
                setFriends(cached.friends);
                setLoadingFriends(false);
            }
            if (isFriendsCacheFresh(cached?.friendsSyncedAt)) return;

            const data = await readTabJson(`${API_URL}/users/friends`, token);
            const freshFriends = data.friends || [];
            setFriends(freshFriends);
            await writeFriendsCache(userId, {
                ...(cached || {}),
                friends: freshFriends,
                friendsSyncedAt: Date.now(),
                updatedAt: Date.now()
            });
        } catch (err) {
            console.error('Failed to load friends:', err);
        } finally {
            setLoadingFriends(false);
        }
    }, [token, userId]);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    const resolveFriendProfile = useCallback((party, isSender = false) => {
        if (!party) return { username: 'friend', name: '', profilePhoto: null, status: 'pending' };
        if (isSender && party.isAnonymous) {
            return {
                userId: null,
                username: 'Anonymous',
                name: 'Anonymous Friend',
                profilePhoto: null,
                status: party.status || 'pending',
                responseWords: party.responseWords || '',
                respondedAt: party.respondedAt || null,
                shareId: party.shareId || null,
                isAnonymous: true
            };
        }
        const pUserId = party.userId ? party.userId.toString() : null;
        const pUsername = party.username && party.username !== 'Anonymous' ? party.username.toLowerCase() : null;

        const matched = friends.find((f) => {
            const fId = (f._id || f.id)?.toString();
            const fUser = f.username?.toLowerCase();
            return (pUserId && fId === pUserId) || (pUsername && fUser === pUsername);
        });

        return {
            userId: party.userId || matched?._id || matched?.id,
            username: (matched?.username || (party.username !== 'Anonymous' ? party.username : null)) || 'friend',
            name: matched?.Name || (party.name !== 'Anonymous Friend' ? party.name : '') || matched?.username || '',
            profilePhoto: matched?.profilePhoto || party.profilePhoto || null,
            status: party.status || 'pending',
            responseWords: party.responseWords || '',
            respondedAt: party.respondedAt || null,
            shareId: party.shareId || null
        };
    }, [friends]);

    useEffect(() => {
        const clean = shareSearchQuery.trim().replace(/^@/, '');
        if (clean.length < 2) {
            setSystemSearchResults([]);
            setIsSearchingUsers(false);
            return;
        }
        setIsSearchingUsers(true);
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/users/search-username?q=${encodeURIComponent(clean)}`, { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    if (!controller.signal.aborted) setSystemSearchResults(data || []);
                }
            } catch {
                if (!controller.signal.aborted) setSystemSearchResults([]);
            } finally {
                if (!controller.signal.aborted) setIsSearchingUsers(false);
            }
        }, 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [shareSearchQuery]);

    const getSortedShareResults = () => {
        const cleanQuery = shareSearchQuery.trim().replace(/^@/, '').toLowerCase();
        if (!cleanQuery) {
            return friends.map((f) => ({ ...f, isFriend: true }));
        }

        const matchingFriends = friends.filter((f) =>
            f.username?.toLowerCase().includes(cleanQuery) ||
            f.Name?.toLowerCase().includes(cleanQuery)
        ).map((f) => ({ ...f, isFriend: true }));

        const friendIds = new Set(friends.map((f) => (f._id || f).toString()));
        const nonFriendMatches = systemSearchResults
            .filter((u) => !friendIds.has(u._id.toString()) && u._id.toString() !== userId?.toString())
            .map((u) => ({ ...u, isFriend: false }));

        const exactMatchUser = nonFriendMatches.find((u) => u.username?.toLowerCase() === cleanQuery);

        if (exactMatchUser) {
            return [
                { ...exactMatchUser, isExact: true },
                ...matchingFriends,
                ...nonFriendMatches.filter((u) => u._id.toString() !== exactMatchUser._id.toString())
            ];
        }

        return [...matchingFriends, ...nonFriendMatches];
    };

    const [responseInputs, setResponseInputs] = useState({});
    const [localActivityId, setLocalActivityId] = useState('');
    const handleSelectShareUser = (targetUser) => {
        setSelectedShareUser(targetUser);
        setShowShareSettings(false);
        setIsShareOpen(false);
    };

    const handleConfirmSharedPrayer = (prayId, quickReplyText) => {
        const current = prayList.find(entry => String(entry._id) === String(prayId));
        if (!current || current._sync || current.sharedFrom?.status === 'confirmed') return;
        const responseText = ((quickReplyText ?? responseInputs[prayId]) || 'Amen 🙏').trim();
        const entry = { ...current, sharedFrom: { ...current.sharedFrom, status: 'confirmed',
            responseWords: responseText, respondedAt: new Date().toISOString(),
            seenActivityBy: { ...current.sharedFrom?.seenActivityBy, [String(userId || 'guest')]: incomingPrayerActivity(current) } },
            _sync: newPrayerAction('reply', userId) };
        setGuestPrays(previous => previous.map(item => item._id === prayId ? entry : item));
        setLocalActivityId(entry._sync.requestId);
        setResponseInputs(previous => { const next = { ...previous }; delete next[prayId]; return next; });
        void preparePrayerAction(entry);
    };

    useEffect(() => {
        if (!token || !userId) {
            setPageLoading(false);
            return;
        }
        let ignore = false;
        const loadProfile = async () => {
            try {
                const cachedData = await readCachedProfile(userId);
                if (cachedData && !ignore) {
                    setProfile(cachedData);
                    setPageLoading(false);
                }
                const newProfileData = await refreshProfile(API_URL, token, userId);
                if (ignore) return;
                setProfile(newProfileData);
            } catch (err) {
                console.error(err);
            } finally {
                if (!ignore) setPageLoading(false);
            }
        };
        loadProfile();
        return () => { ignore = true; };
    }, [token, userId]);

    useEffect(() => {
        let ignore = false;
        const handleFocus = async () => {
            if (!token || !userId) return;
            try {
                const newProfileData = await refreshProfile(API_URL, token, userId, { force: true });
                if (!ignore) setProfile(newProfileData);
            } catch { }
        };
        window.addEventListener('focus', handleFocus);
        return () => { ignore = true; window.removeEventListener('focus', handleFocus); };
    }, [token, userId]);

    const { t, language } = useLanguage();

    const [prayWords, setPrayWords] = useState('');
    const [prayBlocks, setPrayBlocks] = useState([]);
    const [recordingsIndex, setRecordingsIndex] = useState({});
    const [generalRecordings, setGeneralRecordings] = useState([]);
    // All prayers are stored 100% on this device
    const isGuest = !token || !userId;
    const [guestPrays, setGuestPraysState] = useState([]);
    const setGuestPrays = useCallback(next => setGuestPraysState(previous => {
        const incoming = typeof next === 'function' ? next(previous) : next;
        const overlay = localPrayerOverlay();
        const ids = new Set(overlay.map(entry => String(entry._id)));
        return reconcilePrayerEntries(previous, [...overlay.filter(entry => !entry._sync?.hidden), ...incoming.filter(entry => !entry._sync?.hidden && !ids.has(String(entry._id)))]);
    }), []);
    const rawPrayList = guestPrays;
    const prayList = useMemo(() => Array.from(new Map(rawPrayList.map(item => [String(item._id || item.date), item])).values()), [rawPrayList]);
    const { personalPrayList, receivedPrayList, sentPrayList } = useMemo(() => {
        const personalPrayList = [], receivedPrayList = [], sentPrayList = [];
        for (const entry of prayList) {
            if (isPersonalPrayer(entry)) personalPrayList.push(entry);
            if (isSentPrayer(entry)) sentPrayList.push(entry);
            if (isReceivedPrayer(entry)) {
                receivedPrayList.push(entry);
            }
        }
        return { personalPrayList, receivedPrayList, sentPrayList };
    }, [prayList]);
    const deleteCandidates = useMemo(() => [...personalPrayList, ...sentPrayList.filter(entry => entry.sharedWith?.shareId)].filter(entry => !entry._sync), [personalPrayList, sentPrayList]);
    const deletablePrayerIds = usePrayerDeleteWindow(deleteCandidates);

    const [activePrayTab, setActivePrayTab] = useState('personal');
    const [circleFilter, setCircleFilter] = useState('all');
    const [expandedFriendPrayers, setExpandedFriendPrayers] = useState(() => new Set());
    // Compatibility only. New read state belongs to each prayer and is scoped to the account.
    const [legacyOpenedFriendPrayers] = useState(() => {
        if (typeof window === 'undefined') return new Set();
        try { return new Set(JSON.parse(localStorage.getItem('taspe7_opened_friend_prayers') || '[]').map(String)); }
        catch { return new Set(); }
    });
    const sortedSharedPrays = useMemo(() => sortPrayerActivity([...receivedPrayList, ...sentPrayList]), [receivedPrayList, sentPrayList]);
    const unreadPrayerIds = useMemo(() => new Set(sortedSharedPrays.filter(entry => isPrayerUnread(entry, userId, legacyOpenedFriendPrayers)).map(entry => String(entry._id))), [sortedSharedPrays, userId, legacyOpenedFriendPrayers]);
    const visiblePrayList = useMemo(() => {
        if (activePrayTab === 'personal') return personalPrayList;
        return sortedSharedPrays.filter(entry => {
            if (circleFilter === 'sent') return isSentPrayer(entry);
            if (circleFilter === 'received') return isReceivedPrayer(entry);
            // Keep an opened unread result mounted while the user writes their response.
            if (circleFilter === 'unread') return unreadPrayerIds.has(String(entry._id)) || expandedFriendPrayers.has(entry._id);
            return true;
        });
    }, [activePrayTab, circleFilter, personalPrayList, sortedSharedPrays, unreadPrayerIds, expandedFriendPrayers]);

    const [notificationTarget, setNotificationTarget] = useState(null);
    const [notificationPrayerId, setNotificationPrayerId] = useState(null);
    const notificationScrolled = useRef(false);
    const notificationTargetRef = useRef(null);

    useLayoutEffect(() => {
        const openTarget = (target) => {
            notificationTargetRef.current = target;
            notificationScrolled.current = false;
            setNotificationPrayerId(null);
            setNotificationTarget(target);
            setActivePrayTab('shared');
            setCircleFilter('all');
        };
        const target = readPrayerNotificationTarget(window.location.search);
        if (target) openTarget(target);
        const handleOpen = (event) => {
            if (!event.detail?.href) return;
            const url = new URL(event.detail.href, window.location.origin);
            event.preventDefault();
            openTarget(readPrayerNotificationTarget(url.search));
        };
        window.addEventListener('taspe7:open-prayer', handleOpen);
        return () => window.removeEventListener('taspe7:open-prayer', handleOpen);
    }, []);

    // The target can arrive from local storage or the inbox sync. Expand it once,
    // without changing the card's styling or preventing the user from closing it.
    useLayoutEffect(() => {
        if (!notificationTarget || notificationPrayerId !== null) return;
        const prayer = findNotificationPrayer(guestPrays, notificationTarget);
        if (!prayer) return;
        // A reply push can arrive before its payload. Do not open/clear the older sent content.
        if (notificationTarget.type === 'PRAY_CONFIRMED' && prayer.sharedWith?.status !== 'confirmed') return;
        setNotificationPrayerId(String(prayer._id));
        setExpandedFriendPrayers((prev) => new Set(prev).add(prayer._id));
    }, [guestPrays, notificationTarget, notificationPrayerId]);

    useLayoutEffect(() => {
        if (notificationPrayerId === null || notificationScrolled.current) return;
        const card = Array.from(document.querySelectorAll('[data-prayer-id]'))
            .find((element) => element.dataset.prayerId === notificationPrayerId);
        if (!card) return;
        notificationScrolled.current = true;
        card.scrollIntoView({ behavior: 'instant', block: 'center' });
    }, [notificationPrayerId, activePrayTab, circleFilter]);

    const unreadPrayCount = unreadPrayerIds.size;
    const unreadReceivedCount = receivedPrayList.filter(entry => unreadPrayerIds.has(String(entry._id))).length;
    const circleText = prayerCircleText(language);
    const circleAnchorRef = useRef(null);
    const { visibleItems: orderedPrayList, pendingUpdates, revealUpdates } = usePrayerCircleOrder(visiblePrayList, `${userId || 'guest'}:${activePrayTab}:${circleFilter}`, circleAnchorRef, `${notificationPrayerId || ''}:${localActivityId}`);
    const seenWrites = useRef(new Set());
    const markSeen = useCallback(async (id, activity) => {
        const key = `${userId || 'guest'}:${id}:${activity}`;
        if (seenWrites.current.has(key)) return;
        seenWrites.current.add(key);
        setGuestPrays(previous => previous.map(entry => {
            if (String(entry._id) !== String(id)) return entry;
            const changes = seenPrayerChanges(entry, userId, activity);
            return changes ? { ...entry, ...changes } : entry;
        }));
        try {
            await markPrayerActivitySeen(id, userId, activity);
        } catch (error) { console.warn('Could not save prayer read state:', error); }
        finally { seenWrites.current.delete(key); }
    }, [userId, setGuestPrays]);

    const toggleFriendPrayerExpand = (id) => {
        setExpandedFriendPrayers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getPrayTypeLabel = useCallback((value) => {
        const v = (value || 'general').toLowerCase();
        switch (v) {
            case 'prayer for me': return t('prayerForMe');
            case 'prayer for other':
            case 'prayer for others': return t('prayerForOthers');
            case 'chapter':
            case 'chapter reflection': return t('chapterReflection');
            default: return t('generalPrayer');
        }
    }, [t]);

    const refreshRecordings = useCallback(() => {
        getRecordingsIndex().then(next => setRecordingsIndex(previous => reconcilePrayerRecordings(previous, next)))
            .catch((err) => console.warn('Could not load prayer recordings:', err));
    }, []);

    useEffect(() => { refreshRecordings(); }, [refreshRecordings]);
    useEffect(() => {
        let active = true;
        let sequence = 0;
        const refresh = async event => {
            const current = ++sequence;
            const localFailure = event?.detail?.entry;
            const entries = await getGuestPrays();
            if (!active || current !== sequence) return;
            if (localFailure) setGuestPrays(previous => [localFailure, ...previous.filter(entry => entry._id !== localFailure._id)]);
            else setGuestPrays(entries);
            refreshRecordings();
        };
        window.addEventListener(PRAYER_SYNC_EVENT, refresh);
        return () => { active = false; window.removeEventListener(PRAYER_SYNC_EVENT, refresh); };
    }, [setGuestPrays, refreshRecordings]);


    useEffect(() => {
        let isCancelled = false;
        const loadAndRepairPrays = async () => {
            try {
                const locals = await migratePrayerReadState(userId, legacyOpenedFriendPrayers);
                if (!isCancelled) setGuestPrays(locals);

                if (token && Array.isArray(locals)) {
                    const encryptedItems = [];
                    locals.forEach((p) => {
                        if (typeof p.words === 'string' && p.words.startsWith('enc:v1:')) {
                            encryptedItems.push({ id: p._id, field: 'words', text: p.words });
                        }
                        if (typeof p.sharedFrom?.responseWords === 'string' && p.sharedFrom.responseWords.startsWith('enc:v1:')) {
                            encryptedItems.push({ id: p._id, field: 'sharedFrom.responseWords', text: p.sharedFrom.responseWords });
                        }
                        if (typeof p.sharedWith?.responseWords === 'string' && p.sharedWith.responseWords.startsWith('enc:v1:')) {
                            encryptedItems.push({ id: p._id, field: 'sharedWith.responseWords', text: p.sharedWith.responseWords });
                        }
                    });

                    if (encryptedItems.length > 0) {
                        const res = await fetch(`${API_URL}/users/pray-time/decrypt`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify({ texts: encryptedItems.map((item) => item.text) })
                        });
                        if (res.ok) {
                            const { decrypted } = await res.json();
                            let changed = false;
                            for (let i = 0; i < encryptedItems.length; i++) {
                                const item = encryptedItems[i];
                                const plain = decrypted?.[i];
                                if (plain && plain !== item.text) {
                                    changed = true;
                                    if (item.field === 'words') {
                                        await updateGuestPray(item.id, { words: plain });
                                    } else if (item.field === 'sharedFrom.responseWords') {
                                        const current = (await getGuestPrays()).find((e) => String(e._id) === String(item.id));
                                        await updateGuestPray(item.id, {
                                            sharedFrom: { ...(current?.sharedFrom || {}), responseWords: plain }
                                        });
                                    } else if (item.field === 'sharedWith.responseWords') {
                                        const current = (await getGuestPrays()).find((e) => String(e._id) === String(item.id));
                                        await updateGuestPray(item.id, {
                                            sharedWith: { ...(current?.sharedWith || {}), responseWords: plain }
                                        });
                                    }
                                }
                            }
                            if (changed && !isCancelled) {
                                setGuestPrays(await getGuestPrays());
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('Could not load or decrypt local prayers:', err);
            }
        };

        loadAndRepairPrays();
        return () => { isCancelled = true; };
    }, [token, userId, legacyOpenedFriendPrayers, setGuestPrays]);

    // One-time import for existing users who already had prayers in MongoDB
    useEffect(() => {
        if (!profile?.prayTime?.length) return;
        getGuestPrays().then(async (locals) => {
            const localMap = new Map(locals.map((p) => [String(p._id), p]));
            let changed = false;

            for (const item of profile.prayTime) {
                if (!item?.words) continue;
                const existing = localMap.get(String(item._id));
                if (!existing) {
                    await addGuestPray({
                        _id: item._id,
                        words: item.words,
                        prayType: item.prayType || 'general',
                        date: item.date,
                        sharedWith: item.sharedWith,
                        sharedFrom: item.sharedFrom
                    });
                    changed = true;
                } else if (typeof existing.words === 'string' && existing.words.startsWith('enc:v1:') && !item.words.startsWith('enc:v1:')) {
                    await updateGuestPray(existing._id, { words: item.words });
                    changed = true;
                }
            }

            if (changed) {
                setGuestPrays(await getGuestPrays());
            }
        }).catch(() => {});
    }, [profile?.prayTime, setGuestPrays]);

    // Check for incoming shared prayers from Cloudflare R2
    const checkIncomingSharedPrayers = useCallback(async (force = false) => {
        if (!token || !userId) return;
        await runSessionTask(tabReadKey(`${API_URL}/users/pray-time/inbox`, token), async () => {
            try {
                if (deletionSyncRef.current?.owner !== userId) deletionSyncRef.current = { owner: userId, ...(await getPrayerDeletionState(userId)) };
                const sync = deletionSyncRef.current;
                const query = sync.cursor ? `?deletedSince=${encodeURIComponent(sync.cursor)}` : '';
                const { inbox, deletedShareIds = [], deletionCursor } = await readTabJson(`${API_URL}/users/pray-time/inbox${query}`, token, { maxAge: 0 });
                const unseenDeletions = deletedShareIds.filter(id => !sync.seen.has(String(id)));
                if (unseenDeletions.length || (deletionCursor && deletionCursor !== sync.cursor)) {
                    const removed = await applyPrayerRevocations(unseenDeletions, userId, deletionCursor);
                    for (const id of deletedShareIds) sync.seen.add(String(id));
                    if (deletionCursor) sync.cursor = deletionCursor;
                    if (removed.prayers && mountedRef.current) { setGuestPrays(removed.prayers); refreshRecordings(); }
                }
                const liveInbox = Array.isArray(inbox) ? inbox.filter(bundle => !sync.seen.has(String(bundle.shareId))) : [];
                if (!liveInbox.length) return;

                const target = notificationTargetRef.current;
                const prioritizedInbox = target?.type === 'PRAY_SHARED'
                    ? [...liveInbox].sort((a, b) => Number(String(b.shareId) === target.shareId) - Number(String(a.shareId) === target.shareId))
                    : liveInbox;
                const result = await mergeIncomingPrayers(prioritizedInbox);
                if (result.prayers && mountedRef.current) setGuestPrays(result.prayers);
                let audioChanged = false;
                // Save text first, then audio, then acknowledge durable delivery.
                const knownRecordings = await getRecordingsIndex();
                for (const bundle of prioritizedInbox) {
                    const localId = `received-${bundle.shareId}`;
                    const existingIds = new Set((knownRecordings[localId] || []).map(rec => rec.id));
                    for (const rec of bundle.recordings || []) {
                        if (rec.data && !existingIds.has(rec.id)) {
                            await addExternalRecording(localId, rec, rec.data);
                            existingIds.add(rec.id);
                            audioChanged = true;
                        }
                    }
                    void fetch(`${API_URL}/users/pray-time/ack`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ shareId: bundle.shareId })
                    }).catch(() => {});
                }
                if (audioChanged && mountedRef.current) refreshRecordings();
            } catch (err) {
                console.warn('Inbox check error:', err);
            }
        }, { force });
    }, [token, userId, refreshRecordings, setGuestPrays]);

    // Check for confirmations of prayers sent to others
    const checkSentPrayUpdates = useCallback(async (force = false) => {
        if (!token || !userId) return;
        await runSessionTask(tabReadKey(`${API_URL}/users/pray-time/sent-updates`, token), async () => {
            try {
                const { updates } = await readTabJson(`${API_URL}/users/pray-time/sent-updates`, token, { maxAge: 0 });
                if (!Array.isArray(updates) || !updates.length) return;

                const result = await applyPrayerReplies(updates);
                if (result.prayers && mountedRef.current) setGuestPrays(result.prayers);
                for (const shareId of result.acknowledged) {
                    void fetch(`${API_URL}/users/pray-time/sent-ack`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ shareId })
                    }).catch(() => {});
                }

            } catch (err) {
                console.warn('Sent updates check error:', err);
            }
        }, { force });
    }, [token, userId, setGuestPrays]);

    useEffect(() => {
        if (!notificationTarget) return;
        checkIncomingSharedPrayers(true);
        checkSentPrayUpdates(true);
    }, [notificationTarget, checkIncomingSharedPrayers, checkSentPrayUpdates]);

    useEffect(() => {
        checkIncomingSharedPrayers();
        checkSentPrayUpdates();
        const refresh = () => {
            if (document.visibilityState !== 'visible') return;
            checkIncomingSharedPrayers(true);
            checkSentPrayUpdates(true);
        };
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        const interval = setInterval(refresh, 15000);
        window.addEventListener('taspe7:prayer-push', refresh);
        window.addEventListener('online', refresh);
        document.addEventListener('visibilitychange', refreshWhenVisible);
        return () => {
            clearInterval(interval);
            window.removeEventListener('taspe7:prayer-push', refresh);
            window.removeEventListener('online', refresh);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, [checkIncomingSharedPrayers, checkSentPrayUpdates]);


    const recorder = usePrayRecorder((blockId, recording) => {
        if (blockId === GENERAL_BLOCK_ID) {
            setGeneralRecordings((recordings) => [...recordings, { id: `${Date.now()}`, ...recording }]);
            return;
        }
        setPrayBlocks((blocks) => blocks.map((block) => block.id === blockId
            ? { ...block, recordings: [...(block.recordings || []), { id: `${Date.now()}`, ...recording }] }
            : block));
    });

    const revokeBlockUrls = (blocks) => blocks.forEach((block) => (block.recordings || []).forEach((rec) => URL.revokeObjectURL(rec.url)));

    const resetPrayForm = () => {
        if (recorder.isRecording) recorder.cancel();
        revokeBlockUrls([...prayBlocks, { recordings: generalRecordings }]);
        setPrayWords(''); setPrayBlocks([]); setGeneralRecordings([]); setSelectedShareUser(null); setIsAnonymousShare(false); setShowShareSettings(false);
    };
    const removeGeneralRecording = (recId) => setGeneralRecordings((recordings) => {
        recordings.filter((rec) => rec.id === recId).forEach((rec) => URL.revokeObjectURL(rec.url));
        return recordings.filter((rec) => rec.id !== recId);
    });
    const handleAddBlock = (type) => setPrayBlocks([...prayBlocks, { id: Date.now(), prayType: type, words: '', recordings: [] }]);
    const updateBlockWords = (id, words) => setPrayBlocks(prayBlocks.map((block) => block.id === id ? { ...block, words } : block));
    const removeBlock = (id) => {
        if (recorder.recordingBlockId === id) recorder.cancel();
        revokeBlockUrls(prayBlocks.filter((block) => block.id === id));
        setPrayBlocks(prayBlocks.filter((block) => block.id !== id));
    };
    const removePendingRecording = (blockId, recId) => setPrayBlocks((blocks) => blocks.map((block) => {
        if (block.id !== blockId) return block;
        (block.recordings || []).filter((rec) => rec.id === recId).forEach((rec) => URL.revokeObjectURL(rec.url));
        return { ...block, recordings: (block.recordings || []).filter((rec) => rec.id !== recId) };
    }));

    const hasBlockContent = (block) => block.words.trim() || (block.recordings || []).length > 0;

    const handleSubmitPrayTime = () => {
        if (recorder.isRecording) return;
        const blocks = prayBlocks.filter(hasBlockContent);
        const extraText = blocks.map(block => `\n\n[ ${getPrayTypeMarker(block.prayType)} ]\n${block.words.trim() || VOICE_ONLY_TEXT}`).join('');
        const generalText = prayWords.trim() || (generalRecordings.length ? VOICE_ONLY_TEXT : '');
        const words = (generalText + extraText).trim();
        if (!words) return;
        const blockOffset = generalText ? 1 : 0;
        const recordings = [
            ...generalRecordings.map(rec => ({ ...rec, blockType: 'general', sectionIndex: 0 })),
            ...blocks.flatMap((block, index) => (block.recordings || []).map(rec => ({ ...rec, blockType: block.prayType, sectionIndex: blockOffset + index }))),
        ];
        const sharedWith = selectedShareUser ? {
            userId: selectedShareUser._id, username: selectedShareUser.username || selectedShareUser.Name || 'friend',
            name: selectedShareUser.Name || selectedShareUser.username, profilePhoto: selectedShareUser.profilePhoto || null,
            status: 'sent', seenActivityBy: {}, shareId: null, isAnonymous: isAnonymousShare,
        } : undefined;
        const entry = { _id: `local-${crypto.randomUUID()}`, words, prayType: 'general', date: new Date().toISOString(),
            ...(sharedWith ? { sharedWith } : {}), _sync: newPrayerAction(sharedWith ? 'send' : 'save', userId, { audioCount: recordings.length }) };
        setGuestPrays(previous => [entry, ...previous]);
        setLocalActivityId(entry._sync.requestId);
        resetPrayForm();
        if (sharedWith) { setActivePrayTab('shared'); setCircleFilter('sent'); }
        // Yield until after React paints before touching audio/storage.
        void preparePrayerAction(entry, recordings);
    };

    const handleDeletePrayTime = (prayId) => {
        const current = prayList.find(item => String(item._id) === String(prayId));
        if (!current || current._sync || isReceivedPrayer(current) || !prayerDeleteAvailable(current.date)) return;
        const sent = isSentPrayer(current);
        if (sent && (!token || !current.sharedWith?.shareId)) return;
        if (!window.confirm(sent ? circleText.deleteForEveryone : t('deletePrayerConfirm'))) return;
        if (!prayerDeleteAvailable(current.date)) return;
        const entry = { ...current, _sync: newPrayerAction(sent ? 'delete' : 'delete-local', userId, { hidden: true }) };
        // Functional updates remove the card in this frame; the durable copy remains until acknowledgement.
        setGuestPraysState(previous => previous.filter(item => String(item._id) !== String(prayId)));
        void preparePrayerAction(entry);
    };

    // Event callbacks read the latest page state. Keeping their identity stable
    // lets unchanged saved cards skip composer/recording-timer renders.
    const cardActionsRef = useRef(null);
    useLayoutEffect(() => {
        cardActionsRef.current = { handleConfirmSharedPrayer, handleDeletePrayTime, refreshRecordings, toggleFriendPrayerExpand, markSeen };
    });
    const cardActions = useMemo(() => ({
        handleConfirmSharedPrayer: (...args) => cardActionsRef.current.handleConfirmSharedPrayer(...args),
        handleDeletePrayTime: (...args) => cardActionsRef.current.handleDeletePrayTime(...args),
        refreshRecordings: (...args) => cardActionsRef.current.refreshRecordings(...args),
        toggleFriendPrayerExpand: (...args) => cardActionsRef.current.toggleFriendPrayerExpand(...args),
        markSeen: (...args) => cardActionsRef.current.markSeen(...args),
        retryPrayerAction,
        onResponseChange: (id, words) => setResponseInputs(previous => ({ ...previous, [id]: words })),
    }), []);
    const renderPrayer = useCallback(entry => (
        <PrayerCard key={entry._id} entry={entry}
            canDelete={deletablePrayerIds.has(String(entry._id))}
            isExpanded={expandedFriendPrayers.has(entry._id)}
            isUnread={unreadPrayerIds.has(String(entry._id))}
            recordings={recordingsIndex[entry._id]} responseValue={responseInputs[entry._id] || ''}
            resolveFriendProfile={resolveFriendProfile} myProfilePhoto={myProfilePhoto} myUsername={myUsername}
            getPrayTypeLabel={getPrayTypeLabel} t={t} language={language} actions={cardActions} />
    ), [deletablePrayerIds, expandedFriendPrayers, unreadPrayerIds, recordingsIndex, responseInputs, resolveFriendProfile, myProfilePhoto, myUsername, getPrayTypeLabel, t, language, cardActions]);

    return (
        <section className="min-h-screen bg-[var(--app-bg)] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.07),rgba(0,0,0,0))] pb-[100px] pt-8 px-4 text-white transition-colors duration-150">
            <div className="max-w-5xl mx-auto">
                <div className="grid grid-cols-1 gap-5 sm:gap-6">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl shadow-xl shadow-black/20 p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Heart className="w-5 h-5 text-sky-300" />
                                <h3 className="text-base sm:text-lg font-bold text-white">{t('prayTime')}</h3>
                            </div>
                            <MyPraysBackup
                                prayTime={prayList}
                                token={isGuest ? null : token}
                                userId={userId}
                                onRestored={async () => {
                                    deletionSyncRef.current = null;
                                    checkIncomingSharedPrayers(true);
                                    refreshRecordings();
                                    setGuestPrays(await getGuestPrays());
                                }}
                            />
                        </div>
                        <div className="mb-3.5 flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => setIsShareOpen(true)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 text-xs font-semibold text-sky-300 hover:text-white transition-all shadow-sm"
                            >
                                {selectedShareUser ? (
                                    <>
                                        <UserAvatar
                                            photo={selectedShareUser.profilePhoto}
                                            name={selectedShareUser.Name}
                                            username={selectedShareUser.username}
                                            size="xs"
                                        />
                                        <span>Change recipient (@{selectedShareUser.username})</span>
                                    </>
                                ) : (
                                    <>
                                        <Share2 className="w-3.5 h-3.5" />
                                        <span>Share with friend...</span>
                                    </>
                                )}
                            </button>
                        </div>
                        <div className="w-full bg-white/[0.04] border border-white/10 rounded-2xl p-3 sm:p-4 transition-all flex flex-col gap-3.5 mb-4">
                            {selectedShareUser && (
                                <div className="flex flex-col gap-2.5 pb-2.5 border-b border-white/10 text-xs">
                                    <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <UserAvatar
                                            photo={selectedShareUser.profilePhoto}
                                            name={selectedShareUser.Name}
                                            username={selectedShareUser.username}
                                            size="sm"
                                        />
                                        <div className="min-w-0">
                                            <span className="text-xs font-semibold text-[#00C2FF] truncate block">
                                                @{selectedShareUser.username}
                                            </span>
                                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                                <Share2 className="w-3 h-3 text-[#00C2FF]" />
                                                <span>Will send prayer to friend</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setShowShareSettings((prev) => !prev)}
                                            className={`relative p-1.5 rounded-lg transition-colors ${showShareSettings || isAnonymousShare ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:text-sky-300 hover:bg-white/5'}`}
                                            title="Hidden settings"
                                        >
                                            <SlidersHorizontal className="w-3.5 h-3.5" />
                                            {isAnonymousShare && (
                                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 ring-2 ring-slate-900" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedShareUser(null); setIsAnonymousShare(false); setShowShareSettings(false); }}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors shrink-0"
                                            title="Cancel share"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    </div>
                                    {showShareSettings && (
                                        <div className="flex items-center justify-between pt-2 border-t border-white/5 bg-white/[0.02] -mx-1 px-2.5 py-1.5 rounded-xl animate-in fade-in duration-150">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`p-1 rounded-lg ${isAnonymousShare ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-slate-400'}`}>
                                                    <EyeOff className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-medium text-slate-200">
                                                            Send anonymously
                                                        </span>
                                                        {isAnonymousShare && (
                                                            <span className="text-[9px] px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-semibold border border-indigo-500/30">
                                                                Hidden Identity
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 block truncate">
                                                        @{selectedShareUser.username} won&apos;t know who sent this prayer
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsAnonymousShare((prev) => !prev)}
                                                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAnonymousShare ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                                role="switch"
                                                aria-checked={isAnonymousShare}
                                                title={isAnonymousShare ? 'Anonymous mode enabled' : 'Enable anonymous mode'}
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAnonymousShare ? 'translate-x-3' : 'translate-x-0'}`}
                                                />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <textarea dir="auto" value={prayWords} onChange={(event) => setPrayWords(event.target.value)} placeholder={t('writePrayerPlaceholder')} rows={4} className="w-full bg-transparent border-none text-white placeholder-white/20 focus:outline-none focus:ring-0 resize-y min-h-[90px] text-sm leading-relaxed p-0 m-0" />
                            <VoiceRecorderPanel blockId={GENERAL_BLOCK_ID} recorder={recorder} recordings={generalRecordings} onRemove={removeGeneralRecording} prayType="general" />
                            {prayBlocks.length > 0 && (
                                <div className={`flex flex-col gap-3 ${prayWords ? 'pt-3 border-t border-white/10' : ''}`}>
                                    {prayBlocks.map((block) => {
                                        const blockStyle = getPrayTypeStyle(block.prayType);
                                        return (
                                            <div key={block.id} className={`flex flex-col gap-2 p-3 rounded-xl border transition-all bg-black/20 ${blockStyle.cardBg.replace('hover:bg-white/5', '')}`}>
                                                <div className="flex justify-between items-center">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-md border uppercase font-bold tracking-wider ${blockStyle.badge}`}>{getPrayTypeLabel(block.prayType)}</span>
                                                    <button onClick={() => removeBlock(block.id)} className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-all" title={t('removeSection')}><X className="w-3.5 h-3.5" /></button>
                                                </div>
                                                <textarea dir="auto" value={block.words} onChange={(event) => updateBlockWords(block.id, event.target.value)} placeholder={t('writeSectionPrayerPlaceholder')} rows={3} className="w-full bg-transparent border-none text-white placeholder-white/30 focus:outline-none focus:ring-0 resize-y min-h-[60px] text-sm leading-relaxed p-0 m-0" />
                                                <VoiceRecorderPanel blockId={block.id} recorder={recorder} recordings={block.recordings} onRemove={(recId) => removePendingRecording(block.id, recId)} prayType={block.prayType} />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                            <p className="text-[11px] text-slate-400">{(prayWords + ' ' + prayBlocks.map((block) => block.words).join(' ')).trim().split(/\s+/).filter(Boolean).length} {t('totalWords')}</p>
                            <div className="flex items-center gap-2">
                                <button onClick={handleSubmitPrayTime} disabled={recorder.isRecording || (!prayWords.trim() && !generalRecordings.length && !prayBlocks.some(hasBlockContent))} className={`px-4 py-2 rounded-lg text-xs font-bold ${selectedShareUser ? 'bg-[#00C2FF] text-[#020817] hover:brightness-110 shadow-[#00C2FF]/20' : 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/20'} transition-all disabled:opacity-40 flex items-center gap-2 shadow-lg`}>
                                    {isAnonymousShare ? <EyeOff className="w-4 h-4" /> : <Check className="w-4 h-4" />}{selectedShareUser ? 'Send' : t('saveNote')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Primary Space Tabs: My Journal vs Prayer Circle */}
                    <div className="flex flex-col gap-3 min-w-0">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActivePrayTab('personal')}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activePrayTab === 'personal'
                                        ? 'bg-white/20 text-white border border-white/10 shadow-sm'
                                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5 hover:bg-white/10'
                                        }`}
                                >
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>My Journal</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActivePrayTab('shared')}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activePrayTab === 'shared'
                                        ? 'bg-white/20 text-white border border-white/10 shadow-sm'
                                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5 hover:bg-white/10'
                                        }`}
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{circleText.circle}</span>
                                    {unreadPrayCount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-[#00C2FF] text-[#020817] flex items-center gap-1 shadow-sm shadow-[#00C2FF]/30">
                                            <span className="sr-only">{circleText.unread}</span>
                                            <span>{unreadPrayCount}</span>
                                        </span>
                                    )}
                                </button>
                            </div>

                            {activePrayTab === 'shared' && (
                                <div role="group" aria-label={circleText.circle} className="flex flex-wrap items-center gap-1 min-w-0 max-w-full w-full sm:w-auto bg-white/[0.04] p-1 rounded-2xl border border-white/10">
                                    {[
                                        ['all', Layers, circleText.all],
                                        ['unread', Inbox, circleText.unread],
                                        ['received', Inbox, circleText.received],
                                        ['sent', Send, circleText.sent],
                                    ].map(([filter, Icon, label]) => (
                                        <button key={filter} type="button" onClick={() => setCircleFilter(filter)}
                                            aria-pressed={circleFilter === filter}
                                            className={`flex-auto min-w-0 max-w-full min-h-11 px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${circleFilter === filter ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
                                            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                            <span>{label}</span>
                                            {filter === 'unread' && unreadPrayCount > 0 && <span className="min-w-4 px-1 py-0.5 rounded-md text-[10px] bg-sky-500/20 text-sky-300">{unreadPrayCount}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div ref={circleAnchorRef} className="scroll-mt-3">
                    {activePrayTab === 'shared' && pendingUpdates > 0 && (
                        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30" role="status">
                            <button type="button" onClick={revealUpdates} aria-label={`${circleText.viewUpdates}: ${pendingUpdates}`}
                                className="whitespace-nowrap rounded-full border border-sky-400/40 bg-sky-950 text-sky-100 px-4 py-2.5 text-xs font-semibold shadow-lg">&uarr; {pendingUpdates} {circleText.updates}</button>
                        </div>
                    )}
                    <span className="sr-only" role="status">{unreadPrayCount} {circleText.unread}</span>
                    <ListPanel
                        title={activePrayTab === 'personal' ? t('myPrayTimeNotes')
                            : circleFilter === 'unread' ? `${circleText.unread} (${unreadPrayCount})`
                                : circleFilter === 'received' ? `${circleText.received}${unreadReceivedCount ? ` (${unreadReceivedCount})` : ''}`
                                    : circleFilter === 'sent' ? circleText.sent
                                        : circleText.circle}
                        icon={
                            activePrayTab === 'personal'
                                ? Heart
                                : circleFilter === 'received'
                                    ? Inbox
                                    : circleFilter === 'sent'
                                        ? Send
                                        : Layers
                        }
                        iconBgClass={
                            activePrayTab === 'personal'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                : circleFilter === 'received' || circleFilter === 'all'
                                    ? 'bg-[#00C2FF]/10 text-[#00C2FF] border-[#00C2FF]/20'
                                    : circleFilter === 'sent'
                                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }
                        items={activePrayTab === 'shared' ? orderedPrayList : visiblePrayList}
                        emptyText={
                            activePrayTab === 'personal'
                                ? t('noPrayerNotesYet')
                                : circleFilter === 'unread'
                                    ? circleText.noUnread
                                : circleFilter === 'received'
                                    ? 'No received prayers from friends yet'
                                    : circleFilter === 'sent'
                                        ? 'No prayers sent to friends yet'
                                        : 'No shared prayers in your Prayer Circle yet'
                        }
                        forceRenderId={notificationPrayerId}
                        renderItem={renderPrayer}
                    />
                    </div>
                </div>
            </div>

            {/* Share with Friends Modal */}
            {isShareOpen && (
                <Portal>
                    <div
                        className="fixed inset-0 z-[10001] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                        onClick={() => setIsShareOpen(false)}
                    >
                        <div
                            className="w-full max-w-md bg-[#061226] border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between pb-2 border-b border-white/10">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-sky-500/15 text-sky-400">
                                        <Users className="w-4 h-4" />
                                    </div>
                                    <h3 className="text-sm sm:text-base font-bold text-white">Share Prayer</h3>
                                </div>
                                <button
                                    onClick={() => setIsShareOpen(false)}
                                    className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Search by username input */}
                            <div className="relative">
                                <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={shareSearchQuery}
                                    onChange={(e) => setShareSearchQuery(e.target.value)}
                                    placeholder="Search by @username..."
                                    className="w-full pl-9 pr-8 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400/60 transition-all"
                                    autoFocus
                                />
                                {isSearchingUsers ? (
                                    <Loader2 className="absolute right-3 w-4 h-4 text-sky-400 animate-spin top-1/2 -translate-y-1/2" />
                                ) : shareSearchQuery ? (
                                    <button
                                        onClick={() => setShareSearchQuery('')}
                                        className="absolute right-3 text-slate-400 hover:text-white top-1/2 -translate-y-1/2"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                ) : null}
                            </div>

                            {/* User Results List */}
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px] max-h-[320px]">
                                {loadingFriends ? (
                                    <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
                                        <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                                        <span className="text-xs">Loading friends...</span>
                                    </div>
                                ) : getSortedShareResults().length === 0 ? (
                                    <div className="text-center py-10 text-xs text-slate-400 space-y-1">
                                        <p>No matching users found.</p>
                                        <p className="text-[11px] text-slate-500">Search by exact @username to discover users.</p>
                                    </div>
                                ) : (
                                    getSortedShareResults().map((user) => (
                                        <div
                                            key={user._id}
                                            className="flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 pr-2">
                                                <UserAvatar
                                                    photo={user.profilePhoto}
                                                    name={user.Name}
                                                    username={user.username}
                                                    size="md"
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-xs font-bold text-[#00C2FF] truncate max-w-[150px]">
                                                            @{user.username || 'user'}
                                                        </span>
                                                        {user.isExact && (
                                                            <span className="text-[9px] px-1.5 py-0.2 bg-sky-500/20 text-sky-300 rounded border border-sky-400/30 font-bold">
                                                                @match
                                                            </span>
                                                        )}
                                                        {user.isFriend && (
                                                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/15 text-emerald-400 rounded border border-emerald-500/20 font-medium">
                                                                Friend
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleSelectShareUser(user)}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 shadow-sm ${selectedShareUser?._id === user._id ? 'bg-emerald-500 text-white' : 'bg-[#00C2FF] text-[#020817] hover:brightness-110'}`}
                                            >
                                                {selectedShareUser?._id === user._id ? 'Selected' : 'Select'}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </section>
    );
}

