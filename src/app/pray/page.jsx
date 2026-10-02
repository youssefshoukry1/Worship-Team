'use client';

import { useCallback, useEffect, useState, useContext } from 'react';
import localforage from 'localforage';
import { UserContext } from '../context/User_Context';
import { Check, Edit3, Heart, Loader2, Trash2, X, Share2, Search, Users } from 'lucide-react';
import Portal from '../Portal/Portal';
import { queueOfflineAction } from '../utils/offlineQueue';
import { showToast } from '../components/ToastContainer';
import { getApiBaseUrl } from '../utils/apiBase';
import {
    addGuestPray, addRecordings, deleteGuestPray, deleteRecordingsForPray, getGuestPrays, getRecordingsIndex, reconcileTempRecordings, updateGuestPray,
} from '../utils/prayRecordings';
import { MyPraysBackup, SavedPrayRecordings, VoiceRecorderPanel, usePrayRecorder } from './PrayRecordings';
import { useLanguage } from '../context/LanguageContext';

const API_URL = getApiBaseUrl();


const PRAY_TYPES = [
    { id: 'general', key: 'generalPrayer' },
    { id: 'prayer for me', key: 'prayerForMe' },
    { id: 'prayer for other', key: 'prayerForOthers' },
];

const GENERAL_BLOCK_ID = 'general';

const getPrayTypeStyle = (type) => {
    const t = (type || 'general').toLowerCase();
    switch (t) {
        case 'prayer for me': return { activeBtn: 'bg-blue-500/20 text-blue-200 border-blue-400/40', textareaFocus: 'focus:border-blue-400/50 focus:ring-blue-400/30', cardBg: 'bg-blue-900/10 border-blue-500/20 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]', badge: 'bg-blue-500/20 text-blue-200 border-blue-500/20', accent: 'text-blue-400', glass: 'bg-blue-500/5 border-blue-500/10' };
        case 'prayer for other':
        case 'prayer for others': return { activeBtn: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40', textareaFocus: 'focus:border-emerald-400/50 focus:ring-emerald-400/30', cardBg: 'bg-emerald-900/10 border-emerald-500/20 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]', badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/20', accent: 'text-emerald-400', glass: 'bg-emerald-500/5 border-emerald-500/10' };
        case 'chapter':
        case 'chapter reflection': return { activeBtn: 'bg-purple-500/20 text-purple-200 border-purple-400/40', textareaFocus: 'focus:border-purple-400/50 focus:ring-purple-400/30', cardBg: 'bg-purple-900/10 border-purple-500/20 shadow-[inset_0_0_20px_rgba(168,85,247,0.05)]', badge: 'bg-purple-500/20 text-purple-200 border-purple-500/20', accent: 'text-purple-400', glass: 'bg-purple-500/5 border-purple-500/10' };
        default: return { activeBtn: 'bg-rose-500/20 text-rose-200 border-rose-400/40', textareaFocus: 'focus:border-rose-400/50 focus:ring-rose-400/30', cardBg: 'bg-black/20 border-white/5 hover:bg-white/5', badge: 'bg-rose-500/20 text-rose-200 border-rose-500/20', accent: 'text-rose-400', glass: 'bg-rose-500/5 border-rose-500/10' };
    }
};

const formatDate = (value, fallback = 'N/A', lang = 'ar') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

