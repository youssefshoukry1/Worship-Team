'use client';
import { useContext, useEffect, useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { UserContext } from '../context/User_Context';
import { useLanguage } from '../context/LanguageContext';
import usePeoplePage from '../utils/usePeoplePage';
import useLocalFriends from '../utils/friendDirectory/useLocalFriends';
import FriendDirectoryStatus from '../components/FriendDirectoryStatus';
import PeoplePager from '../components/PeoplePager';
import Portal from '../Portal/Portal';
import { UserAvatar } from './PrayerCards';
export default function PrayerSharePicker({ isShareOpen, onClose, onSelect, selectedShareUser }) {
    const { user_id: userId, isLogin: token } = useContext(UserContext);
    const { t } = useLanguage();
    const [shareSearchQuery, setShareSearchQuery] = useState('');
    const [query, setQuery] = useState('');
    const [discover, setDiscover] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => { setQuery(shareSearchQuery.trim().replace(/^@/, '')); setDiscover(false); }, 300);
        return () => clearTimeout(timer);
    }, [shareSearchQuery]);
    const friendsPage = useLocalFriends(token, userId, shareSearchQuery, isShareOpen);
    const searchPage = usePeoplePage(`people-search?q=${encodeURIComponent(query)}`, token, userId, isShareOpen && discover && query.length >= 2, false);
    const isSearchingUsers = query ? friendsPage.syncing || (discover && searchPage.loading) : false;
    const loadingFriends = friendsPage.loading && !friendsPage.ready;
    const getSortedShareResults = () => {
        const friends = friendsPage.items.map(person => ({ ...person, isFriend: true }));
        const ids = new Set(friends.map(person => person._id));
        const others = discover && query.length >= 2 ? searchPage.items.filter(person => person._id !== userId && !ids.has(person._id))
            .map(person => ({ ...person, isFriend: person.relationship === 'friends', isExact: person.username?.toLowerCase() === query.toLowerCase() })) : [];
        return [...friends, ...others].sort((a, b) => Number(Boolean(b.isExact)) - Number(Boolean(a.isExact)));
    };

    return <>
            {/* Share with Friends Modal */}
            {isShareOpen && (
                <Portal>
                    <div
                        className="fixed inset-0 z-[10001] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                        onClick={() => onClose()}
                    >
                        <div
                            className="app-popover w-full max-w-md border rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between pb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm sm:text-base font-bold text-white">{t('praySharePrayer')}</h3>
                                </div>
                                <button
                                    onClick={() => onClose()}
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
                                    placeholder={t('praySearchUsername')}
                                    className="w-full pl-9 pr-8 py-2.5 bg-white/[0.04] border-0 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0 transition-all"
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
                                        <span className="text-xs">{t('prayLoadingFriends')}</span>
                                    </div>
                                ) : getSortedShareResults().length === 0 ? (
                                    <div className="text-center py-10 text-xs text-slate-400 space-y-1">
                                        <p>{t('prayNoUsersFound')}</p>
                                        <p className="text-[11px] text-slate-500">{t('praySearchByUsername')}</p>
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
                                                                {t('prayFriend')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => onSelect(user)}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 shadow-sm ${selectedShareUser?._id === user._id ? 'bg-emerald-500 text-white' : 'bg-[#00C2FF] text-[#020817] hover:brightness-110'}`}
                                            >
                                                {selectedShareUser?._id === user._id ? t('praySelected') : t('praySelect')}
                                            </button>
                                        </div>
                                    ))
                                )}
                                <PeoplePager page={friendsPage} active={isShareOpen} />
                                <FriendDirectoryStatus page={friendsPage} />
                                {query.length >= 2 && !discover && <button type="button" className="text-xs text-sky-400 py-2" onClick={() => setDiscover(true)}>{t('praySearchOnline')}</button>}
                                {discover && query.length >= 2 && <PeoplePager page={searchPage} active={isShareOpen} />}
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
    </>;
}
