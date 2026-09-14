'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Edit3, Heart, Loader2, Trash2, X } from 'lucide-react';
import { queueOfflineAction } from '../utils/offlineQueue';
import { showToast } from '../components/ToastContainer';
import { getApiBaseUrl } from '../utils/apiBase';
import { addRecordings, deleteRecordingsForPray, getRecordingsIndex, reconcileTempRecordings } from '../utils/prayRecordings';
import { MyPraysBackup, SavedPrayRecordings, VoiceRecorderPanel, usePrayRecorder } from './PrayRecordings';

const API_URL = getApiBaseUrl();

const PRAY_FEELINGS = [
    { id: 'thankful', label: 'Thankful', helper: 'Gratitude opens more words. Write one blessing from today.' },
    { id: 'anxious', label: 'Anxious', helper: 'You are safe here. Write one worry, then one small hope.' },
    { id: 'tired', label: 'Tired', helper: 'Keep it simple. Even a few honest lines are enough.' },
    { id: 'other', label: 'Other', helper: 'No pressure. Just write exactly what is in your heart.' },
];

const PRAY_TYPES = [
    { id: 'general', label: 'General Prayer' },
    { id: 'prayer for me', label: 'Pray for me' },
    { id: 'prayer for other', label: 'Prayer For Others' },
];

const GENERAL_BLOCK_ID = 'general';

const getFeelingLabel = (value) => PRAY_FEELINGS.find((item) => item.id === value)?.label || 'Other';
const getPrayTypeLabel = (value) => PRAY_TYPES.find((item) => item.id === value)?.label || 'General Prayer';

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