function PrayEntryContent({ entry, recordings, onRecordingsChanged, getPrayTypeLabel }) {
    const sections = parsePraySections(entry.words);
    const { grouped, leftovers } = groupRecordingsBySection(sections, recordings);
    return (
        <div className="mt-2 flex flex-col gap-3">
            {sections.map((section, index) => (
                <div key={index} className="text-sm text-slate-200 font-medium leading-relaxed">
                    {section.marker && section.type !== 'general' && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black border mb-1 ${section.markerClass}`}>{getPrayTypeLabel ? getPrayTypeLabel(section.type) : section.marker}</span>}
                    {stripVoiceOnlyText(section.text).trim() && <p className="opacity-90 whitespace-pre-wrap">{stripVoiceOnlyText(section.text).trim()}</p>}
                    <SavedPrayRecordings prayId={entry._id} recordings={grouped[index]} onChanged={onRecordingsChanged} />
                </div>
            ))}
            <SavedPrayRecordings prayId={entry._id} recordings={leftovers} getBlockLabel={getPrayTypeLabel} onChanged={onRecordingsChanged} />
        </div>
    );
}

function getUsersEndpointCandidates(apiUrl, path) {
    const normalizedPath = String(path || '').replace(/^\/+/, '');
    const withApi = apiUrl;
    const withoutApi = apiUrl.replace(/\/api$/i, '');
    return [...new Set([
        `${withApi}/users/${normalizedPath}`,
        `${withoutApi}/api/users/${normalizedPath}`,
        `${withoutApi}/users/${normalizedPath}`,
        `${withApi}/api/users/${normalizedPath}`,
    ].map((url) => url.replace(/([^:]\/)\/+/g, '$1')))];
}

async function fetchUsersWithFallback(apiUrl, path, method, token, payload) {
    const urls = getUsersEndpointCandidates(apiUrl, path);
    let lastResponse = null;
    for (const url of urls) {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: payload ? JSON.stringify(payload) : undefined,
        });
        lastResponse = response;
        if (response.status === 404) continue;
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json().catch(() => ({}))
            : { message: `Unexpected non-JSON response from ${url}` };
        return { response, data };
    }
    if (!lastResponse) return { response: null, data: { message: 'No response from server' } };
    const fallbackType = lastResponse.headers.get('content-type') || '';
    const fallbackData = fallbackType.includes('application/json')
        ? await lastResponse.json().catch(() => ({}))
        : { message: 'Endpoint not found on available API routes' };
    return { response: lastResponse, data: fallbackData };
}

function ListPanel({ title, icon: Icon, iconBgClass, items, emptyText, recordsLabel, renderItem }) {
    return (
        <div className="flex flex-col h-full rounded-3xl border border-white/5 bg-white/[0.03] backdrop-blur-2xl overflow-hidden shadow-xl shadow-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 p-4 sm:p-5 bg-black/20">
                <div className={`p-2 rounded-xl flex items-center justify-center border ${iconBgClass}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></div>
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">{title}</h2>
                <div className="ml-auto bg-white/10 text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg text-slate-300">{items.length} {recordsLabel || 'records'}</div>
            </div>
            <div className="flex-1 p-3 sm:p-5 overflow-y-auto max-h-[350px] space-y-2.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[::-webkit-scrollbar-thumb]:bg-white/20" data-lenis-prevent-wheel>
                {items.length > 0 ? items.map((item, index) => renderItem(item, index)) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-[200px]">
                        <Icon className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-xs font-semibold">{emptyText}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function PrayPage() {
    const { user_id: userId, isLogin: token } = useContext(UserContext);
    const [profile, setProfile] = useState(null);
    const [pageLoading, setPageLoading] = useState(true);

    const [isShareOpen, setIsShareOpen] = useState(false);
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(false);
    const [shareSearchQuery, setShareSearchQuery] = useState('');
    const [systemSearchResults, setSystemSearchResults] = useState([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);

    useEffect(() => {
        if (!isShareOpen || !token) return;
        const fetchFriends = async () => {
            try {
                setLoadingFriends(true);
                const res = await fetch(`${API_URL}/users/friends`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setFriends(data.friends || []);
                }
            } catch (err) {
                console.error('Failed to load friends:', err);
            } finally {
                setLoadingFriends(false);
            }
        };
        fetchFriends();
    }, [isShareOpen, token]);

    useEffect(() => {
        const clean = shareSearchQuery.trim().replace(/^@/, '');
        if (clean.length < 2) {
            setSystemSearchResults([]);
            setIsSearchingUsers(false);
            return;
        }
        setIsSearchingUsers(true);
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/users/search-username?q=${encodeURIComponent(clean)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSystemSearchResults(data || []);
                }
            } catch {
                setSystemSearchResults([]);
            } finally {
                setIsSearchingUsers(false);
            }
        }, 300);
        return () => clearTimeout(timer);
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
    const [isConfirmingShare, setIsConfirmingShare] = useState({});

    const handleShareWithUser = async (targetUser) => {
        const textToShare = (prayWords || prayBlocks.map((b) => b.words).join('\n')).trim();
        if (!textToShare) {
            showToast({ message: 'Please write a prayer first to share.', type: 'info' });
            return;
        }
        try {
            setIsSubmittingPray(true);
            const res = await fetch(`${API_URL}/users/pray-time/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    words: textToShare,
                    prayType: 'general',
                    targetUserId: targetUser._id
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.msg || 'Failed to share prayer');

            updateProfileState((prev) => ({
                ...prev,
                prayTime: [...(data.prayTime || [])].sort((a, b) => new Date(b.date) - new Date(a.date))
            }));

            resetPrayForm();
            setIsShareOpen(false);
            showToast({ message: `Prayer saved & shared with @${targetUser.username}!`, type: 'success' });
        } catch (err) {
            showToast({ message: err.message, type: 'error' });
        } finally {
            setIsSubmittingPray(false);
        }
    };

    const handleConfirmSharedPrayer = async (prayId) => {
        const responseText = (responseInputs[prayId] || '').trim();
        try {
            setIsConfirmingShare((prev) => ({ ...prev, [prayId]: true }));
            const res = await fetch(`${API_URL}/users/pray-time/confirm-share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    prayId,
                    responseWords: responseText
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.msg || 'Failed to confirm prayer');

            updateProfileState((prev) => ({
                ...prev,
                prayTime: (prev?.prayTime || []).map((p) => {
                    if (String(p._id) === String(prayId) && p.sharedFrom) {
                        return {
                            ...p,
                            sharedFrom: {
                                ...p.sharedFrom,
                                status: 'confirmed',
                                responseWords: responseText
                            }
                        };
                    }
                    return p;
                })
            }));
            setResponseInputs((prev) => {
                const next = { ...prev };
                delete next[prayId];
                return next;
            });
            showToast({ message: 'Prayer confirmed!', type: 'success' });
        } catch (err) {
            showToast({ message: err.message, type: 'error' });
        } finally {
            setIsConfirmingShare((prev) => ({ ...prev, [prayId]: false }));
        }
    };

    const updateProfileState = (modifier) => {
        setProfile(prev => {
            const updatedProfile = typeof modifier === 'function' ? modifier(prev) : modifier;
            if (updatedProfile && userId) {
                localforage.setItem(`profile_data_${userId}`, updatedProfile).catch(console.error);
            }
            return updatedProfile;
        });
    };

    useEffect(() => {
        if (!token || !userId) {
            setPageLoading(false);
            return;
        }
        let ignore = false;
        const loadProfile = async () => {
            try {
                const cachedData = await localforage.getItem(`profile_data_${userId}`);
                if (cachedData && !ignore) {
                    setProfile(cachedData);
                    setPageLoading(false);
                }
                const res = await fetch(`${API_URL}/users/my-profile`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                if (ignore) return;
                const newProfileData = {
                    user: data.user,
                    prayTime: data.user?.prayTime?.sort((a, b) => new Date(b.date) - new Date(a.date)) || [],
                };
                updateProfileState(newProfileData);
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
        const handleFocus = async () => {
            if (!token || !userId) return;
            try {
                const res = await fetch(`${API_URL}/users/my-profile`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                const newProfileData = {
                    user: data.user,
                    prayTime: data.user?.prayTime?.sort((a, b) => new Date(b.date) - new Date(a.date)) || [],
                };
                updateProfileState(newProfileData);
            } catch { }
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [token, userId]);

    const { t, language } = useLanguage();

    const [prayWords, setPrayWords] = useState('');
    const [prayEditId, setPrayEditId] = useState(null);
    const [isSubmittingPray, setIsSubmittingPray] = useState(false);
    const [prayBlocks, setPrayBlocks] = useState([]);
    const [recordingsIndex, setRecordingsIndex] = useState({});
    const [generalRecordings, setGeneralRecordings] = useState([]);
    // Without an account, prayers are stored only on this device
    const isGuest = !token || !userId;
    const [guestPrays, setGuestPrays] = useState([]);
    const rawPrayList = isGuest ? guestPrays : (profile?.prayTime || []);
    const prayList = Array.from(
        new Map(rawPrayList.map((item) => [String(item._id || item.date), item])).values()
    );

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
        getRecordingsIndex().then(setRecordingsIndex).catch((err) => console.warn('Could not load prayer recordings:', err));
    }, []);

    useEffect(() => { refreshRecordings(); }, [refreshRecordings]);

    useEffect(() => {
        if (!isGuest) return;
        getGuestPrays().then(setGuestPrays).catch((err) => console.warn('Could not load local prayers:', err));
    }, [isGuest]);

    // Re-link recordings of prayers saved offline once they sync and get a real _id
    useEffect(() => {
        if (isGuest || !profile?.prayTime?.length) return;
        reconcileTempRecordings(profile.prayTime).then((changed) => { if (changed) refreshRecordings(); }).catch(() => { });
    }, [isGuest, profile?.prayTime, refreshRecordings]);

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
        setPrayWords(''); setPrayBlocks([]); setGeneralRecordings([]); setPrayEditId(null);
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

    const savePendingRecordings = async (prayId, pendingWords, hasGeneralSection) => {
        // Section order matches the saved text: general words first, then each non-empty block
        const blockOffset = hasGeneralSection ? 1 : 0;
        const items = [
            ...generalRecordings.map((rec) => ({ ...rec, blockType: 'general', sectionIndex: 0 })),
            ...prayBlocks.filter(hasBlockContent).flatMap((block, index) => (block.recordings || []).map((rec) => ({ ...rec, blockType: block.prayType, sectionIndex: blockOffset + index }))),
        ];
        if (!prayId || !items.length) return;
        try {
            await addRecordings(prayId, items, pendingWords);
            refreshRecordings();
        } catch (err) {
            console.error('Saving prayer recordings failed:', err);
            showToast({ message: t('prayerSavedAudioError'), type: 'error', duration: 6000 });
        }
    };

    const handleSubmitPrayTime = async () => {
        if (recorder.isRecording) return;
        const extraText = prayBlocks.filter(hasBlockContent).map((block) => `\n\n[ ${getPrayTypeMarker(block.prayType)} ]\n${block.words.trim() || VOICE_ONLY_TEXT}`).join('');
        const generalText = prayWords.trim() || (!prayEditId && generalRecordings.length ? VOICE_ONLY_TEXT : '');
        const finalWords = (generalText + extraText).trim();
        if (!finalWords) return;
        setIsSubmittingPray(true);
        if (isGuest) {
            try {
                if (prayEditId) {
                    setGuestPrays(await updateGuestPray(prayEditId, { words: finalWords }));
                } else {
                    const entry = await addGuestPray({ words: finalWords, prayType: 'general' });
                    await savePendingRecordings(entry._id, undefined, Boolean(generalText));
                    setGuestPrays(await getGuestPrays());
                }
                resetPrayForm();
            } catch (localError) {
                console.error('Local prayer save error:', localError);
                alert(t('couldNotSaveLocalPrayer'));
            } finally {
                setIsSubmittingPray(false);
            }
            return;
        }
        try {
            const isEditMode = Boolean(prayEditId);
            const method = isEditMode ? 'PATCH' : 'POST';
            const body = isEditMode
                ? { prayId: prayEditId, words: finalWords, prayType: 'general' }
                : { userid: userId, words: finalWords, prayType: 'general' };
            const { response, data } = await fetchUsersWithFallback(API_URL, `pray-time${isEditMode ? `/${userId}` : ''}`, method, token, body);
            if (!response?.ok) throw new Error(data?.message || t('savePrayerError'));
            const savedPrayTime = data.user?.prayTime || [];
            // The server $pushes the new prayer, so it is the last entry before sorting
            if (!isEditMode) await savePendingRecordings(savedPrayTime[savedPrayTime.length - 1]?._id, undefined, Boolean(generalText));
            updateProfileState((previous) => ({ ...previous, prayTime: [...savedPrayTime].sort((a, b) => new Date(b.date) - new Date(a.date)) }));
            resetPrayForm();
        } catch (submitError) {
            const isNetworkError = !navigator.onLine || submitError.message?.includes('Failed to fetch') || submitError.message?.includes('Network Error') || submitError.message?.includes('Load failed');
            if (isNetworkError) {
                const isEditMode = Boolean(prayEditId);
                const method = isEditMode ? 'PATCH' : 'POST';
                const body = isEditMode
                    ? { prayId: prayEditId, words: finalWords, prayType: 'general' }
                    : { userid: userId, words: finalWords, prayType: 'general' };
                await queueOfflineAction(`${API_URL}/users/pray-time${isEditMode ? `/${userId}` : ''}`, method, body, { Authorization: `Bearer ${token}` });
                const tempId = `temp-${Date.now()}`;
                if (!isEditMode) await savePendingRecordings(tempId, finalWords, Boolean(generalText));
                updateProfileState((previous) => {
                    const newEntry = isEditMode ? { ...body, _id: prayEditId, date: new Date().toISOString() } : { ...body, _id: tempId, date: new Date().toISOString() };
                    const existing = isEditMode ? (previous.prayTime || []).map((entry) => entry._id === prayEditId ? { ...entry, ...newEntry } : entry) : [newEntry, ...(previous.prayTime || [])];
                    return { ...previous, prayTime: existing };
                });
                resetPrayForm();
                showToast({ message: t('offlinePrayerSaved'), type: 'offline', duration: 6000 });
                return;
            }
            console.error('Pray time save error:', submitError);
            alert(submitError.message || t('savePrayerError'));
        } finally {
            setIsSubmittingPray(false);
        }
    };

    const handleEditPrayTime = (entry) => {
        setPrayEditId(entry._id);
        if (entry.prayType === 'general' || !entry.prayType) { setPrayWords(stripVoiceOnlyText(entry.words).trim()); setPrayBlocks([]); }
        else { setPrayWords(''); setPrayBlocks([{ id: entry._id, prayType: entry.prayType, words: stripVoiceOnlyText(entry.words).trim() }]); }
    };

    const handleDeletePrayTime = async (prayId) => {
        if (!window.confirm(t('deletePrayerConfirm'))) return;
        if (isGuest) {
            try {
                await deleteGuestPray(prayId);
                setGuestPrays(await getGuestPrays());
                refreshRecordings();
                if (prayEditId === prayId) resetPrayForm();
            } catch (localError) {
                console.error('Local prayer delete error:', localError);
                alert(t('couldNotDeleteLocalPrayer'));
            }
            return;
        }
        try {
            const { response, data } = await fetchUsersWithFallback(API_URL, `pray-time/${userId}`, 'DELETE', token, { prayId });
            if (!response?.ok) throw new Error(data?.message || t('deletePrayerError'));
            updateProfileState((previous) => ({ ...previous, prayTime: (previous?.prayTime || []).filter((entry) => entry._id !== prayId) }));
            await deleteRecordingsForPray(prayId).catch(() => { });
            refreshRecordings();
            if (prayEditId === prayId) resetPrayForm();
        } catch (deleteError) {
            const isNetworkError = !navigator.onLine || deleteError.message?.includes('Failed to fetch') || deleteError.message?.includes('Network Error') || deleteError.message?.includes('Load failed');
            if (isNetworkError) {
                await queueOfflineAction(`${API_URL}/users/pray-time/${userId}`, 'DELETE', { prayId }, { Authorization: `Bearer ${token}` });
                updateProfileState((previous) => ({ ...previous, prayTime: (previous?.prayTime || []).filter((entry) => entry._id !== prayId) }));
                await deleteRecordingsForPray(prayId).catch(() => { });
                refreshRecordings();
                if (prayEditId === prayId) resetPrayForm();
                showToast({ message: t('offlinePrayerDelete'), type: 'offline', duration: 6000 });
                return;
            }
            console.error('Pray time delete error:', deleteError);
            alert(deleteError.message || t('deletePrayerError'));
        }
    };



    return (
        <section className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pb-[100px] pt-8 px-4 text-white">
            <div className="max-w-5xl mx-auto">
                <div className="grid gap-5 sm:gap-6">
                    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 via-slate-900/70 to-slate-900 p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Heart className="w-5 h-5 text-rose-300" />
                                <h3 className="text-base sm:text-lg font-bold text-white">{t('prayTime')}</h3>
                            </div>
                            <MyPraysBackup prayTime={prayList} token={isGuest ? null : token} userId={userId} onRestored={refreshRecordings} />
                        </div>
                        <div className="mb-3.5">
                            <button
                                onClick={() => setIsShareOpen(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-semibold text-rose-300 hover:text-white transition-all shadow-sm"
                            >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Share with...</span>
                            </button>
                        </div>
                        <div className="w-full bg-white/[0.04] border border-white/10 rounded-2xl p-3 sm:p-4 focus-within:ring-1 focus-within:ring-rose-400/30 focus-within:border-rose-400/50 transition-all flex flex-col gap-3.5 mb-4">
                            {(!prayEditId || prayWords || prayBlocks.length === 0) && <textarea value={prayWords} onChange={(event) => setPrayWords(event.target.value)} placeholder={t('writePrayerPlaceholder')} rows={4} className="w-full bg-transparent border-none text-white placeholder-white/20 focus:outline-none focus:ring-0 resize-y min-h-[90px] text-sm leading-relaxed p-0 m-0" />}
                            {!prayEditId && (
                                <VoiceRecorderPanel blockId={GENERAL_BLOCK_ID} recorder={recorder} recordings={generalRecordings} onRemove={removeGeneralRecording} prayType="general" />
                            )}
                            {prayBlocks.length > 0 && (
                                <div className={`flex flex-col gap-3 ${prayWords ? 'pt-3 border-t border-white/10' : ''}`}>
                                    {prayBlocks.map((block) => {
                                        const blockStyle = getPrayTypeStyle(block.prayType);
                                        return (
                                            <div key={block.id} className={`flex flex-col gap-2 p-3 rounded-xl border transition-all bg-black/20 ${blockStyle.cardBg.replace('hover:bg-white/5', '')}`}>
                                                <div className="flex justify-between items-center">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-md border uppercase font-bold tracking-wider ${blockStyle.badge}`}>{getPrayTypeLabel(block.prayType)}</span>
                                                    {!prayEditId && <button onClick={() => removeBlock(block.id)} className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-all" title={t('removeSection')}><X className="w-3.5 h-3.5" /></button>}
                                                </div>
                                                <textarea value={block.words} onChange={(event) => updateBlockWords(block.id, event.target.value)} placeholder={t('writeSectionPrayerPlaceholder')} rows={3} className="w-full bg-transparent border-none text-white placeholder-white/30 focus:outline-none focus:ring-0 resize-y min-h-[60px] text-sm leading-relaxed p-0 m-0" />
                                                {!prayEditId && <VoiceRecorderPanel blockId={block.id} recorder={recorder} recordings={block.recordings} onRemove={(recId) => removePendingRecording(block.id, recId)} prayType={block.prayType} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                            <p className="text-[11px] text-slate-400">{(prayWords + ' ' + prayBlocks.map((block) => block.words).join(' ')).trim().split(/\s+/).filter(Boolean).length} {t('totalWords')}</p>
                            <div className="flex items-center gap-2">
                                {prayEditId && <button onClick={resetPrayForm} className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5">{t('cancelEdit')}</button>}
                                <button onClick={handleSubmitPrayTime} disabled={isSubmittingPray || recorder.isRecording || (!prayWords.trim() && !generalRecordings.length && !prayBlocks.some(hasBlockContent))} className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-rose-500/20">
                                    {isSubmittingPray ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{prayEditId ? t('updateNoteBtn') : t('saveNote')}
                                </button>
                            </div>
                        </div>
                    </div>
                    <ListPanel title={t('myPrayTimeNotes')} icon={Heart} iconBgClass="bg-rose-500/10 text-rose-400 border-rose-500/20" items={prayList} emptyText={t('noPrayerNotesYet')} recordsLabel={t('records')} renderItem={(entry) => {
                        const isReceived = Boolean(
                            (entry.sharedFrom?.username || entry.sharedFrom?.originalPrayId || entry.sharedFrom?.userId) &&
                            !entry.sharedWith?.username
                        );
                        const isPendingConfirmation = isReceived && (entry.sharedFrom?.status || 'pending').toLowerCase() !== 'confirmed';
                        const isConfirmedReceived = isReceived && entry.sharedFrom?.status === 'confirmed';

                        return (
                            <div key={entry._id} className={`rounded-2xl border transition-all duration-300 p-4 sm:p-5 ${getPrayTypeStyle(entry.prayType).cardBg}`}>
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {entry.prayType && entry.prayType !== 'general' && (
                                            <span className="bg-white/10 text-white/80 text-[10px] font-black px-2 py-0.5 rounded-md border border-white/10">{getPrayTypeLabel(entry.prayType)}</span>
                                        )}
                                        {entry.sharedWith?.username && (
                                            <span className="bg-[#00C2FF]/15 text-[#00C2FF] text-[10px] font-bold px-2 py-0.5 rounded-md border border-[#00C2FF]/30">
                                                @{entry.sharedWith.username}
                                            </span>
                                        )}
                                        {entry.sharedFrom?.username && (
                                            <span className="bg-rose-500/15 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-rose-500/30">
                                                @{entry.sharedFrom.username}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-slate-500 font-bold">{formatDate(entry.date, 'N/A', language)}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEditPrayTime(entry)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all border border-white/5" title={t('editNote')}><Edit3 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDeletePrayTime(entry._id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5" title={t('deleteNote')}><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>

                                {isConfirmedReceived && entry.sharedFrom?.responseWords ? (
                                    <>
                                        {/* Recipient's confirmed prayer on top with original font size */}
                                        <div className="mt-2 text-sm text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
                                            {entry.sharedFrom.responseWords}
                                        </div>

                                        {/* Sender's original prayer below in small font size */}
                                        <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-col gap-1 text-xs text-slate-400">
                                            <span className="text-[11px] text-rose-300 font-semibold">
                                                Shared by @{entry.sharedFrom.username}:
                                            </span>
                                            <p className="text-xs text-slate-400 italic leading-relaxed whitespace-pre-wrap pl-2 border-l border-rose-500/30">
                                                {stripVoiceOnlyText(entry.words).trim()}
                                            </p>
                                            <SavedPrayRecordings prayId={entry._id} recordings={recordingsIndex[entry._id]} onChanged={refreshRecordings} />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <PrayEntryContent entry={entry} recordings={recordingsIndex[entry._id]} onRecordingsChanged={refreshRecordings} getPrayTypeLabel={getPrayTypeLabel} />

                                        {/* Sender view: Confirmed recipient response in small font below */}
                                        {!isReceived && entry.sharedWith?.status === 'confirmed' && entry.sharedWith?.responseWords && (
                                            <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-col gap-1 text-xs text-slate-400">
                                                <span className="text-[11px] text-[#00C2FF] font-semibold">
                                                    @{entry.sharedWith.username}&apos;s prayer:
                                                </span>
                                                <p className="text-xs text-slate-400 italic leading-relaxed whitespace-pre-wrap pl-2 border-l border-[#00C2FF]/30">
                                                    {entry.sharedWith.responseWords}
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Confirm input ONLY for the chosen recipient when pending */}
                                {isPendingConfirmation && (
                                    <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
                                        <span className="text-xs text-slate-300">
                                            Shared by <strong className="text-[#00C2FF]">@{entry.sharedFrom?.username}</strong>
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={responseInputs[entry._id] || ''}
                                                onChange={(e) => setResponseInputs((prev) => ({ ...prev, [entry._id]: e.target.value }))}
                                                placeholder={`Write prayer to confirm with @${entry.sharedFrom?.username}...`}
                                                className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00C2FF]/60 transition-all"
                                            />
                                            <button
                                                onClick={() => handleConfirmSharedPrayer(entry._id)}
                                                disabled={isConfirmingShare[entry._id]}
                                                className="px-3.5 py-1.5 text-xs font-bold bg-[#00C2FF] text-[#020817] hover:brightness-110 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-[#00C2FF]/20 disabled:opacity-50 shrink-0"
                                            >
                                                {isConfirmingShare[entry._id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                Confirm
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    }} />
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
                                    <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400">
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
                                    className="w-full pl-9 pr-8 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-400/60 transition-all"
                                    autoFocus
                                />
                                {isSearchingUsers ? (
                                    <Loader2 className="absolute right-3 w-4 h-4 text-rose-400 animate-spin top-1/2 -translate-y-1/2" />
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
                                        <Loader2 className="w-5 h-5 text-rose-400 animate-spin" />
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
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-rose-500/20 to-blue-600/30 border border-rose-400/20 flex items-center justify-center font-bold text-xs text-rose-300 uppercase shrink-0">
                                                    {user.Name?.charAt(0) || 'U'}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-xs font-semibold text-white truncate max-w-[130px]">
                                                            {user.Name}
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
                                                    <div className="text-[11px] text-slate-400 truncate">
                                                        @{user.username || 'user'}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleShareWithUser(user)}
                                                className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all shrink-0 shadow-sm"
                                            >
                                                Share
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

