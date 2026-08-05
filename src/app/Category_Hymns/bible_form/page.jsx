'use client';
import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '../../Portal/Portal';
import { UserContext } from '../../context/User_Context';
import { HymnsContext } from '../../context/Hymns_Context';
import { Check, Copy, X, Search, ChevronDown, Loader2, Monitor, FolderPlus, BookOpen, Share2, FileText, Cross, Sparkles, PlusCircle, Heart, Link2, Lightbulb } from 'lucide-react';
import { showToast } from '../../components/ToastContainer';
import { useLanguage } from "../../context/LanguageContext";
import { normalizeBibleBooksFromApi } from '../../utils/bibleBooks';
import { getApiBaseUrl } from '../../utils/apiBase';
import { isApp } from '../../utils/ReactQueryProvider';
import { getLocalBibleIndex, searchLocalBible, isTranslationDownloaded, downloadTranslationToLocal, deleteTranslationFromLocal } from '../../utils/bibleSync';
import { queueOfflineAction } from '../../utils/offlineQueue';

const API_ROOT = getApiBaseUrl();
const BIBLE_API = `${API_ROOT}/bible`;
const LOCAL_BIBLE_NOTES_KEY = 'taspe7_local_bible_notes';

function readLocalBibleNotes() {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(LOCAL_BIBLE_NOTES_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeLocalBibleNote(verseId, note) {
    if (typeof window === 'undefined' || !verseId) return;
    const current = readLocalBibleNotes();
    current[String(verseId)] = String(note || '');
    localStorage.setItem(LOCAL_BIBLE_NOTES_KEY, JSON.stringify(current));
}

const HIGHLIGHT_COLORS = [
    { id: 'cyan', hex: '#7ae7ff' },
    { id: 'pink', hex: '#ffbde6' },
    { id: 'red', hex: '#f87171' },
    { id: 'lavender', hex: '#e2e0ff' },
    { id: 'yellow', hex: '#ffff00' },
    { id: 'green', hex: '#00ff66' },
    { id: 'blue', hex: '#00bfff' },
    { id: 'orange', hex: '#ffaa44' },
];

const LOCAL_BIBLE_HIGHLIGHTS_KEY = 'taspe7_local_bible_highlights';

function readLocalBibleHighlights() {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(LOCAL_BIBLE_HIGHLIGHTS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeLocalBibleHighlight(verseId, colorId) {
    if (typeof window === 'undefined' || !verseId) return;
    const current = readLocalBibleHighlights();
    if (colorId) {
        current[String(verseId)] = colorId;
    } else {
        delete current[String(verseId)];
    }
    localStorage.setItem(LOCAL_BIBLE_HIGHLIGHTS_KEY, JSON.stringify(current));
}

function getHighlightStyles(colorId, colorsList) {
    if (!colorId || !colorsList) return null;
    const color = colorsList.find(c => c.id === colorId);
    if (!color) return null;
    const hex = color.hex.startsWith('#') ? color.hex : `#${color.hex}`;
    return {
        backgroundColor: `${hex}1a`,
        borderRightColor: hex,
        borderRightWidth: '4px',
        borderRightStyle: 'solid'
    };
}

const VerseItem = React.memo(({
    verse,
    isSelected,
    fontSize,
    spacing,
    highlightColor,
    highlightColorsList,
    hasNote,
    onClick,
    onNoteClick
}) => {
    const highlightStyle = getHighlightStyles(highlightColor, highlightColorsList);
    return (
        <div
            onClick={() => onClick(verse._id)}
            style={{
                marginBottom: `${spacing}px`,
                ...highlightStyle
            }}
            className={`group relative cursor-pointer p-4 rounded-xl transition-all duration-200 ${!highlightStyle && isSelected
                ? 'bg-white/5 border border-white/10'
                : !highlightStyle
                    ? 'hover:bg-white/5 border border-white/0 hover:border-white/10'
                    : ''
                }`}
        >
            <div className="flex items-start gap-4 sm:gap-8">
                <div className="shrink-0 flex flex-col items-center gap-1 min-w-[25px] sm:min-w-[30px] mt-1">
                    <span className={`text-xs sm:text-sm font-black transition-colors text-center ${isSelected ? 'text-sky-500/70' : 'text-white/30 group-hover:text-sky-500/70'}`}>
                        {verse.verseNumber}
                    </span>
                    {hasNote && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1] animate-pulse" title="Has note" />
                    )}
                </div>
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <p
                        className={`leading-relaxed sm:leading-normal font-arabic transition-all break-words ${isSelected || highlightStyle ? 'text-white' : 'text-white/80 group-hover:text-white'}`}
                        style={{ fontSize: `${fontSize}px` }}
                    >
                        {verse.text}
                    </p>

                    {/* Inline Note Preview */}
                    {hasNote && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onNoteClick(verse, hasNote);
                            }}
                            className="flex items-start gap-2 mt-1 text-left w-full group/note"
                        >
                            <div className="w-0.5 bg-[#6366f1]/50 self-stretch rounded-full shrink-0 group-hover/note:bg-[#6366f1] transition-colors" />
                            <p className="text-[11px] text-indigo-300/70 group-hover/note:text-indigo-300 transition-colors line-clamp-2 leading-relaxed" dir="rtl">
                                {hasNote}
                            </p>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});
VerseItem.displayName = 'VerseItem';

function getUsersEndpointCandidates(path) {
    const normalizedPath = String(path || '').replace(/^\/+/, '');
    const withApi = API_ROOT;
    const withoutApi = API_ROOT.replace(/\/api$/i, '');
    const candidates = [
        `${withApi}/users/${normalizedPath}`,
        `${withoutApi}/api/users/${normalizedPath}`,
        `${withoutApi}/users/${normalizedPath}`,
        `${withApi}/api/users/${normalizedPath}`
    ];
    return [...new Set(candidates.map((u) => u.replace(/([^:]\/)\/+/g, '$1')))];
}

async function postUsersWithFallback(path, body, config) {
    let last404Error = null;
    const attempted = [];
    for (const url of getUsersEndpointCandidates(path)) {
        try {
            return await axios.post(url, body, config);
        } catch (err) {
            attempted.push({ url, status: err?.response?.status });
            if (err?.response?.status === 404) {
                last404Error = err;
                continue;
            }
            throw err;
        }
    }
    if (last404Error) {
        last404Error.message = `${last404Error.message} | Attempts: ${attempted.map(a => `${a.status || 'ERR'} ${a.url}`).join(' | ')}`;
    }
    throw last404Error || new Error(`Unable to POST /users/${path}`);
}

async function getUsersWithFallback(path, config) {
    let last404Error = null;
    const attempted = [];
    for (const url of getUsersEndpointCandidates(path)) {
        try {
            return await axios.get(url, config);
        } catch (err) {
            attempted.push({ url, status: err?.response?.status });
            if (err?.response?.status === 404) {
                last404Error = err;
                continue;
            }
            throw err;
        }
    }
    if (last404Error) {
        last404Error.message = `${last404Error.message} | Attempts: ${attempted.map(a => `${a.status || 'ERR'} ${a.url}`).join(' | ')}`;
    }
    throw last404Error || new Error(`Unable to GET /users/${path}`);
}

function bibleTestamentAr(testament) {
    return String(testament || '').toLowerCase() === 'new' ? 'العهد الجديد' : 'العهد القديم';
}

// ─── CompareColumn: isolated component so hooks are valid (not inside .map) ───
const TRANSLATION_LABELS = {
    AVD: 'فان دايك',
    KEH: 'كتاب الحياة',
    'ERV-AR': 'الترجمة العربية',
};

const TRANSLATION_THEME = {
    AVD: {
        accent: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
        header: 'from-amber-900/40 to-transparent border-amber-500/20',
        badge: 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]',
        tab: 'border-b-2 border-amber-400 text-amber-400 bg-amber-500/10',
        tabInactive: 'text-white/40 border-b-2 border-transparent hover:text-white/70',
    },
    KEH: {
        accent: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
        header: 'from-emerald-900/40 to-transparent border-emerald-500/20',
        badge: 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.5)]',
        tab: 'border-b-2 border-emerald-400 text-emerald-400 bg-emerald-500/10',
        tabInactive: 'text-white/40 border-b-2 border-transparent hover:text-white/70',
    },
};
function getTranslationTheme(code) {
    return TRANSLATION_THEME[code] || {
        accent: 'text-sky-400 border-sky-500/30 bg-sky-500/5',
        header: 'from-sky-900/40 to-transparent border-sky-500/20',
        badge: 'bg-sky-500 text-white shadow-[0_0_10px_rgba(14,165,233,0.5)]',
        tab: 'border-b-2 border-sky-400 text-sky-400 bg-sky-500/10',
        tabInactive: 'text-white/40 border-b-2 border-transparent hover:text-white/70',
    };
}

