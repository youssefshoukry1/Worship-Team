'use client';

import { useContext, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '../Portal/Portal';
import {
    Activity,
    Book,
    Check,
    Edit3,
    Loader2,
    Mail,
    Target,
    Trash2,
    User,
    X,
} from 'lucide-react';
import { UserContext } from '../context/User_Context';
import { getApiBaseUrl } from '../utils/apiBase';

const API_URL = getApiBaseUrl();

const titleCase = (value) => {
    if (!value) return 'N/A';
    return value
        .trim()
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const formatDate = (value, fallback = 'N/A') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

/* --- UI COMPONENTS --- */

function Badge({ icon: Icon, label, value, classes = "text-slate-200 bg-white/5 border-white/10" }) {
    return (
        <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${classes}`}>
            <Icon className="w-3.5 h-3.5 opacity-70" />
            <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider opacity-60 leading-[1]">{label}</span>
                <span className="text-xs sm:text-sm font-semibold leading-[1.2] mt-0.5">{value}</span>
            </div>
        </div>
    );
}

function SummaryCard({
    icon: Icon,
    title,
    primaryLabel,
    primaryValue,
    secondaryLabel,
    secondaryValue,
    accentClass = 'text-sky-400',
    bgClass = 'bg-sky-500/10 border-sky-400/20'
}) {
    return (
        <div className={`rounded-2xl border ${bgClass} p-4 sm:p-5 flex flex-col justify-between transition-transform hover:scale-[1.02] duration-300`}>
            <div className="flex items-center gap-2 mb-4">
                <div className={`p-2 rounded-lg bg-black/30 backdrop-blur-md ${accentClass}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <p className="text-xs sm:text-sm font-bold tracking-wide text-white">
                    {title}
                </p>
            </div>
            <div className="flex items-end justify-between mt-auto">
                <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">{primaryLabel}</p>
                    <p className={`text-3xl sm:text-4xl font-black ${accentClass} leading-none`}>{primaryValue}</p>
                </div>
                {secondaryLabel && (
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">{secondaryLabel}</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-200 leading-none">{secondaryValue}</p>
                </div>
                )}
            </div>
        </div>
    );
}

function ListPanel({ title, icon: Icon, accentClass = 'text-sky-400', iconBgClass = 'bg-sky-500/20 text-sky-400 border-sky-500/30', items, emptyText, renderItem }) {
    return (
        <div className="flex flex-col h-full rounded-3xl border border-white/5 bg-white/[0.03] backdrop-blur-2xl overflow-hidden shadow-xl shadow-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 p-4 sm:p-5 bg-black/20">
                <div className={`p-2 rounded-xl flex items-center justify-center border ${iconBgClass}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                    {title}
                </h2>
                <div className="ml-auto bg-white/10 text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg text-slate-300">
                    {items.length} records
                </div>
            </div>
            <div 
                className="flex-1 p-3 sm:p-5 overflow-y-auto max-h-[350px] space-y-2.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[::-webkit-scrollbar-thumb]:bg-white/20"
                data-lenis-prevent-wheel
            >
                {items.length > 0 ? (
                    items.map((item, index) => renderItem(item, index))
                ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-[200px]">
                        <Icon className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-xs font-semibold">{emptyText}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/* --- MAIN PAGE COMPONENT --- */

export default function normal_UserProfile() {
    const { user_id, isLogin } = useContext(UserContext);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    const [noteModalConfig, setNoteModalConfig] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);

    useEffect(() => {
        if (!isLogin || !user_id) {
            setError('Please log in first');
            setLoading(false);
            return;
        }

        let ignore = false;
        const loadProfile = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch(`${API_URL}/users/my-profile`, {
                    headers: { Authorization: `Bearer ${isLogin}` },
                });

                if (!res.ok) {
                    throw new Error('Failed to fetch user profile');
                }

                const data = await res.json();
                
                if (ignore) return;
                
                setProfile({
                    user: data.user,
                    bibleNotes: data.user?.bibleNotes?.sort((a, b) => new Date(b.date) - new Date(a.date)) || [],
                });

            } catch (fetchError) {
                if (!ignore) {
                    console.error('Error fetching profile:', fetchError);
                    setError(fetchError.message || 'Failed to load profile data');
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        };

        loadProfile();

        return () => { ignore = true; };
    }, [isLogin, user_id]);

    const handleDeleteBibleNote = async (noteId) => {
        if (!window.confirm('Are you sure you want to delete this bible note?')) return;
        try {
            const response = await fetch(`${API_URL}/users/bible-note/${user_id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${isLogin}`
                },
                body: JSON.stringify({ noteId })
            });

            if (response.ok) {
                setProfile(prev => ({
                    ...prev,
                    bibleNotes: prev.bibleNotes.filter(n => n._id !== noteId)
                }));
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to delete note');
            }
        } catch (error) {
            console.error('Delete note error:', error);
            alert('Error deleting note');
        }
    };

    const handleSaveNote = async () => {
        if (!noteText.trim() || !noteModalConfig) return;
        setIsSubmittingNote(true);
        try {
            const noteItem = noteModalConfig.data;
            const response = await fetch(`${API_URL}/users/bible-note`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${isLogin}`
                },
                body: JSON.stringify({
                    userid: user_id,
                    verseId: noteItem.verseId,
                    bookName: noteItem.bookName,
                    chapter: noteItem.chapter,
                    verseNumber: noteItem.verseNumber,
                    text: noteItem.text,
                    note: noteText
                })
            });

            if (response.ok) {
                setProfile(prev => ({
                    ...prev,
                    bibleNotes: prev.bibleNotes.map(n =>
                        n.verseId === noteItem.verseId ? { ...n, note: noteText, date: new Date() } : n
                    ).sort((a, b) => new Date(b.date) - new Date(a.date))
                }));
                setNoteModalConfig(null);
                setNoteText('');
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to update note');
            }
        } catch (error) {
            console.error('Update note error:', error);
            alert('Error updating note');
        } finally {
            setIsSubmittingNote(false);
        }
    };

    const handleEditBibleNote = (noteItem) => {
        setNoteText(noteItem.note);
        setNoteModalConfig({ data: noteItem, existingNote: noteItem.note });
    };

    // Lock scroll when modal is open
    useEffect(() => {
        if (noteModalConfig) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    }, [noteModalConfig]);


    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-sky-500/20 border-t-sky-400 rounded-full animate-spin mb-6 shadow-[0_0_30px_rgba(56,189,248,0.2)]"></div>
                <p className="text-sky-300 font-medium tracking-wide">Loading your dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 max-w-md w-full text-center backdrop-blur-xl">
                    <Activity className="w-12 h-12 text-red-400 mx-auto mb-4 opacity-80" />
                    <h2 className="text-xl font-bold text-red-200 mb-2">Oops! Something went wrong.</h2>
                    <p className="text-red-300/80 text-sm mb-6">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-sm font-bold rounded-xl transition-colors border border-red-500/30">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: User },
        { id: 'bible', label: 'Bible Notes', icon: Book },
    ];

    return (
        <main className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] text-white pb-24">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-8 sm:pt-12">

                {/* --- HEADER PROFILE CARD --- */}
                <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-5 sm:p-8 backdrop-blur-2xl mb-6 sm:mb-8 relative overflow-hidden shadow-2xl shadow-black/50">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 opacity-[0.03] pointer-events-none">
                        <User className="w-64 h-64 sm:w-96 sm:h-96" />
                    </div>
                    <div className="absolute top-1/2 left-0 w-32 h-32 bg-sky-500/10 blur-[100px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-300 text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-4">
                            My Profile Insight
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400 mb-2 leading-tight tracking-tight">
                            {profile?.user?.Name || 'N/A'}
                        </h1>
                        <p className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 mb-6 font-medium">
                            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-500" />
                            {profile?.user?.email || 'Email not available'}
                        </p>

                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            <Badge icon={User} label="Role" value={titleCase(profile?.user?.role)} classes="bg-sky-500/5 text-sky-200 border-sky-500/10" />
                            <Badge icon={Target} label="Status" value={titleCase(profile?.user?.status)} classes="bg-emerald-500/5 text-emerald-200 border-emerald-500/10" />
                        </div>
                    </div>
                </div>

                {/* --- SMART TABS NAVIGATION --- */}
                <div className="sticky top-4 z-40 mb-6 sm:mb-8 flex gap-3 items-center">
                    <div className="flex gap-1.5 p-1.5 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 custom-scrollbar-hide flex-1 sm:flex-none">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap min-w-[120px] ${activeTab === tab.id
                                        ? 'bg-white/10 text-white shadow-lg shadow-black/20 border border-white/5 ring-1 ring-white/10'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                                    }`}
                            >
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-sky-400' : 'opacity-60'}`} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* --- TAB CONTENT AREAS --- */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <SummaryCard
                                icon={Book}
                                title="Spiritual Journey"
                                primaryLabel="Private Notes"
                                primaryValue={profile?.bibleNotes?.length || 0}
                                accentClass="text-blue-400"
                                bgClass="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-400/20"
                            />
                        </div>
                    )}

                    {/* BIBLE TAB */}
                    {activeTab === 'bible' && (
                        <div className="grid gap-5 sm:gap-6">
                            <ListPanel
                                title="My Bible Notes"
                                icon={Book}
                                accentClass="text-blue-400"
                                iconBgClass="bg-blue-500/10 text-blue-400 border-blue-500/20"
                                items={profile?.bibleNotes || []}
                                emptyText="No bible notes saved yet"
                                renderItem={(note) => (
                                    <div key={note._id || note.verseId} className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-5 hover:bg-white/5 transition-all duration-300">
                                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    <h4 className="text-base font-bold text-white tracking-tight">{note.bookName}</h4>
                                                    <span className="bg-blue-500/20 text-blue-300 text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-500/20">
                                                        {note.chapter}:{note.verseNumber}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-bold ml-auto sm:ml-0">
                                                        {formatDate(note.date)}
                                                    </span>
                                                </div>
                                                <p className="text-xs sm:text-sm text-slate-400 italic leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5 mb-3" dir="rtl">
                                                    "{note.text}"
                                                </p>
                                                <div className="flex flex-col gap-1.5">
                                                    <p className="text-[9px] uppercase tracking-widest text-blue-400/60 font-black">My Personal Note</p>
                                                    <p className="text-sm text-slate-200 font-medium leading-relaxed">
                                                        {note.note}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex sm:flex-col gap-2 shrink-0">
                                                <button 
                                                    onClick={() => handleEditBibleNote(note)}
                                                    className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all border border-white/5"
                                                    title="Edit Note"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteBibleNote(note._id)}
                                                    className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5"
                                                    title="Delete Note"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                    )}

                </div>
            </div>

            {/* Note Write Modal */}
            <AnimatePresence>
                {noteModalConfig && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-6"
                            style={{ isolation: 'isolate' }}
                        >
                            <div
                                className="absolute inset-0 bg-black/70 backdrop-blur-md"
                                onClick={() => { setNoteModalConfig(null); setNoteText(''); }}
                            />
                            <motion.div
                                initial={{ y: 60, opacity: 0, scale: 0.97 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: 40, opacity: 0, scale: 0.97 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                                className="relative w-full sm:max-w-lg bg-gradient-to-b from-[#0d1a2d] to-[#080f1c] border border-sky-500/20 rounded-t-3xl sm:rounded-3xl shadow-[0_0_60px_-10px_rgba(56,189,248,0.3)] overflow-hidden flex flex-col"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="sm:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1" />
                                <div className="h-px bg-gradient-to-r from-transparent via-sky-500/60 to-transparent" />

                                <div className="px-6 py-5 flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
                                            <Edit3 className="w-4 h-4 text-sky-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">
                                                Update Bible Note
                                            </h3>
                                            <p className="text-[10px] text-sky-400/60 font-mono uppercase tracking-widest mt-0.5">
                                                {noteModalConfig.data.bookName} {noteModalConfig.data.chapter}:{noteModalConfig.data.verseNumber}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setNoteModalConfig(null); setNoteText(''); }}
                                        className="p-1.5 text-white/30 hover:text-white/80 rounded-lg hover:bg-white/10 transition-all shrink-0 mt-0.5"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="mx-6 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-sm text-white/50 leading-relaxed line-clamp-3" dir="rtl">
                                        {noteModalConfig.data.text}
                                    </p>
                                </div>

                                <div className="px-6 pb-2">
                                    <textarea
                                        autoFocus
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        placeholder="Edit your note here..."
                                        rows={4}
                                        className="w-full bg-white/[0.04] border border-white/10 focus:border-sky-500/50 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-sky-500/30 resize-none text-sm leading-relaxed transition-all"
                                        dir="rtl"
                                    />
                                </div>

                                <div className="flex items-center gap-3 px-6 py-5">
                                    <button
                                        onClick={() => { setNoteModalConfig(null); setNoteText(''); }}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all border border-white/10"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveNote}
                                        disabled={isSubmittingNote || !noteText.trim()}
                                        className="flex-[2] py-2.5 rounded-xl text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
                                    >
                                        {isSubmittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Update Note
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .custom-scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}} />
        </main>
    );
}