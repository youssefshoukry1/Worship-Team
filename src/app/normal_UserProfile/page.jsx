'use client';

import { useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '../Portal/Portal';
import { queueOfflineAction } from '../utils/offlineQueue';
import { showToast } from '../components/ToastContainer';
import { useOfflineAvatar } from '../hooks/useOfflineAvatar';
import { removeCachedAvatar } from '../utils/avatarStorage';
import { cropProfilePhoto, resizeSquareCrop } from '../utils/profilePhoto';
import cropStyles from './profileCropper.module.css';
import {
    Activity,
    AlignJustify,
    ArrowLeft,
    Book,
    Camera,
    Check,
    ChevronRight,
    Edit3,
    Globe,
    Heart,
    List,
    Loader2,
    LogOut,
    Mail,
    Moon,
    RotateCcw,
    Settings,
    Sliders,
    SlidersHorizontal,
    Sparkles,
    Sun,
    Target,
    Trash2,
    User,
    X,
} from 'lucide-react';
import { UserContext } from '../context/User_Context';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../utils/apiBase';
import { useLanguage } from "../context/LanguageContext";
import { getGuestPrays } from '../utils/prayRecordings';
import { invalidateProfile, readCachedProfile, refreshProfile, writeCachedProfile } from '../utils/profileCache';

const BIBLE_TRANSLATIONS = [
    { id: 'AVD', name: 'فانديك (AVD)', desc: 'Arabic Van Dyck' },
    { id: 'ERV-AR', name: 'المبسطة (ERV-AR)', desc: 'Arabic Easy-to-Read Version' },
    { id: 'KEH', name: 'كتاب الحياة (KEH)', desc: 'Arabic Life Application' },
];

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

function ListPanel({ title, icon: Icon, accentClass = 'text-sky-400', iconBgClass = 'bg-sky-500/20 text-sky-400 border-sky-500/30', items, emptyText, renderItem, fullHeight = false }) {
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
                className={`flex-1 p-3 sm:p-5 space-y-2.5 ${fullHeight ? '' : 'overflow-y-auto max-h-[350px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[::-webkit-scrollbar-thumb]:bg-white/20'}`}
                {...(!fullHeight ? { 'data-lenis-prevent-wheel': true } : {})}
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

const formatVerseNumbers = (nums) => {
    if (!nums || nums.length === 0) return '';
    const sorted = [...nums].sort((a, b) => a - b);
    const isConsecutive = sorted.every((num, i) => i === 0 || num === sorted[i - 1] + 1);
    if (isConsecutive && sorted.length > 1) {
        return `${sorted[0]}-${sorted[sorted.length - 1]}`;
    }
    return sorted.join(', ');
};

const groupHighlights = (highlights) => {
    if (!highlights || highlights.length === 0) return [];
    // Sort highlights by date ascending so we can process them sequentially
    const sorted = [...highlights].sort((a, b) => new Date(a.date) - new Date(b.date));
    const groups = [];
    sorted.forEach((item) => {
        const match = groups.find(g =>
            g.bookName === item.bookName &&
            g.chapter === item.chapter &&
            g.color === item.color &&
            Math.abs(new Date(g.date) - new Date(item.date)) < 60000 // 60 seconds threshold
        );
        if (match) {
            match.verseIds.push(item.verseId);
            match.verseNumbers.push(item.verseNumber);
            match.verses.push({
                verseId: item.verseId,
                verseNumber: item.verseNumber,
                text: item.text,
                _id: item._id
            });
            match.verses.sort((a, b) => a.verseNumber - b.verseNumber);
        } else {
            groups.push({
                _id: item._id || item.verseId,
                verseIds: [item.verseId],
                bookName: item.bookName,
                chapter: item.chapter,
                verseNumbers: [item.verseNumber],
                color: item.color,
                date: item.date,
                verses: [{
                    verseId: item.verseId,
                    verseNumber: item.verseNumber,
                    text: item.text,
                    _id: item._id
                }]
            });
        }
    });
    return groups.sort((a, b) => new Date(b.date) - new Date(a.date));
};

const groupNotes = (notes) => {
    if (!notes || notes.length === 0) return [];
    const sorted = [...notes].sort((a, b) => new Date(a.date) - new Date(b.date));
    const groups = [];
    sorted.forEach((item) => {
        const match = groups.find(g =>
            g.bookName === item.bookName &&
            g.chapter === item.chapter &&
            g.note === item.note &&
            Math.abs(new Date(g.date) - new Date(item.date)) < 60000 // 60 seconds threshold
        );
        if (match) {
            if (item._id) match.noteIds.push(item._id);
            match.verseIds.push(item.verseId);
            match.verseNumbers.push(item.verseNumber);
            match.verses.push({
                verseId: item.verseId,
                verseNumber: item.verseNumber,
                text: item.text,
                _id: item._id
            });
            match.verses.sort((a, b) => a.verseNumber - b.verseNumber);
        } else {
            groups.push({
                _id: item._id || item.verseId,
                noteIds: item._id ? [item._id] : [],
                verseIds: [item.verseId],
                bookName: item.bookName,
                chapter: item.chapter,
                verseNumbers: [item.verseNumber],
                note: item.note,
                date: item.date,
                verses: [{
                    verseId: item.verseId,
                    verseNumber: item.verseNumber,
                    text: item.text,
                    _id: item._id
                }]
            });
        }
    });
    return groups.sort((a, b) => new Date(b.date) - new Date(a.date));
};

const getHighlightHex = (colorId) => {
    if (!colorId) return '#38bdf8';
    if (colorId.startsWith('#')) return colorId;

    const standard = {
        teal: '#2fc4c9', lavender: '#DAB6FC', lightgray: '#EDEDED',
        sage: '#8BB388', pinkred: '#FF2158', coral: '#F85E3B',
        cyan: '#2fc4c9', pink: '#DAB6FC', red: '#FF2158',
        yellow: '#EDEDED', green: '#8BB388', blue: '#2fc4c9', orange: '#F85E3B'
    };
    if (standard[colorId]) return standard[colorId];

    if (typeof window !== 'undefined') {
        try {
            const savedCustom = localStorage.getItem('taspe7_custom_highlights_list_v2') || localStorage.getItem('taspe7_custom_highlights_list');
            if (savedCustom) {
                const parsed = JSON.parse(savedCustom);
                const found = parsed.find(c => c.id === colorId);
                if (found && found.hex) return found.hex.startsWith('#') ? found.hex : `#${found.hex}`;
            }
        } catch { }
    }

    if (colorId.startsWith('custom-')) {
        const potentialHex = colorId.replace('custom-', '');
        if (/^[0-9a-fA-F]{3,8}$/.test(potentialHex)) {
            return '#' + potentialHex;
        }
    }

    return '#38bdf8';
};

export default function NormalUserProfile() {
    const { user_id, isLogin, setLogin, setUsername, profilePhoto, setProfilePhoto, profilePhotoPreview, clearProfilePhotoPreview, isUploadingProfilePhoto, uploadProfilePhoto, setUserRole, setUser_id, setChurchId, setHymnIds, setUserStatus } = useContext(UserContext);
    const router = useRouter();
    const { language, setLanguage } = useLanguage();
    const { src: cachedProfileAvatarSrc, markFailed: markProfileAvatarFailed } = useOfflineAvatar(user_id, profilePhoto);
    const profileAvatarSrc = profilePhotoPreview || cachedProfileAvatarSrc;
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setProfile(previous => previous && previous.user?.profilePhoto !== profilePhoto
            ? { ...previous, user: { ...previous.user, profilePhoto } }
            : previous);
    }, [profilePhoto]);
    const { theme, toggleTheme, isDark } = useTheme?.() || {};
    const [currentView, setCurrentView] = useState('menu');

    // Clears user session and navigates to sign-in
    const handleLogout = () => {
        localStorage.removeItem('user_Taspe7_Token');
        localStorage.removeItem('user_Taspe7_GlobalRole');
        localStorage.removeItem('user_Taspe7_SubRole');
        localStorage.removeItem('user_Taspe7_Role');
        localStorage.removeItem('user_Taspe7_ID');
        localStorage.removeItem('user_Taspe7_ChurchId');
        localStorage.removeItem('user_Taspe7_HymnIds');
        localStorage.removeItem('user_Taspe7_Status');
        localStorage.removeItem('user_Taspe7_Username');
        localStorage.removeItem('user_Taspe7_Teams');
        localStorage.removeItem('user_Taspe7_ProfilePhoto');

        setLogin(null);
        if (setUserRole) setUserRole(null);
        if (setUser_id) setUser_id(null);
        if (setChurchId) setChurchId(null);
        if (setHymnIds) setHymnIds([]);
        if (setUserStatus) setUserStatus(null);
        if (setUsername) setUsername(null);
        if (setProfilePhoto) setProfilePhoto(null);

        router.push('/login');
    };

    // Bible settings synced with Bible reader
    const [bibleTranslation, setBibleTranslation] = useState(() => {
        if (typeof window === 'undefined') return 'AVD';
        return localStorage.getItem('taspe7_bible_translation') || 'AVD';
    });
    const handleSetBibleTranslation = (tr) => {
        setBibleTranslation(tr);
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_bible_translation', tr);
        }
    };

    const [bibleVerseFontSize, setBibleVerseFontSize] = useState(() => {
        if (typeof window === 'undefined') return 20;
        const saved = localStorage.getItem('taspe7_bible_verse_font_size');
        return saved ? parseInt(saved, 10) : 20;
    });
    const handleSetBibleVerseFontSize = (val) => {
        setBibleVerseFontSize(val);
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_bible_verse_font_size', val.toString());
        }
    };

    const [bibleVerseSpacing, setBibleVerseSpacing] = useState(() => {
        if (typeof window === 'undefined') return 16;
        const saved = localStorage.getItem('taspe7_bible_verse_spacing');
        return saved ? parseInt(saved, 10) : 16;
    });
    const handleSetBibleVerseSpacing = (val) => {
        setBibleVerseSpacing(val);
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_bible_verse_spacing', val.toString());
        }
    };

    const [bibleViewMode, setBibleViewMode] = useState(() => {
        if (typeof window === 'undefined') return 'list';
        return localStorage.getItem('taspe7_bible_view_mode') || 'list';
    });
    const handleSetBibleViewMode = (mode) => {
        setBibleViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_bible_view_mode', mode);
        }
    };

    // Highlights view mode (vertical vs continuous)
    const [highlightsViewMode, setHighlightsViewMode] = useState(() => {
        if (typeof window === 'undefined') return 'list';
        return localStorage.getItem('taspe7_highlights_view_mode') || 'list';
    });
    const handleSetHighlightsViewMode = (mode) => {
        setHighlightsViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_highlights_view_mode', mode);
        }
    };

    // Memoize grouped highlights for performance
    const groupedBibleHighlights = useMemo(() => {
        return groupHighlights(profile?.bibleHighlights || []);
    }, [profile?.bibleHighlights]);

    // Notes view mode (vertical vs continuous)
    const [notesViewMode, setNotesViewMode] = useState(() => {
        if (typeof window === 'undefined') return 'list';
        return localStorage.getItem('taspe7_notes_view_mode') || 'list';
    });
    const handleSetNotesViewMode = (mode) => {
        setNotesViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_notes_view_mode', mode);
        }
    };

    // Memoize grouped notes for performance
    const groupedBibleNotes = useMemo(() => {
        return groupNotes(profile?.bibleNotes || []);
    }, [profile?.bibleNotes]);

    // Handles sub-page navigation with browser history
    const navigateToView = (view) => {
        setCurrentView(view);
        if (typeof window !== 'undefined') {
            window.history.pushState({ profileView: view }, '', `#${view}`);
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    };

    // Returns to main settings menu
    const goBackToMenu = () => {
        if (typeof window !== 'undefined' && window.location.hash) {
            window.history.back();
        } else {
            setCurrentView('menu');
            if (typeof window !== 'undefined') {
                window.scrollTo({ top: 0, behavior: 'instant' });
            }
        }
    };

    // Synchronizes view state with browser back/forward buttons
    useEffect(() => {
        const handlePopState = (e) => {
            if (e.state?.profileView) {
                setCurrentView(e.state.profileView);
            } else if (typeof window !== 'undefined' && window.location.hash) {
                const hash = window.location.hash.replace('#', '');
                if (['highlights', 'notes', 'bible_settings'].includes(hash)) {
                    setCurrentView(hash);
                    return;
                }
                setCurrentView('menu');
            } else {
                setCurrentView('menu');
            }
        };

        if (typeof window !== 'undefined' && window.location.hash) {
            const hash = window.location.hash.replace('#', '');
            if (['highlights', 'notes', 'bible_settings'].includes(hash)) {
                setCurrentView(hash);
            }
        }

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    
    const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
    const isUploadingPhoto = isProcessingPhoto || isUploadingProfilePhoto;
    const fileInputRef = useRef(null);

    const [isViewingPhoto, setIsViewingPhoto] = useState(false);
    const [photoToCrop, setPhotoToCrop] = useState(null);
    const [crop, setCrop] = useState();
    const imgRef = useRef(null);
    const edgeDragCleanup = useRef(null);

    // Edit Name & Username state
    const [editModal, setEditModal] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [usernameCheck, setUsernameCheck] = useState({ checking: false, available: null, reason: '' });

    // The viewer covers the nav without triggering its slide animation.
    // Keep the existing nav lock for the cropper.
    useEffect(() => {
        const hidden = !!photoToCrop;
        window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden } }));
        return () => {
            if (hidden) {
                window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: false } }));
            }
        };
    }, [photoToCrop]);

    const [localPrayCount, setLocalPrayCount] = useState(0);
    useEffect(() => {
        getGuestPrays().then((prays) => setLocalPrayCount(prays.length)).catch(() => {});
    }, []);

    const onImageLoad = (e) => {
        const { width, height } = e.currentTarget;
        const initialCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 100 }, 1, width, height),
            width, height
        );
        setCrop(initialCrop);
    };

    const onCropEdgePointerDown = (event) => {
        const edge = event.target.closest('.ReactCrop__drag-handle')?.dataset.ord;
        if (!['n', 's', 'e', 'w'].includes(edge) || !crop || !imgRef.current || event.isPrimary === false) return;
        event.preventDefault();
        event.stopPropagation();
        edgeDragCleanup.current?.();
        const initialCrop = crop;
        const bounds = imgRef.current.getBoundingClientRect();
        const start = edge === 'n' || edge === 's' ? event.clientY : event.clientX;
        const pointerId = event.pointerId;
        const move = (moveEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            if (moveEvent.cancelable) moveEvent.preventDefault();
            const position = edge === 'n' || edge === 's' ? moveEvent.clientY : moveEvent.clientX;
            const nextCrop = resizeSquareCrop(initialCrop, edge, position - start, bounds.width, bounds.height);
            setCrop(nextCrop);
        };
        const finish = (upEvent) => {
            if (upEvent.pointerId === pointerId) edgeDragCleanup.current?.();
        };
        edgeDragCleanup.current = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            edgeDragCleanup.current = null;
        };
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
    };

    const onCropEdgeKeyDown = (event) => {
        const edge = event.target.closest('.ReactCrop__drag-handle')?.dataset.ord;
        const horizontal = edge === 'e' || edge === 'w';
        const delta = (horizontal ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 })[event.key];
        if (!['n', 's', 'e', 'w'].includes(edge) || !delta || !crop || !imgRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const { width, height } = imgRef.current.getBoundingClientRect();
        const nextCrop = resizeSquareCrop(crop, edge, delta * (event.shiftKey ? 10 : 1), width, height);
        setCrop(nextCrop);
    };

    const [noteModalConfig, setNoteModalConfig] = useState(null);
    const [noteText, setNoteText] = useState('');
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);

    // Updates profile state and local cache
    const updateProfileState = (modifier) => {
        setProfile(prev => {
            const updatedProfile = typeof modifier === 'function' ? modifier(prev) : modifier;
            if (updatedProfile) {
                invalidateProfile(API_URL, isLogin);
                writeCachedProfile(user_id, updatedProfile).catch(console.error);
            }
            return updatedProfile;
        });
    };

    // Debounced username availability check
    useEffect(() => {
        if (!editModal || editModal.type !== 'username') return;

        const currentVal = (editValue || '').trim().toLowerCase();
        const originalVal = (profile?.user?.username || '').trim().toLowerCase();

        if (!currentVal) {
            setUsernameCheck({ checking: false, available: null, reason: '' });
            return;
        }

        if (currentVal === originalVal) {
            setUsernameCheck({ checking: false, available: true, reason: 'Current username', isCurrent: true });
            return;
        }

        if (!/^[a-z0-9_]+$/.test(currentVal)) {
            setUsernameCheck({
                checking: false,
                available: false,
                reason: 'Only letters, numbers, and underscores (_).'
            });
            return;
        }

        setUsernameCheck({ checking: true, available: null, reason: '' });
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_URL}/users/check-username?username=${encodeURIComponent(currentVal)}`, { signal: controller.signal });
                const data = await res.json();
                if (controller.signal.aborted) return;
                if (data.available) {
                    setUsernameCheck({ checking: false, available: true, reason: 'Username is available' });
                } else {
                    setUsernameCheck({ checking: false, available: false, reason: data.reason || 'Username is already taken' });
                }
            } catch {
                if (!controller.signal.aborted) setUsernameCheck({ checking: false, available: false, reason: 'Error checking username' });
            }
        }, 350);

        return () => { clearTimeout(timer); controller.abort(); };
    }, [editValue, editModal, profile?.user?.username]);

    const handleSaveEdit = async () => {
        if (!editModal || isSavingEdit) return;
        const trimmed = editValue.trim();

        if (editModal.type === 'name') {
            if (!trimmed) {
                showToast({ message: 'Name cannot be empty', type: 'error' });
                return;
            }
            if (trimmed === profile?.user?.Name) {
                setEditModal(null);
                return;
            }

            setIsSavingEdit(true);
            try {
                const res = await fetch(`${API_URL}/users/update-name`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${isLogin}`
                    },
                    body: JSON.stringify({ name: trimmed })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.msg || 'Failed to update name');

                updateProfileState(prev => prev ? {
                    ...prev,
                    user: { ...prev.user, Name: trimmed }
                } : prev);

                showToast({ message: 'Name updated successfully', type: 'success' });
                setEditModal(null);
            } catch (err) {
                showToast({ message: err.message || 'Error updating name', type: 'error' });
            } finally {
                setIsSavingEdit(false);
            }
        } else if (editModal.type === 'username') {
            const lower = trimmed.toLowerCase();
            if (!lower) {
                showToast({ message: 'Username cannot be empty', type: 'error' });
                return;
            }
            if (lower === profile?.user?.username) {
                setEditModal(null);
                return;
            }
            if (!usernameCheck.available || usernameCheck.isCurrent) {
                showToast({ message: usernameCheck.reason || 'Invalid username', type: 'error' });
                return;
            }

            setIsSavingEdit(true);
            try {
                const res = await fetch(`${API_URL}/users/set-username`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${isLogin}`
                    },
                    body: JSON.stringify({ username: lower })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.msg || 'Failed to set username');

                if (data.token) {
                    localStorage.setItem('user_Taspe7_Token', data.token);
                    setLogin(data.token);
                }
                if (data.username) {
                    localStorage.setItem('user_Taspe7_Username', data.username);
                    setUsername(data.username);
                }

                updateProfileState(prev => prev ? {
                    ...prev,
                    user: { ...prev.user, username: data.username || lower }
                } : prev);

                showToast({ message: 'Username updated successfully', type: 'success' });
                setEditModal(null);
            } catch (err) {
                showToast({ message: err.message || 'Error updating username', type: 'error' });
            } finally {
                setIsSavingEdit(false);
            }
        }
    };

    // Object URLs avoid copying large camera photos into base64 strings.
    useEffect(() => {
        return () => {
            edgeDragCleanup.current?.();
            if (photoToCrop) URL.revokeObjectURL(photoToCrop);
        };
    }, [photoToCrop]);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || isUploadingPhoto) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            showToast({ message: 'Please choose a JPEG, PNG, or WebP photo', type: 'error' });
            return;
        }
        // The upload limit applies to the compressed image, not the camera original.
        if (file.size > 25 * 1024 * 1024) {
            showToast({ message: 'File is too large (max 25MB)', type: 'error' });
            return;
        }
        setCrop(undefined);
        setPhotoToCrop(URL.createObjectURL(file));
    };

    const confirmCropAndUpload = async () => {
        if (!photoToCrop || !crop || !imgRef.current || isUploadingPhoto) return;
        setIsProcessingPhoto(true);
        try {
            const blob = await cropProfilePhoto(imgRef.current, crop);
            // Publish the local preview before starting the network work. The
            // provider keeps both alive if the user navigates to another page.
            void uploadProfilePhoto(blob);
            setPhotoToCrop(null);
            setIsViewingPhoto(false);
        } catch (error) {
            showToast({ message: error.message || 'Unable to process photo', type: 'error' });
        } finally {
            setIsProcessingPhoto(false);
        }
    };

    const handlePhotoRemove = async () => {
        if (isUploadingPhoto) return;
        if (!window.confirm('Are you sure you want to remove your profile photo?')) return;
        setIsProcessingPhoto(true);
        try {
            const res = await fetch(`${API_URL}/users/profile-photo`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${isLogin}` }
            });
            if (!res.ok) throw new Error('Failed to remove photo');
            
            try {
                await removeCachedAvatar(user_id, profilePhoto);
            } catch (cacheError) {
                console.warn('Profile photo cache cleanup failed:', cacheError);
            }
            clearProfilePhotoPreview();
            setProfilePhoto(null);
            updateProfileState(prev => prev ? { ...prev, user: { ...prev.user, profilePhoto: null } } : prev);
            localStorage.removeItem("user_Taspe7_ProfilePhoto");
            showToast({ message: 'Profile photo removed', type: 'success' });
        } catch (error) {
            console.error('Photo remove error:', error);
            showToast({ message: error.message || 'Removal failed', type: 'error' });
        } finally {
            setIsProcessingPhoto(false);
        }
    };

    useEffect(() => {
        if (!isLogin || !user_id) {
            setError('Please log in first');
            setLoading(false);
            return;
        }

        let ignore = false;
        const loadProfile = async () => {
            try {
                // 1. استرجاع البيانات من الكاش أولاً لعرضها فوراً
                const cachedData = await readCachedProfile(user_id);
                if (cachedData && !ignore) {
                    setProfile(cachedData);
                    setLoading(false);
                } else if (!ignore) {
                    setLoading(true);
                }

                // 2. تحديث البيانات من السيرفر في الخلفية
                const newProfileData = await refreshProfile(API_URL, isLogin, user_id);
                if (ignore) return;

                // 3. تحديث الكاش والـ UI بالبيانات الجديدة
                setProfile(newProfileData);
                setError(null);

            } catch (fetchError) {
                if (!ignore) {
                    console.error('Error fetching profile:', fetchError);
                    const cachedData = await readCachedProfile(user_id);
                    if (!cachedData) {
                        setError(fetchError.message || 'Failed to load profile data');
                    }
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        };

        loadProfile();

        const refresh = () => {
            refreshProfile(API_URL, isLogin, user_id, { force: true }).then(data => {
                if (!ignore) { setProfile(data); setError(null); }
            }).catch(() => {});
        };
        window.addEventListener('focus', refresh);
        return () => { ignore = true; window.removeEventListener('focus', refresh); };
    }, [isLogin, user_id]);

    const handleDeleteBibleNote = async (noteId) => {
        if (!window.confirm('Are you sure you want to delete this bible note?')) return;
        const idsToDelete = Array.isArray(noteId) ? noteId : [noteId];
        try {
            await Promise.all(idsToDelete.map(id =>
                fetch(`${API_URL}/users/bible-note/${user_id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${isLogin}`
                    },
                    body: JSON.stringify({ noteId: id })
                })
            ));

            updateProfileState(prev => ({
                ...prev,
                bibleNotes: prev.bibleNotes.filter(n => !idsToDelete.includes(n._id))
            }));
        } catch (error) {
            const isNetworkError = !navigator.onLine || error.message.includes('Failed to fetch') || error.message.includes('Network Error');
            if (isNetworkError) {
                for (const id of idsToDelete) {
                    await queueOfflineAction(`${API_URL}/users/bible-note/${user_id}`, 'DELETE', { noteId: id }, { Authorization: `Bearer ${isLogin}` });
                }
                updateProfileState(prev => ({
                    ...prev,
                    bibleNotes: prev.bibleNotes.filter(n => !idsToDelete.includes(n._id))
                }));
                showToast({ message: '📶 Offline: Note deleted locally. Will sync when online.', type: 'offline', duration: 4000 });
                return;
            }
            console.error('Delete note error:', error);
            alert('Error deleting note');
        }
    };

    const handleDeleteBibleHighlight = async (verseId) => {
        if (!window.confirm('Are you sure you want to delete this highlight?')) return;
        const idsToDelete = Array.isArray(verseId) ? verseId : [verseId];

        // Sync with local storage
        if (typeof window !== 'undefined') {
            try {
                const raw = localStorage.getItem('taspe7_local_bible_highlights');
                if (raw) {
                    const current = JSON.parse(raw);
                    idsToDelete.forEach(id => {
                        delete current[String(id)];
                    });
                    localStorage.setItem('taspe7_local_bible_highlights', JSON.stringify(current));
                }
            } catch { }
        }

        try {
            const response = await fetch(`${API_URL}/users/bible-highlight/${user_id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${isLogin}`
                },
                body: JSON.stringify({ verseId })
            });

            if (response.ok) {
                updateProfileState(prev => {
                    return {
                        ...prev,
                        bibleHighlights: prev.bibleHighlights.filter(h => !idsToDelete.includes(h.verseId))
                    };
                });
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to delete highlight');
            }
        } catch (error) {
            const isNetworkError = !navigator.onLine || error.message.includes('Failed to fetch') || error.message.includes('Network Error');
            if (isNetworkError) {
                await queueOfflineAction(`${API_URL}/users/bible-highlight/${user_id}`, 'DELETE', { verseId }, { Authorization: `Bearer ${isLogin}` });
                updateProfileState(prev => {
                    return {
                        ...prev,
                        bibleHighlights: prev.bibleHighlights.filter(h => !idsToDelete.includes(h.verseId))
                    };
                });
                showToast({ message: '📶 Offline: Highlight deleted locally. Will sync when online.', type: 'offline', duration: 4000 });
                return;
            }
            console.error('Delete highlight error:', error);
            alert('Error deleting highlight');
        }
    };

    const handleSaveNote = async () => {
        if (!noteText.trim() || !noteModalConfig) return;
        setIsSubmittingNote(true);
        const noteItem = noteModalConfig.data;
        const verses = noteItem.verses || [noteItem];

        try {
            await Promise.all(verses.map(v =>
                fetch(`${API_URL}/users/bible-note`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${isLogin}`
                    },
                    body: JSON.stringify({
                        userid: user_id,
                        verseId: v.verseId || noteItem.verseId,
                        bookName: noteItem.bookName,
                        chapter: noteItem.chapter,
                        verseNumber: v.verseNumber || noteItem.verseNumber,
                        text: v.text || noteItem.text,
                        note: noteText
                    })
                })
            ));

            const verseIds = verses.map(v => v.verseId || noteItem.verseId);
            updateProfileState(prev => ({
                ...prev,
                bibleNotes: prev.bibleNotes.map(n =>
                    verseIds.includes(n.verseId) ? { ...n, note: noteText, date: new Date() } : n
                ).sort((a, b) => new Date(b.date) - new Date(a.date))
            }));
            setNoteModalConfig(null);
            setNoteText('');
        } catch (error) {
            const isNetworkError = !navigator.onLine || error.message.includes('Failed to fetch') || error.message.includes('Network Error');
            if (isNetworkError) {
                for (const v of verses) {
                    const payload = {
                        userid: user_id,
                        verseId: v.verseId || noteItem.verseId,
                        bookName: noteItem.bookName,
                        chapter: noteItem.chapter,
                        verseNumber: v.verseNumber || noteItem.verseNumber,
                        text: v.text || noteItem.text,
                        note: noteText
                    };
                    await queueOfflineAction(`${API_URL}/users/bible-note`, 'POST', payload, { Authorization: `Bearer ${isLogin}` });
                }
                const verseIds = verses.map(v => v.verseId || noteItem.verseId);
                updateProfileState(prev => ({
                    ...prev,
                    bibleNotes: prev.bibleNotes.map(n =>
                        verseIds.includes(n.verseId) ? { ...n, note: noteText, date: new Date() } : n
                    ).sort((a, b) => new Date(b.date) - new Date(a.date))
                }));
                setNoteModalConfig(null);
                setNoteText('');
                showToast({ message: '📶 Offline: Note saved locally. Will sync when online.', type: 'offline', duration: 4000 });
                return;
            }
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
            <div className="min-h-screen bg-[var(--app-bg)] flex flex-col items-center justify-center p-4 transition-colors duration-150">
                <div className="w-16 h-16 border-4 border-sky-500/20 border-t-sky-400 rounded-full animate-spin mb-6 shadow-[0_0_30px_rgba(56,189,248,0.2)]"></div>
                <p className="text-sky-300 font-medium tracking-wide">Loading your dashboard...</p>
            </div>
        );
    }

    if (error && !profile) {
        return (
            <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center p-4 transition-colors duration-150">
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

    return (
        <main className="min-h-screen bg-[var(--app-bg)] text-white pb-24 transition-colors duration-150">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-6 sm:pt-10">

                {currentView === 'menu' ? (
                    <>
                        {/* --- HEADER PROFILE CARD --- */}
                        <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-5 sm:p-8 backdrop-blur-2xl mb-6 sm:mb-8 relative overflow-hidden shadow-2xl shadow-black/50">
                            <div className="absolute top-1/2 left-0 w-32 h-32 bg-sky-500/10 blur-[100px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>

                            <div className="relative z-10 flex flex-row items-start justify-between gap-3 sm:gap-6">
                                <div className="flex flex-row items-center gap-3 sm:gap-6 min-w-0">
                                    <div className="relative shrink-0">
                                        <div 
                                            className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-sky-500/20 bg-black/40 flex items-center justify-center shadow-xl shadow-black/50 cursor-pointer"
                                            onClick={() => {
                                                if (profileAvatarSrc) {
                                                    setIsViewingPhoto(true);
                                                } else {
                                                    fileInputRef.current?.click();
                                                }
                                            }}
                                        >
                                            {profileAvatarSrc ? (
                                                <img src={profileAvatarSrc} alt="Profile" onError={markProfileAvatarFailed} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                                            ) : (
                                                <span className="text-2xl sm:text-4xl font-bold text-sky-400/50">
                                                    {profile?.user?.Name?.charAt(0) || 'U'}
                                                </span>
                                            )}
                                        </div>
                                        
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isUploadingPhoto}
                                            className="absolute bottom-0 right-0 translate-x-1 translate-y-1 w-7 h-7 sm:w-9 sm:h-9 bg-slate-900 rounded-full flex items-center justify-center border-2 border-sky-500/30 shadow-lg hover:bg-slate-800 transition-colors"
                                            title="Change Photo"
                                        >
                                            {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 animate-spin" /> : <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />}
                                        </button>

                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            accept="image/jpeg, image/png, image/webp" 
                                            onChange={handleFileSelect} 
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                                            <h1 className="text-xl sm:text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400 leading-tight tracking-tight truncate">
                                                {profile?.user?.Name || 'N/A'}
                                            </h1>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setEditValue(profile?.user?.Name || '');
                                                    setEditModal({ type: 'name' });
                                                }}
                                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                                                title="Edit Name"
                                            >
                                                <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-400 font-medium">
                                            <span className="truncate">
                                                @{profile?.user?.username || profile?.user?.Name?.toLowerCase().replace(/\s+/g, '') || 'username'}
                                            </span>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setEditValue(profile?.user?.username || '');
                                                    setEditModal({ type: 'username' });
                                                }}
                                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                                                title="Edit Username"
                                            >
                                                <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-end gap-2 shrink-0">
                                    <Badge icon={User} label="Role" value={titleCase(profile?.user?.role)} classes="bg-sky-500/5 text-sky-200 border-sky-500/10" />
                                    {!navigator.onLine && (
                                        <Badge icon={Activity} label="Status" value="Offline Mode" classes="bg-orange-500/10 text-orange-400 border-orange-500/20" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* --- SETTINGS GROUPS (CHATGPT STYLE) --- */}
                        <div className="space-y-6">
                            {/* Bible Group */}
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                                    Bible
                                </h3>
                                <div className="rounded-2xl bg-zinc-900/60 sm:bg-white/[0.03] border border-white/5 divide-y divide-white/5 overflow-hidden shadow-xl shadow-black/20">
                                    <button
                                        type="button"
                                        onClick={() => navigateToView('highlights')}
                                        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <Sparkles className="w-5 h-5 text-slate-300 shrink-0" />
                                            <span className="text-sm sm:text-base font-semibold text-white">Bible Highlights</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-400 font-medium">
                                                {groupedBibleHighlights.length} {groupedBibleHighlights.length === 1 ? 'record' : 'records'}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-slate-500" />
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => navigateToView('notes')}
                                        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <Book className="w-5 h-5 text-slate-300 shrink-0" />
                                            <span className="text-sm sm:text-base font-semibold text-white">Bible Notes</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-400 font-medium">
                                                {groupedBibleNotes.length} {groupedBibleNotes.length === 1 ? 'record' : 'records'}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-slate-500" />
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => router.push('/plans')}
                                        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3.5"><Sparkles className="w-5 h-5 shrink-0 text-cyan-400" /><span className="text-sm sm:text-base font-semibold text-white">{language === 'ar' ? 'الخطط والاشتراك' : 'Plans & subscription'}</span></div><ChevronRight className="h-4 w-4 text-slate-500" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigateToView('bible_settings')}
                                        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <Sliders className="w-5 h-5 text-slate-300 shrink-0" />
                                            <div>
                                                <span className="text-sm sm:text-base font-semibold text-white block">Bible Settings</span>
                                                <span className="text-xs text-slate-400">
                                                    {bibleTranslation} • {bibleVerseFontSize}px • {bibleViewMode === 'paragraph' ? 'Continuous' : 'Vertical'}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-500" />
                                    </button>
                                </div>
                            </div>

                            {/* Appearance Group */}
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                                    Appearance
                                </h3>
                                <div className="rounded-2xl bg-zinc-900/60 sm:bg-white/[0.03] border border-white/5 divide-y divide-white/5 overflow-hidden shadow-xl shadow-black/20">
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3.5">
                                            {isDark ? <Moon className="w-5 h-5 text-slate-300 shrink-0" /> : <Sun className="w-5 h-5 text-slate-300 shrink-0" />}
                                            <div>
                                                <p className="text-sm sm:text-base font-semibold text-white">Theme</p>
                                                <p className="text-xs text-slate-400">{isDark ? 'Dark Mode' : 'Light Mode'}</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleTheme}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isDark ? 'bg-sky-500' : 'bg-slate-700'}`}
                                            aria-label="Toggle Theme"
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDark ? 'translate-x-6' : 'translate-x-1'}`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {(profile?.user?.global_role || profile?.user?.role) === 'PROGRAMER' && (
                                <div>
                                    <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">PROGRAMER</h3>
                                    <button type="button" onClick={() => router.push('/ProgramerDashboard')} className="flex w-full items-center justify-between rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4 text-left hover:bg-sky-400/10">
                                        <div className="flex items-center gap-3.5"><Settings className="h-5 w-5 shrink-0 text-sky-300" /><div><span className="block text-sm font-semibold text-white">App control center</span><span className="mt-1 block text-xs text-slate-400">OTA controll and UI animations</span></div></div><ChevronRight className="h-4 w-4 text-slate-500" />
                                    </button>
                                </div>
                            )}

                            {/* General Settings Group */}
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                                    General Settings
                                </h3>
                                <div className="rounded-2xl bg-zinc-900/60 sm:bg-white/[0.03] border border-white/5 divide-y divide-white/5 overflow-hidden shadow-xl shadow-black/20">
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3.5">
                                            <Settings className="w-5 h-5 text-slate-300 shrink-0" />
                                            <div>
                                                <p className="text-sm sm:text-base font-semibold text-white">General Preferences</p>
                                                <p className="text-xs text-slate-400">Configure app and account options</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-500" />
                                    </div>
                                </div>
                            </div>

                            {/* Translations Group */}
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                                    {language === 'ar' ? 'الترجمة واللغة' : 'Translations & Language'}
                                </h3>
                                <div className="rounded-2xl bg-zinc-900/60 sm:bg-white/[0.03] border border-white/5 p-4 shadow-xl shadow-black/20 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <Globe className="w-5 h-5 text-slate-300 shrink-0" />
                                        <div>
                                            <p className="text-sm sm:text-base font-semibold text-white">
                                                {language === 'ar' ? 'لغة التطبيق' : 'App Language'}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {language === 'ar' ? 'العربية' : 'English'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setLanguage('ar')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                language === 'ar'
                                                    ? 'bg-sky-500 text-slate-950 shadow-md'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            العربية
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLanguage('en')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                language === 'en'
                                                    ? 'bg-sky-500 text-slate-950 shadow-md'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            English
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Logout Button */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 font-bold text-sm sm:text-base transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                                    <span>{language === 'ar' ? 'تسجيل الخروج' : 'Log Out'}</span>
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    /* --- DEDICATED SUB-PAGES (CHATGPT STYLE) --- */
                    <div>
                        {currentView === 'highlights' && (
                            <div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={goBackToMenu}
                                            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-colors shrink-0"
                                            title="Back"
                                        >
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <div>
                                            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                                                <Sparkles className="w-5 h-5 text-slate-300" />
                                                Bible Highlights
                                            </h1>
                                            <p className="text-xs text-slate-400">
                                                {groupedBibleHighlights.length} {groupedBibleHighlights.length === 1 ? 'record' : 'records'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Vertical / Continuous Toggle */}
                                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 gap-1 self-start sm:self-auto">
                                        <button
                                            type="button"
                                            onClick={() => handleSetHighlightsViewMode('list')}
                                            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                                                highlightsViewMode === 'list'
                                                    ? 'bg-sky-500 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                            title="Vertical View"
                                        >
                                            <List className="w-3.5 h-3.5" />
                                            <span>Vertical</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetHighlightsViewMode('paragraph')}
                                            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                                                highlightsViewMode === 'paragraph'
                                                    ? 'bg-sky-500 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                            title="Continuous View"
                                        >
                                            <AlignJustify className="w-3.5 h-3.5" />
                                            <span>Continuous</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Direct Highlights List */}
                                {groupedBibleHighlights.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 rounded-3xl border border-white/5 bg-white/[0.02]">
                                        <Sparkles className="w-10 h-10 mb-3 opacity-20" />
                                        <p className="text-xs font-semibold">No bible highlights saved yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {groupedBibleHighlights.map((highlight) => {
                                            const hex = getHighlightHex(highlight.color);
                                            return (
                                                <div key={highlight._id} className="rounded-2xl border border-white/5 bg-zinc-900/60 sm:bg-white/[0.03] p-4 sm:p-5 hover:bg-white/5 transition-all duration-300 relative overflow-hidden group shadow-xl shadow-black/20">
                                                    <div className="absolute top-0 bottom-0 right-0 w-1.5 opacity-80" style={{ backgroundColor: hex }}></div>
                                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4 relative z-10 pr-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                                <h4 className="text-base font-bold text-white tracking-tight">{highlight.bookName}</h4>
                                                                <span className="bg-sky-500/20 text-sky-300 text-[10px] font-black px-2 py-0.5 rounded-md border border-sky-500/20">
                                                                    {highlight.chapter}:{formatVerseNumbers(highlight.verseNumbers)}
                                                                </span>
                                                                <span className="text-[10px] text-slate-500 font-bold ml-auto sm:ml-0">
                                                                    {formatDate(highlight.date)}
                                                                </span>
                                                            </div>

                                                            {highlightsViewMode === 'list' ? (
                                                                <div className="space-y-2 mt-2">
                                                                    {highlight.verses.map((v) => (
                                                                        <p key={v.verseId} className="text-xs sm:text-sm text-slate-200 leading-relaxed p-3 rounded-xl border border-white/5 bg-white/5 shadow-inner" style={{ backgroundColor: `${hex}15`, borderColor: `${hex}30` }} dir="rtl">
                                                                            <span className="text-sky-400/80 font-bold ml-1.5">[{v.verseNumber}]</span>
                                                                            {v.text}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-2">
                                                                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed p-3 rounded-xl border border-white/5 bg-white/5 shadow-inner" style={{ backgroundColor: `${hex}15`, borderColor: `${hex}30`, lineHeight: 1.8 }} dir="rtl">
                                                                        {highlight.verses.map((v, i) => (
                                                                            <span key={v.verseId}>
                                                                                <span className="text-sky-400/80 font-bold ml-1.5">[{v.verseNumber}]</span>
                                                                                {v.text}
                                                                                {i < highlight.verses.length - 1 && <span className="inline-block w-2.5" />}
                                                                            </span>
                                                                        ))}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteBibleHighlight(highlight.verseIds)}
                                                            className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5 shrink-0 self-start"
                                                            title="Delete Highlight"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {currentView === 'notes' && (
                            <div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={goBackToMenu}
                                            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-colors shrink-0"
                                            title="Back"
                                        >
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <div>
                                            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                                                <Book className="w-5 h-5 text-slate-300" />
                                                Bible Notes
                                            </h1>
                                            <p className="text-xs text-slate-400">
                                                {groupedBibleNotes.length} {groupedBibleNotes.length === 1 ? 'record' : 'records'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Vertical / Continuous Toggle */}
                                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 gap-1 self-start sm:self-auto">
                                        <button
                                            type="button"
                                            onClick={() => handleSetNotesViewMode('list')}
                                            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                                                notesViewMode === 'list'
                                                    ? 'bg-sky-500 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                            title="Vertical View"
                                        >
                                            <List className="w-3.5 h-3.5" />
                                            <span>Vertical</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetNotesViewMode('paragraph')}
                                            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                                                notesViewMode === 'paragraph'
                                                    ? 'bg-sky-500 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                            title="Continuous View"
                                        >
                                            <AlignJustify className="w-3.5 h-3.5" />
                                            <span>Continuous</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Direct Notes List */}
                                {groupedBibleNotes.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 rounded-3xl border border-white/5 bg-white/[0.02]">
                                        <Book className="w-10 h-10 mb-3 opacity-20" />
                                        <p className="text-xs font-semibold">No bible notes saved yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {groupedBibleNotes.map((note) => (
                                            <div key={note._id} className="rounded-2xl border border-white/5 bg-zinc-900/60 sm:bg-white/[0.03] p-4 sm:p-5 hover:bg-white/5 transition-all duration-300 relative overflow-hidden group shadow-xl shadow-black/20">
                                                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                                                            <h4 className="text-base font-bold text-white tracking-tight">{note.bookName}</h4>
                                                            <span className="bg-sky-500/20 text-sky-300 text-[10px] font-black px-2 py-0.5 rounded-md border border-sky-500/20">
                                                                {note.chapter}:{formatVerseNumbers(note.verseNumbers)}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-bold ml-auto sm:ml-0">
                                                                {formatDate(note.date)}
                                                            </span>
                                                        </div>

                                                        {notesViewMode === 'list' ? (
                                                            <div className="space-y-2 mb-3">
                                                                {note.verses.map((v) => (
                                                                    <p key={v.verseId} className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5" dir="rtl">
                                                                        <span className="text-sky-400 font-bold ml-1.5">[{v.verseNumber}]</span>
                                                                        {v.text}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="mb-3">
                                                                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5" dir="rtl" style={{ lineHeight: 1.8 }}>
                                                                    {note.verses.map((v, i) => (
                                                                        <span key={v.verseId}>
                                                                            <span className="text-sky-400 font-bold ml-1.5">[{v.verseNumber}]</span>
                                                                            {v.text}
                                                                            {i < note.verses.length - 1 && <span className="inline-block w-2.5" />}
                                                                        </span>
                                                                    ))}
                                                                </p>
                                                            </div>
                                                        )}

                                                        <div className="flex flex-col gap-1.5 pt-1">
                                                            <p className="text-[9px] uppercase tracking-widest text-sky-400/70 font-black">My Personal Note</p>
                                                            <p className="text-sm text-slate-200 font-medium leading-relaxed" dir="rtl">
                                                                {note.note}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex sm:flex-col gap-2 shrink-0 self-start">
                                                        <button
                                                            onClick={() => handleEditBibleNote(note)}
                                                            className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-all border border-white/5"
                                                            title="Edit Note"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteBibleNote(note.noteIds || note._id)}
                                                            className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5"
                                                            title="Delete Note"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {currentView === 'bible_settings' && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <button
                                        type="button"
                                        onClick={goBackToMenu}
                                        className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-colors shrink-0"
                                        title="Back"
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div>
                                        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                                            <Sliders className="w-5 h-5 text-slate-300" />
                                            Bible Settings
                                        </h1>
                                        <p className="text-xs text-slate-400">Reading, font & layout preferences</p>
                                    </div>
                                </div>

                                {/* Translation Group */}
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                                        Translation
                                    </h3>
                                    <div className="rounded-2xl bg-zinc-900/60 sm:bg-white/[0.03] border border-white/5 divide-y divide-white/5 overflow-hidden shadow-xl shadow-black/20">
                                        {BIBLE_TRANSLATIONS.map((tr) => {
                                            const isSelected = bibleTranslation === tr.id;
                                            return (
                                                <button
                                                    key={tr.id}
                                                    type="button"
                                                    onClick={() => handleSetBibleTranslation(tr.id)}
                                                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-sky-400 bg-sky-400' : 'border-white/30'}`}>
                                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm sm:text-base font-semibold text-white">{tr.name}</p>
                                                            <p className="text-xs text-slate-400">{tr.desc}</p>
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check className="w-4 h-4 text-sky-400" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Verse Controls Group */}
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                                        Verse Controls
                                    </h3>
                                    <div className="rounded-2xl bg-zinc-900/60 sm:bg-white/[0.03] border border-white/5 divide-y divide-white/5 overflow-hidden shadow-xl shadow-black/20">
                                        {/* View Mode */}
                                        <div className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-3.5">
                                                {bibleViewMode === 'list' ? <List className="w-5 h-5 text-slate-300 shrink-0" /> : <AlignJustify className="w-5 h-5 text-slate-300 shrink-0" />}
                                                <div>
                                                    <p className="text-sm sm:text-base font-semibold text-white">Verse Display Mode</p>
                                                    <p className="text-xs text-slate-400">{bibleViewMode === 'list' ? 'Vertical (Under each other)' : 'Continuous (Beside each other)'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleViewMode('list')}
                                                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${bibleViewMode === 'list' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    <List className="w-3.5 h-3.5" />
                                                    <span>Vertical</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleViewMode('paragraph')}
                                                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${bibleViewMode === 'paragraph' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    <AlignJustify className="w-3.5 h-3.5" />
                                                    <span>Continuous</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Font Size */}
                                        <div className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-3.5">
                                                <SlidersHorizontal className="w-5 h-5 text-slate-300 shrink-0" />
                                                <div>
                                                    <p className="text-sm sm:text-base font-semibold text-white">Font Size</p>
                                                    <p className="text-xs text-slate-400">Verse text size</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center border border-white/10 rounded-xl overflow-hidden bg-white/5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleVerseFontSize(Math.max(16, bibleVerseFontSize - 2))}
                                                    className="h-8 px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors active:bg-white/20"
                                                    title="Decrease font size"
                                                >
                                                    -A
                                                </button>
                                                <span className="font-bold min-w-[36px] px-2 text-center text-xs text-sky-400">
                                                    {bibleVerseFontSize}px
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleVerseFontSize(Math.min(44, bibleVerseFontSize + 2))}
                                                    className="h-8 px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors active:bg-white/20"
                                                    title="Increase font size"
                                                >
                                                    +A
                                                </button>
                                            </div>
                                        </div>

                                        {/* Verse Spacing */}
                                        <div className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-3.5">
                                                <Sliders className="w-5 h-5 text-slate-300 shrink-0" />
                                                <div>
                                                    <p className="text-sm sm:text-base font-semibold text-white">Verse Spacing</p>
                                                    <p className="text-xs text-slate-400">Vertical gap between verses</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center border border-white/10 rounded-xl overflow-hidden bg-white/5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleVerseSpacing(Math.max(2, bibleVerseSpacing - 2))}
                                                    className="h-8 px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors active:bg-white/20"
                                                    title="Decrease spacing"
                                                >
                                                    -
                                                </button>
                                                <span className="font-bold min-w-[36px] px-2 text-center text-xs text-sky-400">
                                                    {bibleVerseSpacing}px
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleVerseSpacing(Math.min(36, bibleVerseSpacing + 2))}
                                                    className="h-8 px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors active:bg-white/20"
                                                    title="Increase spacing"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Live Preview Box */}
                                <div>
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1">
                                        Live Preview
                                    </h3>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 shadow-xl shadow-black/20" dir="rtl">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="bg-sky-500/20 text-sky-300 text-xs font-bold px-2.5 py-0.5 rounded-lg border border-sky-500/20">
                                                يوحنا 1:1-2 ({bibleTranslation})
                                            </span>
                                        </div>
                                        {bibleViewMode === 'list' ? (
                                            <div className="flex flex-col">
                                                <p
                                                    className="text-slate-200 leading-relaxed font-arabic"
                                                    style={{ fontSize: `${bibleVerseFontSize}px`, marginBottom: `${bibleVerseSpacing}px` }}
                                                >
                                                    <span className="text-sky-400 font-bold ml-2 text-xs">[1]</span>
                                                    فِي الْبَدْءِ كَانَ الْكَلِمَةُ، وَالْكَلِمَةُ كَانَ عِنْدَ اللهِ، وَكَانَ الْكَلِمَةُ اللهَ.
                                                </p>
                                                <p
                                                    className="text-slate-200 leading-relaxed font-arabic"
                                                    style={{ fontSize: `${bibleVerseFontSize}px` }}
                                                >
                                                    <span className="text-sky-400 font-bold ml-2 text-xs">[2]</span>
                                                    هذَا كَانَ فِي الْبَدْءِ عِنْدَ اللهِ.
                                                </p>
                                            </div>
                                        ) : (
                                            <p
                                                className="text-slate-200 leading-relaxed font-arabic"
                                                style={{ fontSize: `${bibleVerseFontSize}px`, lineHeight: 1.8 }}
                                            >
                                                <span className="text-sky-400 font-bold ml-1.5 text-xs">[1]</span>
                                                فِي الْبَدْءِ كَانَ الْكَلِمَةُ، وَالْكَلِمَةُ كَانَ عِنْدَ اللهِ، وَكَانَ الْكَلِمَةُ اللهَ.
                                                <span className="inline-block w-3" />
                                                <span className="text-sky-400 font-bold ml-1.5 text-xs">[2]</span>
                                                هذَا كَانَ فِي الْبَدْءِ عِنْدَ اللهِ.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
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
                                                {noteModalConfig.data.bookName} {noteModalConfig.data.chapter}:{formatVerseNumbers(noteModalConfig.data.verseNumbers || [noteModalConfig.data.verseNumber])}
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

                                <div className="mx-6 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] max-h-36 overflow-y-auto">
                                    {noteModalConfig.data.verses ? (
                                        <div className="space-y-1.5" dir="rtl">
                                            {noteModalConfig.data.verses.map((v) => (
                                                <p key={v.verseId || v.verseNumber} className="text-sm text-white/50 leading-relaxed">
                                                    <span className="text-sky-400 font-bold ml-1">[{v.verseNumber}]</span> {v.text}
                                                </p>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-white/50 leading-relaxed line-clamp-3" dir="rtl">
                                            {noteModalConfig.data.text}
                                        </p>
                                    )}
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

            {/* --- FULL IMAGE VIEWER MODAL --- */}
            <Portal>
                {isViewingPhoto && profileAvatarSrc && (
                    <div
                        onClick={() => setIsViewingPhoto(false)}
                        className="fixed inset-0 z-[10001] flex flex-col bg-black"
                    >
                        <div className="shrink-0 flex justify-between items-center p-4 bg-gradient-to-b from-black/80 to-transparent"
                            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
                            <button
                                onClick={() => setIsViewingPhoto(false)}
                                className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fileInputRef.current?.click();
                                    }}
                                    className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
                                    title="Change Photo"
                                    disabled={isUploadingPhoto}
                                >
                                    <Edit3 className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsViewingPhoto(false);
                                        handlePhotoRemove();
                                    }}
                                    className="p-2 text-rose-500 hover:bg-white/10 rounded-full transition-colors"
                                    title="Remove Photo"
                                    disabled={isUploadingPhoto}
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="relative flex-1 min-h-0 m-4 overflow-hidden">
                            <img
                                src={profileAvatarSrc}
                                alt="Profile"
                                className="absolute inset-0 w-full h-full object-contain"
                                onError={markProfileAvatarFailed}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                )}
            </Portal>

            {/* --- IMAGE CROPPER MODAL --- */}
            <AnimatePresence>
                {photoToCrop && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 50 }}
                            className="fixed inset-0 z-[10002] flex flex-col bg-black"
                        >
                            <div className={cropStyles.stage}
                                onPointerDownCapture={onCropEdgePointerDown}
                                onKeyDownCapture={onCropEdgeKeyDown}>
                                <ReactCrop 
                                    crop={crop} 
                                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                                    aspect={1}
                                    ruleOfThirds
                                    className={cropStyles.cropper}
                                    keepSelection
                                    minWidth={48}
                                    minHeight={48}
                                >
                                    <img 
                                        ref={imgRef} 
                                        src={photoToCrop} 
                                        onLoad={onImageLoad}
                                        onError={() => {
                                            setPhotoToCrop(null);
                                            showToast({ message: 'Unable to open this photo. Please choose another image.', type: 'error' });
                                        }}
                                        alt="Crop me"
                                        className={cropStyles.image}
                                    />
                                </ReactCrop>
                            </div>
                            <div className={`${cropStyles.actions} px-6 py-5 bg-[#020817] flex justify-between items-center z-10 border-t border-sky-500/10`}>
                                <button
                                    onClick={() => setPhotoToCrop(null)}
                                    className="text-sky-500 hover:text-sky-400 font-semibold text-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { if (imgRef.current) onImageLoad({ currentTarget: imgRef.current }); }}
                                    className="p-3 rounded-full text-white hover:bg-white/10 transition-colors"
                                    title="Reset crop"
                                >
                                    <RotateCcw className="w-6 h-6" />
                                </button>
                                <button
                                    onClick={confirmCropAndUpload}
                                    disabled={isUploadingPhoto || !crop}
                                    className="text-sky-500 hover:text-sky-400 font-bold text-lg transition-colors flex items-center gap-2"
                                >
                                    {isUploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Done'}
                                </button>
                            </div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* --- EDIT PROFILE POPUP MODAL --- */}
            <AnimatePresence>
                {editModal && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[500] flex items-center justify-center p-4"
                            style={{ isolation: 'isolate' }}
                        >
                            <div 
                                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                                onClick={() => { if (!isSavingEdit) setEditModal(null); }}
                            />
                            <motion.div
                                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                className="relative w-full max-w-sm bg-[#080f1c] rounded-2xl overflow-hidden flex flex-col p-5"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                                            <Edit3 className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-sm font-bold text-white">
                                            {editModal.type === 'name' ? 'Edit Name' : 'Edit Username'}
                                        </h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { if (!isSavingEdit) setEditModal(null); }}
                                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                        {editModal.type === 'name' ? 'Display Name' : 'Username'}
                                    </label>
                                    <div className="relative flex items-center">
                                        {editModal.type === 'username' && (
                                            <span className="absolute left-3 text-sm font-bold text-sky-400 select-none">
                                                @
                                            </span>
                                        )}
                                        <input
                                            type="text"
                                            autoFocus
                                            value={editValue}
                                            onChange={(e) => setEditValue(editModal.type === 'username' ? e.target.value.toLowerCase().replace(/\s+/g, '') : e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveEdit();
                                            }}
                                            maxLength={editModal.type === 'name' ? 50 : 30}
                                            placeholder={editModal.type === 'name' ? 'Enter your name' : 'username'}
                                            className={`w-full bg-white/5 border rounded-xl py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors ${
                                                editModal.type === 'username' ? 'pl-8 pr-9' : 'px-3.5'
                                            } ${
                                                editModal.type === 'username' && editValue.trim()
                                                    ? usernameCheck.checking
                                                        ? 'border-sky-500/40 focus:ring-sky-500/40'
                                                        : usernameCheck.available
                                                        ? 'border-emerald-500/50 focus:ring-emerald-500/50'
                                                        : 'border-rose-500/50 focus:ring-rose-500/50'
                                                    : 'border-white/10 focus:border-sky-400/50 focus:ring-sky-400/30'
                                            }`}
                                        />
                                        {editModal.type === 'username' && editValue.trim() && (
                                            <div className="absolute right-3 flex items-center">
                                                {usernameCheck.checking ? (
                                                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                                                ) : usernameCheck.available ? (
                                                    <Check className="w-4 h-4 text-emerald-400" />
                                                ) : (
                                                    <X className="w-4 h-4 text-rose-400" />
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {editModal.type === 'username' && editValue.trim() && (
                                        <p className={`text-[11px] mt-1.5 font-medium flex items-center gap-1 ${
                                            usernameCheck.checking
                                                ? 'text-slate-400'
                                                : usernameCheck.available
                                                ? 'text-emerald-400'
                                                : 'text-rose-400'
                                        }`}>
                                            {usernameCheck.checking ? 'Checking availability...' : usernameCheck.reason}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setEditModal(null)}
                                        disabled={isSavingEdit}
                                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveEdit}
                                        disabled={
                                            isSavingEdit ||
                                            !editValue.trim() ||
                                            (editModal.type === 'name' && editValue.trim() === profile?.user?.Name) ||
                                            (editModal.type === 'username' && (!usernameCheck.available || usernameCheck.isCurrent || usernameCheck.checking))
                                        }
                                        className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:hover:bg-sky-500"
                                    >
                                        {isSavingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                                        Save
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar-hide::-webkit-scrollbar { display: none; }
                .custom-scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

            `}} />
        </main>
    );
}
