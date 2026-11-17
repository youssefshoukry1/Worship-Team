'use client';
import { useContext, useState } from 'react';
import { Check, EyeOff, Share2, SlidersHorizontal, X } from 'lucide-react';
import { useTabPageActive } from '../components/TabPageActivity';
import { UserContext } from '../context/User_Context';
import { useLanguage } from '../context/LanguageContext';
import { newPrayerAction, preparePrayerAction } from '../services/prayerSync';
import { VoiceRecorderPanel } from './PrayRecordings';
import { UserAvatar, getPrayTypeStyle, getPrayTypeMarker, VOICE_ONLY_TEXT, GENERAL_BLOCK_ID } from './PrayerCards';
import { usePrayerSession, usePrayerField } from './PrayerSessionProvider';
import PrayerSharePicker from './PrayerSharePicker';
import privacyStyles from './PrayerBackup.module.css';
const idleRecorder = { isRecording: false, start() {} };
export default function PrayerComposer({ friends, loadingFriends, onSaved }) {
    const { user_id: userId } = useContext(UserContext);
    const { t } = useLanguage();
    const pageActive = useTabPageActive();
    const session = usePrayerSession();
    const [recorder] = usePrayerField('recorder');
    const getPrayTypeLabel = (value) => {
        const v = (value || 'general').toLowerCase();
        switch (v) {
            case 'prayer for me': return t('prayerForMe');
            case 'prayer for other':
            case 'prayer for others': return t('prayerForOthers');
            case 'chapter':
            case 'chapter reflection': return t('chapterReflection');
            default: return t('generalPrayer');
        }
    };
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [prayWords, setPrayWords] = usePrayerField('prayWords');
    const [prayBlocks, setPrayBlocks] = usePrayerField('prayBlocks');
    const [generalRecordings, setGeneralRecordings] = usePrayerField('generalRecordings');
    const [selectedShareUser, setSelectedShareUser] = usePrayerField('selectedShareUser');
    const [isAnonymousShare, setIsAnonymousShare] = usePrayerField('isAnonymousShare');
    const [showShareSettings, setShowShareSettings] = usePrayerField('showShareSettings');
    const handleSelectShareUser = (targetUser) => {
        setSelectedShareUser(targetUser);
        setShowShareSettings(false);
        setIsShareOpen(false);
    };

    const revokeBlockUrls = (blocks) => blocks.forEach((block) => (block.recordings || []).forEach((rec) => URL.revokeObjectURL(rec.url)));

    const resetPrayForm = () => { if (recorder?.isRecording) recorder.cancel(); session.discardComposer(); };
    const removeGeneralRecording = (recId) => setGeneralRecordings((recordings) => {
        recordings.filter((rec) => rec.id === recId).forEach((rec) => URL.revokeObjectURL(rec.url));
        return recordings.filter((rec) => rec.id !== recId);
    });
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
        if (!session.active || !recorder || recorder.isRecording) return;
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
        onSaved(entry);
        resetPrayForm();
        // Yield until after React paints before touching audio/storage.
        void preparePrayerAction(entry, recordings);
    };

    return <>
                        <div className="mb-3.5 flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => setIsShareOpen(true)}
                                className={`${privacyStyles.matteButton} inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border-0 text-xs font-semibold transition-colors`}
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
                        <div className="app-input w-full border rounded-2xl p-3 sm:p-4 transition-all flex flex-col gap-3.5 mb-4">
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
                            <VoiceRecorderPanel blockId={GENERAL_BLOCK_ID} recorder={recorder || idleRecorder} recordings={generalRecordings} onRemove={removeGeneralRecording} prayType="general" />
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
                                                <VoiceRecorderPanel blockId={block.id} recorder={recorder || idleRecorder} recordings={block.recordings} onRemove={(recId) => removePendingRecording(block.id, recId)} prayType={block.prayType} />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                            <p className="text-[11px] text-slate-400">{(prayWords + ' ' + prayBlocks.map((block) => block.words).join(' ')).trim().split(/\s+/).filter(Boolean).length} {t('totalWords')}</p>
                            <div className="flex items-center gap-2">
                                <button onClick={handleSubmitPrayTime} disabled={recorder?.isRecording || (!prayWords.trim() && !generalRecordings.length && !prayBlocks.some(hasBlockContent))} className={`px-4 py-2 rounded-lg text-xs font-bold ${privacyStyles.saveButton} transition-colors disabled:opacity-40 flex items-center gap-2`}>
                                    {isAnonymousShare ? <EyeOff className="w-4 h-4" /> : <Check className="w-4 h-4" />}{selectedShareUser ? 'Send' : t('saveNote')}
                                </button>
                            </div>
                        </div>
        <PrayerSharePicker isShareOpen={pageActive && isShareOpen} onClose={() => setIsShareOpen(false)} onSelect={handleSelectShareUser}
            selectedShareUser={selectedShareUser} friends={friends} loadingFriends={loadingFriends} />
    </>;
}