function CompareColumn({ translationCode, verses, isActive = true }) {
    const [copied, setCopied] = useState(false);
    const theme = getTranslationTheme(translationCode);
    const translationLabel = TRANSLATION_LABELS[translationCode] || translationCode;

    const copyAll = () => {
        const text = verses.map(v => `[${v.verseNumber}] ${v.text}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className={`flex-1 flex flex-col min-h-0 border-b sm:border-b-0 sm:border-r border-white/[0.06] last:border-0 ${isActive ? '' : 'hidden sm:flex'}`}>
            {/* Column Header */}
            <div className={`shrink-0 px-5 py-3 flex items-center justify-between bg-gradient-to-b ${theme.header} border-b`}>
                <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-black tracking-widest px-2.5 py-0.5 rounded-full ${theme.badge}`}>
                        {translationCode}
                    </span>
                    <span className={`text-xs font-semibold ${theme.accent.split(' ')[0]}`}>
                        {translationLabel}
                    </span>
                </div>
                <button
                    onClick={copyAll}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                    title="Copy all"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
            </div>

            {/* Verses scroll area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar" dir="rtl" data-lenis-prevent-wheel>
                {verses.map((v, vIdx) => (
                    <div key={v._id || vIdx} className={`p-4 rounded-2xl border ${theme.accent}`}>
                        <div className="flex items-start gap-3">
                            <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${theme.badge}`}>
                                {v.verseNumber}
                            </span>
                            <p className="text-white/90 leading-loose text-base font-arabic">
                                {v.text}
                            </p>
                        </div>
                    </div>
                ))}
                {verses.length === 0 && (
                    <div className="py-10 text-center opacity-30">
                        <p className="text-sm">لا توجد آيات</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function normalizeText(text) {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u0652]/g, '') // Remove Arabic diacritics (Tashkeel)
        .replace(/[^\w\s\u0600-\u06FF]/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
}

export default function BibleModal({ isOpen: showBibleModal, onClose: setShowBibleModal, onOpenPresentation, verseNotes, setVerseNotes, noteModalConfig, setNoteModalConfig, noteText, setNoteText, isSubmittingNote, setIsSubmittingNote, viewNoteConfig, setViewNoteConfig }) {
    const { user_id, isLogin } = useContext(UserContext);
    const { addToWorkspace } = useContext(HymnsContext);
    const { language, t } = useLanguage();

    ////Bible State & UseEffects
    // --- Bible Modal State ---
    const [bibleSearchQuery, setBibleSearchQuery] = useState('');
    const [bibleSearchResults, setBibleSearchResults] = useState([]);
    const [isSearchingBible, setIsSearchingBible] = useState(false);
    const [bibleModalBooks, setBibleModalBooks] = useState([]);
    const [bibleModalBook, setBibleModalBook] = useState(null);
    const [bibleModalChapters, setBibleModalChapters] = useState([]);
    const [bibleModalChapter, setBibleModalChapter] = useState(null);
    const [bibleModalVerses, setBibleModalVerses] = useState([]);
    const [bibleSelectedVerseIds, setBibleSelectedVerseIds] = useState(new Set());
    // AI analysis state
    const [aiAnalysis, setAiAnalysis] = useState({ loading: false, type: null, text: '', error: null });
    const [showAiOptions, setShowAiOptions] = useState(false);
    const [bibleVerseFontSize, setBibleVerseFontSize] = useState(() => {
        if (typeof window === 'undefined') return 24;
        const saved = localStorage.getItem('taspe7_bible_verse_font_size');
        return saved ? parseInt(saved, 10) : 24;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_bible_verse_font_size', bibleVerseFontSize.toString());
        }
    }, [bibleVerseFontSize]);

    const [bibleAddedSuccess, setBibleAddedSuccess] = useState(false);

    const [bibleModalBrowseLoading, setBibleModalBrowseLoading] = useState(false);
    const [bibleModalBooksReady, setBibleModalBooksReady] = useState(false);
    const [biblePickerOpen, setBiblePickerOpen] = useState(null);
    const bibleBookPickerRef = useRef(null);
    const bibleChapterPickerRef = useRef(null);
    const [isSavingBible, setIsSavingBible] = useState(false);

    // --- New Spacing, Highlights, and Overlay States ---
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

    const [bibleHighlights, setBibleHighlights] = useState({});
    const [imageCardConfig, setImageCardConfig] = useState(null);
    const [prayModeActive, setPrayModeActive] = useState(false);

    const [highlightColorsList, setHighlightColorsList] = useState(() => {
        if (typeof window === 'undefined') return HIGHLIGHT_COLORS;
        try {
            const saved = localStorage.getItem('taspe7_custom_highlights_list');
            return saved ? JSON.parse(saved) : HIGHLIGHT_COLORS;
        } catch {
            return HIGHLIGHT_COLORS;
        }
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('taspe7_custom_highlights_list', JSON.stringify(highlightColorsList));
        }
    }, [highlightColorsList]);

    const [showColorCustomizer, setShowColorCustomizer] = useState(false);
    const [customColorHex, setCustomColorHex] = useState('#7ae7ff');

    const colorInputRef = useRef(null);

    const handleTriggerColorPicker = () => {
        colorInputRef.current?.click();
    };

    const handleColorPickerChange = (e) => {
        const newHex = e.target.value;
        if (newHex) {
            setCustomColorHex(newHex);
        }
    };

    useEffect(() => {
        if (showBibleModal) {
            setBibleHighlights(readLocalBibleHighlights());
        }
    }, [showBibleModal]);

    const handleApplyHighlight = async (colorId) => {
        const newHighlights = { ...bibleHighlights };

        // Optimistic UI update
        bibleSelectedVerseIds.forEach(id => {
            if (colorId) {
                newHighlights[id] = colorId;
                writeLocalBibleHighlight(id, colorId);
            } else {
                delete newHighlights[id];
                writeLocalBibleHighlight(id, null);
            }
        });
        setBibleHighlights(newHighlights);

        // Store array before clearing state
        const verseIdsToProcess = Array.from(bibleSelectedVerseIds);
        setBibleSelectedVerseIds(new Set()); // Auto close context menu by deselecting

        if (!user_id) return;
        const token = localStorage.getItem("user_Taspe7_Token");
        if (!token) return;

        try {
            const promises = verseIdsToProcess.map(async (id) => {
                const verse = bibleModalVerses.find(v => v._id === id);
                if (!verse) return;

                if (colorId) {
                    await axios.post(`${API_ROOT.replace(/\/api$/, '')}/api/users/bible-highlight`, {
                        userid: user_id,
                        verseId: id,
                        bookName: verse.bookName || bibleModalBook?.name || '',
                        chapter: verse.chapter || bibleModalChapter?.number || 1,
                        verseNumber: verse.verseNumber,
                        color: colorId,
                        text: verse.text
                    }, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                } else {
                    await axios.delete(`${API_ROOT.replace(/\/api$/, '')}/api/users/bible-highlight/${user_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                        data: { verseId: id }
                    });
                }
            });
            await Promise.all(promises);
        } catch (err) {
            console.error('Failed to sync bible highlights:', err);
        }
    };

    const handleVerseClick = React.useCallback((verseId) => {
        setBibleSelectedVerseIds(prev => {
            const next = new Set(prev);
            if (next.has(verseId)) {
                next.delete(verseId);
            } else {
                next.add(verseId);
            }
            return next;
        });
    }, []);

    const handleVerseNoteClick = React.useCallback((verse, existingNote) => {
        setViewNoteConfig({ verse, note: existingNote });
    }, []);

    // --- Translation Selector State ---
    const getInitialTranslation = () => {
        if (typeof window === 'undefined') return 'AVD';
        return localStorage.getItem('taspe7_bible_translation') || 'AVD';
    };
    const [bibleTranslation, setBibleTranslationRaw] = useState(getInitialTranslation);
    // Pre-seeded with known translations so both pills appear immediately,
    // even before the /translations endpoint responds.
    const [availableTranslations, setAvailableTranslations] = useState(['AVD', 'KEH']);
    const setBibleTranslation = (t) => {
        setBibleTranslationRaw(t);
        if (typeof window !== 'undefined') localStorage.setItem('taspe7_bible_translation', t);
        // Reset book/chapter/verses so they reload with new translation
        setBibleModalBook(null);
        setBibleModalChapter(null);
        setBibleModalVerses([]);
        setBibleSelectedVerseIds(new Set());
        setBibleModalChapters([]);
        setBibleSearchQuery('');
        setBibleSearchResults([]);
    };

    // --- Offline Translation Downloads State ---
    const [downloadedTranslations, setDownloadedTranslations] = useState(new Set(isApp ? ['AVD'] : []));
    const [isDownloadingTranslation, setIsDownloadingTranslation] = useState(null);

    // Check which translations are offline when modal opens or available translations change
    useEffect(() => {
        if (!showBibleModal) return;
        const checkOffline = async () => {
            const active = new Set(isApp ? ['AVD'] : []); // AVD is pre-seeded only on apps
            for (const tr of availableTranslations) {
                if (tr === 'AVD') continue;
                const downloaded = await isTranslationDownloaded(tr);
                if (downloaded) {
                    active.add(tr);
                }
            }
            setDownloadedTranslations(active);
        };
        checkOffline();
    }, [showBibleModal, availableTranslations]);

    const toggleDownloadTranslation = async (tr) => {
        if (tr === 'AVD') return; // AVD is packaged and cannot be deleted
        const isDownloaded = downloadedTranslations.has(tr);
        if (isDownloaded) {
            if (confirm(language === 'ar' ? `هل أنت متأكد من حذف ترجمة ${tr} من جهازك؟` : `Are you sure you want to delete ${tr} translation from your device?`)) {
                const success = await deleteTranslationFromLocal(tr);
                if (success) {
                    setDownloadedTranslations(prev => {
                        const next = new Set(prev);
                        next.delete(tr);
                        return next;
                    });
                    showToast(language === 'ar' ? 'تم حذف الترجمة بنجاح' : 'Translation deleted successfully');
                }
            }
        } else {
            setIsDownloadingTranslation(tr);
            try {
                const success = await downloadTranslationToLocal(tr, BIBLE_API);
                if (success) {
                    setDownloadedTranslations(prev => {
                        const next = new Set(prev);
                        next.add(tr);
                        return next;
                    });
                    showToast(language === 'ar' ? 'تم تحميل الترجمة بنجاح للتشغيل بدون إنترنت!' : 'Translation downloaded successfully for offline use!');
                }
            } catch (error) {
                if (error?.isNotFound) {
                    showToast(
                        language === 'ar'
                            ? `ترجمة ${tr} غير متوفرة في قاعدة البيانات حالياً.`
                            : `Translation ${tr} is not available in the database yet.`
                    );
                } else {
                    showToast(language === 'ar' ? 'فشل تحميل الترجمة. تأكد من اتصالك بالإنترنت.' : 'Failed to download translation. Check your connection.');
                }
            } finally {
                setIsDownloadingTranslation(null);
            }
        }
    };


    // --- Compare Modal State ---
    const [compareModal, setCompareModal] = useState(false); // open/close
    const [compareData, setCompareData] = useState(null);   // { AVD: [...], KEH: [...] }
    const [isLoadingCompare, setIsLoadingCompare] = useState(false);
    const [compareVerseNums, setCompareVerseNums] = useState([]); // verse numbers to compare

    // Multi-translation selection for compare (persisted in localStorage)
    const COMPARE_STORAGE_KEY = 'taspe7_compare_translations';
    const getInitialCompareTranslations = () => {
        if (typeof window === 'undefined') return [];
        try {
            const saved = localStorage.getItem(COMPARE_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    };
    const [compareSelectedTranslations, setCompareSelectedTranslationsRaw] = useState(getInitialCompareTranslations);
    const setCompareSelectedTranslations = (trs) => {
        setCompareSelectedTranslationsRaw(trs);
        if (typeof window !== 'undefined') localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(trs));
    };

    // UI state: mobile tab index, desktop page (groups of 3)
    const [compareMobileTab, setCompareMobileTab] = useState(0);
    const [compareDesktopPage, setCompareDesktopPage] = useState(0);

    // Core fetch function — separated so it can be called when user toggles translations
    const fetchCompareData = async (verseNumbers, translations) => {
        if (!bibleModalBook?.bookName || bibleModalChapter == null || !verseNumbers?.length) return;
        setIsLoadingCompare(true);
        setCompareData(null);
        try {
            const trsParam = translations && translations.length > 0 ? `&translations=${translations.join(',')}` : '';
            const { data } = await axios.get(
                `${BIBLE_API}/compare?bookName=${encodeURIComponent(bibleModalBook.bookName)}&chapter=${bibleModalChapter}&verseNumbers=${verseNumbers.join(',')}${trsParam}`
            );
            setCompareData(data);
        } catch (err) {
            console.error('Compare fetch error', err);
            setCompareData({});
        } finally {
            setIsLoadingCompare(false);
        }
    };

    const openCompare = async (verseNumbers) => {
        if (!bibleModalBook?.bookName || bibleModalChapter == null || !verseNumbers?.length) return;
        setCompareModal(true);
        setCompareVerseNums(verseNumbers);
        setCompareMobileTab(0);
        setCompareDesktopPage(0);
        // Restore saved selection, or default to all available translations
        const saved = getInitialCompareTranslations();
        const allTrs = availableTranslations;
        let activeTrs = saved.length > 0 ? saved.filter(t => allTrs.includes(t)) : allTrs;
        // Always ensure the current translation is included
        if (!activeTrs.includes(bibleTranslation)) activeTrs = [bibleTranslation, ...activeTrs];
        setCompareSelectedTranslationsRaw(activeTrs);
        await fetchCompareData(verseNumbers, activeTrs);
    };

    useEffect(() => {
        if (!biblePickerOpen) return;
        const onDown = (e) => {
            const bookEl = bibleBookPickerRef.current;
            const chEl = bibleChapterPickerRef.current;
            if (biblePickerOpen === 'book' && bookEl && !bookEl.contains(e.target)) setBiblePickerOpen(null);
            if (biblePickerOpen === 'chapter' && chEl && !chEl.contains(e.target)) setBiblePickerOpen(null);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [biblePickerOpen]);

    // ─── Fetch available translations (runs once on first modal open) ───
    const translationsFetchedRef = React.useRef(false);
    useEffect(() => {
        if (!showBibleModal || translationsFetchedRef.current) return;
        translationsFetchedRef.current = true;
        axios.get(`${BIBLE_API}/translations`)
            .then(({ data }) => {
                if (Array.isArray(data) && data.length > 0) {
                    setAvailableTranslations(data);
                }
            })
            .catch(() => { /* keep the default ['AVD','KEH'] */ });
    }, [showBibleModal]);

    // ─── Load books when modal opens ───
    useEffect(() => {
        if (!showBibleModal) return;
        setBibleModalBook(null);
        setBibleModalChapter(null);
        setBibleModalChapters([]);
        setBibleSelectedVerseIds(new Set());
        setBibleModalVerses([]);
        setBibleModalBooksReady(false);
        let cancelled = false;
        (async () => {
            try {
                // Books are the same across translations — prefer local index (fast/offline)
                const index = await getLocalBibleIndex();
                if (index && index.books && index.books.length > 0) {
                    if (!cancelled) setBibleModalBooks(normalizeBibleBooksFromApi(index.books));
                } else {
                    const { data } = await axios.get(`${BIBLE_API}/books?lang=arabic`);
                    if (!cancelled) setBibleModalBooks(normalizeBibleBooksFromApi(data));
                }
            } catch {
                if (!cancelled) setBibleModalBooks([]);
            } finally {
                if (!cancelled) setBibleModalBooksReady(true);
            }
        })();
        return () => { cancelled = true; };
        // NOTE: NOT depending on bibleTranslation here — books are the same across translations
        // and we don't want the book list to reset every time the user switches translation.
    }, [showBibleModal]);

    // ─── Load chapters when book or translation changes ───
    useEffect(() => {
        if (!showBibleModal || !bibleModalBook?.bookName) {
            setBibleModalChapters([]);
            setBibleSelectedVerseIds(new Set());
            return;
        }
        let cancelled = false;
        (async () => {
            setBibleModalBrowseLoading(true);
            try {
                const isDownloaded = downloadedTranslations.has(bibleTranslation);
                if (isDownloaded) {
                    // use local index for instant offline-first response
                    const index = await getLocalBibleIndex(bibleTranslation);
                    if (index) {
                        const chapters = index.chaptersMap.get(bibleModalBook.bookName) || [];
                        if (!cancelled) {
                            setBibleModalChapters(chapters);
                            setBibleModalBrowseLoading(false);
                        }
                        return;
                    }
                }
                // Other translations or when local index is absent → hit the API
                const { data } = await axios.get(
                    `${BIBLE_API}/chapters/${encodeURIComponent(bibleModalBook.bookName)}?lang=arabic&translation=${bibleTranslation}`
                );
                if (!cancelled) setBibleModalChapters(Array.isArray(data) ? data : []);
            } catch {
                if (!cancelled) setBibleModalChapters([]);
            } finally {
                if (!cancelled) setBibleModalBrowseLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [showBibleModal, bibleModalBook, bibleTranslation, downloadedTranslations]);

    // ─── Load verses when chapter or translation changes ───
    useEffect(() => {
        if (!showBibleModal || !bibleModalBook?.bookName || bibleModalChapter == null) {
            setBibleModalVerses([]);
            setBibleSelectedVerseIds(new Set());
            return;
        }
        let cancelled = false;
        (async () => {
            setBibleModalBrowseLoading(true);
            try {
                const isDownloaded = downloadedTranslations.has(bibleTranslation);
                if (isDownloaded) {
                    // use local index for instant offline-first response
                    const index = await getLocalBibleIndex(bibleTranslation);
                    if (index) {
                        const verses = index.versesMap.get(`${bibleModalBook.bookName}_${parseInt(bibleModalChapter)}`) || [];
                        if (!cancelled) {
                            setBibleModalVerses(verses);
                            setBibleModalBrowseLoading(false);
                        }
                        return;
                    }
                }
                // Other translations or when local index is absent → hit the API
                const { data } = await axios.get(
                    `${BIBLE_API}/verses/${encodeURIComponent(bibleModalBook.bookName)}/${bibleModalChapter}?lang=arabic&translation=${bibleTranslation}`
                );
                if (!cancelled) setBibleModalVerses(Array.isArray(data) ? data : []);
            } catch {
                if (!cancelled) setBibleModalVerses([]);
            } finally {
                if (!cancelled) setBibleModalBrowseLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [showBibleModal, bibleModalBook, bibleModalChapter, bibleTranslation, downloadedTranslations]);


    // Bible Search Debounce Effect
    useEffect(() => {
        let cancelled = false;

        const searchBible = async () => {
            if (!bibleSearchQuery.trim()) {
                setBibleSearchResults([]);
                return;
            }
            setIsSearchingBible(true);
            try {
                let searchedOnline = false;

                // Try Online (MongoDB) First if the device is connected
                if (navigator.onLine) {
                    try {
                        const { data } = await axios.get(
                            `${BIBLE_API}/search?q=${encodeURIComponent(bibleSearchQuery)}&lang=arabic&translation=${bibleTranslation}`
                        );
                        if (!cancelled) setBibleSearchResults(Array.isArray(data) ? data : []);
                        searchedOnline = true;
                    } catch (err) {
                        console.warn("Online Bible search failed, falling back to offline search", err);
                    }
                }

                // Fallback to Offline if Online failed or if device is offline
                if (!searchedOnline) {
                    const isDownloaded = downloadedTranslations.has(bibleTranslation);
                    if (isDownloaded) {
                        const localResults = await searchLocalBible(bibleSearchQuery, bibleTranslation);
                        if (!cancelled) setBibleSearchResults(localResults || []);
                    } else {
                        if (!cancelled) setBibleSearchResults([]);
                    }
                }
            } catch (error) {
                console.error("Bible search error:", error);
                if (!cancelled) setBibleSearchResults([]);
            } finally {
                if (!cancelled) setIsSearchingBible(false);
            }
        };

        const handler = setTimeout(() => {
            searchBible();
        }, 400);

        return () => {
            cancelled = true;
            clearTimeout(handler);
        };
    }, [bibleSearchQuery, bibleTranslation, downloadedTranslations]);

    // Load user's existing bible notes on login
    useEffect(() => {
        if (!isLogin || !user_id) return;
        const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
        if (!token) return;
        // Fetch user's notes and index by verseId for O(1) lookup
        getUsersWithFallback('my-notes', { headers: { Authorization: `Bearer ${token}` } })
            .then(({ data }) => {
                const localMap = readLocalBibleNotes();
                if (Array.isArray(data?.bibleNotes)) {
                    const map = {};
                    data.bibleNotes.forEach(n => { if (n.verseId) map[n.verseId] = n.note; });
                    setVerseNotes({ ...map, ...localMap });
                } else {
                    setVerseNotes(localMap);
                }
            })
            .catch(() => {
                setVerseNotes(readLocalBibleNotes());
            });
    }, [isLogin, user_id]);

    const closeBibleModal = () => {
        setShowBibleModal(false);
        setBibleSearchQuery('');
        setBibleSearchResults([]);
        setBibleModalBooks([]);
        setBibleModalBook(null);
        setBibleModalChapters([]);
        setBibleModalChapter(null);
        setBibleSelectedVerseIds(new Set());
        setBibleModalVerses([]);
        setBibleModalBooksReady(false);
        setBiblePickerOpen(null);
        setCompareModal(false);
        setCompareData(null);
        setCompareVerseNums([]);
        setCompareMobileTab(0);
        setCompareDesktopPage(0);
    };

    const getSelectedVersesRef = () => {
        if (!bibleModalBook?.bookName || bibleModalChapter == null || bibleSelectedVerseIds.size === 0) return '';
        const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
        if (selectedVersesData.length === 0) return '';
        const nums = selectedVersesData.map(v => v.verseNumber).sort((a, b) => a - b);
        if (nums.length === 1) {
            return `${bibleModalBook.bookName} ${bibleModalChapter}:${nums[0]}`;
        } else {
            const isConsecutive = nums.every((num, i) => i === 0 || num === nums[i - 1] + 1);
            if (isConsecutive) {
                return `${bibleModalBook.bookName} ${bibleModalChapter}:${nums[0]}-${nums[nums.length - 1]}`;
            } else {
                return `${bibleModalBook.bookName} ${bibleModalChapter}:${nums.join('، ')}`;
            }
        }
    };

    const handleShare = () => {
        const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
        const shareText = selectedVersesData.map(v => `[${v.verseNumber}] ${v.text}`).join('\n') + `\n(${getSelectedVersesRef()})`;
        if (navigator.share) {
            navigator.share({
                title: getSelectedVersesRef(),
                text: shareText
            }).catch(() => {
                navigator.clipboard.writeText(shareText);
                showToast(language === 'ar' ? 'تم نسخ النص المختار!' : 'Selected text copied!');
            });
        } else {
            navigator.clipboard.writeText(shareText);
            showToast(language === 'ar' ? 'تم نسخ النص المختار!' : 'Selected text copied!');
        }
    };

    const handleOpenImageCard = () => {
        const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
        const combinedText = selectedVersesData.map(v => v.text).join(' ');
        setImageCardConfig({
            refText: getSelectedVersesRef(),
            text: combinedText
        });
    };

    const handleAiAnalysis = async (analysisType) => {
        setShowAiOptions(false);
        const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
        if (!selectedVersesData.length) return;
        const textContent = selectedVersesData.map(v => `[${v.verseNumber}] ${v.text}`).join(' ');
        const verseId = Array.from(bibleSelectedVerseIds).sort().join('-');
        setAiAnalysis({ loading: true, type: analysisType, text: '', error: null });
        try {
            const { data } = await axios.post(`${API_ROOT}/ai/analyze-verse`, {
                verseId,
                textContent,
                analysisType
            });
            setAiAnalysis({ loading: false, type: analysisType, text: data.explanation || '', error: null });
        } catch {
            setAiAnalysis({ loading: false, type: analysisType, text: '', error: 'حدث خطأ، حاول مجدداً.' });
        }
    };

    // Save Bible verses to workspace
    const saveBibleToWorkspace = async () => {
        if (!bibleModalBook?.bookName || bibleModalChapter == null || bibleSelectedVerseIds.size === 0) {
            return;
        }

        setIsSavingBible(true);
        try {
            const selectedVersesData = bibleModalVerses.filter(verse => bibleSelectedVerseIds.has(verse._id));

            if (selectedVersesData.length === 0) {
                setIsSavingBible(false);
                return;
            }

            const selectedVerseNumbers = selectedVersesData.map(v => v.verseNumber).sort((a, b) => a - b);
            const verseNumbersString = selectedVerseNumbers.join(', ');

            const title = `${bibleModalBook.bookName} · ${t('chapter')} ${bibleModalChapter}:${verseNumbersString}`;
            const uniqueIdSuffix = selectedVerseNumbers.join('-'); // For unique ID based on selected verses

            const bibleItem = {
                _id: `bible-${bibleModalBook.bookName}-${bibleModalChapter}-${uniqueIdSuffix}`,
                title: title,
                bookName: bibleModalBook.bookName,
                chapter: bibleModalChapter,
                // Store only the selected verses
                verses: selectedVersesData,
                // Lyrics for presentation/display should also be only selected verses
                isBible: true,
                lyrics: selectedVersesData.map(v => ({
                    type: 'verse',
                    title: `آية ${v.verseNumber}`,
                    text: v.text
                }))
            };

            addToWorkspace(bibleItem);

            setBibleAddedSuccess(true);
            setTimeout(() => setBibleAddedSuccess(false), 2000);
        } catch (error) {
            console.error('Error saving Bible to workspace:', error);
        } finally {
            setIsSavingBible(false);
        }
    };
    ////////////////////////////////////////////////////////

    // Update references to openBiblePresentation inside the extracted functions
    const presentBibleFromSearchHit = async (hit) => {
        if (!hit?.bookName || hit.chapter == null || hit.verseNumber == null) return;
        try {
            const { data } = await axios.get(
                `${BIBLE_API}/verses/${encodeURIComponent(hit.bookName)}/${hit.chapter}?&lang=arabic`
            );
            const list = Array.isArray(data) ? data : [];
            if (!list.length) return;
            const idx = list.findIndex((v) => v.verseNumber === hit.verseNumber);
            onOpenPresentation({
                bookName: hit.bookName,
                chapter: hit.chapter,
                verses: list,
                startIndex: idx >= 0 ? idx : 0,
            });
        } catch (e) {
            console.error('Bible search present:', e);
        }
    };

    const goToChapterFromSearch = (hit) => {
        const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
        if (book) {
            setBibleModalBook(book);
            setBibleModalChapter(hit.chapter);
            setBibleSearchQuery('');
        }
    };

    return (
        <>
            {showBibleModal && (
                <Portal>
                    {/* Fixed the wrapper by adding overflow-hidden to prevent background interaction */}
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 overflow-hidden">
                        {/* Dynamic Background Blur */}
                        <div className="absolute inset-0 bg-[#050505]/80 backdrop-blur-xl" onClick={closeBibleModal} />

                        <div
                            className="relative w-full h-full sm:h-[85vh] max-w-4xl bg-white/[0.02] border border-white/10 sm:rounded-[2.5rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden backdrop-blur-2xl"
                        >
                            {/* ── Top Bar ── */}
                            <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-white/[0.05] bg-black/20 gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Digital Scripture</span>
                                </div>

                                {/* ── Translation Selector ── */}
                                <div className="flex items-center gap-1 bg-white/[0.04] rounded-2xl p-1 border border-white/[0.07]">
                                    {availableTranslations.map((tr) => {
                                        const isActive = bibleTranslation === tr;
                                        const colors = {
                                            AVD: isActive ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'text-amber-400/60 hover:text-amber-300',
                                            KEH: isActive ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'text-emerald-400/60 hover:text-emerald-300',
                                        };
                                        const colorClass = colors[tr] || (isActive ? 'bg-sky-500 text-white' : 'text-sky-400/60 hover:text-sky-300');
                                        return (
                                            <button
                                                key={tr}
                                                onClick={() => setBibleTranslation(tr)}
                                                className={`px-3 py-1 text-[11px] font-black tracking-widest rounded-xl transition-all duration-300 ${colorClass}`}
                                            >
                                                {tr}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* ── Offline Download Option ── */}
                                {bibleTranslation !== 'AVD' && (
                                    <div className="flex items-center gap-1.5" dir="rtl">
                                        {isDownloadingTranslation === bibleTranslation ? (
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-1 rounded-xl animate-pulse">
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                <span>تحميل...</span>
                                            </div>
                                        ) : downloadedTranslations.has(bibleTranslation) ? (
                                            <button
                                                onClick={() => toggleDownloadTranslation(bibleTranslation)}
                                                className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-red-500/25 hover:text-red-300 hover:border-red-500/30 px-2 py-1 rounded-xl transition-all duration-300"
                                                title="حذف الترجمة من الجهاز"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                <span>محفوظة محلياً</span>
                                                <X className="w-2.5 h-2.5 mr-0.5 opacity-60" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => toggleDownloadTranslation(bibleTranslation)}
                                                className="flex items-center gap-1 text-[10px] font-bold text-sky-300 bg-sky-500/20 border border-sky-500/30 hover:bg-sky-500/35 hover:text-white px-2.5 py-1 rounded-xl transition-all duration-300"
                                                title="تنزيل للتشغيل بدون إنترنت"
                                            >
                                                📥 تنزيل للعمل أوفلاين
                                            </button>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={closeBibleModal}
                                    className="group p-2 bg-white/5 hover:bg-red-500/20 rounded-full transition-all duration-300"
                                >
                                    <X className="w-4 h-4 text-white/50 group-hover:text-red-400" />
                                </button>
                            </div>

                            {/* Smart Navigation Hub - Floating Style */}
                            <div className="shrink-0 p-3 sm:p-5 space-y-3 bg-gradient-to-b from-black/40 to-transparent" dir="rtl">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    {/* Minimalist Search */}
                                    <div className="relative flex-1 group">
                                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-sky-400 transition-colors" />
                                        <input
                                            type="text"
                                            value={bibleSearchQuery}
                                            onChange={(e) => setBibleSearchQuery(e.target.value)}
                                            placeholder="ابحث بعمق..."
                                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-2.5 pr-10 pl-4 text-white text-sm focus:outline-none focus:bg-white/[0.06] focus:border-sky-500/30 transition-all placeholder:text-white/10"
                                        />
                                        {bibleSearchQuery && (
                                            <button
                                                onClick={() => setBibleSearchQuery('')}
                                                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-white/30 transition-all z-20"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Compact Selectors */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setBiblePickerOpen(o => o === 'book' ? null : 'book')}
                                            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-white text-xs font-bold transition-all flex items-center gap-2 ${biblePickerOpen === 'book' ? 'bg-sky-500/20 border-sky-500/50' : ''}`}
                                        >
                                            <span className="opacity-50 tracking-tighter">السفر:</span>
                                            <span className="truncate max-w-[80px]">{bibleModalBook?.bookName || '...'}</span>
                                        </button>

                                        <button
                                            onClick={() => setBiblePickerOpen(o => o === 'chapter' ? null : 'chapter')}
                                            disabled={!bibleModalBook}
                                            className={`px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-white text-xs font-bold transition-all flex items-center gap-2 ${biblePickerOpen === 'chapter' ? 'bg-sky-500/20 border-sky-500/50' : ''}`}
                                        >
                                            <span className="opacity-50">الأصحاح:</span>
                                            <span>{bibleModalChapter || '0'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Smart Floating Pickers Area */}
                                <AnimatePresence>
                                    {biblePickerOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            transition={{ duration: 0.15 }}
                                            className="bg-white/[0.02] border border-white/5 rounded-3xl"
                                        >
                                            <div
                                                className="p-4 max-h-[30vh] overflow-y-auto custom-scrollbar"
                                                data-lenis-prevent-wheel
                                            >
                                                {biblePickerOpen === 'book' ? (
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                                        {bibleModalBooks.map((book) => (
                                                            <button
                                                                key={book._id}
                                                                className={`px-3 py-2 rounded-xl text-right text-[11px] font-medium transition-all ${bibleModalBook?.bookName === book.bookName ? 'bg-slate-700/80 text-slate-100 border border-slate-500/30 shadow-lg shadow-black/30' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white'}`}
                                                                onClick={() => { setBibleModalBook(book); setBibleModalChapter(null); setBiblePickerOpen('chapter'); }}
                                                            >
                                                                {book.bookName}
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                                                        {bibleModalChapters.map((ch) => (
                                                            <button
                                                                key={ch}
                                                                className={`h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all ${bibleModalChapter === ch ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'bg-white/5 text-white/40 hover:text-white'}`}
                                                                onClick={() => { setBibleModalChapter(ch); setBiblePickerOpen(null); }}
                                                            >
                                                                {ch}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* --- MAIN SCROLL AREA - FIXED HEIGHT --- */}
                            {/* Added 'overscroll-contain' to stop the website from scrolling when this reaches the end */}
                            <div
                                className="flex-1 overflow-y-auto min-h-0 overscroll-contain custom-scrollbar-thin"
                                dir="rtl"
                                data-lenis-prevent-wheel
                            >
                                <div className="p-4 sm:p-12 max-w-3xl mx-auto">
                                    {isSearchingBible ? (
                                        <div className="flex flex-col items-center justify-center py-20 opacity-40 animate-pulse">
                                            <div className="w-12 h-12 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mb-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white">Neural Search...</span>
                                        </div>
                                    ) : bibleSearchQuery.trim() ? (
                                        <div className="space-y-6 pb-20">
                                            {bibleSearchResults.length > 0 ? (
                                                <>
                                                    <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
                                                        <div className="w-1 h-6 bg-sky-500 rounded-full" />
                                                        <h2 className="text-xl font-bold text-white">نتائج البحث ({bibleSearchResults.length})</h2>
                                                    </div>
                                                    <div className="grid gap-4">
                                                        {bibleSearchResults.map((hit, idx) => (
                                                            <div
                                                                key={idx}
                                                                onClick={() => goToChapterFromSearch(hit)}

                                                                className="group p-4 rounded-2xl bg-white/[0.03] border border-white/0 hover:border-sky-500/30 hover:bg-sky-500/5 transition-all cursor-pointer"
                                                            >
                                                                <div className="flex justify-between items-start gap-4 mb-2">
                                                                    <span className="text-sky-400 font-bold text-sm">
                                                                        {hit.bookName} {hit.chapter}:{hit.verseNumber}
                                                                    </span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            presentBibleFromSearchHit(hit);
                                                                        }}
                                                                        className="p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-all active:scale-90"
                                                                        title="Data Show"
                                                                    >
                                                                        <Monitor className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                                <p
                                                                    className="text-white/80 group-hover:text-white text-base leading-relaxed font-arabic transition-all [&_b]:text-sky-400 [&_b]:font-black"
                                                                    dangerouslySetInnerHTML={{ __html: hit.text }}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="py-20 text-center opacity-30">
                                                    <Search className="w-12 h-12 mx-auto mb-4" />
                                                    <p className="text-sm font-bold uppercase tracking-widest">
                                                        {language === 'arabic' ? 'لم يتم العثور على نتائج' : 'No results found'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : bibleModalVerses.length > 0 ? (
                                        <div className="space-y-10">
                                            {/* Modern Chapter Indicator */}
                                            <div className="flex items-end justify-between border-b border-white/5 pb-6">
                                                <div>
                                                    <h1 className="text-3xl sm:text-5xl font-black text-white leading-none">
                                                        {bibleModalBook.bookName}
                                                    </h1>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <span className="h-[2px] w-8 bg-sky-500" />
                                                        <span className="text-xs font-bold text-sky-400 uppercase tracking-tighter">أصحاح {bibleModalChapter}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => onOpenPresentation({ bookName: bibleModalBook.bookName, chapter: bibleModalChapter, verses: bibleModalVerses, startIndex: 0 })}
                                                    className="p-3 bg-white/5 hover:bg-sky-500 text-white rounded-2xl transition-all active:scale-90 group"
                                                >
                                                    <Monitor className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                </button>
                                            </div>

                                            {/* The Reading Experience - Optimized for performance */}
                                            <div className="space-y-6 pb-20">
                                                {/* Global Controls Panel (Block Positioned) */}
                                                {bibleModalVerses.length > 0 && (
                                                    <div className="relative flex flex-col gap-3.5 p-4 bg-slate-950/50 border border-white/10 rounded-3xl shadow-xl mb-6" dir="rtl">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            {/* Typography & Spacing controls */}
                                                            <div className="flex items-center gap-3.5 flex-wrap text-white text-xs">
                                                                {/* Font Size Control */}
                                                                <div className="flex items-center gap-2 bg-white/5 border border-white/[0.07] rounded-2xl px-3 py-2">
                                                                    <span className="text-white/40 font-bold">حجم الخط:</span>
                                                                    <button
                                                                        onClick={() => setBibleVerseFontSize(prev => Math.max(16, prev - 2))}
                                                                        className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all active:scale-90"
                                                                        title="Decrease font size"
                                                                    >
                                                                        -A
                                                                    </button>
                                                                    <span className="font-bold min-w-[20px] text-center">{bibleVerseFontSize}</span>
                                                                    <button
                                                                        onClick={() => setBibleVerseFontSize(prev => Math.min(44, prev + 2))}
                                                                        className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all active:scale-90"
                                                                        title="Increase font size"
                                                                    >
                                                                        +A
                                                                    </button>
                                                                </div>

                                                                {/* Spacing Control */}
                                                                <div className="flex items-center gap-2 bg-white/5 border border-white/[0.07] rounded-2xl px-3 py-2">
                                                                    <span className="text-white/40 font-bold">المسافة:</span>
                                                                    <button
                                                                        onClick={() => handleSetBibleVerseSpacing(Math.max(8, bibleVerseSpacing - 4))}
                                                                        className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all active:scale-90"
                                                                        title="Decrease spacing"
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <span className="font-bold min-w-[24px] text-center">{bibleVerseSpacing}px</span>
                                                                    <button
                                                                        onClick={() => handleSetBibleVerseSpacing(Math.min(80, bibleVerseSpacing + 4))}
                                                                        className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all active:scale-90"
                                                                        title="Increase spacing"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Selection quick actions */}
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <button
                                                                    onClick={() => setBibleSelectedVerseIds(new Set(bibleModalVerses.map(v => v._id)))}
                                                                    className="px-3.5 py-2 text-xs font-bold rounded-2xl bg-white/5 hover:bg-white/10 border border-white/[0.07] text-slate-200 transition-all active:scale-95"
                                                                >
                                                                    تحديد الكل
                                                                </button>
                                                                <button
                                                                    onClick={() => setBibleSelectedVerseIds(new Set())}
                                                                    className="px-3.5 py-2 text-xs font-bold rounded-2xl bg-white/5 hover:bg-white/10 border border-white/[0.07] text-slate-300 transition-all active:scale-95"
                                                                >
                                                                    إلغاء التحديد
                                                                </button>

                                                                {/* Save Selected to Workspace */}
                                                                {bibleSelectedVerseIds.size > 0 && (
                                                                    <button
                                                                        onClick={saveBibleToWorkspace}
                                                                        disabled={isSavingBible || bibleAddedSuccess}
                                                                        className={`px-4 py-2 text-xs font-black rounded-2xl transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center gap-1.5
                                          ${bibleAddedSuccess ? 'bg-green-500 text-white' : 'bg-sky-500 hover:bg-sky-400 text-white'}
                                          disabled:opacity-50`}
                                                                    >
                                                                        {isSavingBible ? (
                                                                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> ...</>
                                                                        ) : bibleAddedSuccess ? (
                                                                            <><Check className="w-3.5 h-3.5" /> تم الحفظ</>
                                                                        ) : (
                                                                            <>
                                                                                <FolderPlus className="w-3.5 h-3.5" />
                                                                                حفظ للمساحة ({bibleSelectedVerseIds.size})
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Verses List */}
                                                {bibleModalVerses.map((verse) => {
                                                    const isSelectedIndividual = bibleSelectedVerseIds.has(verse._id);
                                                    const existingNote = verseNotes[verse._id];
                                                    const highlightColor = bibleHighlights[verse._id];
                                                    return (
                                                        <VerseItem
                                                            key={verse._id}
                                                            verse={verse}
                                                            isSelected={isSelectedIndividual}
                                                            fontSize={bibleVerseFontSize}
                                                            spacing={bibleVerseSpacing}
                                                            highlightColor={highlightColor}
                                                            highlightColorsList={highlightColorsList}
                                                            hasNote={existingNote}
                                                            onClick={handleVerseClick}
                                                            onNoteClick={handleVerseNoteClick}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center opacity-10 py-40">
                                            <BookOpen className="w-20 h-20 mb-4" />
                                            <span className="text-sm font-bold uppercase tracking-[0.4em]">Select Wisdom</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── SELECTION SHEET (Bottom Drawer Style) ── */}
                            <AnimatePresence>
                                {bibleSelectedVerseIds.size > 0 && (
                                    <motion.div
                                        drag="y"
                                        dragConstraints={{ top: 0, bottom: 0 }}
                                        dragElastic={{ top: 0, bottom: 0.6 }}
                                        onDragEnd={(event, info) => {
                                            if (info.offset.y > 100 || info.velocity.y > 300) {
                                                setBibleSelectedVerseIds(new Set());
                                            }
                                        }}
                                        initial={{ y: '100%' }}
                                        animate={{ y: 0 }}
                                        exit={{ y: '100%' }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                                        className="absolute bottom-0 left-0 right-0 z-50 bg-[#0d0e15]/95 border-t border-white/10 backdrop-blur-2xl px-6 py-5 rounded-t-[2.5rem] shadow-[0_-15px_35px_rgba(0,0,0,0.6)] flex flex-col gap-4 text-white"
                                        dir="rtl"
                                    >
                                        {/* Pull bar */}
                                        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-1 shrink-0 cursor-grab active:cursor-grabbing" />

                                        {/* Title & Ref */}
                                        <div className="flex justify-between items-center shrink-0">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">تعديل الآية المحددة</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-sky-400" dir="ltr">
                                                    {getSelectedVersesRef()}
                                                </span>
                                                <button
                                                    onClick={() => setBibleSelectedVerseIds(new Set())}
                                                    className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all active:scale-95 flex items-center justify-center"
                                                    title="إغلاق"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Capsule Action Buttons */}
                                        <div className="flex gap-2 overflow-x-auto py-1 hide-scrollbar shrink-0" dir="ltr">
                                            <button
                                                onClick={handleShare}
                                                className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95"
                                            >
                                                <Share2 className="w-3.5 h-3.5 text-white/70" /> Share
                                            </button>
                                            {availableTranslations.length > 1 && (
                                                <button
                                                    onClick={() => {
                                                        const nums = bibleModalVerses
                                                            .filter(v => bibleSelectedVerseIds.has(v._id))
                                                            .map(v => v.verseNumber);
                                                        openCompare(nums);
                                                    }}
                                                    className="flex-1 min-w-[90px] py-2.5 px-4 rounded-full bg-[#0a0f1d]/80 hover:bg-[#0f172a] border border-sky-500/40 text-sky-300 text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-[inset_0_0_20px_rgba(14,165,233,0.1),0_0_15px_rgba(14,165,233,0.2)] backdrop-blur-md relative overflow-hidden group/compare"
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-sky-500/0 via-sky-400/10 to-sky-500/0 -translate-x-full group-hover/compare:translate-x-full transition-transform duration-1000"></div>
                                                    <BookOpen className="w-3.5 h-3.5 text-sky-400" /> Compare
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    const firstVerse = bibleModalVerses.find(v => bibleSelectedVerseIds.has(v._id));
                                                    if (!firstVerse) return;
                                                    setNoteText(verseNotes[firstVerse._id] || '');
                                                    setNoteModalConfig({ type: 'bible', data: firstVerse, existingNote: verseNotes[firstVerse._id] });
                                                }}
                                                className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95"
                                            >
                                                <FileText className="w-3.5 h-3.5 text-indigo-400" /> Note
                                            </button>
                                            <button
                                                onClick={() => setPrayModeActive(true)}
                                                className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95"
                                            >
                                                <Cross className="w-3.5 h-3.5 text-rose-400 fill-rose-400/20" /> Pray
                                            </button>
                                            {/* AI Analyze Button */}
                                            <button
                                                onClick={() => { setShowAiOptions(p => !p); setAiAnalysis({ loading: false, type: null, text: '', error: null }); }}
                                                className={`flex-1 min-w-[78px] py-2.5 px-3 rounded-full border text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95 relative overflow-hidden ${showAiOptions
                                                    ? 'bg-violet-500/20 border-violet-400/50 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                                                    : 'bg-white/5 hover:bg-violet-500/10 border-white/10 hover:border-violet-400/30 text-white hover:text-violet-300'
                                                    }`}
                                            >
                                                <Sparkles className="w-3.5 h-3.5" /> AI
                                            </button>
                                        </div>

                                        {/* AI Options Row */}
                                        {showAiOptions && (
                                            <div className="flex gap-2 shrink-0 animate-in fade-in slide-in-from-bottom-1 duration-200" dir="rtl">
                                                {[
                                                    { type: 'explain', label: 'تفسير', icon: BookOpen, color: 'text-violet-400', border: 'border-violet-500/20 hover:border-violet-400/50 hover:bg-violet-500/5', glow: 'shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_22px_rgba(139,92,246,0.25)]' },
                                                    { type: 'cross_reference', label: 'مراجع', icon: Link2, color: 'text-sky-400', border: 'border-sky-500/20 hover:border-sky-400/50 hover:bg-sky-500/5', glow: 'shadow-[0_0_15px_rgba(14,165,233,0.15)] hover:shadow-[0_0_22px_rgba(14,165,233,0.25)]' },
                                                    { type: 'practical', label: 'تطبيق', icon: Lightbulb, color: 'text-amber-400', border: 'border-amber-500/20 hover:border-amber-400/50 hover:bg-amber-500/5', glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_22px_rgba(245,158,11,0.25)]' },
                                                ].map(({ type, label, icon: IconComponent, color, border, glow }) => (
                                                    <button
                                                        key={type}
                                                        onClick={() => handleAiAnalysis(type)}
                                                        disabled={aiAnalysis.loading}
                                                        className={`flex-1 py-3 px-4 rounded-2xl bg-[#111322]/50 border ${border} ${glow} transition-all duration-300 flex flex-col items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 group`}
                                                    >
                                                        <IconComponent className={`w-5 h-5 ${color} group-hover:scale-110 group-active:scale-95 transition-transform duration-300`} />
                                                        <span className="text-[11px] font-black text-slate-300 group-hover:text-white transition-colors duration-300">{label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* AI Response Panel */}
                                        {(aiAnalysis.loading || aiAnalysis.text || aiAnalysis.error) && (
                                            <div className="shrink-0 rounded-2xl overflow-hidden border border-violet-500/20 bg-[#0c0f1e]/80 backdrop-blur-md shadow-[0_4px_24px_rgba(139,92,246,0.12)]">
                                                {/* Panel header */}
                                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-indigo-600/5">
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                                        <span className="text-[11px] font-black text-violet-300 tracking-wider uppercase">
                                                            {aiAnalysis.type === 'explain' ? 'تفسير روحي' : aiAnalysis.type === 'cross_reference' ? 'مراجع كتابية' : 'تطبيق عملي'}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => setAiAnalysis({ loading: false, type: null, text: '', error: null })}
                                                        className="p-1 rounded-full hover:bg-white/10 text-white/30 hover:text-white transition-all"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                {/* Content */}
                                                <div className="px-4 py-3 max-h-52 overflow-y-auto custom-scrollbar-thin" dir="rtl">
                                                    {aiAnalysis.loading ? (
                                                        <div className="flex flex-col items-center justify-center gap-3 py-6">
                                                            <div className="relative w-8 h-8">
                                                                <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
                                                                <Sparkles className="absolute inset-0 m-auto w-3.5 h-3.5 text-violet-400 animate-pulse" />
                                                            </div>
                                                            <span className="text-[11px] text-violet-300/60 font-bold">جارٍ التحليل الذكي...</span>
                                                        </div>
                                                    ) : aiAnalysis.error ? (
                                                        <p className="text-xs text-red-400 text-center py-3">{aiAnalysis.error}</p>
                                                    ) : (
                                                        <p className="text-[13px] leading-loose text-slate-200/90 font-arabic whitespace-pre-line">{aiAnalysis.text}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Highlights Circle Color Picker */}
                                        <div className="flex flex-col gap-2.5 shrink-0 mt-1">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-black text-white/50 whitespace-nowrap">تمييز:</span>
                                                <div className="flex gap-2.5 items-center overflow-x-auto py-1 hide-scrollbar">
                                                    {highlightColorsList.map(c => {
                                                        const isColorActive = Array.from(bibleSelectedVerseIds).every(id => bibleHighlights[id] === c.id);
                                                        const isCustomColor = c.id.startsWith('custom-');
                                                        return (
                                                            <div key={c.id} className="relative group/color shrink-0">
                                                                <button
                                                                    onClick={() => handleApplyHighlight(c.id)}
                                                                    className={`w-7 h-7 rounded-full transition-all active:scale-90 flex items-center justify-center border-2 ${isColorActive ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                                                                        }`}
                                                                    style={{ backgroundColor: c.hex }}
                                                                    title={`Highlight ${c.id}`}
                                                                >
                                                                    {isColorActive && <Check className="w-4 h-4 text-slate-900 stroke-[3]" />}
                                                                </button>

                                                                {isCustomColor && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setHighlightColorsList(prev => prev.filter(color => color.id !== c.id));
                                                                            const nextHighlights = { ...bibleHighlights };
                                                                            let changed = false;
                                                                            Object.keys(nextHighlights).forEach(vid => {
                                                                                if (nextHighlights[vid] === c.id) {
                                                                                    delete nextHighlights[vid];
                                                                                    writeLocalBibleHighlight(vid, null);
                                                                                    changed = true;
                                                                                }
                                                                            });
                                                                            if (changed) setBibleHighlights(nextHighlights);
                                                                        }}
                                                                        className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-[8px] font-bold shadow-md opacity-100 transition-opacity"
                                                                        title="Delete custom color"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {/* Plus button to open/toggle customizer */}
                                                    <button
                                                        onClick={() => setShowColorCustomizer(prev => !prev)}
                                                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 border border-white/20 ${showColorCustomizer ? 'bg-sky-500/20 text-sky-400 border-sky-500/50' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                                                            }`}
                                                        title="Add Custom Color"
                                                    >
                                                        <PlusCircle className="w-4 h-4" />
                                                    </button>

                                                    <button
                                                        onClick={() => handleApplyHighlight(null)}
                                                        className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all active:scale-90 text-white/60 hover:text-white"
                                                        title="Clear Highlight"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Custom Color Editor Widget */}
                                            {showColorCustomizer && (
                                                <div className="flex flex-col gap-3 bg-[#0c1222]/90 backdrop-blur-md border border-white/10 rounded-2xl p-3 mt-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200 shadow-xl shadow-black/40">
                                                    <span className="text-[11px] font-bold text-white/50 mb-1">Choose a vibrant preset:</span>

                                                    <div className="grid grid-cols-6 gap-2">
                                                        {['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#84cc16'].map(presetHex => (
                                                            <button
                                                                key={presetHex}
                                                                onClick={() => {
                                                                    const newId = `custom-${presetHex.replace('#', '')}`;
                                                                    setHighlightColorsList(prev => {
                                                                        if (prev.some(c => c.hex.toLowerCase() === presetHex.toLowerCase())) return prev;
                                                                        return [...prev, { id: newId, hex: presetHex }];
                                                                    });
                                                                    handleApplyHighlight(newId);
                                                                    setShowColorCustomizer(false);
                                                                }}
                                                                className="w-8 h-8 rounded-full border-2 border-white/10 hover:border-white hover:scale-110 transition-all shadow-md"
                                                                style={{ backgroundColor: presetHex }}
                                                                title={`Preset ${presetHex}`}
                                                            />
                                                        ))}
                                                    </div>

                                                    <div className="h-px bg-white/5 w-full my-1"></div>

                                                    <div className="flex items-center gap-2 relative">
                                                        <span className="text-[10px] text-white/40 shrink-0">Custom:</span>

                                                        {/* Visual Color Picker Wrapper */}
                                                        <label className="relative group/picker shrink-0 cursor-pointer w-6 h-6 rounded-md border border-white/20 shadow-inner overflow-hidden flex items-center justify-center hover:scale-110 transition-transform"
                                                            style={{
                                                                background: `linear-gradient(135deg, ${customColorHex}, ${customColorHex}80, #000)`,
                                                                backgroundColor: customColorHex
                                                            }}
                                                            title="Open Color Picker"
                                                        >
                                                            <Sparkles className="w-3 h-3 text-white/50 mix-blend-overlay pointer-events-none" />
                                                            <input
                                                                type="color"
                                                                value={customColorHex}
                                                                onChange={(e) => setCustomColorHex(e.target.value)}
                                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                            />
                                                        </label>

                                                        <input
                                                            type="text"
                                                            value={customColorHex}
                                                            onChange={(e) => setCustomColorHex(e.target.value)}
                                                            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white/80 font-mono w-[4.5rem] focus:outline-none focus:border-sky-500/50 transition-colors"
                                                            placeholder="#000000"
                                                        />

                                                        <div className="flex gap-1.5 ml-auto" dir="ltr">
                                                            <button
                                                                onClick={() => setShowColorCustomizer(false)}
                                                                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-[10px] font-black transition-all active:scale-95"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newId = `custom-${Date.now()}`;
                                                                    const newColor = { id: newId, hex: customColorHex };
                                                                    setHighlightColorsList(prev => {
                                                                        if (prev.some(c => c.hex.toLowerCase() === customColorHex.toLowerCase())) return prev;
                                                                        return [...prev, newColor];
                                                                    });
                                                                    handleApplyHighlight(newId);
                                                                    setShowColorCustomizer(false);
                                                                }}
                                                                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white text-[10px] font-black transition-all active:scale-95 shadow-[0_0_12px_rgba(56,189,248,0.3)]"
                                                            >
                                                                Add
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>



                            {/* ── PRAY MODE FULLSCREEN OVERLAY ── */}
                            {prayModeActive && (
                                <Portal>
                                    <div className="fixed inset-0 z-[300] bg-[#05050c] flex flex-col justify-between p-6 sm:p-12 text-white">
                                        {/* Soft pulsing ambient lights in background */}
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.06),transparent_50%)] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_70%,rgba(14,165,233,0.04),transparent_50%)] pointer-events-none animate-pulse duration-[6s]" />

                                        <div className="shrink-0 flex justify-between items-center border-b border-white/5 pb-4 z-10">
                                            <div className="flex items-center gap-2">
                                                <Heart className="w-5 h-5 text-rose-400 fill-rose-400/20 animate-pulse" />
                                                <span className="text-xs font-bold text-white/50 tracking-wider">وقت الصلاة والتأمل • Prayer & Meditation</span>
                                            </div>
                                            <button
                                                onClick={() => setPrayModeActive(false)}
                                                className="p-2 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-all"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <div className="flex-1 flex flex-col justify-center items-center max-w-4xl mx-auto py-10 px-4 text-center z-10 overflow-y-auto custom-scrollbar-thin">
                                            <div className="space-y-8 select-none" dir="rtl">
                                                {bibleModalVerses
                                                    .filter(v => bibleSelectedVerseIds.has(v._id))
                                                    .map(v => (
                                                        <p key={v._id} className="text-3xl sm:text-5xl font-arabic leading-relaxed font-medium text-slate-100/90 hover:text-white transition-all duration-300">
                                                            {v.text}
                                                            <span className="text-sky-500/40 text-xl sm:text-2xl mr-3 select-none font-bold">({v.verseNumber})</span>
                                                        </p>
                                                    ))}
                                            </div>
                                            <p className="text-sm font-bold text-sky-400 mt-12 tracking-wide uppercase">
                                                — {getSelectedVersesRef()} —
                                            </p>
                                        </div>

                                        <div className="shrink-0 flex flex-col items-center gap-4 z-10">
                                            <p className="text-xs text-white/30 text-center">تأمل بعمق في الآية ودعها تملأ قلبك بالسلام</p>
                                            <button
                                                onClick={() => setPrayModeActive(false)}
                                                className="py-3 px-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-bold transition-all active:scale-95"
                                            >
                                                رجوع • Back
                                            </button>
                                        </div>
                                    </div>
                                </Portal>
                            )}

                            {/* Smart Progress Indicator */}
                            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-sky-500/50 to-transparent" />
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════════
                  COMPARE MODAL — slides in over the Bible modal
                  ══════════════════════════════════════════════ */}
                    <AnimatePresence>
                        {compareModal && (() => {
                            // All translation codes present in the fetched data
                            const dataKeys = compareData ? Object.keys(compareData) : [];
                            // Active selected translations (user toggled)
                            const allColumns = compareSelectedTranslations.length > 0
                                ? compareSelectedTranslations.filter(t => dataKeys.includes(t))
                                : dataKeys;
                            // Desktop: paginate in groups of 3
                            const DESKTOP_PAGE_SIZE = 3;
                            const totalPages = Math.ceil(allColumns.length / DESKTOP_PAGE_SIZE);
                            const dpSafe = Math.min(compareDesktopPage, Math.max(0, totalPages - 1));
                            const desktopColumns = allColumns.slice(dpSafe * DESKTOP_PAGE_SIZE, dpSafe * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE);
                            // Mobile: current tab
                            const mtSafe = Math.min(compareMobileTab, Math.max(0, allColumns.length - 1));
                            const mobileActiveCode = allColumns[mtSafe] || null;
                            return (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15, ease: 'easeOut' }}
                                    className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6"
                                >
                                    {/* Backdrop */}
                                    <div
                                        className="absolute inset-0 bg-[#03030f]/90 sm:backdrop-blur-xl"
                                        onClick={() => setCompareModal(false)}
                                    />

                                    <motion.div
                                        initial={{ y: 56, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: 40, opacity: 0 }}
                                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                        style={{ willChange: 'transform, opacity' }}
                                        className="relative w-full sm:max-w-5xl h-[92vh] sm:h-[82vh] rounded-t-[2.5rem] sm:rounded-[2.5rem] bg-[#09091a] border border-white/10 sm:shadow-[0_0_80px_-10px_rgba(14,165,233,0.4)] flex flex-col overflow-hidden"
                                    >
                                        {/* ── Compare Modal Header ── */}
                                        <div className="shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-b border-white/[0.07] bg-gradient-to-r from-sky-900/30 to-indigo-900/20">
                                            {/* Top row: icon + title + close */}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shadow-[0_0_14px_rgba(14,165,233,0.6)] text-sm">
                                                        ⚖️
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.25em] text-sky-400/80">Translation Compare</p>
                                                        <p className="text-xs sm:text-sm font-bold text-white" dir="rtl">
                                                            {bibleModalBook?.bookName} {bibleModalChapter}
                                                            {compareVerseNums.length > 0 && (
                                                                <span className="text-white/50 font-medium"> — {compareVerseNums.length > 1 ? `آيات ${compareVerseNums.join('، ')}` : `آية ${compareVerseNums[0]}`}</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setCompareModal(false)}
                                                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Translation multi-selector pills */}
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider mr-0.5 shrink-0">ترجمة:</span>
                                                {availableTranslations.map(tr => {
                                                    const isSelected = compareSelectedTranslations.includes(tr);
                                                    const th = getTranslationTheme(tr);
                                                    return (
                                                        <button
                                                            key={tr}
                                                            onClick={async () => {
                                                                // Must keep at least 1 selected
                                                                if (isSelected && compareSelectedTranslations.length === 1) return;
                                                                const next = isSelected
                                                                    ? compareSelectedTranslations.filter(t => t !== tr)
                                                                    : [...compareSelectedTranslations, tr];
                                                                setCompareSelectedTranslations(next);
                                                                setCompareMobileTab(0);
                                                                setCompareDesktopPage(0);
                                                                await fetchCompareData(compareVerseNums, next);
                                                            }}
                                                            className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-black tracking-wide border transition-all active:scale-95 ${isSelected
                                                                ? `${th.badge} border-transparent`
                                                                : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/10'
                                                                }`}
                                                        >
                                                            {tr}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* ── Mobile Tab Bar (hidden on sm+) ── */}
                                        {!isLoadingCompare && allColumns.length > 1 && (
                                            <div className="sm:hidden shrink-0 flex border-b border-white/[0.07] bg-[#09091a]/80 overflow-x-auto hide-scrollbar">
                                                {allColumns.map((tr, idx) => {
                                                    const th = getTranslationTheme(tr);
                                                    return (
                                                        <button
                                                            key={tr}
                                                            onClick={() => setCompareMobileTab(idx)}
                                                            className={`flex-1 min-w-[80px] px-3 py-3 text-xs font-black tracking-wide transition-all whitespace-nowrap ${idx === mtSafe ? th.tab : th.tabInactive
                                                                }`}
                                                        >
                                                            {tr}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* ── Compare Body ── */}
                                        <div className="flex-1 overflow-hidden flex min-h-0">
                                            {isLoadingCompare ? (
                                                <div className="flex-1 flex flex-col sm:flex-row gap-0 min-h-0">
                                                    {[...Array(Math.min(3, compareSelectedTranslations.length || 2))].map((_, i) => (
                                                        <div key={i} className="flex-1 p-6 border-b sm:border-b-0 sm:border-r border-white/[0.06] last:border-0 space-y-4 animate-pulse">
                                                            <div className="h-5 w-24 bg-white/10 rounded-full" />
                                                            {[...Array(compareVerseNums.length || 2)].map((_, j) => (
                                                                <div key={j} className="space-y-2">
                                                                    <div className="h-3 w-10 bg-white/5 rounded" />
                                                                    <div className="h-4 bg-white/5 rounded w-full" />
                                                                    <div className="h-4 bg-white/5 rounded w-4/5" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : allColumns.length > 0 ? (
                                                <>
                                                    {/* DESKTOP: up to 3 columns with prev/next */}
                                                    <div className="hidden sm:flex flex-1 min-h-0 relative overflow-hidden">
                                                        {desktopColumns.map((tr) => (
                                                            <CompareColumn
                                                                key={tr}
                                                                translationCode={tr}
                                                                verses={compareData?.[tr] || []}
                                                                isActive={true}
                                                            />
                                                        ))}
                                                        {/* Desktop Prev/Next pills */}
                                                        {totalPages > 1 && (
                                                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#09091a]/90 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 shadow-xl z-10">
                                                                <button
                                                                    onClick={() => setCompareDesktopPage(p => Math.max(0, p - 1))}
                                                                    disabled={dpSafe === 0}
                                                                    className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                                                                >
                                                                    <ChevronDown className="w-4 h-4 rotate-90" />
                                                                </button>
                                                                <div className="flex gap-1.5 items-center">
                                                                    {Array.from({ length: totalPages }).map((_, pi) => (
                                                                        <button
                                                                            key={pi}
                                                                            onClick={() => setCompareDesktopPage(pi)}
                                                                            className={`h-2 rounded-full transition-all ${pi === dpSafe ? 'bg-sky-400 w-5' : 'bg-white/20 w-2 hover:bg-white/40'}`}
                                                                        />
                                                                    ))}
                                                                </div>
                                                                <button
                                                                    onClick={() => setCompareDesktopPage(p => Math.min(totalPages - 1, p + 1))}
                                                                    disabled={dpSafe >= totalPages - 1}
                                                                    className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                                                                >
                                                                    <ChevronDown className="w-4 h-4 -rotate-90" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* MOBILE: one tab at a time */}
                                                    <div className="sm:hidden flex-1 flex flex-col min-h-0 overflow-hidden">
                                                        {mobileActiveCode && compareData?.[mobileActiveCode] ? (
                                                            <CompareColumn
                                                                key={mobileActiveCode}
                                                                translationCode={mobileActiveCode}
                                                                verses={compareData[mobileActiveCode]}
                                                                isActive={true}
                                                            />
                                                        ) : (
                                                            <div className="flex-1 flex items-center justify-center opacity-20">
                                                                <p className="text-sm">لا توجد بيانات</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex-1 flex items-center justify-center opacity-20">
                                                    <div className="text-center">
                                                        <div className="text-4xl mb-3">⚖️</div>
                                                        <p className="text-sm font-bold">لا توجد بيانات</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Bottom glow line */}
                                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-500/60 to-transparent" />
                                    </motion.div>
                                </motion.div>
                            );
                        })()}
                    </AnimatePresence>
                </Portal>
            )}
        </>
    );
}
