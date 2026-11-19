'use client';
import { memo, useMemo, useEffect, useRef } from 'react';
import { Check, Clock3, CircleAlert, Trash2, ChevronRight, EyeOff, ArrowRight } from 'lucide-react';
import { useTabPageActive } from '../components/TabPageActivity';
import { useOfflineAvatar } from '../hooks/useOfflineAvatar';
import { incomingPrayerActivity } from '../utils/prayerActivity';
import { prayerCircleText, formatActivityTime } from './prayerCircleText';
import { SavedPrayRecordings } from './PrayRecordings';
import PrayerList from './PrayerList';
import JournalList from './JournalList';
import { PrayerCardsSkeleton } from '../components/PageSkeleton';
import { usePrayerField } from './PrayerSessionProvider';
const GENERAL_BLOCK_ID = 'general';

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

const PrayerCard = memo(function PrayerCard({ entry, canDelete, isExpanded, isUnread, recordings, resolveFriendProfile, myProfilePhoto, myUsername, getPrayTypeLabel, t, language, actions }) {
    const [responseValue, setResponseValue] = usePrayerField(`reply:${entry._id}`);
    const pageActive = useTabPageActive();
    const { handleConfirmSharedPrayer, handleDeletePrayTime, refreshRecordings, toggleFriendPrayerExpand } = actions;
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
        if (!pageActive || !isExpanded || !isUnread) return;
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
    }, [pageActive, entry._id, entry.sharedWith?.responseWords, incomingActivity, isSent, isExpanded, isUnread, actions]);

    const senderInfo = resolveFriendProfile(entry.sharedFrom, true);
    const targetInfo = resolveFriendProfile(entry.sharedWith, false);
    const senderUsername = senderInfo.username || 'friend';
    const targetUsername = targetInfo.username || 'friend';
    const isAnonReceived = Boolean(senderInfo.isAnonymous || entry.sharedFrom?.isAnonymous);

    if (isPersonal) {
        return (
            <div key={entry._id} data-prayer-id={String(entry._id)} className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 ${getPrayTypeStyle(entry.prayType).cardBg}`}>
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
            <div key={entry._id} data-prayer-id={String(entry._id)} data-prayer-unread={isUnread ? 'true' : 'false'}
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
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center ring-2 ring-slate-900 shadow-sm" title={circleText.replied}>
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </span>
                            ) : (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-500 ring-2 ring-slate-900" />
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-xs sm:text-sm font-bold text-white truncate">
                                    {t('prayYou')}
                                </span>
                                {isAnonSent && (
                                    <span className="bg-indigo-500/15 text-indigo-300 text-[9px] font-semibold px-2 py-0.5 rounded-md border border-indigo-500/20 shrink-0 inline-flex items-center gap-1">
                                        <EyeOff className="w-2.5 h-2.5" />
                                        {t('prayAnonymous')}
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
                                        @{targetUsername} {t('prayReply')}
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
        <div key={entry._id} data-prayer-id={String(entry._id)} data-prayer-unread={isUnread ? 'true' : 'false'}
            className="rounded-2xl border transition-colors duration-150 overflow-hidden bg-white/[0.03] border-white/10 hover:border-sky-400/30">
            {isSnapRow && (
                <div
                    onClick={() => toggleFriendPrayerExpand(entry._id)}
                    className="flex items-center justify-between p-3.5 sm:p-4 cursor-pointer hover:bg-white/[0.04] transition-colors gap-3 select-none"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                            {isAnonReceived ? (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 shadow-sm" title={circleText.anonymous}>
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
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center ring-2 ring-slate-900 shadow-sm" title={circleText.replied}>
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
                                        {t('prayAnonymous')}
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
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 shadow-sm" title={circleText.anonymous}>
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
                                                {t('prayAnonymous')}
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
                                            {t('prayYou')}
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
                                            onChange={(e) => setResponseValue(e.target.value)}
                                            placeholder={`${t('prayResponsePlaceholder')} ${isAnonReceived ? t('prayAnonymous') : `@${senderUsername}`}...`}
                                            className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2FF]/60 transition-all resize-none leading-relaxed"
                                        />
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => handleConfirmSharedPrayer(entry._id)}
                                                className="px-4 py-2 text-xs font-bold bg-[#00C2FF] text-[#020817] hover:brightness-110 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-[#00C2FF]/20 disabled:opacity-50"
                                            >
                                                <span>{t('praySendReply')}</span>
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

const ListPanel = memo(function ListPanel({ title, icon: Icon, items, emptyText, renderItem, active, scope, targetId, targetKey, hasSnapshot, storageError, loadingLabel }) {
    let body;
    if (items.length) {
        const List = scope === 'personal' ? JournalList : PrayerList;
        body = active ? <List key={scope} scope={scope} items={items} renderItem={renderItem} targetId={targetId} targetKey={targetKey} /> : <div className="min-h-[200px]" />;
    } else if (!hasSnapshot || storageError) {
        body = active && !storageError && <PrayerCardsSkeleton label={loadingLabel} />;
    } else {
        body = <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-[200px]">
            <Icon className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-xs font-semibold">{emptyText}</p>
        </div>;
    }
    return (
        <div data-journal-panel={scope === 'personal' || undefined} className="flex flex-col app-card rounded-3xl border shadow-xl shadow-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 p-4 sm:p-5 bg-black/20">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">{title}</h2>
            </div>
            <div className="flex-1 p-3 sm:p-5 space-y-2.5">
                {body}
            </div>
        </div>
    );
});


export { PrayerCard, ListPanel, UserAvatar, isReceivedPrayer, isSentPrayer, isPersonalPrayer, getPrayTypeStyle, getPrayTypeMarker, VOICE_ONLY_TEXT, GENERAL_BLOCK_ID };
