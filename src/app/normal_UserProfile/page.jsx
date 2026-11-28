'use client';

import { Suspense, useContext, useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { isProfilePath, openProfileView, profileScrollPosition, profileView, rememberSettingsRoute, returnFromSettings } from '../utils/profileNavigation';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '../Portal/Portal';
import PageSkeleton from '../components/PageSkeleton';
import { journal, watchBibleChanges, writeBibleChange } from '../utils/bibleChanges';
import { showToast } from '../components/ToastContainer';
import { useOfflineAvatar } from '../hooks/useOfflineAvatar';
import { removeCachedAvatar } from '../utils/avatarStorage';
import { cropProfilePhoto, resizeSquareCrop } from '../utils/profilePhoto';
import TestimonyBoard from '../components/testimonies/TestimonyBoard';
import { useProfileNotesStore } from '../components/testimonies/TestimonyFeedProvider';
import ProfileLayout from '../components/profile/ProfileLayout';
import ProfileHeaderCard from '../components/profile/ProfileHeaderCard';
import ProfileStats from '../components/profile/ProfileStats';
import FriendshipControls from '../components/profile/FriendshipControls';
import AiStudyModeSettings from '../components/profile/AiStudyModeSettings';
import AiUsageSettings from '../components/profile/AiUsageSettings';
import cropStyles from './profileCropper.module.css';
import {
    Activity,
    AlignJustify,
    ArrowLeft,
    Book,
    Camera,
    Check,
    ChevronRight,
    CreditCard,
    Edit3,
    GalleryHorizontalEnd,
    Globe,
    Heart,
    Highlighter,
    LifeBuoy,
    List,
    Loader2,
    Mail,
    NotebookText,
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
import { useSwipePreference } from '../utils/swipePreferences';
import { createProfileBiblePages } from '../components/profile/profileBiblePages';
import { ProfileBibleFooter, ProfileBibleList } from '../components/profile/ProfileBibleList';
import { useTabPageActive } from '../components/TabPageActivity';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../utils/apiBase';
import { useLanguage } from "../context/LanguageContext";
import { readProfileSummary, refreshProfileSummary, saveProfileSummary } from '../utils/profileSummary';
import { invalidateProfile, readCachedProfile, writeCachedProfile } from '../utils/profileCache';

const BIBLE_TRANSLATIONS = [
    { id: 'AVD', name: 'فانديك (AVD)', desc: 'Arabic Van Dyck' },
];

const API_URL = getApiBaseUrl();

// On a direct owner-menu launch the summary can travel while React hydrates.
// The mounted menu joins the same account-scoped request.
if (typeof window !== 'undefined' && isProfilePath(location.pathname) && !location.hash && !location.search) {
    try {
        const owner = localStorage.getItem('user_Taspe7_ID');
        const token = localStorage.getItem('user_Taspe7_Token');
        if (owner && token && localStorage.getItem('user_Taspe7_Username') && navigator.onLine) {
            void refreshProfileSummary(API_URL, token, owner).catch(() => {});
        }
    } catch { /* The mounted menu also handles unavailable storage and offline startup. */ }
}

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

let recordDateFormatter;
const formatDate = (value, fallback = 'N/A') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    recordDateFormatter ??= new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
    return recordDateFormatter.format(date);
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

function ProfileRoute() {
    const params = useSearchParams();
    const { user_id } = useContext(UserContext);
    const requestedId = params.get('user');
    if (requestedId !== null && !/^[a-f\d]{24}$/i.test(requestedId)) {
        return <ProfileLayout><div className="py-12 text-center text-slate-300"><h1 className="mb-3 text-xl font-semibold text-white">Profile unavailable</h1><Link href="/friends" className="text-sky-300">Back to friends</Link></div></ProfileLayout>;
    }
    if (!user_id) return <PageSkeleton variant="profile" fullPage />;
    const targetId = requestedId?.toLowerCase();
    const profileUserId = targetId || user_id;
    return <UserProfile key={`${user_id}:${profileUserId}`} profileUserId={profileUserId} />;
}

export default function NormalUserProfilePage() {
    return <Suspense fallback={<PageSkeleton variant="profile" fullPage />}><ProfileRoute /></Suspense>;
}

function UserProfile({ profileUserId }) {
    const pageActive = useTabPageActive();
    const [swipeEnabled, setSwipeEnabled] = useSwipePreference();
    const { user_id, isLogin, logout, setLogin, setUsername, profilePhoto, setProfilePhoto, profilePhotoPreview, clearProfilePhotoPreview, isUploadingProfilePhoto, uploadProfilePhoto } = useContext(UserContext);
    const isOwner = String(profileUserId).toLowerCase() === String(user_id).toLowerCase();
    const router = useRouter();
    const { t, language, setLanguage } = useLanguage();
    const profileNotes = useProfileNotesStore();
    const [initialSocial] = useState(() => profileNotes.getSnapshot(profileUserId));
    const [profile, setProfile] = useState(() => isOwner ? readProfileSummary(user_id) : initialSocial?.ready && initialSocial.user ? { user: initialSocial.user } : null);
    const [socialProfile, setSocialProfile] = useState(() => initialSocial?.ready ? initialSocial : null);
    const [refreshingSocial, setRefreshingSocial] = useState(false);
    const [loading, setLoading] = useState(() => !profile);
    const [error, setError] = useState(null);
    const { src: cachedProfileAvatarSrc, markFailed: markProfileAvatarFailed } = useOfflineAvatar(profileUserId, isOwner ? profilePhoto : profile?.user?.profilePhoto);
    const profileAvatarSrc = (isOwner && profilePhotoPreview) || cachedProfileAvatarSrc;
    const handleSocialProfile = useCallback((data, fetchError) => {
        setSocialProfile(data);
        if (!isOwner) {
            setProfile(data?.user ? { user: data.user } : null);
            setError(data?.user ? null : fetchError?.message || 'Profile unavailable. Please try again.');
        }
    }, [isOwner]);
    const refreshFriendship = useCallback(() => window.dispatchEvent(new Event('taspe7:friends-push')), []);
    const revokeFriendship = useCallback(() => {
        const previousProfile = socialProfile;
        setSocialProfile(previous => previous ? { ...previous, items: [], nextCursor: null, canViewTestimonies: false, relationship: 'none',
            stats: { ...previous.stats, friends: Math.max(0, (previous.stats?.friends || 0) - 1), testimonies: null } } : previous);
        return () => setSocialProfile(previousProfile);
    }, [socialProfile]);

    useEffect(() => {
        if (!isOwner) return;
        setProfile(previous => previous && previous.user?.profilePhoto !== profilePhoto
            ? { ...previous, user: { ...previous.user, profilePhoto } }
            : previous);
    }, [profilePhoto, isOwner]);
    const { theme, toggleTheme, isDark } = useTheme?.() || {};
    const [currentView, setCurrentView] = useState('menu');

    const needsDetails = isOwner && (currentView === 'notes' || currentView === 'highlights');
    const collections = useMemo(() => ({
        notes: createProfileBiblePages(API_URL, user_id, isLogin, 'notes'),
        highlights: createProfileBiblePages(API_URL, user_id, isLogin, 'highlights'),
    }), [user_id, isLogin]);
    const collection = currentView === 'highlights' ? collections.highlights : collections.notes;
    const records = useSyncExternalStore(collection.subscribe, collection.snapshot, collection.snapshot);
    useEffect(() => {
        if (!pageActive || !needsDetails || !isLogin) return;
        const open = () => { void collection.load(); };
        open();
        window.addEventListener('online', open);
        return () => { collection.cancel(); window.removeEventListener('online', open); };
    }, [collection, needsDetails, pageActive, isLogin]);

    const [localCounts, setLocalCounts] = useState({});
    useEffect(() => {
        if (!isOwner || !isLogin) return;
        let live = true;
        const revisions = {};
        const check = async kind => {
            const revision = revisions[kind] = (revisions[kind] || 0) + 1;
            const value = await journal.summary(journal.scope(API_URL, user_id, kind));
            if (!live || revision !== revisions[kind]) return;
            setLocalCounts(previous => {
                const current = previous[kind];
                if (current?.count === value?.count && current?.version === value?.version &&
                    current?.pending === value?.pending) return previous;
                return { ...previous, [kind]: value };
            });
        };
        if (pageActive && currentView === 'menu') {
            for (const kind of ['notes', 'highlights']) check(kind).catch(console.warn);
        }
        const unsubscribe = watchBibleChanges(event => {
            if (event.owner !== user_id || event.api !== API_URL) return;
            const store = collections[event.kind];
            store.invalidate();
            if (pageActive && currentView === event.kind) void store.load(false, !event.reconcile && !event.rejected && event.version == null);
            check(event.kind).catch(console.warn);
            if (pageActive && currentView === 'menu' && (event.version != null || event.reconcile || event.rejected)) {
                refreshProfileSummary(API_URL, isLogin, user_id).then(data => { if (live) setProfile(data); }).catch(() => {});
            }
        });
        return () => { live = false; unsubscribe(); };
    }, [user_id, isOwner, isLogin, currentView, pageActive, collections]);

    const menuCount = kind => {
        const local = localCounts[kind];
        if (local?.pending) return '…';
        if (Number.isInteger(local?.count) && local.version >= (profile?.versions?.[kind] || 0)) return local.count;
        return profile?.counts?.[kind] ?? '—';
    };

    // Clears user session and navigates to sign-in
    const handleLogout = () => {
        if (!isOwner) return;
        logout();
        router.replace('/login');
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

    const navigateToView = view => {
        if (!isOwner) return;
        openProfileView(view);
        setCurrentView(view);
    };
    const openSettingsRoute = href => {
        rememberSettingsRoute(href);
        router.push(href);
    };

    useLayoutEffect(() => {
        if (!isOwner || !pageActive) return;
        const sync = () => setCurrentView(profileView());
        sync();
        window.addEventListener('popstate', sync);
        window.addEventListener('hashchange', sync);
        return () => {
            window.removeEventListener('popstate', sync);
            window.removeEventListener('hashchange', sync);
        };
    }, [isOwner, pageActive]);

    useLayoutEffect(() => {
        if (!isOwner || !pageActive || !isProfilePath(location.pathname)
            || currentView !== profileView()) return;
        if (needsDetails && collection.anchor) return;
        const top = profileScrollPosition();
        if (currentView !== 'menu' || top != null) window.scrollTo({ top: top ?? 0, behavior: 'instant' });
    }, [currentView, isOwner, pageActive, needsDetails, collection]);

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

    const updateHeader = modifier => {
        invalidateProfile(API_URL, isLogin);
        const updated = modifier(profile);
        if (updated) {
            setProfile(updated);
            saveProfileSummary(user_id, updated);
        }
        readCachedProfile(user_id).then(cached => {
            if (cached) return writeCachedProfile(user_id, modifier(cached));
        }).catch(console.error);
    };

    // Debounced username availability check
    useEffect(() => {
        if (!isOwner || !editModal || editModal.type !== 'username') return;

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
    }, [editValue, editModal, profile?.user?.username, isOwner]);

    const handleSaveEdit = async () => {
        if (!isOwner || !editModal || isSavingEdit) return;
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

                updateHeader(prev => prev ? {
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

                updateHeader(prev => prev ? {
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
        if (!isOwner) return;
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
        if (!isOwner) return;
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
        if (!isOwner) return;
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
            updateHeader(prev => prev ? { ...prev, user: { ...prev.user, profilePhoto: null } } : prev);
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

        // The same profile page selects its data source by who is viewing it.
        // Visitors never request or read the owner's private profile cache.
        if (!isOwner) {
            const apply = () => {
                const data = profileNotes.getSnapshot(profileUserId);
                if (data.ready) { handleSocialProfile(data); setLoading(false); }
                else if (!data.loading && data.error) { setError(data.error); setLoading(false); }
            };
            const unsubscribe = profileNotes.subscribe(profileUserId, apply);
            apply();
            void profileNotes.ensure(profileUserId);
            return unsubscribe;
        }

        if (!pageActive || currentView !== 'menu' || profileView() !== 'menu') return;
        let active = true;
        const refresh = async () => {
            try {
                const summary = await refreshProfileSummary(API_URL, isLogin, user_id);
                if (active) { setProfile(summary); setError(null); }
            } catch (error) {
                if (!active || error.name === 'AbortError') return;
                if (!readProfileSummary(user_id)) {
                    // Upgrade offline users with an older cached header on first use.
                    const legacy = await readCachedProfile(user_id);
                    if (!active) return;
                    if (legacy?.user) {
                        const { _id, Name, username, role, global_role, profilePhoto } = legacy.user;
                        const summary = { user: { _id, Name, username, role, global_role, profilePhoto } };
                        setProfile(summary);
                        saveProfileSummary(user_id, summary);
                    } else setError(error.message);
                }
            } finally {
                if (active) setLoading(false);
            }
        };
        refresh();
        window.addEventListener('focus', refresh);
        window.addEventListener('online', refresh);
        return () => {
            active = false;
            window.removeEventListener('focus', refresh);
            window.removeEventListener('online', refresh);
        };
    }, [isLogin, user_id, isOwner, profileUserId, handleSocialProfile, profileNotes, pageActive, currentView]);

    async function changeAnnotation(kind, remove, record, value) {
        const entries = record.verses.map(v => ({
            verseId: String(v.verseId), noteId: kind === 'notes' && v._id ? String(v._id) : undefined,
            bookName: record.bookName, chapter: record.chapter, verseNumber: v.verseNumber, text: v.text, value,
        }));
        const synced = await writeBibleChange(API_URL, user_id, isLogin, kind, remove, entries);
        if (!synced) showToast({ message: 'Saved on this device. Will sync when online.', type: 'offline' });
    }

    async function deleteAnnotation(kind, record) {
        if (!isOwner || !window.confirm(kind === 'notes' ? 'Delete this Bible note?' : 'Delete this highlight?')) return;
        try { await changeAnnotation(kind, true, record); }
        catch (error) { showToast({ message: error.message, type: 'error' }); }
    }

    const handleSaveNote = async () => {
        if (!isOwner || !noteText.trim() || !noteModalConfig || isSubmittingNote) return;
        setIsSubmittingNote(true);
        try {
            await changeAnnotation('notes', false, noteModalConfig.data, noteText);
            setNoteModalConfig(null);
            setNoteText('');
        } catch (error) { showToast({ message: error.message, type: 'error' }); }
        finally { setIsSubmittingNote(false); }
    };

    const handleEditBibleNote = (noteItem) => {
        if (!isOwner) return;
        setNoteText(noteItem.note);
        setNoteModalConfig({ data: noteItem, existingNote: noteItem.note });
    };

    // Lock scroll when modal is open
    useEffect(() => {
        if (!isOwner) return;
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
    }, [noteModalConfig, isOwner]);


    if (!isOwner && loading) {
        return <PageSkeleton variant="profile" fullPage />;
    }

    if (!needsDetails && error && !profile) {
        return (
            <div className="app-page min-h-screen flex items-center justify-center p-4 transition-colors duration-150">
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
        <ProfileLayout menu={isOwner && currentView === 'menu'}>

                {!isOwner || currentView === 'menu' ? (
                    <>
                        {/* --- HEADER PROFILE CARD --- */}
                        {loading ? <div aria-hidden="true" className="app-card mb-6 rounded-[2rem] border p-5 sm:mb-8 sm:p-8">
                            <div className="flex items-center gap-3 sm:gap-6">
                                <div className="size-20 shrink-0 rounded-full bg-slate-400/10 sm:size-28" />
                                <div className="space-y-2"><div className="h-5 w-28 rounded bg-slate-400/10" /><div className="h-3 w-20 rounded bg-slate-400/10" /></div>
                            </div>
                            <div className="mt-8 hidden h-11 max-[480px]:block" />
                        </div> : <ProfileHeaderCard
                            user={profile?.user}
                            onEditName={isOwner ? () => {
                                setEditValue(profile?.user?.Name || '');
                                setEditModal({ type: 'name' });
                            } : undefined}
                            onEditUsername={isOwner ? () => {
                                setEditValue(profile?.user?.username || '');
                                setEditModal({ type: 'username' });
                            } : undefined}
                            avatar={
                                    <div className="relative shrink-0">
                                        <div 
                                            className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-sky-500/20 bg-black/40 flex items-center justify-center shadow-xl shadow-black/50 cursor-pointer"
                                            onClick={() => {
                                                if (profileAvatarSrc) {
                                                    setIsViewingPhoto(true);
                                                } else if (isOwner) {
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
                                        
                                        {isOwner && <><button 
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isUploadingPhoto}
                                            className="absolute bottom-0 right-0 translate-x-1 translate-y-1 w-7 h-7 sm:w-9 sm:h-9 bg-app-panel rounded-full flex items-center justify-center border-2 border-sky-500/30 shadow-lg hover:bg-app-raised transition-colors"
                                            title={t('changePhoto')}
                                        >
                                            {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 animate-spin" /> : <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400" />}
                                        </button>

                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            accept="image/jpeg, image/png, image/webp" 
                                            onChange={handleFileSelect} 
                                        /></>}
                                    </div>

                            }
                            stats={socialProfile?.stats ? <ProfileStats stats={socialProfile.stats} isOwner={isOwner}
                                roleBadge={isOwner && profile?.user?.role && !['USER', 'USERS'].includes(profile.user.role.toUpperCase()) ? <Badge icon={User} label={t('role')} value={profile.user.role.toUpperCase() === 'PROGRAMER' ? t('roleProgrammer') : titleCase(profile.user.role)} classes="bg-sky-500/5 text-sky-200 border-sky-500/10" /> : null} profileUserId={profile?.user?._id} token={isLogin} userId={user_id} /> : isOwner && <div aria-hidden="true" className="h-11 max-[480px]:mt-5" />}
                        >
                            {!isOwner && socialProfile?.user && <FriendshipControls profile={socialProfile} token={isLogin} userId={user_id} refreshing={refreshingSocial} onRevoke={revokeFriendship} onRefresh={refreshFriendship} />}
                        </ProfileHeaderCard>}

                        <TestimonyBoard profileUserId={profileUserId} onProfileLoad={handleSocialProfile} profileAccess={socialProfile?.canViewTestimonies} onLoadingChange={setRefreshingSocial} />

                        {/* --- SETTINGS GROUPS (CHATGPT STYLE) --- */}
                        {isOwner && <div className="space-y-5" data-preview-content={loading || !profile?.user?._id ? 'profile-menu' : undefined}>
                            <AiUsageSettings userId={user_id} token={isLogin} active={pageActive} />
                            {/* Bible Group */}
                            <div>
                                <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                    {t('bible')}
                                </h3>
                                <div className="app-card rounded-xl border divide-y divide-white/5 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => navigateToView('highlights')}
                                        className="w-full flex items-center justify-between min-h-[52px] px-4 py-2 hover:bg-white/5 transition-colors text-left gap-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Highlighter className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                            <span className="text-sm font-medium text-white">{t('highlights')}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-xs text-slate-400 font-medium">
                                                {menuCount('highlights')} {menuCount('highlights') === 1 ? t('record') : t('records')}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-slate-600" />
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => navigateToView('notes')}
                                        className="w-full flex items-center justify-between min-h-[52px] px-4 py-2 hover:bg-white/5 transition-colors text-left gap-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <NotebookText className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                            <span className="text-sm font-medium text-white">{t('notes')}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-xs text-slate-400 font-medium">
                                                {menuCount('notes')} {menuCount('notes') === 1 ? t('record') : t('records')}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-slate-600" />
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => navigateToView('bible_settings')}
                                        className="w-full flex items-center justify-between min-h-[52px] px-4 py-2 hover:bg-white/5 transition-colors text-left gap-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <SlidersHorizontal className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                            <div className="min-w-0">
                                                <span className="text-sm font-medium text-white block">{t('settings')}</span>
                                                <span className="text-xs text-slate-400">
                                                    {bibleTranslation} • {bibleVerseFontSize}px • {bibleViewMode === 'paragraph' ? t('continuous') : t('vertical')}
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                    {t('plansAndSubscription')}
                                </h3>
                                <div className="app-card rounded-xl border divide-y divide-white/5 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => openSettingsRoute('/plans')}
                                        className="w-full flex items-center justify-between min-h-[52px] px-4 py-2 hover:bg-white/5 transition-colors text-left gap-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <CreditCard className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                            <span className="text-sm font-medium text-white">{t('plansAndSubscription')}</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                                    </button>
                                    <button type="button" disabled className="w-full flex items-center justify-between gap-3 min-h-[52px] px-4 py-2 text-left cursor-not-allowed">
                                        <div className="flex items-center gap-3">
                                            <LifeBuoy className="w-[18px] h-[18px] text-slate-600 shrink-0" />
                                            <span className="text-sm font-medium text-slate-400">{t('support')}</span>
                                        </div>
                                        <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-400">{t('comingSoon')}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Appearance Group */}
                            <div>
                                <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                    {t('appearance')}
                                </h3>
                                <div className="app-card rounded-xl border divide-y divide-white/5 overflow-hidden">
                                    <div className="flex items-center justify-between min-h-[52px] px-4 py-2">
                                        <div className="flex items-center gap-3">
                                            <Sun className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-white">{t('theme')}</p>
                                                <p className="text-xs text-slate-400">{isDark ? t('darkMode') : t('lightMode')}</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleTheme}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isDark ? 'bg-sky-500' : 'bg-slate-700'}`}
                                            aria-label="Toggle Theme"
                                            role="switch"
                                            aria-checked={isDark}
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
                                    <h3 className="mb-2 px-1 text-xs font-medium text-slate-400">{t('roleProgrammer')}</h3>
                                    <button type="button" onClick={() => openSettingsRoute('/ProgramerDashboard')} className="flex w-full items-center justify-between rounded-xl border border-sky-400/20 bg-sky-400/5 min-h-11 px-3 py-2 text-left hover:bg-sky-400/10">
                                        <div className="flex items-center gap-2.5"><div><span className="block text-sm font-medium text-white">{t('appControlCenter')}</span><span className="mt-0.5 block text-xs text-slate-400">{t('appControlCenterDesc')}</span></div></div>
                                    </button>
                                </div>
                            )}

                            {/* General Settings Group */}
                            <div>
                                <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                    {t('generalSettings')}
                                </h3>
                                <div className="app-card rounded-xl border divide-y divide-white/5 overflow-hidden">
                                    <div className="flex items-center justify-between gap-4 min-h-[52px] px-4 py-2">
                                        <div className="flex items-center gap-3">
                                            <GalleryHorizontalEnd className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                            <div>
                                                <p id="swipe-setting-label" className="text-sm font-medium text-white">{t('swipeBetweenPages')}</p>
                                                <p id="swipe-setting-description" className="mt-0.5 text-xs text-slate-400">{t('swipeBetweenPagesDesc')}</p>
                                            </div>
                                        </div>
                                        <button type="button" role="switch" aria-checked={swipeEnabled} aria-labelledby="swipe-setting-label" aria-describedby="swipe-setting-description"
                                            onClick={() => setSwipeEnabled(!swipeEnabled)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400 ${swipeEnabled ? 'bg-sky-500' : 'bg-slate-700'}`}>
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${swipeEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between min-h-[52px] px-4 py-2">
                                        <div className="flex items-center gap-3">
                                            <Settings className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-white">{t('generalPreferences')}</p>
                                                <p className="text-xs text-slate-400">{t('generalPreferencesDesc')}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Translations Group */}
                            <div>
                                <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                    {t('translationsAndLanguage')}
                                </h3>
                                <div className="app-card rounded-xl border min-h-[52px] px-4 py-2 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Globe className="w-[18px] h-[18px] text-slate-400 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-white">
                                                {t('appLanguage')}
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

                            <section>
                                <h2 className="mb-2 px-1 text-xs font-bold text-slate-400">{language === 'ar' ? 'حول التطبيق' : 'About'}</h2>
                                <button type="button" onClick={() => openSettingsRoute('/bible-credits')}
                                    className="w-full min-h-11 rounded-xl bg-white/5 px-3 text-start text-sm font-medium hover:bg-white/10">
                                    {language === 'ar' ? 'حقوق ترجمات الكتاب المقدس' : 'Bible translation credits'}
                                </button>
                            </section>

                            {/* Logout Button */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-center gap-2.5 min-h-11 py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 font-medium text-sm transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <span>{t('logout')}</span>
                                </button>
                            </div>
                        </div>}
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
                                            onClick={returnFromSettings}
                                            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-colors shrink-0"
                                            title={t('back')}
                                        >
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <div>
                                            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                                                {t('bibleHighlights')}
                                            </h1>
                                            <p className="text-xs text-slate-400">
                                                {records.ready ? records.total : '—'} {records.total === 1 ? t('record') : t('records')}
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
                                            title={t('verticalView')}
                                        >
                                            <List className="w-3.5 h-3.5" />
                                            <span>{t('vertical')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetHighlightsViewMode('paragraph')}
                                            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                                                highlightsViewMode === 'paragraph'
                                                    ? 'bg-sky-500 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                            title={t('continuousView')}
                                        >
                                            <AlignJustify className="w-3.5 h-3.5" />
                                            <span>{t('continuous')}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Direct Highlights List */}
                                {records.ready && records.total === 0 && !records.error ? (
                                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 rounded-3xl border border-white/5 bg-white/[0.02]">
                                        <Sparkles className="w-10 h-10 mb-3 opacity-20" />
                                        <p className="text-xs font-semibold">{t('noBibleHighlightsYet')}</p>
                                    </div>
                                ) : (
                                    <ProfileBibleList key={currentView} active={pageActive} state={records} store={collection} render={(highlight) => {
                                            const hex = getHighlightHex(highlight.color);
                                            return (
                                                <div key={highlight._id} className="app-card rounded-2xl border p-4 sm:p-5 hover:bg-white/5 transition-all duration-300 relative overflow-hidden group shadow-xl shadow-black/20">
                                                    <div className="absolute top-0 bottom-0 right-0 w-1.5 opacity-80" style={{ backgroundColor: hex }}></div>
                                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4 relative z-10 pr-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                                <h4 className="text-base font-bold text-white tracking-tight">{highlight.bookName}</h4>
                                                                <span className="text-[10px] text-slate-400 font-bold">
                                                                    {highlight.chapter}:{formatVerseNumbers(highlight.verseNumbers)}
                                                                </span>
                                                                <span className="text-[10px] text-slate-500 font-bold ml-auto sm:ml-0">
                                                                    {formatDate(highlight.date)}
                                                                </span>
                                                            </div>

                                                            {highlightsViewMode === 'list' ? (
                                                                <div className="space-y-2 mt-2">
                                                                    {highlight.verses.map((v) => (
                                                                        <p key={v.verseId} className="text-xs sm:text-sm text-slate-200 leading-relaxed py-1" dir="rtl">
                                                                            <span className="text-sky-400/80 font-bold ml-1.5">[{v.verseNumber}]</span>
                                                                            {v.text}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-2">
                                                                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed py-1" style={{ lineHeight: 1.8 }} dir="rtl">
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
                                                            onClick={() => deleteAnnotation('highlights', highlight)}
                                                            className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5 shrink-0 self-start"
                                                            title={t('deleteHighlight')}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                    }} />
                                )}
                            </div>
                        )}

                        {currentView === 'notes' && (
                            <div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={returnFromSettings}
                                            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-colors shrink-0"
                                            title={t('back')}
                                        >
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <div>
                                            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                                                {t('bibleNotes')}
                                            </h1>
                                            <p className="text-xs text-slate-400">
                                                {records.ready ? records.total : '—'} {records.total === 1 ? t('record') : t('records')}
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
                                            title={t('verticalView')}
                                        >
                                            <List className="w-3.5 h-3.5" />
                                            <span>{t('vertical')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSetNotesViewMode('paragraph')}
                                            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${
                                                notesViewMode === 'paragraph'
                                                    ? 'bg-sky-500 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            }`}
                                            title={t('continuousView')}
                                        >
                                            <AlignJustify className="w-3.5 h-3.5" />
                                            <span>{t('continuous')}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Direct Notes List */}
                                {records.ready && records.total === 0 && !records.error ? (
                                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 rounded-3xl border border-white/5 bg-white/[0.02]">
                                        <Book className="w-10 h-10 mb-3 opacity-20" />
                                        <p className="text-xs font-semibold">{t('noBibleNotesYet')}</p>
                                    </div>
                                ) : (
                                    <ProfileBibleList key={currentView} active={pageActive} state={records} store={collection} render={(note) => (
                                            <div key={note._id} className="app-card rounded-2xl border p-4 sm:p-5 hover:bg-white/5 transition-all duration-300 relative overflow-hidden group shadow-xl shadow-black/20">
                                                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                                                            <h4 className="text-base font-bold text-white tracking-tight">{note.bookName}</h4>
                                                            <span className="text-[10px] text-slate-400 font-bold">
                                                                {note.chapter}:{formatVerseNumbers(note.verseNumbers)}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-bold ml-auto sm:ml-0">
                                                                {formatDate(note.date)}
                                                            </span>
                                                        </div>

                                                        {notesViewMode === 'list' ? (
                                                            <div className="space-y-2 mb-3">
                                                                {note.verses.map((v) => (
                                                                  <p key={v.verseId} className="text-xs sm:text-sm text-slate-300 leading-relaxed py-1" dir="rtl">
                                                                        <span className="text-sky-400 font-bold ml-1.5">[{v.verseNumber}]</span>
                                                                        {v.text}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="mb-3">
                                                                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed py-1" dir="rtl" style={{ lineHeight: 1.8 }}>
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
                                                            <p className="text-[9px] uppercase tracking-widest text-sky-400/70 font-black">{t('myPersonalNote')}</p>
                                                            <p className="text-sm text-slate-200 font-medium leading-relaxed" dir="rtl">
                                                                {note.note}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex sm:flex-col gap-2 shrink-0 self-start">
                                                        <button
                                                            onClick={() => handleEditBibleNote(note)}
                                                            className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-all border border-white/5"
                                                            title={t('editNote')}
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteAnnotation('notes', note)}
                                                            className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5"
                                                            title={t('deleteNote')}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                    )} />
                                )}
                            </div>
                        )}

                        {needsDetails && <ProfileBibleFooter store={collection} state={records} active={pageActive} language={language} />}

                        {currentView === 'bible_settings' && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <button
                                        type="button"
                                        onClick={returnFromSettings}
                                        className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white transition-colors shrink-0"
                                        title={t('back')}
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div>
                                        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                                            <Sliders className="w-5 h-5 text-slate-300" />
                                            {t('bibleSettings')}
                                        </h1>
                                        <p className="text-xs text-slate-400">{t('bibleSettingsDesc')}</p>
                                    </div>
                                </div>

                                <AiStudyModeSettings userId={user_id} />
                                <AiUsageSettings userId={user_id} token={isLogin} active={pageActive} />

                                {/* Translation Group */}
                                <div>
                                    <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                        {t('translation')}
                                    </h3>
                                    <div className="app-card rounded-2xl border divide-y divide-white/5 overflow-hidden shadow-xl shadow-black/20">
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
                                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-app-panel" />}
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
                                    <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                        {t('verseControls')}
                                    </h3>
                                    <div className="app-card rounded-2xl border divide-y divide-white/5 overflow-hidden shadow-xl shadow-black/20">
                                        {/* View Mode */}
                                        <div className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-3.5">
                                                <div>
                                                    <p className="text-sm sm:text-base font-semibold text-white">{t('verseDisplayMode')}</p>
                                                    <p className="text-xs text-slate-400">{bibleViewMode === 'list' ? t('verseDisplayVertical') : t('verseDisplayContinuous')}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleViewMode('list')}
                                                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${bibleViewMode === 'list' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    <List className="w-3.5 h-3.5" />
                                                    <span>{t('vertical')}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleViewMode('paragraph')}
                                                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all ${bibleViewMode === 'paragraph' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    <AlignJustify className="w-3.5 h-3.5" />
                                                    <span>{t('continuous')}</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Font Size */}
                                        <div className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-3.5">
                                                <div>
                                                    <p className="text-sm sm:text-base font-semibold text-white">{t('fontSize')}</p>
                                                    <p className="text-xs text-slate-400">{t('fontSizeDesc')}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center border border-white/10 rounded-xl overflow-hidden bg-white/5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleVerseFontSize(Math.max(16, bibleVerseFontSize - 2))}
                                                    className="h-8 px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors active:bg-white/20"
                                                    title={t('decreaseFontSize')}
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
                                                    title={t('increaseFontSize')}
                                                >
                                                    +A
                                                </button>
                                            </div>
                                        </div>

                                        {/* Verse Spacing */}
                                        <div className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-3.5">
                                                <div>
                                                    <p className="text-sm sm:text-base font-semibold text-white">{t('verseSpacing')}</p>
                                                    <p className="text-xs text-slate-400">{t('verseSpacingDesc')}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center border border-white/10 rounded-xl overflow-hidden bg-white/5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetBibleVerseSpacing(Math.max(2, bibleVerseSpacing - 2))}
                                                    className="h-8 px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors active:bg-white/20"
                                                    title={t('decreaseSpacing')}
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
                                                    title={t('increaseSpacing')}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Live Preview Box */}
                                <div>
                                    <h3 className="text-xs font-medium text-slate-400 mb-2 px-1">
                                        {t('livePreview')}
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
            {/* Note Write Modal */}
            <AnimatePresence>
                {isOwner && noteModalConfig && (
                    <Portal>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center p-0 sm:p-6"
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
                                                {t('updateBibleNote')}
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
                                        placeholder={t('editNotePlaceholder')}
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
                                        {t('cancel')}
                                    </button>
                                    <button
                                        onClick={handleSaveNote}
                                        disabled={isSubmittingNote || !noteText.trim()}
                                        className="flex-[2] py-2.5 rounded-xl text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
                                    >
                                        {isSubmittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        {t('updateNoteBtn')}
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
                            {isOwner && <div className="flex items-center gap-4">
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
                            </div>}
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
                {isOwner && photoToCrop && (
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
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={() => { if (imgRef.current) onImageLoad({ currentTarget: imgRef.current }); }}
                                    className="p-3 rounded-full text-white hover:bg-white/10 transition-colors"
                                    title={t('resetCrop')}
                                >
                                    <RotateCcw className="w-6 h-6" />
                                </button>
                                <button
                                    onClick={confirmCropAndUpload}
                                    disabled={isUploadingPhoto || !crop}
                                    className="text-sky-500 hover:text-sky-400 font-bold text-lg transition-colors flex items-center gap-2"
                                >
                                    {isUploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : t('done')}
                                </button>
                            </div>
                        </motion.div>
                    </Portal>
                )}
            </AnimatePresence>

            {/* --- EDIT PROFILE POPUP MODAL --- */}
            <AnimatePresence>
                {isOwner && editModal && (
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
                                className="relative w-full max-w-sm bg-app-panel rounded-2xl overflow-hidden flex flex-col p-5"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                                            <Edit3 className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-sm font-bold text-white">
                                            {editModal.type === 'name' ? t('editName') : t('editUsername')}
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
                                        {editModal.type === 'name' ? t('displayName') : t('username')}
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
                                            placeholder={editModal.type === 'name' ? t('enterYourName') : 'username'}
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
                                            {usernameCheck.checking ? t('checkingAvailability') : usernameCheck.reason}
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
                                        {t('cancel')}
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
                                        {t('save')}
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
        </ProfileLayout>
    );
}