const formatDate = (value, fallback = 'N/A') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Section markers written into the saved text by the block editor ("Pray for me" blocks write "[ PRAY FOR ME ]")
const SECTION_MARKERS = [
    { pattern: /^\[ PRAYE?R? FOR ME \]$/i, type: 'prayer for me', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    { pattern: /^\[ PRAYER FOR OTHERS \]$/i, type: 'prayer for other', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    { pattern: /^\[ CHAPTER REFLECTION \]$/i, type: 'chapter', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
];
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

function PrayEntryContent({ entry, recordings, onRecordingsChanged }) {
    const sections = parsePraySections(entry.words);
    const { grouped, leftovers } = groupRecordingsBySection(sections, recordings);
    return (
        <div className="mt-2 flex flex-col gap-3">
            {sections.map((section, index) => (
                <div key={index} className="text-sm text-slate-200 font-medium leading-relaxed">
                    {section.marker && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black border mb-1 ${section.markerClass}`}>{section.marker}</span>}
                    {section.text.trim() && <p className="opacity-90 whitespace-pre-wrap">{section.text.trim()}</p>}
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

function ListPanel({ title, icon: Icon, iconBgClass, items, emptyText, renderItem }) {
    return (
        <div className="flex flex-col h-full rounded-3xl border border-white/5 bg-white/[0.03] backdrop-blur-2xl overflow-hidden shadow-xl shadow-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 p-4 sm:p-5 bg-black/20">
                <div className={`p-2 rounded-xl flex items-center justify-center border ${iconBgClass}`}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></div>
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">{title}</h2>
                <div className="ml-auto bg-white/10 text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg text-slate-300">{items.length} records</div>
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

export default function Pray({ profile, updateProfileState, userId, token }) {
    const [prayWords, setPrayWords] = useState('');
    const [prayFeeling, setPrayFeeling] = useState('other');
    const [prayEditId, setPrayEditId] = useState(null);
    const [isSubmittingPray, setIsSubmittingPray] = useState(false);
    const [prayBlocks, setPrayBlocks] = useState([]);
    const [recordingsIndex, setRecordingsIndex] = useState({});
    const [generalRecordings, setGeneralRecordings] = useState([]);

    const refreshRecordings = useCallback(() => {
        getRecordingsIndex().then(setRecordingsIndex).catch((err) => console.warn('Could not load prayer recordings:', err));
    }, []);

    useEffect(() => { refreshRecordings(); }, [refreshRecordings]);

    // Re-link recordings of prayers saved offline once they sync and get a real _id
    useEffect(() => {
        if (!profile?.prayTime?.length) return;
        reconcileTempRecordings(profile.prayTime).then((changed) => { if (changed) refreshRecordings(); }).catch(() => {});
    }, [profile?.prayTime, refreshRecordings]);

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
        setPrayWords(''); setPrayBlocks([]); setGeneralRecordings([]); setPrayFeeling('other'); setPrayEditId(null);
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
            showToast({ message: 'Prayer saved, but the voice recordings could not be stored on this device.', type: 'error', duration: 6000 });
        }
    };

    const handleSubmitPrayTime = async () => {
        if (recorder.isRecording) return;
        const extraText = prayBlocks.filter(hasBlockContent).map((block) => `\n\n[ ${getPrayTypeLabel(block.prayType).toUpperCase()} ]\n${block.words.trim() || '🎙️ Voice prayer'}`).join('');
        const generalText = prayWords.trim() || (!prayEditId && generalRecordings.length ? '🎙️ Voice prayer' : '');
        const finalWords = (generalText + extraText).trim();
        if (!finalWords) return;
        setIsSubmittingPray(true);
        try {
            const isEditMode = Boolean(prayEditId);
            const method = isEditMode ? 'PATCH' : 'POST';
            const body = isEditMode
                ? { prayId: prayEditId, words: finalWords, feeling: prayFeeling, prayType: 'general' }
                : { userid: userId, words: finalWords, feeling: prayFeeling, prayType: 'general' };
            const { response, data } = await fetchUsersWithFallback(API_URL, `pray-time${isEditMode ? `/${userId}` : ''}`, method, token, body);
            if (!response?.ok) throw new Error(data?.message || 'Failed to save pray time');
            const savedPrayTime = data.user?.prayTime || [];
            // The server $pushes the new prayer, so it is the last entry before sorting
            if (!isEditMode) await savePendingRecordings(savedPrayTime[savedPrayTime.length - 1]?._id, undefined, Boolean(generalText));
            updateProfileState((previous) => ({ ...previous, prayTime: [...savedPrayTime].sort((a, b) => new Date(b.date) - new Date(a.date)) }));
            resetPrayForm();
        } catch (submitError) {
            const isNetworkError = !navigator.onLine || submitError.message.includes('Failed to fetch') || submitError.message.includes('Network Error') || submitError.message.includes('Load failed');
            if (isNetworkError) {
                const isEditMode = Boolean(prayEditId);
                const method = isEditMode ? 'PATCH' : 'POST';
                const body = isEditMode
                    ? { prayId: prayEditId, words: finalWords, feeling: prayFeeling, prayType: 'general' }
                    : { userid: userId, words: finalWords, feeling: prayFeeling, prayType: 'general' };
                await queueOfflineAction(`${API_URL}/users/pray-time${isEditMode ? `/${userId}` : ''}`, method, body, { Authorization: `Bearer ${token}` });
                const tempId = `temp-${Date.now()}`;
                if (!isEditMode) await savePendingRecordings(tempId, finalWords, Boolean(generalText));
                updateProfileState((previous) => {
                    const newEntry = isEditMode ? { ...body, _id: prayEditId, date: new Date().toISOString() } : { ...body, _id: tempId, date: new Date().toISOString() };
                    const existing = isEditMode ? (previous.prayTime || []).map((entry) => entry._id === prayEditId ? { ...entry, ...newEntry } : entry) : [newEntry, ...(previous.prayTime || [])];
                    return { ...previous, prayTime: existing };
                });
                resetPrayForm();
                showToast({ message: '📶 You\'re offline — your prayer is saved and will sync automatically once you\'re back online.', type: 'offline', duration: 6000 });
                return;
            }
            console.error('Pray time save error:', submitError);
            alert(submitError.message || 'Failed to save pray time');
        } finally {
            setIsSubmittingPray(false);
        }
    };

    const handleEditPrayTime = (entry) => {
        setPrayEditId(entry._id);
        if (entry.prayType === 'general' || !entry.prayType) { setPrayWords(entry.words || ''); setPrayBlocks([]); }
        else { setPrayWords(''); setPrayBlocks([{ id: entry._id, prayType: entry.prayType, words: entry.words || '' }]); }
        setPrayFeeling(entry.feeling || 'other');
    };

    const handleDeletePrayTime = async (prayId) => {
        if (!window.confirm('Are you sure you want to delete this prayer note?')) return;
        try {
            const { response, data } = await fetchUsersWithFallback(API_URL, `pray-time/${userId}`, 'DELETE', token, { prayId });
            if (!response?.ok) throw new Error(data?.message || 'Failed to delete pray time');
            updateProfileState((previous) => ({ ...previous, prayTime: (previous?.prayTime || []).filter((entry) => entry._id !== prayId) }));
            await deleteRecordingsForPray(prayId).catch(() => {});
            refreshRecordings();
            if (prayEditId === prayId) resetPrayForm();
        } catch (deleteError) {
            const isNetworkError = !navigator.onLine || deleteError.message.includes('Failed to fetch') || deleteError.message.includes('Network Error') || deleteError.message.includes('Load failed');
            if (isNetworkError) {
                await queueOfflineAction(`${API_URL}/users/pray-time/${userId}`, 'DELETE', { prayId }, { Authorization: `Bearer ${token}` });
                updateProfileState((previous) => ({ ...previous, prayTime: (previous?.prayTime || []).filter((entry) => entry._id !== prayId) }));
                await deleteRecordingsForPray(prayId).catch(() => {});
                refreshRecordings();
                if (prayEditId === prayId) resetPrayForm();
                showToast({ message: '📶 You\'re offline — this prayer will be removed once you\'re back online.', type: 'offline', duration: 6000 });
                return;
            }
            console.error('Pray time delete error:', deleteError);
            alert(deleteError.message || 'Failed to delete pray time');
        }
    };

    return (
        <div className="grid gap-5 sm:gap-6">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 via-slate-900/70 to-slate-900 p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3"><Heart className="w-5 h-5 text-rose-300" /><h3 className="text-base sm:text-lg font-bold text-white">Pray Time</h3></div>
                <div className="flex flex-wrap gap-2 mb-4">
                    <div className="w-full mb-1">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Add Prayer Section</p>
                        <div className="flex flex-wrap gap-2">
                            {PRAY_TYPES.filter((item) => item.id !== 'general').map((item) => (
                                <button key={item.id} onClick={() => !prayEditId && handleAddBlock(item.id)} disabled={!!prayEditId} className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 disabled:opacity-40">+ {item.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="w-full mt-2 mb-1">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">How are you feeling?</p>
                        <div className="flex flex-wrap gap-2">
                            {PRAY_FEELINGS.map((item) => (
                                <button key={item.id} onClick={() => setPrayFeeling(item.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${prayFeeling === item.id ? 'bg-rose-500/20 text-rose-200 border-rose-400/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}>{item.label}</button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="w-full bg-white/[0.04] border border-white/10 rounded-2xl p-3 sm:p-4 focus-within:ring-1 focus-within:ring-rose-400/30 focus-within:border-rose-400/50 transition-all flex flex-col gap-3.5 mb-4">
                    {(!prayEditId || prayWords || prayBlocks.length === 0) && <textarea value={prayWords} onChange={(event) => setPrayWords(event.target.value)} placeholder="Write your general prayer words here..." rows={4} className="w-full bg-transparent border-none text-white placeholder-white/20 focus:outline-none focus:ring-0 resize-y min-h-[90px] text-sm leading-relaxed p-0 m-0" />}
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
                                            {!prayEditId && <button onClick={() => removeBlock(block.id)} className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-all" title="Remove section"><X className="w-3.5 h-3.5" /></button>}
                                        </div>
                                        <textarea value={block.words} onChange={(event) => updateBlockWords(block.id, event.target.value)} placeholder={`Write your ${getPrayTypeLabel(block.prayType).toLowerCase()}...`} rows={3} className="w-full bg-transparent border-none text-white placeholder-white/30 focus:outline-none focus:ring-0 resize-y min-h-[60px] text-sm leading-relaxed p-0 m-0" />
                                        {!prayEditId && <VoiceRecorderPanel blockId={block.id} recorder={recorder} recordings={block.recordings} onRemove={(recId) => removePendingRecording(block.id, recId)} prayType={block.prayType} />}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                    <p className="text-[11px] text-slate-400">{(prayWords + ' ' + prayBlocks.map((block) => block.words).join(' ')).trim().split(/\s+/).filter(Boolean).length} total words</p>
                    <div className="flex items-center gap-2">
                        {prayEditId && <button onClick={resetPrayForm} className="px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/5">Cancel Edit</button>}
                        <button onClick={handleSubmitPrayTime} disabled={isSubmittingPray || recorder.isRecording || (!prayWords.trim() && !generalRecordings.length && !prayBlocks.some(hasBlockContent))} className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-rose-500/20">
                            {isSubmittingPray ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{prayEditId ? 'Update Note' : 'Save Note'}
                        </button>
                    </div>
                </div>
            </div>
            <ListPanel title="My Pray Time Notes" icon={Heart} iconBgClass="bg-rose-500/10 text-rose-400 border-rose-500/20" items={profile?.prayTime || []} emptyText="No prayer notes yet" renderItem={(entry) => (
                <div key={entry._id} className={`rounded-2xl border transition-all duration-300 p-4 sm:p-5 ${getPrayTypeStyle(entry.prayType).cardBg}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${getPrayTypeStyle(entry.prayType).badge}`}>{getFeelingLabel(entry.feeling)}</span>
                            <span className="bg-white/10 text-white/80 text-[10px] font-black px-2 py-0.5 rounded-md border border-white/10">{getPrayTypeLabel(entry.prayType)}</span>
                            <span className="text-[10px] text-slate-500 font-bold">{formatDate(entry.date)}</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEditPrayTime(entry)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all border border-white/5" title="Edit Note"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeletePrayTime(entry._id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5" title="Delete Note"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </div>
                    <PrayEntryContent entry={entry} recordings={recordingsIndex[entry._id]} onRecordingsChanged={refreshRecordings} />
                </div>
            )} />
            <MyPraysBackup prayTime={profile?.prayTime || []} token={token} userId={userId} onRestored={refreshRecordings} />
        </div>
    );
}
