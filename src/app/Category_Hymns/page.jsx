'use client';
import React, { useState, useContext, useEffect, useRef } from 'react';
import { transposeScale, transposeChords, transposeLyrics } from '../utils/musicUtils';
import { useQuery, useInfiniteQuery, useQueryClient, useIsRestoring } from "@tanstack/react-query";
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../loading';
import Portal from '../Portal/Portal';
import Metronome from '../Metronome/page';
import { UserContext } from '../context/User_Context';
// Add BookOpen to this line
import { Music, Calendar, Star, Gift, Sparkles, PlayCircle, PlusCircle, Trash2, X, Heart, GraduationCap, FolderPlus, Check, Edit2, Search, FileText, Monitor, Guitar, Eye, EyeOff, Radio, ExternalLink, Tv2, Mic, MicOff, BookOpen, ChevronDown, Loader2, Copy, Share2, ClipboardCheck, Link2, Lightbulb, Eraser, Moon, RotateCcw, ZoomOut, ZoomIn, Cross } from 'lucide-react';
import { HymnsContext } from '../context/Hymns_Context';
import { useLanguage } from "../context/LanguageContext";
import { showToast } from '../components/ToastContainer';
import { Virtuoso } from "react-virtuoso";
import { usePresentation } from '../hooks/usePresentation';
import { normalizeBibleBooksFromApi } from '../utils/bibleBooks';
import { getApiBaseUrl } from '../utils/apiBase';
import { useRouter } from 'next/navigation';
import { isApp } from '../utils/ReactQueryProvider';
import { initLocalBible, getLocalBibleIndex, searchLocalBible, isTranslationDownloaded, downloadTranslationToLocal, deleteTranslationFromLocal } from '../utils/bibleSync';
import { queueOfflineAction } from '../utils/offlineQueue';
import StanzaSlideControls from '../components/StanzaSlideControls';
import {
  buildHymnPresentationSlides,
  normalizeStanzaForEdit,
  prepareLyricsForSave,
  sanitizeSlideBreaks,
} from '../utils/hymnSlides';
import { useCategoryHymnsTour } from './Tour/useCategoryHymnsTour';


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

export default function Category_Humns() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLogin, UserRole, vocalsMode, user_id } = useContext(UserContext);
  const { addToWorkspace, isHymnInWorkspace } = useContext(HymnsContext)
  const { t, language, setLanguage } = useLanguage();

  // Initialize offline caches (Bible + Hymns) on startup
  useEffect(() => {
    // Bible: run on both app and web (app loads from bundled JSON, web downloads from API in background)
    initLocalBible().catch(() => { });

    // Hymns: on native app, pre-load bundled hymns.json into localforage if empty
    if (isApp) {
      (async () => {
        const localforage_ = (await import('localforage')).default;
        const HYMNS_CACHE_KEY = 'taspe7_hymns_json';
        const resolveId = (id) => {
          if (!id) return '';
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id.$oid) return id.$oid;
          return String(id);
        };
        try {
          const existing = await localforage_.getItem(HYMNS_CACHE_KEY);
          if (!existing || existing.length === 0) {
            const res = await fetch('/hymns.json');
            if (res.ok) {
              const json = await res.json();
              if (Array.isArray(json) && json.length > 0) {
                const normalized = json.map(h => ({
                  ...h,
                  _id: resolveId(h._id),
                  lyrics: Array.isArray(h.lyrics) ? h.lyrics.map(l => ({ ...l, _id: resolveId(l._id) })) : h.lyrics
                }));
                await localforage_.setItem(HYMNS_CACHE_KEY, normalized);
                console.log('[HymnsInit] App: hymns.json cached to localforage:', normalized.length);
              }
            }
          }
        } catch (e) {
          console.warn('[HymnsInit] App: failed to cache hymns.json', e.message);
        }
      })();
    }
  }, []);

  // Product tour
  useCategoryHymnsTour(language);

  // Re-introduced for Role checks
  const [activeTab, setActiveTab] = useState('all');



  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', party: ['all'], BPM: '', timeSignature: 'None' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingHymnId, setEditingHymnId] = useState(null); // Track which hymn is being edited

  // Presentation view visibility state (moved up to avoid TDZ error)
  const [showDataShow, setShowDataShow] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(true);

  // Desktop presentation search option ('hymns' or 'bible') (moved up to avoid TDZ error)
  const [desktopSearchType, setDesktopSearchType] = useState(() => {
    if (typeof window === 'undefined') return 'hymns';
    return localStorage.getItem('taspe7_desktop_search_type') || 'hymns';
  });

  const handleSetDesktopSearchType = (val) => {
    setDesktopSearchType(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_desktop_search_type', val);
    }
  };

  ////Bible State & UseEffects
  // --- Bible Modal State ---
  const [showBibleModal, setShowBibleModal] = useState(false);
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
  const [aiAnalysis, setAiAnalysis] = useState({ loading: false, type: null, text: '', error: null, isLimit: false });
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


  ////////////////////////////////////////////

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


  const dataKeys = compareData ? Object.keys(compareData) : [];
  const allColumns = compareSelectedTranslations.length > 0
    ? compareSelectedTranslations.filter(t => dataKeys.includes(t))
    : dataKeys;
  const DESKTOP_PAGE_SIZE = 3;
  const totalPages = Math.ceil(allColumns.length / DESKTOP_PAGE_SIZE);
  const dpSafe = Math.min(compareDesktopPage, Math.max(0, totalPages - 1));
  const desktopColumns = allColumns.slice(dpSafe * DESKTOP_PAGE_SIZE, dpSafe * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE);
  const mtSafe = Math.min(compareMobileTab, Math.max(0, allColumns.length - 1));
  const mobileActiveCode = allColumns[mtSafe] || null;
  ///////////////////////////////////////////
  // Notes: keyed by verseId for O(1) lookup
  const [verseNotes, setVerseNotes] = useState({}); // { [verseId]: noteText }
  const [noteModalConfig, setNoteModalConfig] = useState(null); // { type, data, existingNote }
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [viewNoteConfig, setViewNoteConfig] = useState(null); // { verse, note }

  useEffect(() => {
    if (!biblePickerOpen) return;
    const onDown = (e) => {
      const bookEl = bibleBookPickerRef.current;
      const chEl = bibleChapterPickerRef.current;
      if (biblePickerOpen === 'book' && bookEl && !bookEl.contains(e.target)) setBiblePickerOpen(null);
      if (biblePickerOpen === 'chapter' && chEl && !chEl.contains(e.target)) setBiblePickerOpen(null);

      // Close presentation Bible picker when clicking outside picker buttons or dropdowns
      const isPickerClick = e.target.closest('.bible-picker-btn') || e.target.closest('.bible-picker-dropdown');
      if (!isPickerClick && (biblePickerOpen === 'book_present' || biblePickerOpen === 'chapter_present')) {
        setBiblePickerOpen(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [biblePickerOpen]);

  // ─── Fetch available translations (runs once on first modal open or presentation mode active) ───
  const translationsFetchedRef = React.useRef(false);
  useEffect(() => {
    if ((!showBibleModal && !(showDataShow && desktopSearchType === 'bible')) || translationsFetchedRef.current) return;
    translationsFetchedRef.current = true;
    axios.get(`${BIBLE_API}/translations`)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableTranslations(data);
        }
      })
      .catch(() => { /* keep the default ['AVD','KEH'] */ });
  }, [showBibleModal, showDataShow, desktopSearchType]);

  // ─── Load books when modal opens or presentation Bible mode is active ───
  useEffect(() => {
    if (!showBibleModal && !(showDataShow && desktopSearchType === 'bible')) return;
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
  }, [showBibleModal, showDataShow, desktopSearchType]);

  // ─── Load chapters when book or translation changes (synced with presentation) ───
  useEffect(() => {
    if ((!showBibleModal && !(showDataShow && desktopSearchType === 'bible')) || !bibleModalBook?.bookName) {
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
  }, [showBibleModal, showDataShow, desktopSearchType, bibleModalBook, bibleTranslation, downloadedTranslations]);

  // ─── Load verses when chapter or translation changes (synced with presentation) ───
  useEffect(() => {
    if ((!showBibleModal && !(showDataShow && desktopSearchType === 'bible')) || !bibleModalBook?.bookName || bibleModalChapter == null) {
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
  }, [showBibleModal, showDataShow, desktopSearchType, bibleModalBook, bibleModalChapter, bibleTranslation, downloadedTranslations]);


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

  const handleSaveNote = async () => {
    if (!noteText.trim() || !noteModalConfig) return;
    // Use the correct localStorage keys this app actually uses
    const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
    const userid = user_id; // from UserContext, key: user_Taspe7_ID
    if (!token || !userid) {
      console.error('Note save failed: missing token or user ID', { token: !!token, userid });
      alert('You must be logged in to save notes.');
      return;
    }

    setIsSubmittingNote(true);
    try {
      if (noteModalConfig.type === 'bible') {
        const verse = noteModalConfig.data;
        await postUsersWithFallback('bible-note', {
          userid,
          verseId: verse._id,
          bookName: bibleModalBook?.bookName || verse.bookName || 'Unknown',
          chapter: bibleModalChapter || verse.chapter || 1,
          verseNumber: verse.verseNumber,
          text: verse.text,
          note: noteText
        }, { headers: { Authorization: `Bearer ${token}` } });
        // Update local state immediately for instant feedback
        setVerseNotes(prev => ({ ...prev, [verse._id]: noteText }));
      } else if (noteModalConfig.type === 'hymn') {
        const hymn = noteModalConfig.data;
        await postUsersWithFallback('hymn-note', {
          userid,
          hymnId: hymn._id || hymn.hymnId,
          title: hymn.title,
          note: noteText
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setNoteModalConfig(null);
      setNoteText('');
    } catch (err) {
      const isNetworkError = !navigator.onLine || err.message === 'Network Error' || err.code === 'ECONNABORTED';

      if (isNetworkError) {
        if (noteModalConfig?.type === 'bible') {
          const verse = noteModalConfig.data;
          await queueOfflineAction(`${API_ROOT}/users/bible-note`, 'POST', {
            userid,
            verseId: verse._id,
            bookName: bibleModalBook?.bookName || verse.bookName || 'Unknown',
            chapter: bibleModalChapter || verse.chapter || 1,
            verseNumber: verse.verseNumber,
            text: verse.text,
            note: noteText
          }, { Authorization: `Bearer ${token}` });

          writeLocalBibleNote(verse?._id, noteText);
          setVerseNotes(prev => ({ ...prev, [verse?._id]: noteText }));
        } else if (noteModalConfig?.type === 'hymn') {
          const hymn = noteModalConfig.data;
          await queueOfflineAction(`${API_ROOT}/users/hymn-note`, 'POST', {
            userid,
            hymnId: hymn._id || hymn.hymnId,
            title: hymn.title,
            note: noteText
          }, { Authorization: `Bearer ${token}` });
        }

        setNoteModalConfig(null);
        setNoteText('');
        showToast({ message: '📶 You\'re offline — your note is saved and will sync automatically once you\'re back online.', type: 'offline', duration: 6000 });
        return;
      }

      if (err?.response?.status === 404 && noteModalConfig?.type === 'bible') {
        const verse = noteModalConfig.data;
        writeLocalBibleNote(verse?._id, noteText);
        setVerseNotes(prev => ({ ...prev, [verse?._id]: noteText }));
        setNoteModalConfig(null);
        setNoteText('');
        alert('Saved locally on this device. Backend note route is still returning 404.');
        return;
      }
      console.error('Failed to save note:', err?.response?.data || err.message);
      alert('Failed to save note: ' + (err?.response?.data?.message || err.message));
    } finally {
      setIsSubmittingNote(false);
    }
  };

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

    try {
      navigator.share({
        title: getSelectedVersesRef(),
        text: shareText
      });
    } catch (error) {
      console.error('navigator.share is not supported', error);
      navigator.clipboard.writeText(shareText).then(() => {
        showToast(language === 'ar' ? 'تم نسخ النص المختار!' : 'Selected text copied!');
      }).catch((clipboardError) => {
        console.error('Clipboard write failed', clipboardError);
        // Handle the error further if needed
      });
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
    setAiAnalysis({ loading: true, type: analysisType, text: '', error: null, isLimit: false });
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const { data } = await axios.post(`${API_ROOT}/ai/analyze-verse`, {
        verseId,
        textContent,
        analysisType
      }, { headers });
      setAiAnalysis({ loading: false, type: analysisType, text: data.explanation || '', error: null, isLimit: false });
    } catch (err) {
      const responseMessage = err?.response?.data?.message || 'حدث خطأ، حاول مجدداً.';
      const isLimit = err?.response?.status === 429;
      setAiAnalysis({ loading: false, type: analysisType, text: '', error: responseMessage, isLimit });
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

  // Lyrics Modal State
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
  const [lyricsTheme, setLyricsTheme] = useState('main');
  const [fontSize, setFontSize] = useState(18);
  const [showChords, setShowChords] = useState(true); // Toggle for chords visibility
  const lyricsScrollRef = React.useRef(null); // Ref for lyrics scroll container
  const [copiedLyrics, setCopiedLyrics] = useState(false);

  //Data Show
  const [dataShowIndex, setDataShowIndex] = useState(0);
  const [presentationViewport, setPresentationViewport] = useState({ width: 1200, height: 900 });
  const thumbContainerRef = React.useRef(null);

  // ── Live Presentation (Socket.io) ──────────────────────────────────
  const [dataShowId, setDataShowId] = useState('');
  const [dataShowIdInput, setDataShowIdInput] = useState('');
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isJoiningSession, setIsJoiningSession] = useState(false);

  // ── Presentation Controls & Custom Backgrounds States ─────────────
  const [dataShowBlackout, setDataShowBlackout] = useState(false);
  const [dataShowFontScale, setDataShowFontScale] = useState(1.0);
  const [dataShowBackgrounds, setDataShowBackgrounds] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('taspe_presentation_backgrounds');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [dataShowActiveBg, setDataShowActiveBg] = useState(() => {
    if (typeof window === 'undefined') return 'default';
    return localStorage.getItem('taspe_active_background') || 'default';
  });
  const [showBgSelector, setShowBgSelector] = useState(false);

  useEffect(() => {
    const savedSession = localStorage.getItem('myLivePresentationId');
    if (savedSession) {
      const checkSession = async () => {
        try {
          const BASE_URL = "https://worship-team-api.onrender.com/api";
          const response = await axios.get(`${BASE_URL}/presentation/check/${encodeURIComponent(savedSession)}`);
          if (response.data.exists) {
            setDataShowId(savedSession);
            if (response.data.expiresAt) setSessionExpiresAt(response.data.expiresAt);
          } else {
            localStorage.removeItem('myLivePresentationId');
          }
        } catch (e) {
          console.error(e);
        }
      };
      checkSession();
    }
  }, []);

  const { isConnected, broadcastHymn, broadcastSlide, clearDisplay, toggleAudio, isAudioActive } = usePresentation(
    dataShowId || null,
    'controller'
  );

  const handleCreateSession = async () => {
    if (dataShowId || localStorage.getItem('myLivePresentationId')) {
      alert("You already have an active Live Presentation on this device. Please end it first.");
      return;
    }

    const id = dataShowIdInput.trim();
    if (!id) return;

    setIsCreatingSession(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await axios.post(`${API_ROOT}/presentation/create`, { dataShowId: id }, { headers });
      if (response.data.success) {
        setDataShowId(id);
        if (response.data.expiresAt) setSessionExpiresAt(response.data.expiresAt);
        localStorage.setItem('myLivePresentationId', id);
        setShowSessionPanel(false);
      }
    } catch (error) {
      alert(error.response?.data?.error || "Failed to create session");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleJoinSession = async () => {
    const id = dataShowIdInput.trim();
    if (!id) return;

    setIsJoiningSession(true);
    try {
      const response = await axios.get(`${API_ROOT}/presentation/check/${encodeURIComponent(id)}`);
      if (response.data.exists) {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile || window.innerWidth < 640) {
          router.push(`/presentation/display?dataShowId=${encodeURIComponent(id)}`);
        } else {
          window.open(`/presentation/display?dataShowId=${encodeURIComponent(id)}`, '_blank');
          setIsJoiningSession(false);
        }
        setShowSessionPanel(false);
      } else {
        alert("Presentation room does not exist or has expired.");
        setIsJoiningSession(false);
      }
    } catch (error) {
      alert("Failed to join session: could not connect to server");
      setIsJoiningSession(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────

  const lyricsInputRef = React.useRef(null); // Ref for the lyrics textarea

  // Lock scroll when modal is open
  useEffect(() => {
    const isAnyModalOpen = showModal || showLyricsModal || showDataShow || showBibleModal;

    const overflowValue = isAnyModalOpen ? 'hidden' : '';

    document.body.style.overflow = overflowValue;
    document.documentElement.style.overflow = overflowValue;

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [showModal, showLyricsModal, showDataShow, showBibleModal]);

  useEffect(() => {
    if (!showDataShow || typeof window === 'undefined') return;
    const updateViewport = () => {
      setPresentationViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [showDataShow]);



  const dataShowSlides = React.useMemo(() => {
    if (!selectedLyricsHymn?.lyrics) return [];

    let lyricsArray = selectedLyricsHymn.lyrics;

    if (typeof lyricsArray === 'string') {
      const lyricsToUse = selectedLyricsHymn.transposeStep
        ? transposeLyrics(lyricsArray, selectedLyricsHymn.transposeStep)
        : lyricsArray;

      return buildHymnPresentationSlides(lyricsToUse, {
        showChords,
        viewportHeight: presentationViewport.height,
        viewportWidth: presentationViewport.width,
      });
    }

    if (Array.isArray(lyricsArray)) {
      const lyricsToUse = selectedLyricsHymn.transposeStep
        ? transposeLyrics(lyricsArray, selectedLyricsHymn.transposeStep)
        : lyricsArray;

      return buildHymnPresentationSlides(lyricsToUse, {
        showChords,
        viewportHeight: presentationViewport.height,
        viewportWidth: presentationViewport.width,
      });
    }

    return [];
  }, [
    selectedLyricsHymn?.lyrics,
    selectedLyricsHymn?.transposeStep,
    showChords,
    presentationViewport.height,
    presentationViewport.width,
  ]);

  //Data show Swipe - Native Touch Events (No Library)
  useEffect(() => {
    if (!showDataShow) return;

    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;
    let elementRef = null;

    const handleKey = (e) => {
      // Left = Next slide
      if (e.key === 'ArrowLeft' && dataShowIndex < dataShowSlides.length - 1) {
        const nextIdx = dataShowIndex + 1;
        setDataShowIndex(nextIdx);
        broadcastLocalSlide(dataShowSlides, nextIdx, selectedLyricsHymn?.title);
      }

      // Right = Previous slide
      if (e.key === 'ArrowRight' && dataShowIndex > 0) {
        const prevIdx = dataShowIndex - 1;
        setDataShowIndex(prevIdx);
        broadcastLocalSlide(dataShowSlides, prevIdx, selectedLyricsHymn?.title);
      }

      if (e.key === 'Escape') {
        setShowDataShow(false);
      }
    };

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const swipeDistance = touchStartX - touchEndX;

      // Swipe Right (Next Slide) - RTL
      if (swipeDistance < -minSwipeDistance && dataShowIndex < dataShowSlides.length - 1) {
        setDataShowIndex(i => i + 1);
      }

      // Swipe Left (Previous Slide) - RTL
      if (swipeDistance > minSwipeDistance && dataShowIndex > 0) {
        setDataShowIndex(i => i - 1);
      }
    };

    // Wait for DOM to be ready (fixes first-time touch event issue)
    const timer = setTimeout(() => {
      const element = document.getElementById('mobileSlideArea');
      if (element) {
        elementRef = element;
        element.addEventListener('touchstart', handleTouchStart, { passive: true });
        element.addEventListener('touchend', handleTouchEnd, { passive: true });
      }
    }, 0);

    window.addEventListener('keydown', handleKey);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
      if (elementRef) {
        elementRef.removeEventListener('touchstart', handleTouchStart);
        elementRef.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [showDataShow, dataShowIndex, dataShowSlides.length]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    if (showDataShow && thumbContainerRef.current) {
      const activeBtn = thumbContainerRef.current.children[dataShowIndex];
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [dataShowIndex, showDataShow]);

  // Robust broadcast sync: whenever session connects or hymn/lyrics change while presentation is open.
  // Uses the already-computed dataShowSlides memo — avoids duplicating the regex/split/map work.
  useEffect(() => {
    if (showDataShow && dataShowId && selectedLyricsHymn && isConnected) {
      // dataShowSlides is already memoised above; reuse it directly
      broadcastHymn(selectedLyricsHymn, dataShowSlides);
      // No broadcastSlide here — hymn-change resets to slide 0 on the server,
      // and the separate dataShowIndex effect handles subsequent navigation.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDataShow, dataShowId, selectedLyricsHymn, isConnected, broadcastHymn, showChords]);

  // Broadcast slide change whenever dataShowIndex moves exclusively
  useEffect(() => {
    if (showDataShow && dataShowId && selectedLyricsHymn && isConnected) {
      broadcastSlide(dataShowIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataShowIndex]);

  // Sync showChords with vocalsMode
  useEffect(() => {
    if (vocalsMode) {
      setShowChords(false);
    } else {
      setShowChords(true);
    }
  }, [vocalsMode]);


  const lyricsThemes = {
    warm: {
      bg: '#FDFBF7',
      text: '#1A1A1A',
      label: 'Warm',
      accent: '#0F172A',
      chord: '#2563EB',
      border: 'rgba(0, 0, 0, 0.05)'
    },
    dark: {
      bg: '#0F172A',
      text: '#F1F5F9',
      label: 'Dark',
      accent: '#38BDF8',
      chord: '#7DD3FC',
      border: 'rgba(255, 255, 255, 0.05)'
    },
    main: {
      bg: '#0E2238',
      text: '#F8F9FA',
      label: 'Main',
      accent: '#60A5FA',
      chord: '#38BDF8',
      border: 'rgba(96, 165, 250, 0.1)'
    }
  };
  const usageTimerRef = useRef(null); // مخزن للتايمر عشان نقدر نكسله
  const openLyrics = (hymn, transposeStep = 0) => {
    setSelectedLyricsHymn({ ...hymn, transposeStep });
    setLyricsTheme('main');
    setShowChords(vocalsMode ? false : true);

    setShowLyricsModal(true);
    // لو فيه تايمر قديم شغال (من ترنيمة تانية مثلاً) نكنسله
    if (usageTimerRef.current) clearTimeout(usageTimerRef.current);

    console.log("التايمر بدأ للترنيمة:", hymn.title);

    // بنخزن التايمر جوه الـ Ref
    usageTimerRef.current = setTimeout(async () => {
      try {
        await axios.patch(`${API_ROOT}/hymns/${hymn._id}/use`);
        console.log("تم تسجيل الاستخدام بنجاح!");
        usageTimerRef.current = null; // تصفير الـ Ref بعد التنفيذ
      } catch (err) {
        console.error("خطأ في تسجيل الاستخدام:", err);
      }
    }, 10000); // 10 ثواني
  };

  // ── Local Offline Broadcast (BroadcastChannel API - zero internet needed) ──
  const LOCAL_CHANNEL = 'taspe_presenter';
  const localDisplayRef = React.useRef(null);

  const broadcastLocalSettings = React.useCallback((settings) => {
    const ch = new BroadcastChannel(LOCAL_CHANNEL);
    ch.postMessage({
      type: 'settings',
      settings
    });
    ch.close();
  }, []);

  const broadcastLocalSlide = React.useCallback((slides, index, hymnTitle) => {
    const slide = slides[index];
    if (!slide) return;
    const ch = new BroadcastChannel(LOCAL_CHANNEL);
    ch.postMessage({
      type: 'slide',
      slide,
      hymn: hymnTitle,
      index,
      total: slides.length,
      settings: {
        blackout: dataShowBlackout,
        activeBg: dataShowActiveBg,
        fontScale: dataShowFontScale
      }
    });
    ch.close();
  }, [dataShowBlackout, dataShowActiveBg, dataShowFontScale]);

  // Background Management Functions
  const handleUploadBackground = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (dataShowBackgrounds.length >= 5) {
      alert(language === 'ar' ? 'يمكنك رفع 5 صور كحد أقصى.' : 'You can upload a maximum of 5 images.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      const updated = [...dataShowBackgrounds, base64];
      setDataShowBackgrounds(updated);
      localStorage.setItem('taspe_presentation_backgrounds', JSON.stringify(updated));

      setDataShowActiveBg(base64);
      localStorage.setItem('taspe_active_background', base64);

      broadcastLocalSettings({
        blackout: dataShowBlackout,
        activeBg: base64,
        fontScale: dataShowFontScale
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteBackground = (bgToDelete, e) => {
    e.stopPropagation();
    const updated = dataShowBackgrounds.filter(bg => bg !== bgToDelete);
    setDataShowBackgrounds(updated);
    localStorage.setItem('taspe_presentation_backgrounds', JSON.stringify(updated));

    if (dataShowActiveBg === bgToDelete) {
      setDataShowActiveBg('default');
      localStorage.setItem('taspe_active_background', 'default');
      broadcastLocalSettings({
        blackout: dataShowBlackout,
        activeBg: 'default',
        fontScale: dataShowFontScale
      });
    }
  };

  const handleSelectBackground = (bg) => {
    setDataShowActiveBg(bg);
    localStorage.setItem('taspe_active_background', bg);
    broadcastLocalSettings({
      blackout: dataShowBlackout,
      activeBg: bg,
      fontScale: dataShowFontScale
    });
  };

  // Presentation Quick Settings Handlers
  const toggleBlackout = () => {
    setDataShowBlackout(prev => {
      const next = !prev;
      broadcastLocalSettings({
        blackout: next,
        activeBg: dataShowActiveBg,
        fontScale: dataShowFontScale
      });
      return next;
    });
  };

  const handleReset = () => {
    setDataShowBlackout(false);
    setDataShowFontScale(1.0);
    setDataShowActiveBg('default');
    localStorage.setItem('taspe_active_background', 'default');
    broadcastLocalSettings({
      blackout: false,
      activeBg: 'default',
      fontScale: 1.0
    });
  };

  const decreaseFontSize = () => {
    setDataShowFontScale(prev => {
      const next = Math.max(0.5, parseFloat((prev - 0.1).toFixed(1)));
      broadcastLocalSettings({
        blackout: dataShowBlackout,
        activeBg: dataShowActiveBg,
        fontScale: next
      });
      return next;
    });
  };

  const increaseFontSize = () => {
    setDataShowFontScale(prev => {
      const next = Math.min(2.0, parseFloat((prev + 0.1).toFixed(1)));
      broadcastLocalSettings({
        blackout: dataShowBlackout,
        activeBg: dataShowActiveBg,
        fontScale: next
      });
      return next;
    });
  };

  // Open the local display window (offline, HDMI screen)
  const openPresentation = (hymn, transposeStep = 0) => {
    setSelectedLyricsHymn({ ...hymn, transposeStep });
    setShowChords(vocalsMode ? false : true);
    setDataShowIndex(0);
    setShowDataShow(true);

    // Open / focus the local display window - Only on desktop/tablet (sm breakpoint)
    if (window.innerWidth >= 640) {
      if (!localDisplayRef.current || localDisplayRef.current.closed) {
        localDisplayRef.current = window.open('/presentation/local', 'taspe_local_display', 'width=1280,height=720');
      } else {
        localDisplayRef.current.focus();
      }
      setTimeout(() => {
        broadcastLocalSettings({
          blackout: dataShowBlackout,
          activeBg: dataShowActiveBg,
          fontScale: dataShowFontScale
        });
      }, 600);
    }
  };


  /** Bible: same slide pipeline as hymn lyrics (one slide per verse). */
  const openBiblePresentation = React.useCallback(
    ({ bookName, chapter, verses, startIndex = 0 }) => {
      if (!bookName || chapter == null || !verses?.length) return;
      const safeIdx = Math.min(Math.max(0, startIndex), verses.length - 1);
      const lyrics = verses.map((v) => ({
        type: 'verse',
        title: `آية ${v.verseNumber}`,
        text: v.text,
      }));
      setSelectedLyricsHymn({
        _id: `bible-${bookName}-${chapter}`,
        title: `${bookName} · ${t('chapter')} ${chapter}`,
        lyrics,
        transposeStep: 0,
        isBible: true,
      });
      setShowChords(false);
      setDataShowIndex(safeIdx);
      setShowDataShow(true);
      setShowBibleModal(false);
      setBiblePickerOpen(null);

      if (typeof window !== 'undefined' && window.innerWidth >= 640) {
        if (!localDisplayRef.current || localDisplayRef.current.closed) {
          localDisplayRef.current = window.open('/presentation/local', 'taspe_local_display', 'width=1280,height=720');
        } else {
          localDisplayRef.current.focus();
        }
      }
    },
    [t]
  );

  const presentBibleFromSearchHit = async (hit) => {
    if (!hit?.bookName || hit.chapter == null || hit.verseNumber == null) return;
    try {
      let list = [];
      const translation = hit.translation || bibleTranslation || 'AVD';
      const isDownloaded = downloadedTranslations.has(translation) || (await isTranslationDownloaded(translation));

      if (isDownloaded) {
        const index = await getLocalBibleIndex(translation);
        if (index) {
          list = index.versesMap.get(`${hit.bookName}_${parseInt(hit.chapter)}`) || [];
        }
      }

      if (!list.length) {
        const { data } = await axios.get(
          `${BIBLE_API}/verses/${encodeURIComponent(hit.bookName)}/${hit.chapter}?&lang=arabic`
        );
        list = Array.isArray(data) ? data : [];
      }

      if (!list.length) return;
      const idx = list.findIndex((v) => v.verseNumber === hit.verseNumber);

      // Keep Book & Chapter picker states in sync
      const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
      if (book) {
        setBibleModalBook(book);
        setBibleModalChapter(hit.chapter);
      }

      openBiblePresentation({
        bookName: hit.bookName,
        chapter: hit.chapter,
        verses: list,
        startIndex: idx >= 0 ? idx : 0,
      });
    } catch (e) {
      console.error('Bible search present:', e);
      // Fallback: if offline, try loading AVD local index
      try {
        const index = await getLocalBibleIndex('AVD');
        if (index) {
          const list = index.versesMap.get(`${hit.bookName}_${parseInt(hit.chapter)}`) || [];
          if (list.length) {
            const idx = list.findIndex((v) => v.verseNumber === hit.verseNumber);
            const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
            if (book) {
              setBibleModalBook(book);
              setBibleModalChapter(hit.chapter);
            }
            openBiblePresentation({
              bookName: hit.bookName,
              chapter: hit.chapter,
              verses: list,
              startIndex: idx >= 0 ? idx : 0,
            });
          }
        }
      } catch (innerErr) {
        console.error('Offline AVD fallback failed:', innerErr);
      }
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

  const closeLyricsModal = () => {
    setShowLyricsModal(false);
    setSelectedLyricsHymn(null);
    // لو قفل المودال قبل الـ 10 ثواني، نكنسل الطلب فوراً
    if (usageTimerRef.current) {
      clearTimeout(usageTimerRef.current);
      usageTimerRef.current = null;
      console.log("تم إلغاء تسجيل الاستخدام لأنك قفلت بدري");
    }
  };



  // Attached via onScroll prop to guarantee firing in Portals

  // Prevent background scrolling when lyrics modal is open
  React.useEffect(() => {
    if (showLyricsModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showLyricsModal]);

  //search State
  const [search, setSearch] = useState(''); // Stores the search query text
  const [debouncedSearch, setDebouncedSearch] = useState(''); // Debounced search text
  const [showSearchBar, setShowSearchBar] = useState(false); // Controls search input visibility

  // Debounce Effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [search]);


  // --- API Functions ---

  // 2. Add Hymn (Post)
  const add_Hymn = async () => {
    if (!isLogin) return;

    // Front-end Validation
    if (!formData.title.trim()) {
      alert(t("enterTitle"));
      return;
    }
    if (!Array.isArray(formData.lyrics) || formData.lyrics.length === 0) {
      alert(t("addSection"));
      return;
    }
    if (formData.lyrics.some(l => !l.text.trim())) {
      alert(t("sectionTextRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const url = "https://worship-team-api.onrender.com/api/hymns/create";

      const response = await axios.post(url, { ...formData, lyrics: prepareLyricsForSave(formData.lyrics) }, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      console.log('[CREATE_HYMN] Response status:', response.status);
      console.log('[CREATE_HYMN] Response data:', response.data);

      // 202 = queued as pending (non-PROGRAMER role)
      if (response.status === 202 && response.data?.pending) {
        console.log('[CREATE_HYMN] Request queued as pending');
        showToast({ message: '⏳ ' + response.data.message, type: 'info', duration: 7000 });
        closeModal();
        setFormData({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', BPM: '', timeSignature: 'None', party: ['all'] });
        return;
      }

      console.log('[CREATE_HYMN] Request approved directly (PROGRAMER role)');
      // Optimistic cache update → PersistQueryClientProvider auto-saves to localforage
      const newHymn = { ...formData, lyrics: prepareLyricsForSave(formData.lyrics), _id: response.data?._id || response.data?.hymn?._id || Date.now().toString(), usageCount: 0 };
      queryClient.setQueryData(['hymns'], (old) => Array.isArray(old) ? [newHymn, ...old] : [newHymn]);
      showToast({ message: '✅ Hymn added successfully!', type: 'success', duration: 4000 });
      closeModal();
      setFormData({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', BPM: '', timeSignature: 'None', party: ['all'] });
    } catch (error) {
      console.error("Error adding hymn:", error);
      if (error.response?.status === 409) {
        showToast({ message: t("duplicateFound").replace("{title}", error.response.data.existingTitle), type: 'error' });
      } else if (error.response?.data?.message) {
        showToast({ message: "Error: " + error.response.data.message, type: 'error' });
      } else {
        showToast({ message: 'Failed to add hymn. Please check all fields.', type: 'error' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Edit Hymn (Patch)
  const edit_Hymn = async (id) => {
    if (!isLogin) return;

    // Front-end Validation
    if (!formData.title.trim()) {
      alert(t("enterTitle"));
      return;
    }
    if (!Array.isArray(formData.lyrics) || formData.lyrics.length === 0) {
      alert(t("addSection"));
      return;
    }
    if (formData.lyrics.some(l => !l.text.trim())) {
      alert(t("sectionTextRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const url = `https://worship-team-api.onrender.com/api/hymns/${id}`;

      const response = await axios.patch(url, { ...formData, lyrics: prepareLyricsForSave(formData.lyrics) }, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      console.log('[EDIT_HYMN] Response status:', response.status);
      console.log('[EDIT_HYMN] Response data:', response.data);

      // 202 = queued as pending (non-PROGRAMER role)
      if (response.status === 202 && response.data?.pending) {
        console.log('[EDIT_HYMN] Request queued as pending');
        showToast({ message: '⏳ ' + response.data.message, type: 'info', duration: 7000 });
        closeModal();
        setFormData({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', party: ['all'], BPM: '', timeSignature: 'None' });
        setEditingHymnId(null);
        return;
      }

      console.log('[EDIT_HYMN] Request approved directly (PROGRAMER role)');
      // Optimistic cache patch → PersistQueryClientProvider auto-saves to localforage
      const updatedHymn = { ...formData, lyrics: prepareLyricsForSave(formData.lyrics), _id: id };
      queryClient.setQueryData(['hymns'], (old) =>
        Array.isArray(old) ? old.map(h => h._id === id ? { ...h, ...updatedHymn } : h) : old
      );
      showToast({ message: '✅ Hymn updated successfully!', type: 'success', duration: 4000 });
      closeModal();
      setFormData({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', party: ['all'], BPM: '', timeSignature: 'None' });
      setEditingHymnId(null);
    } catch (error) {
      console.error("Error editing hymn:", error);
      if (error.response?.data?.message) {
        showToast({ message: 'Error updating hymn: ' + error.response.data.message, type: 'error' });
      } else {
        showToast({ message: 'Failed to update hymn.', type: 'error' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Delete Hymn by ID
  const delete_Hymn = async (id) => {
    if (!isLogin) return;
    if (!confirm(t("confirmDeleteHymn"))) return;

    try {
      const url = `https://worship-team-api.onrender.com/api/hymns/${id}`;

      const response = await axios.delete(url, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      console.log('[DELETE_HYMN] Response status:', response.status);
      console.log('[DELETE_HYMN] Response data:', response.data);

      // 202 = queued as pending (non-PROGRAMER role)
      if (response.status === 202 && response.data?.pending) {
        console.log('[DELETE_HYMN] Request queued as pending');
        showToast({ message: '⏳ ' + response.data.message, type: 'info', duration: 7000 });
        return;
      }

      console.log('[DELETE_HYMN] Request approved directly (PROGRAMER role)');
      // Remove from cache instantly → PersistQueryClientProvider auto-saves to localforage
      queryClient.setQueryData(['hymns'], (old) =>
        Array.isArray(old) ? old.filter(h => h._id !== id) : old
      );
      showToast({ message: '🗑️ Hymn deleted.', type: 'success', duration: 3000 });
    } catch (error) {
      console.error("Error deleting hymn:", error);
      showToast({ message: 'Failed to delete hymn.', type: 'error' });
    }
  };

  // Fetch Hymns:
  // - Web: useInfiniteQuery for server-side pagination on scroll.
  // - App: version-controlled incremental sync using localforage cache.

  // ── APP: offline-first load from localforage (no network on open) ─────
  const { data: allHymns = [], isLoading: isLoadingApp } = useQuery({
    queryKey: ["hymns", "app"],
    enabled: isApp,
    staleTime: Infinity,
    queryFn: async () => {
      const HYMNS_CACHE_KEY = 'taspe7_hymns_json';
      const localforage_ = (await import('localforage')).default;

      const resolveId = (id) => {
        if (!id) return '';
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id.$oid) return id.$oid;
        return String(id);
      };
      const normalizeIds = (hymns) => hymns.map(h => ({
        ...h,
        _id: resolveId(h._id),
        lyrics: Array.isArray(h.lyrics)
          ? h.lyrics.map(l => ({ ...l, _id: resolveId(l._id) }))
          : h.lyrics
      }));

      // 1. Try localforage cache (instant, offline)
      const cached = await localforage_.getItem(HYMNS_CACHE_KEY);
      if (Array.isArray(cached) && cached.length > 0) return normalizeIds(cached);

      // 2. Seed from bundled hymns.json (first install)
      try {
        const res = await fetch('/hymns.json');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            const normalized = normalizeIds(json);
            await localforage_.setItem(HYMNS_CACHE_KEY, normalized);
            return normalized;
          }
        }
      } catch { }
      return [];
    }
  });

  // ── APP: background sync — runs after mount, only when needed ──────────
  // Triggered by: (a) force_sync flag from dashboard, (b) BroadcastChannel signal, (c) no cache yet
  useEffect(() => {
    if (!isApp || typeof window === 'undefined') return;

    const API_BASE = 'https://worship-team-api.onrender.com/api/hymns';
    const HYMNS_VERSION_KEY = 'taspe7_hymns_sync_version';
    const HYMNS_CACHE_KEY = 'taspe7_hymns_json';
    const SYNC_FLAG_KEY = 'taspe7_force_sync';
    const SYNC_CHANNEL = 'taspe7_sync';

    const resolveId = (id) => {
      if (!id) return '';
      if (typeof id === 'string') return id;
      if (typeof id === 'object' && id.$oid) return id.$oid;
      return String(id);
    };
    const normalizeIds = (hymns) => hymns.map(h => ({
      ...h,
      _id: resolveId(h._id),
      lyrics: Array.isArray(h.lyrics)
        ? h.lyrics.map(l => ({ ...l, _id: resolveId(l._id) }))
        : h.lyrics
    }));

    const doSync = async () => {
      try {
        const localforage_ = (await import('localforage')).default;
        const verRes = await axios.get(`${API_BASE}/version`);
        const serverVersion = verRes.data.version;
        const localVersion = parseInt(localStorage.getItem(HYMNS_VERSION_KEY) || '0');

        if (serverVersion <= localVersion) {
          localStorage.removeItem(SYNC_FLAG_KEY);
          return; // already up to date
        }

        const cached = await localforage_.getItem(HYMNS_CACHE_KEY);
        const localData = Array.isArray(cached) && cached.length > 0 ? normalizeIds(cached) : null;

        if (localData) {
          // Incremental sync
          const changesRes = await axios.get(`${API_BASE}/changes?fromVersion=${localVersion}`);
          const { updated = [], deleted = [], fallback, currentVersion: cv } = changesRes.data;

          if (!fallback) {
            let merged = [...localData];
            if (deleted.length > 0) {
              const deletedSet = new Set(deleted.map(String));
              merged = merged.filter(h => !deletedSet.has(resolveId(h._id)));
            }
            if (updated.length > 0) {
              const updatedMap = new Map(updated.map(h => [resolveId(h._id), h]));
              merged = merged.map(h => updatedMap.has(resolveId(h._id)) ? updatedMap.get(resolveId(h._id)) : h);
              const mergedIds = new Set(merged.map(h => resolveId(h._id)));
              for (const h of updated) {
                if (!mergedIds.has(resolveId(h._id))) merged.push(h);
              }
            }
            await localforage_.setItem(HYMNS_CACHE_KEY, merged);
            localStorage.setItem(HYMNS_VERSION_KEY, (cv || serverVersion).toString());
            localStorage.removeItem(SYNC_FLAG_KEY);
            queryClient.setQueryData(['hymns', 'app'], normalizeIds(merged));
            return;
          }
        }

        // Full download
        const response = await axios.get(`${API_BASE}?limit=50000`);
        const data = Array.isArray(response.data) ? response.data : [];
        if (data.length > 0) {
          await localforage_.setItem(HYMNS_CACHE_KEY, data);
          localStorage.setItem(HYMNS_VERSION_KEY, serverVersion.toString());
          localStorage.removeItem(SYNC_FLAG_KEY);
          queryClient.setQueryData(['hymns', 'app'], normalizeIds(data));
        }
      } catch {
        // Offline — silently skip
      }
    };

    // Always check for updates when the app opens
    doSync();
    // Listen for real-time force sync from dashboard (same device, any tab)
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channel.onmessage = (e) => {
      if (e.data?.type === 'force_sync') doSync();
    };
    return () => channel.close();
  }, [isApp, queryClient]);

  // ── WEB: Server-side infinite scrolling ──────────────────────────────
  const {
    data: webData,
    isLoading: isLoadingWeb,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ["hymns", "web", activeTab, debouncedSearch],
    enabled: !isApp,
    queryFn: async ({ pageParam = 0 }) => {
      const API_BASE = 'https://worship-team-api.onrender.com/api/hymns';
      let url = '';
      let qStr = `?limit=20&skip=${pageParam}`;

      if (debouncedSearch && debouncedSearch.trim()) {
        url = `${API_BASE}/search${qStr}&q=${encodeURIComponent(debouncedSearch)}`;
      } else if (activeTab && activeTab !== 'all') {
        const target = String(activeTab).toLowerCase().trim() === 'christmass' ? 'christmas' : String(activeTab).toLowerCase().trim();
        url = `${API_BASE}/${target}${qStr}`;
      } else {
        url = `${API_BASE}${qStr}`;
      }

      const response = await axios.get(url);
      return Array.isArray(response.data) ? response.data : [];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length * 20 : undefined;
    }
  });

  const isLoading = isApp ? isLoadingApp : isLoadingWeb;
  const isRestoring = useIsRestoring();

  const humns = React.useMemo(() => {
    // ── WEB: Server-side pagination and filtering ──────────────────────────
    if (!isApp) {
      return webData ? webData.pages.flat() : [];
    }

    // ── APP: Client-side filtering (offline mode) ──────────────────────────
    let filtered = [...allHymns];

    // 1. Category Tabs Filter
    if (activeTab && activeTab !== 'all') {
      const target = String(activeTab).toLowerCase().trim() === 'christmass' ? 'christmas' : String(activeTab).toLowerCase().trim();
      filtered = filtered.filter(hymn => {
        if (!hymn.party) return false;
        const parties = Array.isArray(hymn.party) ? hymn.party : [hymn.party];
        return parties.some(p => {
          const lower = String(p).toLowerCase().trim();
          const normParty = lower === 'christmass' ? 'christmas' : lower;
          return normParty === target;
        });
      });
    }

    // 2. Search Filter
    if (debouncedSearch && debouncedSearch.trim()) {
      const query = normalizeText(debouncedSearch);
      if (!query) return [];

      filtered = filtered.map(hymn => {
        const normTitle = normalizeText(hymn.title || '');

        let lyricsRaw = '';
        if (typeof hymn.lyrics === 'string') {
          lyricsRaw = hymn.lyrics;
        } else if (Array.isArray(hymn.lyrics)) {
          lyricsRaw = hymn.lyrics.map(l => l.text).join(' ');
        }
        const normLyrics = normalizeText(lyricsRaw);

        let score = 0;
        // Title matching (High priority)
        if (normTitle === query) score += 500; // Perfect match
        else if (normTitle.startsWith(query)) score += 200;
        else if (normTitle.includes(query)) score += 100;

        // Lyrics matching (Lower priority)
        if (normLyrics.includes(query)) score += 40;

        // Add popularity boost if we have any match at all
        if (score > 0) {
          score += Math.log10((hymn.usageCount || 0) + 1) * 20;
        }

        return { ...hymn, _searchScore: score };
      })
        .filter(h => h._searchScore > 0)
        .sort((a, b) => b._searchScore - a._searchScore);
    } else {
      // 3. Default Sorting (Sort categories / general list by usageCount descending)
      filtered.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    }

    // Remove duplicates by _id
    return Array.from(new Map(filtered.map(item => [item._id, item])).values());
  }, [isApp, webData, allHymns, activeTab, debouncedSearch]);


  // Infinite Scroll Trigger is now handled by Virtuoso's endReached prop
  ///////////////////////////////// API proccess end here /////////////////////////////

  // Automatically load selected Bible verses into presentation slides
  useEffect(() => {
    if (showDataShow && desktopSearchType === 'bible' && bibleModalBook?.bookName && bibleModalChapter != null && bibleModalVerses.length > 0) {
      const expectedId = `bible-${bibleModalBook.bookName}-${bibleModalChapter}`;
      if (selectedLyricsHymn?._id !== expectedId) {
        const lyrics = bibleModalVerses.map((v) => ({
          type: 'verse',
          title: `آية ${v.verseNumber}`,
          text: v.text,
        }));
        setSelectedLyricsHymn({
          _id: expectedId,
          title: `${bibleModalBook.bookName} · ${t('chapter')} ${bibleModalChapter}`,
          lyrics,
          transposeStep: 0,
          isBible: true,
        });
        setDataShowIndex(0);
      }
    }
  }, [showDataShow, desktopSearchType, bibleModalBook, bibleModalChapter, bibleModalVerses, selectedLyricsHymn?._id, t]);

  // ── Presentation Hymn Search States & Effect ──────────────────────
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [presetSearchResults, setPresetSearchResults] = useState([]);
  const [isSearchingPreset, setIsSearchingPreset] = useState(false);

  useEffect(() => {
    const query = presetSearchQuery.trim();
    if (!query) {
      setPresetSearchResults(prev => prev.length ? [] : prev);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingPreset(true);
      try {
        if (isApp) {
          // Client-side search for App (offline mode)
          const normalizedQuery = normalizeText(query);
          const results = allHymns.filter(hymn => {
            const normalizedTitle = normalizeText(hymn.title || '');
            let lyricsText = '';
            if (typeof hymn.lyrics === 'string') {
              lyricsText = hymn.lyrics;
            } else if (Array.isArray(hymn.lyrics)) {
              lyricsText = hymn.lyrics.map(l => l.text).join(' ');
            }
            const normalizedLyrics = normalizeText(lyricsText);
            return normalizedTitle.includes(normalizedQuery) || normalizedLyrics.includes(normalizedQuery);
          });
          setPresetSearchResults(results.slice(0, 15));
        } else {
          // API Search for Web
          const API_BASE = 'https://worship-team-api.onrender.com/api/hymns';
          const response = await axios.get(`${API_BASE}/search?limit=15&q=${encodeURIComponent(query)}`);
          setPresetSearchResults(Array.isArray(response.data) ? response.data : []);
        }
      } catch (err) {
        console.error("Presentation search error:", err);
      } finally {
        setIsSearchingPreset(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [presetSearchQuery, isApp, allHymns]);

  // --- Modal Helpers ---//
  const openModal = () => {
    // Pre-fill party based on active tab if specific
    setFormData(prev => ({
      ...prev,
      party: activeTab === 'all' ? ['all'] :
        activeTab === 'christmas' ? ['christmas'] :
          activeTab === 'prayer_times' ? ['prayer_times'] :
            activeTab === 'praise' ? ['praise'] :
              activeTab === 'cross' ? ['cross'] :
                activeTab === 'kids' ? ['kids'] : ['all']
    }));
    setEditingHymnId(null); // Reset editing mode
    setShowModal(true);
  };

  const openEditModal = (hymn) => {
    const rawLyrics = Array.isArray(hymn.lyrics)
      ? hymn.lyrics
      : (hymn.lyrics ? [{ type: 'verse', title: '1', text: hymn.lyrics }] : []);

    const loadedParty = Array.isArray(hymn.party) ? hymn.party : [hymn.party || 'all'];
    const normalizedParty = loadedParty.map(p => {
      const lower = String(p).toLowerCase().trim();
      return lower === 'christmass' ? 'christmas' : lower;
    });

    setFormData({
      title: hymn.title || '',
      lyrics: rawLyrics.map(normalizeStanzaForEdit),
      scale: hymn.scale || '',
      relatedChords: hymn.relatedChords || '',
      link: hymn.link || '',
      party: normalizedParty,
      BPM: hymn.BPM || '',
      timeSignature: hymn.timeSignature || 'None'
    });
    setEditingHymnId(hymn._id); // Set the ID of the hymn being edited
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const categories = [
    { id: 'all', label: t("AllHymns"), icon: Music },
    { id: 'christmas', label: t("Christmas"), icon: Gift },
    { id: 'prayer_times', label: t("PrayerTimes"), icon: Star },
    { id: 'praise', label: t("Praise"), icon: Sparkles },
    { id: 'cross', label: t("Cross"), icon: Cross },
    { id: 'kids', label: t("Kids"), icon: GraduationCap },
  ];

  // Helper to check permission
  const canEdit = UserRole === 'WEBSITE_ADMIN' || UserRole === 'PROGRAMER';

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };



  // ── Helper: extract plain-text lyrics with verse/chorus labels ──
  const getLyricsPlainText = () => {
    if (!selectedLyricsHymn) return '';
    const hymn = selectedLyricsHymn;
    const title = hymn.title || '';
    const lyricsData = hymn.lyrics || hymn.verses;
    if (!lyricsData) return title;
    const stripChords = (text) => text.replace(/\[.*?\]/g, '');
    let lines = [`🎵 ${title}`, ''];
    if (Array.isArray(lyricsData)) {
      const isBible = lyricsData.length > 0 && 'verseNumber' in lyricsData[0];
      if (isBible) {
        lyricsData.forEach((v) => {
          lines.push(`[Verse ${v.verseNumber}]`);
          lines.push(stripChords(v.text || ''));
          lines.push('');
        });
      } else {
        lyricsData.forEach((stanza) => {
          const label = stanza.title
            ? (stanza.type === 'chorus' ? `[Chorus - ${stanza.title}]` : `[Verse ${stanza.title}]`)
            : (stanza.type === 'chorus' ? '[Chorus]' : '[Verse]');
          lines.push(label);
          lines.push(stripChords(stanza.text || ''));
          lines.push('');
        });
      }
    } else if (typeof lyricsData === 'string') {
      lines.push(stripChords(lyricsData));
    }
    return lines.join('\n').trim();
  };

  const handleCopyLyrics = async () => {
    const text = getLyricsPlainText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.select(); document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedLyrics(true);
    setTimeout(() => setCopiedLyrics(false), 2500);
  };

  const handleShareLyrics = async () => {
    const text = getLyricsPlainText();
    const title = selectedLyricsHymn?.title || 'Hymn';
    if (navigator.share) {
      try { await navigator.share({ title, text }); return; } catch { /* cancelled */ }
    }
    await handleCopyLyrics();
  };
  // ─────────────────────────────────────────────────────────────────

  const renderLyricsWithChords = (lyricsData) => {
    if (!lyricsData) return null;
    const currentTheme = lyricsThemes[lyricsTheme];

    const parseSegments = (line) => {
      const parts = line.split(/(\[.*?\])/g);
      const segments = [];
      let i = 0;
      while (i < parts.length) {
        const part = parts[i];
        if (part && part.startsWith('[') && part.endsWith(']')) {
          segments.push({
            chord: part.slice(1, -1),
            text: parts[i + 1] ?? '',
          });
          i += 2;
        } else {
          if (part) segments.push({ chord: null, text: part });
          i++;
        }
      }
      return segments;
    };

    const renderLine = (line, stanzaType, i) => {
      const isChorus = stanzaType === 'chorus';
      const segments = parseSegments(line);
      const anyHasChords = line.includes('[');

      if (line.trim() === '---') return null;
      if (!line.trim()) return <div key={i} className="h-4" />;

      return (
        <div
          key={i}
          className={`flex flex-wrap justify-center items-end w-full leading-relaxed ${showChords && anyHasChords ? 'mt-8 mb-2' : 'my-2'}`}
          dir="rtl"
        >
          {segments.map((seg, j) => {
            const transposedChord = (showChords && seg.chord)
              ? (selectedLyricsHymn?.transposeStep ? transposeChords(seg.chord, selectedLyricsHymn.transposeStep) : seg.chord)
              : null;

            return (
              <span key={j} className={`inline-flex flex-col items-center max-w-full ${showChords ? 'min-w-[0.2em]' : ''}`}>
                {/* Chord row - Absolutely clean, no badges */}
                {showChords && (
                  <span
                    className="block font-bold whitespace-nowrap overflow-visible h-[1.2em] mb-[-0.1em] px-0.5 select-none"
                    dir="ltr"
                    style={{
                      color: currentTheme.chord,
                      fontSize: '0.85em',
                      lineHeight: '1',
                      visibility: seg.chord ? 'visible' : 'hidden'
                    }}
                  >
                    {transposedChord || '\u00A0'}
                  </span>
                )}
                {/* Lyrics row */}
                <span
                  style={{ color: currentTheme.text, fontSize: `${fontSize}px` }}
                  className={`${isChorus ? 'font-black' : 'font-bold'} whitespace-pre-wrap break-words text-center transition-colors duration-300`}
                >
                  {seg.text || '\u00A0'}
                </span>
              </span>
            );
          })}
        </div>
      );
    };

    if (Array.isArray(lyricsData)) {
      return lyricsData.map((stanza, idx) => (
        <div key={idx} className={`mb-12 flex flex-col items-center ${stanza.type === 'chorus' ? 'bg-white/5 py-8 px-6 rounded-3xl mx-[-1rem] sm:mx-0 border border-white/5 shadow-inner' : ''}`}>
          {stanza.title && (
            <div className={`text-[10px] mb-6 font-black tracking-[0.2em] px-4 py-1.5 rounded-full border uppercase ${stanza.type === 'chorus' ? 'text-sky-300 border-sky-400/30 bg-sky-500/10' : 'text-gray-400 border-white/10 bg-white/5'}`}>
              {stanza.title}
            </div>
          )}
          {stanza.text.split('\n').map((line, i) => renderLine(line, stanza.type, i))}
        </div>
      ));
    }

    return <div className="mb-12">{lyricsData.split('\n').map((line, i) => renderLine(line, 'verse', i))}</div>;
  };

  const renderPresentationSlideWithChords = (slideData) => {
    if (!slideData) return null;

    const text = typeof slideData === 'string' ? slideData : slideData.text;
    const title = typeof slideData !== 'string' ? slideData.title : null;
    const type = typeof slideData !== 'string' ? slideData.type : 'verse';
    const isChorus = type === 'chorus';

    const parseSegments = (line) => {
      const parts = line.split(/(\[.*?\])/g);
      const segments = [];
      let i = 0;
      while (i < parts.length) {
        const part = parts[i];
        if (part && part.startsWith('[') && part.endsWith(']')) {
          segments.push({
            chord: part.slice(1, -1),
            text: parts[i + 1] ?? '',
          });
          i += 2;
        } else {
          if (part) segments.push({ chord: null, text: part });
          i++;
        }
      }
      return segments;
    };
    // 1. فانكشن تسجيل الاستخدام
    const recordUsage = async (id) => {
      try {
        // تأكد من تغيير المسار للمسار الحقيقي بتاعك
        await axios.patch(`https://worship-team-api.onrender.com/api/hymns/${id}/use`);
        console.log("Usage recorded!");
      } catch (err) {
        console.error("Error updating usage:", err);
      }
    };

    // 2. تتبع الوقت (الذكاء اللي بيمنع الـ Bounce)
    useEffect(() => {
      let timer;
      if (selectedHymn) {
        // لو المستخدم فضل فاتح الترنيمة 10 ثواني، بنسجل إنه استخدمها فعلاً
        timer = setTimeout(() => {
          recordUsage(selectedHymn._id);
        }, 10000); // 10 ثواني
      }

      // لو قفل الترنيمة أو اختار واحدة تانية قبل الـ 10 ثواني، التايمر بيتمسح ومبيحسبش حاجة
      return () => clearTimeout(timer);
    }, [selectedHymn]); // الـ Effect ده بيشتغل كل ما الـ selectedHymn تتغير


    return (
      <>

        {title && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 text-white/50 text-[11px] sm:text-base font-black tracking-[0.4em] px-6 py-2 rounded-full border border-white/10 bg-white/5 uppercase select-none" dir="rtl">
            {title}
          </div>
        )}
        <div className="w-full h-full flex flex-col items-center justify-center gap-6 sm:gap-10 px-6 sm:px-12">
          {text.split('\n').map((line, i) => {
            if (!line.trim()) return <div key={i} className="h-[1em]" />;

            const segments = parseSegments(line);
            const anyHasChords = line.includes('[');

            return (
              <div
                key={i}
                className={`flex flex-wrap justify-center items-end w-full ${showChords && anyHasChords ? 'mt-[2.2em]' : 'my-[1em]'}`}
                dir="rtl"
              >
                {segments.map((seg, j) => {
                  const transposedChord = (showChords && seg.chord)
                    ? (selectedLyricsHymn?.transposeStep ? transposeChords(seg.chord, selectedLyricsHymn.transposeStep) : seg.chord)
                    : null;

                  return (
                    <span key={j} className={`inline-flex flex-col items-center max-w-full ${showChords ? 'min-w-[0.2em]' : ''}`}>
                      {/* Chord row */}
                      {showChords && (
                        <span
                          className="block font-black whitespace-nowrap overflow-visible leading-none select-none mb-3"
                          dir="ltr"
                          style={{
                            color: '#38BDF8',
                            fontSize: '0.6em',
                            visibility: seg.chord ? 'visible' : 'hidden',
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                          }}
                        >
                          {transposedChord || '\u00A0'}
                        </span>
                      )}
                      {/* Lyrics row */}
                      <span
                        className={`font-bold whitespace-pre-wrap break-words text-center leading-relaxed select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] tracking-tight ${isChorus ? 'text-yellow-300' : 'text-white'}`}
                        style={{ fontSize: 'clamp(28px, 7vw, 90px)' }}
                      >
                        {seg.text || '\u00A0'}
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </>
    );
  };


  if (isJoiningSession) {
    return <Loading />;
  }

  return (<section id="Category_Humns" className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#17275c] text-white px-4 sm:px-6 py-10 relative overflow-hidden">
    {/* Background Gradients */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />

    <div className="relative z-10 max-w-7xl mx-auto">


      {/* Search Section - Centered under Title */}
      <div className="mb-8 flex items-center justify-center gap-3 relative z-20 h-12">
        {/* Search Toggle (Icon Only) */}
        <button
          id="tour-search-btn"
          onClick={() => {
            setShowSearchBar(!showSearchBar);
            if (showSearchBar) {
              setSearch('');
            }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 border backdrop-blur-xl relative overflow-hidden group shadow-lg z-30
           ${showSearchBar
              ? 'bg-red-500/10 border-red-500/20 text-red-400 rotate-90 scale-90'
              : 'bg-white/5 border-white/20 text-sky-200 hover:bg-white/10 hover:text-white hover:border-sky-400/30 hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]'
            }`}
          title={showSearchBar ? "Close Search" : "Search Hymns"}
        >
          {showSearchBar ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>

        {/* Simple, dependency-free fade animation (no framer-motion, no lag) */}
        {showSearchBar && (
          <div className="relative h-10 w-[250px] flex items-center flex-shrink-0 search-fade-in">
            <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-full backdrop-blur-md shadow-inner" />

            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full h-full pl-4 pr-8 py-2 bg-transparent text-sm text-white placeholder-gray-400/70 
                 outline-none relative z-10 font-light tracking-wide"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/20 text-gray-400 hover:text-white transition-all z-20"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

      </div>
      {/* Categories Tabs */}
      {
        showSearchBar ?
          (null) :
          <div id="tour-categories" className="flex flex-wrap justify-center gap-4 mb-8">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 border backdrop-blur-md relative overflow-hidden group
                  ${isActive
                      ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 shadow-[0_0_20px_rgba(56,189,248,0.3)]'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-sky-400/10 blur-xl rounded-full" />
                  )}
                  <Icon className={`w-5 h-5 relative z-10 ${isActive ? 'text-sky-300' : ''}`} />
                  <span className="font-medium relative z-10">{cat.label}</span>
                </button>
              )
            })}
          </div>

      }





      {/* Admin Controls */}
      <div className="flex flex-wrap justify-end items-center gap-3 mb-6">
        {/* --- ADD THIS BIBLE BUTTON --- */}
        <button
          id="tour-bible-btn"
          onClick={() => setShowBibleModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-full hover:bg-sky-500/20 transition-all shadow-[0_0_15px_rgba(56,189,248,0.1)] active:scale-95 font-semibold text-sm"
        >
          <BookOpen className="w-5 h-5" />
          <span>{t('bible')}</span>
        </button>
        {/* ----------------------------- */}

        {canEdit && (
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full hover:bg-gray-100 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_rgba(255,255,255,0.5)] active:scale-95 font-semibold text-sm"
          >
            <PlusCircle className="w-5 h-5" />
            <span>{t("newHymn")}</span>
          </button>
        )}

        {/* Live Session Panel */}
        <div id="tour-live-session" className="relative animate-live-session-parent-full">
          <div className={`relative p-[1px] rounded-full overflow-hidden transition-all duration-300 animate-live-session-intro
            ${isConnected
              ? 'shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)]'
              : 'shadow-[0_0_15px_rgba(255,255,255,0.02)]'}`}
          >
            {/* Animated looping gradient background */}
            <div className={`absolute -inset-[100%] pointer-events-none z-0 ${isConnected ? 'animate-border-spin-fast' : 'animate-border-spin-slow'}`}
              style={{
                background: isConnected
                  ? 'conic-gradient(from 0deg, transparent 0deg, transparent 120deg, #10b981 180deg, #34d399 240deg, #3b82f6 300deg, transparent 360deg)'
                  : 'conic-gradient(from 0deg, transparent 0deg, transparent 180deg, rgba(255,255,255,0.15) 270deg, transparent 360deg)'
              }}
            />
            {/* Mask button overlay */}
            <button
              onClick={() => setShowSessionPanel(p => !p)}
              className={`relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-full transition-all font-semibold text-sm w-full h-full justify-center
                    ${isConnected
                  ? 'bg-[#0c142c] text-green-400 hover:bg-[#121d3f]'
                  : 'bg-[#0a1020] text-gray-400 hover:bg-[#0f172f] hover:text-white'
                }`}
            >
              <Radio className={`w-4 h-4 ${isConnected ? 'animate-pulse text-green-400' : ''}`} />
              {isConnected ? (
                <><span className="text-[10px] text-green-400 font-black uppercase tracking-widest">● LIVE</span> · {dataShowId}</>
              ) : t('livesession')}
            </button>
          </div>

          {showSessionPanel && (
            <div className="absolute right-0 mt-2 z-50 p-4 bg-[#0c1627] border border-white/10 rounded-2xl shadow-2xl w-[90vw] sm:w-[400px]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Presentation Room</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={dataShowIdInput}
                  onChange={e => setDataShowIdInput(e.target.value)}
                  placeholder='e.g. "sunday-01"'
                  className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-gray-600 w-full"
                  onKeyDown={e => { if (e.key === 'Enter') handleJoinSession(); }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateSession}
                    disabled={isCreatingSession}
                    className="flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                  >
                    {isCreatingSession ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : 'Create'}
                  </button>
                  <button
                    onClick={handleJoinSession}
                    disabled={isJoiningSession}
                    className="flex-1 sm:flex-none px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                  >
                    Join
                  </button>
                </div>
              </div>
              {dataShowId && (
                <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
                  <a
                    href={`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`}
                    onClick={(e) => {
                      if (typeof window !== 'undefined' && window.Capacitor?.isNative) {
                        e.preventDefault();
                        setIsJoiningSession(true);
                        router.push(`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`);
                      }
                    }}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/20 transition-all flex-1"
                  >
                    <Tv2 size={13} /> Open Display Window
                  </a>
                  <a
                    href={`/presentation/remote?dataShowId=${encodeURIComponent(dataShowId)}`}
                    onClick={(e) => {
                      if (typeof window !== 'undefined' && window.Capacitor?.isNative) {
                        e.preventDefault();
                        setIsJoiningSession(true);
                        router.push(`/presentation/remote?dataShowId=${encodeURIComponent(dataShowId)}`);
                      }
                    }}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/20 transition-all flex-1"
                  >
                    <ExternalLink size={13} /> Mobile Remote
                  </a>

                  {/* Microphone Toggle Button */}
                  <button
                    onClick={toggleAudio}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all flex-1 ${isAudioActive
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                      }`}
                  >
                    {isAudioActive ? <Mic size={13} className="text-sky-400 animate-pulse" /> : <MicOff size={13} />}
                    {isAudioActive ? 'Mic On' : 'Turn On Mic'}
                  </button>

                  {/* End Session Button */}
                  <button
                    onClick={() => {
                      if (isAudioActive) toggleAudio();
                      clearDisplay();
                      setDataShowId('');
                      localStorage.removeItem('myLivePresentationId');
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all w-full sm:w-auto"
                  >
                    <X size={13} /> End Session
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Content Table/List */}
      {(isLoading && !isRestoring) ? (
        <Loading />
      ) : (
        <div className="relative">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest bg-white/5 rounded-t-2xl border-b border-white/10 mx-2">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-5">{t("songTitle")}</div>

            {/* الخلية بتفضل واخدة 2 columns بس الكلام جواه مختفي invisible */}
            <div className={`col-span-2 text-center bg-white/5 rounded-lg py-1 ${vocalsMode ? "invisible" : ""}`}>
              {t("keyChords")}
            </div>

            <div className="col-span-1 text-center">{t("action")}</div>
            <div className="col-span-3 text-center">{t("media")}</div>
          </div>
          {/* List Body with react-virtuoso */}
          {humns.length > 0 ? (
            <div className="pb-20 mt-2">
              <Virtuoso
                useWindowScroll
                data={humns}
                endReached={() => {
                  if (hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                  }
                }}
                itemContent={(index, humn) => (
                  <div className="pb-3">
                    <HymnItem
                      humn={humn}
                      index={index}
                      categories={categories}
                      addToWorkspace={addToWorkspace}
                      isHymnInWorkspace={isHymnInWorkspace}
                      canEdit={canEdit}
                      delete_Hymn={delete_Hymn}
                      openEditModal={openEditModal}
                      variants={itemVariants}
                      openLyrics={openLyrics}
                      openPresentation={openPresentation}
                      t={t}
                      vocalsMode={vocalsMode}
                      UserRole={UserRole}
                      setNoteModalConfig={setNoteModalConfig}
                    />
                  </div>
                )}
                components={{
                  Footer: () => (
                    <div className="py-8 flex justify-center w-full flex-col items-center">
                      {isFetchingNextPage && (
                        <div className="w-8 h-8 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mb-4" />
                      )}
                      {!hasNextPage && humns.length > 0 && (
                        <p className="text-center text-gray-500 py-2 font-light italic w-full">
                          — {t("endOfList")} —
                        </p>
                      )}
                    </div>
                  )
                }}
              />
            </div>
          ) : (
            !(isLoading || isRestoring) && (
              <div className="p-20 text-center flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed mt-2 mb-20">
                <Music className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">{t("NoHymnsfoundinthiscategory")}</p>
              </div>
            )
          )}

          {/* This is the Add/Edit Hymn form */}
          {showModal && (
            <Portal>
              <div
                className="fixed inset-0 z-9999 flex justify-center items-center p-4 backdrop-blur-md bg-black/70"
              >
                <div
                  className="w-full max-w-md max-h-[90vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative"
                  data-lenis-prevent-wheel
                >
                  {/* Header */}
                  <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h2 className="text-2xl font-bold bg-linear-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                      {editingHymnId ? `✏️ ${t("editHymn")}` : `🎵 ${t("addNewHymn")}`}
                    </h2>
                    <button onClick={closeModal} className="text-gray-400 hover:text-white transition">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Form */}
                  <div className="p-6 flex flex-col gap-4">
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">{t("songTitle")}</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                        placeholder="e.g. Amazing Grace"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      />
                    </div>

                    {/* Lyrics Structure Builder */}
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/10">
                        <label className="text-gray-200 text-sm font-semibold">{t("lyrics")}</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newArray = Array.isArray(formData.lyrics) ? [...formData.lyrics] : [];
                              newArray.push({ type: 'verse', title: String(newArray.filter(l => l.type === 'verse').length + 1), text: '', slideMode: 'manual', slideBreaks: [] });
                              setFormData({ ...formData, lyrics: newArray });
                            }}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 shadow-sm"
                          >
                            <PlusCircle className="w-4 h-4" /> العدد
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newArray = Array.isArray(formData.lyrics) ? [...formData.lyrics] : [];
                              newArray.push({ type: 'chorus', title: 'القرار', text: '', slideMode: 'manual', slideBreaks: [] });
                              setFormData({ ...formData, lyrics: newArray });
                            }}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 hover:bg-sky-500/30 text-sky-200 transition-colors flex items-center gap-1.5 shadow-sm shadow-sky-500/10"
                          >
                            <PlusCircle className="w-4 h-4" /> القرار
                          </button>
                        </div>
                      </div>

                      {Array.isArray(formData.lyrics) && formData.lyrics.map((stanza, idx) => (
                        <div key={idx} className={`p-4 rounded-xl border relative flex flex-col gap-3 transition-colors ${stanza.type === 'chorus' ? 'bg-sky-500/10 border-sky-500/30 shadow-[inset_0_0_20px_rgba(56,189,248,0.05)]' : 'bg-[#151525] border-white/10'}`}>

                          <div className="flex justify-between items-center gap-2 pb-2 border-b border-white/5">
                            <input
                              type="text"
                              value={stanza.title}
                              onChange={(e) => {
                                const newArray = [...formData.lyrics];
                                newArray[idx].title = e.target.value;
                                setFormData({ ...formData, lyrics: newArray });
                              }}
                              className={`text-sm font-bold bg-transparent border-none outline-none w-32 px-1 focus:ring-0 ${stanza.type === 'chorus' ? 'text-white placeholder-white/50' : 'text-gray-300 placeholder-gray-500'}`}
                              placeholder={stanza.type === 'chorus' ? "القرار" : "1"}
                              dir="rtl"
                            />

                            <div className="flex items-center gap-3 flex-wrap flex-row-reverse">
                              {/* Chord Toolbar for this specific text area */}
                              {formData.relatedChords && (
                                <div className="flex gap-1.5 flex-wrap justify-end pl-3 border-l border-white/10">
                                  {formData.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, cIdx) => (
                                    <button
                                      key={cIdx}
                                      onClick={() => {
                                        const textareaId = `lyrics-textarea-${idx}`;
                                        const input = document.getElementById(textareaId);
                                        if (input) {
                                          const start = input.selectionStart;
                                          const end = input.selectionEnd;
                                          const text = input.value;
                                          const newText = text.substring(0, start) + `[${chord}]` + text.substring(end);
                                          const newArray = [...formData.lyrics];
                                          newArray[idx].text = newText;
                                          setFormData({ ...formData, lyrics: newArray });
                                          setTimeout(() => {
                                            input.selectionStart = input.selectionEnd = start + chord.length + 2;
                                            input.focus();
                                          }, 0);
                                        }
                                      }}
                                      className="text-[10px] font-black px-2.5 py-1 rounded-md cursor-pointer select-none bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 hover:text-white transition-all shadow-sm active:scale-95"
                                      type="button"
                                    >
                                      {chord}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (!confirm('هل تريد مسح هذا المقطع؟')) return;
                                  const newArray = formData.lyrics.filter((_, i) => i !== idx);
                                  setFormData({ ...formData, lyrics: newArray });
                                }}
                                className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-full hover:bg-red-500/10"
                                title="Remove section"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <textarea
                            id={`lyrics-textarea-${idx}`}
                            dir="rtl"
                            className="w-full p-3 rounded-lg bg-black/40 border border-black/50 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition min-h-[100px] resize-y whitespace-pre-wrap text-sm leading-relaxed custom-scrollbar shadow-inner"
                            placeholder="كلمات المقطع هنا (سطر واحد لكل بيت — بدون فراغات بين الشرائح)..."
                            value={stanza.text}
                            onChange={(e) => {
                              const newArray = [...formData.lyrics];
                              const text = e.target.value;
                              const lineCount = text.split('\n').filter((l) => l.trim()).length;
                              newArray[idx] = {
                                ...newArray[idx],
                                text,
                                slideBreaks: sanitizeSlideBreaks(newArray[idx].slideBreaks, lineCount),
                              };
                              setFormData({ ...formData, lyrics: newArray });
                            }}
                          />

                          <StanzaSlideControls
                            stanza={stanza}
                            stanzaIndex={idx}
                            onChange={(stanzaIdx, updatedStanza) => {
                              const newArray = [...formData.lyrics];
                              newArray[stanzaIdx] = updatedStanza;
                              setFormData({ ...formData, lyrics: newArray });
                            }}
                          />
                        </div>
                      ))}

                      {(!formData.lyrics || formData.lyrics.length === 0) && (
                        <div className="text-center p-8 border border-dashed border-white/10 rounded-xl bg-white/5">
                          <Music className="w-8 h-8 text-gray-500 mx-auto mb-3 opacity-50" />
                          <p className="text-gray-400 text-sm font-medium">اضغط على <span className="text-sky-400">القرار</span> أو <span className="text-white">العدد</span> للبدء في كتابة الترتيلة</p>
                        </div>
                      )}
                    </div>


                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">{t("scale")}</label>
                        <input
                          type="text"
                          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition"
                          placeholder="e.g. C Major"
                          value={formData.scale}
                          onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">{t("category")}</label>
                        <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                          {categories.map((cat) => {
                            const isSelected = formData.party.includes(cat.id);
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  let newParty;
                                  if (isSelected) {
                                    newParty = formData.party.filter(p => p !== cat.id);
                                    if (newParty.length === 0) newParty = ['all'];
                                  } else {
                                    // If selecting something other than 'all', remove 'all' if it's there
                                    if (cat.id !== 'all') {
                                      newParty = [...formData.party.filter(p => p !== 'all'), cat.id];
                                    } else {
                                      // If selecting 'all', remove everything else
                                      newParty = ['all'];
                                    }
                                  }
                                  setFormData({ ...formData, party: newParty });
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5
                                  ${isSelected
                                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                                  }`}
                              >
                                <cat.icon className="w-3 h-3" />
                                {cat.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">{t("bpm")}</label>
                        <input
                          type="text"
                          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition"
                          placeholder="e.g. 120"
                          value={formData.BPM}
                          onChange={(e) => setFormData({ ...formData, BPM: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">{t("timeSignature")}</label>
                        <select
                          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition [&>option]:bg-gray-900"
                          value={formData.timeSignature}
                          onChange={(e) => setFormData({ ...formData, timeSignature: e.target.value })}
                        >
                          <option value="None">None</option>
                          <option value="2/2">2/2</option>
                          <option value="1/4">1/4</option>
                          <option value="2/4">2/4</option>
                          <option value="3/4">3/4</option>
                          <option value="4/4">4/4</option>
                          <option value="5/4">5/4</option>
                          <option value="6/8">6/8</option>
                          <option value="7/8">7/8</option>
                          <option value="8/8">8/8</option>
                          <option value="9/8">9/8</option>
                          <option value="10/8">10/8</option>
                        </select>
                      </div>
                    </div>



                    <div>
                      <label className="block text-gray-400 text-sm mb-2">{t("relatedChords")}</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition placeholder-gray-600 mb-2"
                        placeholder="e.g. G, C, D, Em"
                        value={formData.relatedChords}
                        onChange={(e) => setFormData({ ...formData, relatedChords: e.target.value })}
                      />
                      {formData.relatedChords && (
                        <div className="flex flex-wrap gap-1.5 px-1">
                          {formData.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
                            <span key={i} className="text-[10px] font-bold text-green-300 bg-green-500/10 px-2 py-0.5 rounded-lg border border-green-500/20">
                              {chord}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-gray-400 text-sm mb-2">{t("youtubeLink")}</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                        placeholder="https://youtube.com/..."
                        value={formData.link}
                        onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                      />
                    </div>

                    <button
                      onClick={() => editingHymnId ? edit_Hymn(editingHymnId) : add_Hymn()}
                      disabled={isSubmitting || !formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim())}
                      className={`mt-4 w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all
                      ${(isSubmitting || !formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim()))
                          ? 'bg-gray-600 cursor-not-allowed'
                          : editingHymnId
                            ? 'bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 hover:shadow-blue-500/25'
                            : 'bg-linear-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
                    >
                      {isSubmitting ? (editingHymnId ? t("updating") : t("adding")) : (editingHymnId ? t("updateSong") : t("addSong"))}
                    </button>
                  </div>

                </div>
              </div>
            </Portal>
          )}

          {/* This is the Lyrics display */}
          {showLyricsModal && selectedLyricsHymn && (
            <Portal>
              <div
                className="fixed inset-0 z-9999 flex justify-center items-end sm:items-center bg-black/70"
              >
                <div
                  style={{
                    backgroundColor: lyricsThemes[lyricsTheme].bg,
                    boxShadow: lyricsTheme === 'warm' ? '0 10px 40px rgba(139, 94, 60, 0.15)' : '0 10px 40px rgba(0, 0, 0, 0.5)',
                    willChange: 'transform, opacity'
                  }}
                  className={`w-full sm:max-w-3xl h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-[2.5rem] flex flex-col relative overflow-hidden`}
                >
                  {(() => {
                    const hasChords = selectedLyricsHymn?.lyrics ? (
                      typeof selectedLyricsHymn.lyrics === 'string'
                        ? selectedLyricsHymn.lyrics.includes('[')
                        : (Array.isArray(selectedLyricsHymn.lyrics) && selectedLyricsHymn.lyrics.some(s => s.text.includes('[')))
                    ) : false;

                    return (
                      <div
                        ref={lyricsScrollRef}
                        className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                        data-lenis-prevent-wheel
                      >
                        {/* Sticky Header - Title, Presentation & Close Buttons (Always visible) */}
                        <div
                          className={`sticky top-0 z-50 pt-2 pb-4 flex flex-col shrink-0 transition-colors duration-500`}
                          style={{
                            backgroundColor: lyricsThemes[lyricsTheme].bg,
                            borderBottom: `1px solid ${lyricsTheme === 'warm' ? 'rgba(120,50,0,0.05)' : 'rgba(255,255,255,0.05)'}`
                          }}
                        >
                          {/* Decorative Pull Bar for Mobile */}
                          <div className="sm:hidden w-12 bg-gray-400/20 rounded-full mx-auto shrink-0 h-1.5 mb-4" />

                          <div className="px-6 flex justify-between items-center gap-4">
                            <div className="flex flex-col min-w-0">
                              <h2 className={`text-2xl sm:text-3xl font-bold truncate tracking-tight transition-colors duration-300 ${lyricsTheme === 'warm' ? 'text-[#1A1A1A]' : 'text-white'}`}>
                                {selectedLyricsHymn.title}
                              </h2>
                              <div className={`text-xs uppercase tracking-[0.2em] font-bold opacity-50 ${lyricsTheme === 'warm' ? 'text-gray-500' : 'text-sky-400'}`}>
                                Lyrics {hasChords ? "& Chords" : ""}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  openPresentation(selectedLyricsHymn, selectedLyricsHymn?.transposeStep || 0);
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
                                                                      ${lyricsTheme === 'warm'
                                    ? 'bg-black/5 text-black hover:bg-black/10'
                                    : 'bg-white/5 text-white hover:bg-white/10'}`}
                              >
                                <Monitor className="w-4 h-4" />
                                <span className="hidden sm:inline">Presentation</span>
                              </button>

                              <button
                                onClick={closeLyricsModal}
                                className={`p-2 rounded-full transition-all ${lyricsTheme === 'warm' ? 'hover:bg-black/5 text-black/40 hover:text-black' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}
                              >
                                <X className="w-6 h-6" />
                              </button>
                            </div>
                          </div>

                          {/* Smooth transparent gradient shadow covering text rolling under */}
                          <div className="absolute top-full left-0 right-0 h-6 pointer-events-none"
                            style={{
                              background: lyricsTheme === 'warm'
                                ? 'linear-gradient(to bottom, #FDFBF7, transparent)'
                                : lyricsTheme === 'dark'
                                  ? 'linear-gradient(to bottom, #0F172A, transparent)'
                                  : 'linear-gradient(to bottom, #0E2238, transparent)'
                            }}
                          />
                        </div>

                        {/* Naturally Scrolling Toolbar - Elegantly slides under Sticky Header when scrolled */}
                        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                          <div className="flex items-center gap-2">
                            {/* Chords Toggle */}
                            <button
                              onClick={() => setShowChords(!showChords)}
                              disabled={vocalsMode || !hasChords}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${vocalsMode ? 'hidden' : ''}
                                                    ${!hasChords
                                  ? (lyricsTheme === 'warm' ? 'bg-black/5 text-black/20 border-black/10 cursor-not-allowed' : 'bg-white/5 text-white/10 border-white/5 cursor-not-allowed')
                                  : (showChords
                                    ? (lyricsTheme === 'warm' ? 'bg-black text-white border-black' : 'bg-sky-500 text-white border-sky-500')
                                    : (lyricsTheme === 'warm' ? 'bg-transparent text-black/50 border-black/20' : 'bg-transparent text-white/30 border-white/10'))
                                }`}
                            >
                              {!hasChords ? <Mic className="w-3.5 h-3.5 opacity-40" /> : (showChords ? <Guitar className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />)}
                              {!hasChords ? "Chords coming soon" : (showChords ? "Chords On" : "Chords Off")}
                            </button>

                            {/* Font Controls */}
                            <div className={`flex items-center rounded-xl border transition-colors duration-300 ${lyricsTheme === 'warm' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                              <button
                                onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                                disabled={fontSize <= 14}
                                className={`p-2 transition-all disabled:opacity-20 ${lyricsTheme === 'warm' ? 'hover:text-black' : 'hover:text-white text-white/60'}`}
                              >
                                <span className="text-xs font-black">A-</span>
                              </button>
                              <div className={`w-px h-4 ${lyricsTheme === 'warm' ? 'bg-black/10' : 'bg-white/10'}`} />
                              <button
                                onClick={() => setFontSize(prev => Math.min(48, prev + 2))}
                                disabled={fontSize >= 48}
                                className={`p-2 transition-all disabled:opacity-20 ${lyricsTheme === 'warm' ? 'hover:text-black' : 'hover:text-white text-white/60'}`}
                              >
                                <span className="text-sm font-black">A+</span>
                              </button>
                            </div>
                          </div>


                          {/* Right side: Theme Selector + Share/Copy buttons */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Theme Selector */}
                            <div className={`flex p-1 rounded-xl border transition-colors duration-300 ${lyricsTheme === 'warm' ? 'bg-amber-900/5 border-amber-900/10' : 'bg-white/5 border-white/10'}`}>
                              {Object.entries(lyricsThemes).map(([key, theme]) => (
                                <button
                                  key={key}
                                  onClick={() => setLyricsTheme(key)}
                                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 relative overflow-hidden
                                  ${lyricsTheme === key
                                      ? 'shadow-lg scale-100 z-10'
                                      : 'opacity-40 hover:opacity-100 scale-95'}`}
                                  style={{
                                    backgroundColor: lyricsTheme === key ? theme.bg : 'transparent',
                                    color: lyricsTheme === key ? theme.text : (lyricsTheme === 'warm' ? '#2D2926' : '#fff'),
                                    border: lyricsTheme === key ? `1px solid ${theme.border || 'transparent'}` : 'none'
                                  }}
                                >
                                  {theme.label}
                                  {lyricsTheme === key && (
                                    <div className="absolute inset-0 rounded-lg border-2 border-sky-400/20" />
                                  )}
                                </button>
                              ))}
                            </div>

                            {/* ── Copy Button ── */}
                            <button
                              onClick={handleCopyLyrics}
                              title="Copy lyrics"
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border
                                ${copiedLyrics
                                  ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/30'
                                  : (lyricsTheme === 'warm'
                                    ? 'bg-black/5 text-black/60 border-black/10 hover:bg-black/10 hover:text-black'
                                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white')}`}
                            >
                              {copiedLyrics ? (
                                <><ClipboardCheck className="w-3.5 h-3.5" /><span className="hidden sm:inline">Copied!</span></>
                              ) : (
                                <><Copy className="w-3.5 h-3.5" /><span className="hidden sm:inline">Copy</span></>
                              )}
                            </button>

                            {/* ── Share Button ── */}
                            <button
                              onClick={handleShareLyrics}
                              title="Share lyrics"
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border
                                ${lyricsTheme === 'warm'
                                  ? 'bg-black/5 text-black/60 border-black/10 hover:bg-sky-500 hover:text-white hover:border-sky-400'
                                  : 'bg-white/5 text-white/60 border-white/10 hover:bg-sky-500 hover:text-white hover:border-sky-400'}`}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Share</span>
                            </button>
                          </div>
                        </div>

                        <div className="px-6 sm:px-10 py-10">
                          <div
                            className="w-full max-w-2xl mx-auto transition-all duration-500"
                            dir="rtl"
                          >
                            {renderLyricsWithChords(selectedLyricsHymn.lyrics)}
                          </div>
                          {/* Extra spacing at bottom for better scrolling feel */}
                          <div className="h-20" />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Aesthetic Footer Gradient */}
                  <div className={`absolute bottom-0 left-0 right-0 h-12 pointer-events-none transition-colors duration-500
                    ${lyricsTheme === 'warm'
                      ? 'bg-linear-to-t from-[#FDFBF7] to-transparent'
                      : lyricsTheme === 'dark'
                        ? 'bg-linear-to-t from-[#0F172A] to-transparent'
                        : 'bg-linear-to-t from-[#0E2238] to-transparent'
                    }`}
                  />
                </div>
              </div>
            </Portal>
          )}

          {/* This is the Bible search and reader */}
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
                  <div className="shrink-0 px-3 py-2 flex items-center justify-between border-b border-white/[0.1] bg-black/30 gap-2 sm:gap-3 rounded-t-xl flex-wrap sm:flex-nowrap">

                    {/* Left / Brand Section */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/60 hidden xs:inline">
                        Digital Scripture
                      </span>
                    </div>

                    {/* Middle Controls (Translations + Offline Toggle) */}
                    <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                      {/* Translation Selector */}
                      <div className="flex items-center gap-1.5 bg-white/10 rounded-xl p-1 border border-white/20 shrink-0">
                        {availableTranslations.map((tr) => {
                          const isActive = bibleTranslation === tr;
                          return (
                            <button
                              key={tr}
                              onClick={() => setBibleTranslation(tr)}
                              className={`px-3 py-1 text-[12px] font-bold tracking-wider rounded-lg transition-all duration-300 ${isActive
                                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                                : 'text-white/90 hover:text-white bg-white/5 hover:bg-white/20'
                                }`}
                            >
                              {tr}
                            </button>
                          );
                        })}
                      </div>

                      {/* Offline Download Option */}
                      {bibleTranslation !== 'AVD' && (
                        <div className="flex items-center gap-1.5 shrink-0" dir="rtl">
                          <div>
                            {isDownloadingTranslation === bibleTranslation ? (
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400 bg-sky-500/20 border border-sky-500/30 px-2 py-1 rounded-xl animate-pulse whitespace-nowrap">
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                <span>تحميل...</span>
                              </div>
                            ) : downloadedTranslations.has(bibleTranslation) ? (
                              <button
                                onClick={() => toggleDownloadTranslation(bibleTranslation)}
                                className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 hover:bg-red-500/25 hover:text-red-300 hover:border-red-500/30 px-2 py-1 rounded-xl transition-all duration-300 whitespace-nowrap"
                                title="حذف الترجمة من الجهاز"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                <span>محفوظة</span>
                                <X className="w-2.5 h-2.5 shrink-0 opacity-60" />
                              </button>
                            ) : (
                              <button
                                onClick={() => toggleDownloadTranslation(bibleTranslation)}
                                className="flex items-center gap-1 text-[10px] font-bold text-sky-300 bg-sky-500/20 border border-sky-500/30 hover:bg-sky-500/35 hover:text-white px-2 py-1 rounded-xl transition-all duration-300 whitespace-nowrap"
                                title="تنزيل للتشغيل بدون إنترنت"
                              >
                                📥 <span className="hidden sm:inline">تنزيل أوفلاين</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Close Button - Guaranteed to Stay Visible */}
                    <button
                      onClick={closeBibleModal}
                      className="group p-1.5 sm:p-2 bg-white/5 hover:bg-red-500/20 rounded-full transition-all duration-300 shrink-0 ml-auto sm:ml-0"
                      title="إغلاق"
                    >
                      <X className="w-4 h-4 text-white/60 group-hover:text-red-400" />
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
                                  <button
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
                                  </button>
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
                              onClick={() => openBiblePresentation({ bookName: bibleModalBook.bookName, chapter: bibleModalChapter, verses: bibleModalVerses, startIndex: 0 })}
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
                          <div
                            className="shrink-0 rounded-2xl overflow-hidden border border-violet-500/20 bg-[#0c0f1e]/80 backdrop-blur-md shadow-[0_4px_24px_rgba(139,92,246,0.12)]"
                            style={{ transition: 'background-color 0.3s ease-in-out', padding: '1rem' }}
                          >
                            {/* Panel header */}
                            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-gradient-to-r from-violet-600/10 to-indigo-600/5">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                <span
                                  className="text-[11px] font-black text-violet-300 tracking-wider uppercase"
                                  style={{ transition: 'color 0.3s ease-in-out' }}
                                >
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
                            <div
                              className="px-4 py-3 max-h-52 overflow-y-auto custom-scrollbar-thin"
                              dir="rtl"
                              style={{ transition: 'max-height 0.3s ease-in-out' }}
                            >
                              {aiAnalysis.loading ? (
                                <div
                                  className="flex flex-col items-center justify-center gap-3 py-6"
                                  style={{
                                    animation: 'pulse 1s ease-in-out infinite',
                                    backgroundColor: '#0c0f1e'
                                  }}
                                >
                                  <div className="relative w-8 h-8" style={{ animation: 'spin 2s linear infinite' }}>
                                    <div
                                      className="absolute inset-0 rounded-full border-2 border-violet-500/30 border-t-violet-400"
                                      style={{ animation: 'pulse 1s ease-in-out infinite', backgroundColor: '#0c0f1e' }}
                                    >
                                      <Sparkles className="absolute inset-0 m-auto w-3.5 h-3.5 text-violet-400 animate-pulse" />
                                    </div>
                                  </div>
                                  <span
                                    className="text-[11px] text-violet-300/60 font-bold"
                                    style={{ color: '#7b8392' }}
                                  >
                                    جاري التحليل الذكي...
                                  </span>
                                </div>
                              ) : aiAnalysis.error ? (
                                <>
                                  <p className="text-xs text-red-400 text-center py-3" style={{ color: '#f15c6d' }}>
                                    {aiAnalysis.error}
                                  </p>
                                  {aiAnalysis.isLimit && !isLogin && (
                                    <div className="mt-3 flex justify-center">
                                      <button
                                        onClick={() => router.push('/login')}
                                        className="inline-flex items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-xs font-black text-white transition hover:bg-sky-400"
                                      >
                                        تسجيل الدخول
                                      </button>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p
                                  className="text-[13px] leading-loose text-slate-200/90 font-arabic whitespace-pre-line"
                                  style={{ color: '#c5d8e4' }}
                                >
                                  {aiAnalysis.text}
                                </p>
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

                          {/* Custom Pure-In-App Spectrum Picker (Horizontal Layout) */}
                          {showColorCustomizer && (
                            <div className="flex flex-col sm:flex-row gap-5 bg-[#141824]/95 backdrop-blur-xl text-white rounded-[24px] p-5 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-200 shadow-[0_15px_50px_rgba(0,0,0,0.6)] border border-white/10 w-full max-w-[540px] z-50 select-none origin-top-right">

                              {/* Left Side (Spectrum Box) */}
                              <div className="flex flex-col gap-2 shrink-0">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-xs font-bold text-white/70">طيف الألوان</span>
                                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                                </div>
                                <div
                                  className="relative w-full sm:w-[260px] h-32 sm:h-[160px] rounded-2xl overflow-hidden cursor-crosshair shadow-inner border border-white/15 touch-none"
                                  onPointerDown={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const updateColor = (pEvent) => {
                                      const x = Math.max(0, Math.min(1, (pEvent.clientX - rect.left) / rect.width));
                                      const y = Math.max(0, Math.min(1, (pEvent.clientY - rect.top) / rect.height));

                                      const hue = x * 360;
                                      const sat = 1;
                                      const val = 1 - y;

                                      const f = (n, k = (n + hue / 60) % 6) => val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
                                      const r = Math.round(f(5) * 255);
                                      const g = Math.round(f(3) * 255);
                                      const b = Math.round(f(1) * 255);

                                      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                                      setCustomColorHex(hex);
                                    };

                                    updateColor(e);

                                    const onPointerMove = (pEvent) => updateColor(pEvent);
                                    const onPointerUp = () => {
                                      window.removeEventListener('pointermove', onPointerMove);
                                      window.removeEventListener('pointerup', onPointerUp);
                                    };

                                    window.addEventListener('pointermove', onPointerMove);
                                    window.addEventListener('pointerup', onPointerUp);
                                  }}
                                >
                                  {/* Spectrum Gradients */}
                                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }} />
                                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 100%)' }} />
                                </div>
                              </div>

                              {/* Right Side (Details & Actions) */}
                              <div className="flex flex-col flex-1 gap-4 justify-between">

                                {/* Color Preview & Values Container */}
                                <div className="flex items-center gap-3">
                                  {/* Color Square */}
                                  <div className="w-12 h-12 rounded-xl shadow-inner border border-white/20 shrink-0 transition-colors" style={{ backgroundColor: customColorHex }} />

                                  {/* HEX and RGB Values */}
                                  <div className="flex flex-col w-full bg-black/30 rounded-xl p-2.5 border border-white/5 font-mono text-xs text-white/90 shadow-inner">
                                    <div className="flex justify-between items-center px-1">
                                      <span className="text-[9px] text-white/40 font-sans font-bold">HEX</span>
                                      <span>{customColorHex.toUpperCase()}</span>
                                    </div>
                                    <div className="w-full h-px bg-white/10 my-1.5" />
                                    <div className="flex justify-between items-center px-1">
                                      <span className="text-[9px] text-white/40 font-sans font-bold">RGB</span>
                                      <span className="text-[10px] text-white/70">
                                        {parseInt(customColorHex.slice(1, 3) || '0', 16)}, {parseInt(customColorHex.slice(3, 5) || '0', 16)}, {parseInt(customColorHex.slice(5, 7) || '0', 16)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Quick Swatches */}
                                <div className="flex flex-col gap-2">
                                  <span className="text-[10px] text-white/40 font-bold px-1">ألوان جاهزة:</span>
                                  <div className="flex flex-wrap gap-2.5 px-1">
                                    {['#f43f5e', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b'].map(presetHex => (
                                      <button
                                        key={presetHex}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setCustomColorHex(presetHex);
                                        }}
                                        className="w-6 h-6 rounded-full border border-white/20 hover:scale-125 transition-transform shrink-0 shadow-md hover:z-10"
                                        style={{ backgroundColor: presetHex }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                {/* Control Buttons */}
                                <div className="flex gap-2.5 mt-auto pt-2">
                                  <button
                                    onClick={() => setShowColorCustomizer(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold transition-all active:scale-95"
                                  >
                                    إلغاء
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
                                    className="flex-[1.5] py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-black transition-all active:scale-95 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                                  >
                                    تطبيق اللون
                                  </button>
                                </div>
                              </div>

                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>


                  {/* Smart Progress Indicator */}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-sky-500/50 to-transparent" />
                </div>
              </div>

              {/* ══════════════════════════════════════════════
                  COMPARE MODAL — slides in over the Bible modal
                  ══════════════════════════════════════════════ */}
              <AnimatePresence>
                {compareModal && (
                  <Portal>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6"
                    >
                      {/* ── Modern Backdrop with Blur ── */}
                      <div
                        className="absolute inset-0 bg-[#020205]/80 backdrop-blur-sm transition-opacity"
                        onClick={() => setCompareModal(false)}
                      />

                      <motion.div
                        initial={{ y: 50, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 30, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        style={{ willChange: 'transform, opacity' }}
                        className="relative w-full sm:max-w-6xl h-[92vh] sm:h-[85vh] rounded-t-[2rem] sm:rounded-[2rem] bg-[#0A0A14]/95 backdrop-blur-2xl border-t sm:border border-white/[0.08] shadow-2xl sm:shadow-[0_0_60px_-15px_rgba(14,165,233,0.15)] flex flex-col overflow-hidden ring-1 ring-white/5"
                      >
                        {/* ── Compare Modal Header ── */}
                        <div className="shrink-0 px-5 sm:px-8 py-5 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-white/10 flex items-center justify-center shadow-[inset_0_0_12px_rgba(56,189,248,0.2)]">
                                <span className="text-lg drop-shadow-md">⚖️</span>
                              </div>
                              <div>
                                <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-sky-400/90 mb-0.5">
                                  مقارنة التراجم
                                </p>
                                <p className="text-sm sm:text-base font-bold text-white/95 tracking-wide" dir="rtl">
                                  {bibleModalBook?.bookName} {bibleModalChapter}
                                  {compareVerseNums.length > 0 && (
                                    <span className="text-white/40 font-medium ml-1">
                                      — {compareVerseNums.length > 1 ? `آيات ${compareVerseNums.join('، ')}` : `آية ${compareVerseNums[0]}`}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => setCompareModal(false)}
                              className="group p-2.5 rounded-full bg-white/5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-300"
                            >
                              <X className="w-4 h-4 text-white/50 group-hover:text-red-400 group-active:scale-90 transition-transform" />
                            </button>
                          </div>

                          {/* Modern Translation Multi-selector Pills */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-white/30 mr-1 shrink-0 flex items-center gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-white/30" />
                              الترجمات المعروضة:
                            </span>
                            {availableTranslations.map(tr => {
                              const isSelected = compareSelectedTranslations.includes(tr);
                              return (
                                <button
                                  key={tr}
                                  onClick={async () => {
                                    if (isSelected && compareSelectedTranslations.length === 1) return;
                                    const next = isSelected
                                      ? compareSelectedTranslations.filter(t => t !== tr)
                                      : [...compareSelectedTranslations, tr];
                                    setCompareSelectedTranslations(next);
                                    setCompareMobileTab(0);
                                    setCompareDesktopPage(0);
                                    await fetchCompareData(compareVerseNums, next);
                                  }}
                                  className={`px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-wider transition-all duration-300 active:scale-95 border ${isSelected
                                    ? 'bg-white text-black border-white shadow-[0_0_15px_-3px_rgba(255,255,255,0.3)]'
                                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                >
                                  {tr}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── Mobile Tab Bar ── */}
                        {!isLoadingCompare && allColumns.length > 1 && (
                          <div className="sm:hidden shrink-0 flex border-b border-white/[0.06] bg-black/20 overflow-x-auto hide-scrollbar px-2">
                            {allColumns.map((tr, idx) => (
                              <button
                                key={tr}
                                onClick={() => setCompareMobileTab(idx)}
                                className={`relative flex-1 min-w-[90px] px-4 py-4 text-[13px] font-bold tracking-wide transition-colors whitespace-nowrap ${idx === mtSafe ? 'text-sky-400' : 'text-white/40 hover:text-white/70'
                                  }`}
                              >
                                {tr}
                                {idx === mtSafe && (
                                  <motion.div
                                    layoutId="activeTabMobile"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 rounded-t-full shadow-[0_-2px_8px_rgba(56,189,248,0.5)]"
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* ── Compare Body ── */}
                        <div className="flex-1 overflow-hidden flex min-h-0 bg-[#0A0A14]/50">
                          {isLoadingCompare ? (
                            <div className="flex-1 flex flex-col sm:flex-row gap-0 min-h-0">
                              {[...Array(Math.min(3, compareSelectedTranslations.length || 2))].map((_, i) => (
                                <div key={i} className="flex-1 p-6 sm:p-8 border-b sm:border-b-0 sm:border-r border-white/[0.04] last:border-0 space-y-6">
                                  <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse" />
                                  {[...Array(compareVerseNums.length || 2)].map((_, j) => (
                                    <div key={j} className="space-y-3">
                                      <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />
                                      <div className="h-4 bg-white/5 rounded w-full animate-pulse delay-75" />
                                      <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse delay-100" />
                                      <div className="h-4 bg-white/5 rounded w-4/6 animate-pulse delay-150" />
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : allColumns.length > 0 ? (
                            <>
                              {/* DESKTOP */}
                              <div className="hidden sm:flex flex-1 min-h-0 relative overflow-hidden">
                                {desktopColumns.map((tr) => (
                                  <div key={tr} className="flex-1 border-r border-white/[0.04] last:border-0 overflow-y-auto custom-scrollbar">
                                    <CompareColumn
                                      translationCode={tr}
                                      verses={compareData?.[tr] || []}
                                      isActive={true}
                                    />
                                  </div>
                                ))}

                                {totalPages > 1 && (
                                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#12121A]/80 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] z-10 ring-1 ring-white/5">
                                    <button
                                      onClick={() => setCompareDesktopPage(p => Math.max(0, p - 1))}
                                      disabled={dpSafe === 0}
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                                    >
                                      <ChevronDown className="w-4 h-4 rotate-90" />
                                    </button>

                                    <div className="flex gap-2 items-center px-2">
                                      {Array.from({ length: totalPages }).map((_, pi) => (
                                        <button
                                          key={pi}
                                          onClick={() => setCompareDesktopPage(pi)}
                                          className={`h-1.5 rounded-full transition-all duration-500 ease-out ${pi === dpSafe
                                            ? 'bg-sky-400 w-6 shadow-[0_0_10px_rgba(56,189,248,0.5)]'
                                            : 'bg-white/20 w-1.5 hover:bg-white/40 hover:w-3'
                                            }`}
                                        />
                                      ))}
                                    </div>

                                    <button
                                      onClick={() => setCompareDesktopPage(p => Math.min(totalPages - 1, p + 1))}
                                      disabled={dpSafe >= totalPages - 1}
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                                    >
                                      <ChevronDown className="w-4 h-4 -rotate-90" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* MOBILE (With Swipe Gesture Support) */}
                              <div className="sm:hidden flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar relative">
                                {mobileActiveCode && compareData?.[mobileActiveCode] ? (
                                  <motion.div
                                    key={mobileActiveCode}
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    dragElastic={0.15}
                                    onDragEnd={(_, info) => {
                                      const swipeThreshold = 50; // مسافة السحب المطلوبة بالبكسل
                                      if (info.offset.x < -swipeThreshold && mtSafe < allColumns.length - 1) {
                                        // سحب لليسار -> الانتقال للترجمة التالية
                                        setCompareMobileTab(prev => prev + 1);
                                      } else if (info.offset.x > swipeThreshold && mtSafe > 0) {
                                        // سحب لليمين -> الانتقال للترجمة السابقة
                                        setCompareMobileTab(prev => prev - 1);
                                      }
                                    }}
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    transition={{ duration: 0.25 }}
                                    className="flex-1 touch-pan-y cursor-grab active:cursor-grabbing"
                                  >
                                    <CompareColumn
                                      translationCode={mobileActiveCode}
                                      verses={compareData[mobileActiveCode]}
                                      isActive={true}
                                    />
                                  </motion.div>
                                ) : (
                                  <div className="flex-1 flex items-center justify-center">
                                    <p className="text-white/30 text-sm font-medium">لا توجد بيانات</p>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex-1 flex items-center justify-center">
                              <div className="text-center opacity-40">
                                <div className="text-5xl mb-4 drop-shadow-xl">⚖️</div>
                                <p className="text-base font-bold text-white tracking-wide">لا توجد بيانات للمقارنة</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-sky-500/40 to-transparent blur-[0.5px]" />
                      </motion.div>
                    </motion.div>
                  </Portal>
                )}
              </AnimatePresence>
            </Portal>
          )}

          {/* This is the Presentation controller screen */}
          {showDataShow && selectedLyricsHymn && (
            <Portal>
              <div id="showDataContainer" className="fixed inset-0 z-10000 bg-[#020617] flex flex-col" data-lenis-prevent>
                {/* ── Shared Header ── */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0f172a] border-b border-white/10 shrink-0 z-20">
                  <div className="flex flex-col min-w-0">
                    <h2 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">{selectedLyricsHymn.title}</h2>
                    <p className="text-[10px] sm:text-xs text-sky-400 font-medium">
                      {selectedLyricsHymn?.isBible ? (
                        <>
                          <span className="sm:hidden">اسحب أو اختر آية من الشريط · مثل عرض الترانيم</span>
                          <span className="hidden sm:inline">عرض الكتاب المقدس · آية بآية مثل مقاطع الترانيم</span>
                        </>
                      ) : (
                        <>
                          <span className="sm:hidden">Swipe or tap a part below</span>
                          <span className="hidden sm:inline">Presenter View • Click a cut to broadcast</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {isConnected && (
                      <span className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        LIVE · {dataShowId}
                      </span>
                    )}
                    <span className="sm:hidden text-xs font-mono text-white/40">
                      {dataShowSlides.length} / {dataShowIndex + 1}
                    </span>
                    <button
                      onClick={() => setShowDataShow(false)}
                      className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-all border border-white/10 hover:border-red-500/30"
                      title="Close"
                    >
                      <X className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>

                {/* ══ MOBILE VIEW ══ */}
                <div className="flex-1 flex flex-col sm:hidden min-h-0">
                  <div id="mobileSlideArea" className="flex-1 flex flex-col min-h-0 relative">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={dataShowIndex}
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 30 }}
                        transition={{ duration: 0.18, ease: 'easeInOut' }}
                        className="absolute inset-0 flex flex-col items-center justify-center px-6 py-4 text-center overflow-hidden"
                      >
                        {(() => {
                          const s = dataShowSlides[dataShowIndex];
                          if (!s) return null;
                          const isChorus = s.type === 'chorus';
                          return (
                            <>
                              {s.title && (
                                <div className={`absolute top-4 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1 rounded-full border
                                  ${isChorus ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' : 'text-white/40 bg-white/5 border-white/10'}`}
                                  dir="rtl"
                                >
                                  {s.title}
                                </div>
                              )}
                              <div className="w-full flex flex-col items-center gap-0 overflow-hidden" dir="rtl">
                                {s.text.split('\n').map((line, idx) => {
                                  if (!line.trim()) return <div key={idx} className="h-2" />;
                                  const parts = line.split(/(\[.*?\])/g);
                                  const segs = [];
                                  let pi = 0;
                                  while (pi < parts.length) {
                                    const p = parts[pi];
                                    if (p && p.startsWith('[') && p.endsWith(']')) {
                                      segs.push({ chord: p.slice(1, -1), text: parts[pi + 1] ?? '' });
                                      pi += 2;
                                    } else {
                                      if (p) segs.push({ chord: null, text: p });
                                      pi++;
                                    }
                                  }
                                  const anyChords = line.includes('[');

                                  return (
                                    <div key={idx} className={`flex flex-wrap justify-center items-end w-full ${showChords && anyChords ? 'mt-[1.1em]' : 'my-[0.1em]'}`} dir="rtl">
                                      {segs.map((seg, j) => (
                                        <span key={j} className="inline-flex flex-col items-center min-w-[0.2em] max-w-full">
                                          {showChords && (
                                            <span className="block font-black whitespace-nowrap leading-none select-none mb-1" dir="ltr"
                                              style={{ color: '#38BDF8', fontSize: 'clamp(9px, 2vw, 14px)', visibility: seg.chord ? 'visible' : 'hidden' }}>
                                              {seg.chord || '\u00A0'}
                                            </span>
                                          )}
                                          <span
                                            className={`font-bold whitespace-pre-wrap break-words text-center leading-snug select-none drop-shadow-lg tracking-tight ${isChorus ? 'text-yellow-300' : 'text-white'}`}
                                            style={{
                                              fontSize: selectedLyricsHymn?.isBible
                                                ? 'clamp(26px, 7.2vw, 56px)'
                                                : 'clamp(24px, 6.5vw, 52px)',
                                              lineHeight: selectedLyricsHymn?.isBible ? 1.72 : undefined,
                                            }}
                                          >
                                            {seg.text || '\u00A0'}
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Dot nav + arrow buttons */}
                  <div className="flex items-center justify-center gap-5 py-2.5 shrink-0">
                    <button
                      onClick={() => { if (dataShowIndex < dataShowSlides.length - 1) { const ni = dataShowIndex + 1; setDataShowIndex(ni); broadcastLocalSlide(dataShowSlides, ni, selectedLyricsHymn?.title); } }}
                      disabled={dataShowIndex === dataShowSlides.length - 1}
                      className="p-2 rounded-full bg-white/5 border border-white/10 text-white/50 disabled:opacity-20 transition-all active:scale-90"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <div dir="rtl" className="flex gap-1.5 overflow-x-auto max-w-[60vw]" style={{ scrollbarWidth: 'none' }}>
                      {dataShowSlides.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                          className={`flex-none rounded-full transition-all duration-200 ${i === dataShowIndex ? 'w-5 h-2 bg-sky-400' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => { if (dataShowIndex > 0) { const ni = dataShowIndex - 1; setDataShowIndex(ni); broadcastLocalSlide(dataShowSlides, ni, selectedLyricsHymn?.title); } }}
                      disabled={dataShowIndex === 0}
                      className="p-2 rounded-full bg-white/5 border border-white/10 text-white/50 disabled:opacity-20 transition-all active:scale-90"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                  </div>

                  {/* Bottom thumbnail strip */}
                  <div className="shrink-0 bg-black/50 border-t border-white/10 py-3 px-3">
                    <div ref={thumbContainerRef} className="flex gap-2.5 overflow-x-auto pb-1" dir="rtl" style={{ scrollbarWidth: 'none' }}>
                      {dataShowSlides.map((slide, i) => {
                        const isActive = dataShowIndex === i;
                        const isChorus = slide.type === 'chorus';
                        return (
                          <button
                            key={i}
                            onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                            className={`relative flex-none flex flex-col w-24 h-20 p-2 rounded-xl border text-right transition-all duration-200 overflow-hidden
                              ${isActive
                                ? 'bg-sky-500/25 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                                : 'bg-white/5 border-white/10 opacity-60 active:opacity-100'}`}
                          >
                            {isActive && <div className="absolute inset-0 bg-linear-to-b from-sky-500/10 to-transparent pointer-events-none" />}
                            <div className="flex items-center justify-between mb-1 relative z-10" dir="ltr">
                              <span className="text-[9px] font-mono text-gray-500">{i + 1}</span>
                              {isActive
                                ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                : slide.title && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${isChorus ? 'text-yellow-300 bg-yellow-500/20' : 'text-gray-400 bg-white/10'}`}>{slide.title.slice(0, 6)}</span>
                              }
                            </div>
                            <div className="flex-1 text-[9px] font-semibold text-gray-300 line-clamp-3 leading-tight text-right relative z-10">
                              {slide.text.replace(/\[.*?\]/g, '')}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>



                {/* ══ DESKTOP VIEW: Professional Grid, Preview + Quick Settings ══ */}
                <div className="hidden sm:flex flex-1 flex-col min-h-0 bg-[#0a0f1c] text-white">

                  {/* Top Header Section */}
                  <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 shrink-0 gap-6" dir="rtl">
                    <div className="flex items-center gap-4 min-w-0 shrink-0">
                      <h1 className="text-2xl font-bold tracking-wide drop-shadow-md text-gray-50 truncate max-w-[200px] xl:max-w-[300px]">
                        {selectedLyricsHymn?.title || 'ليسوع كل القدرة'}
                      </h1>
                      {dataShowId && (
                        <span className="flex items-center gap-1.5 bg-red-500/10 text-red-500 border border-red-500/20 px-2.5 py-1 rounded-md text-xs font-bold tracking-widest uppercase">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE
                        </span>
                      )}
                    </div>

                    {/* Middle: Compact Search Bar Widget with Hymns/Bible Toggle */}
                    <div className="flex-1 max-w-lg relative z-30" dir="rtl">
                      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-2 py-1.5">

                        {/* Segmented Control - inline pill */}
                        <div className="flex items-center gap-0.5 bg-black/30 rounded-full p-0.5 shrink-0">
                          <button
                            onClick={() => handleSetDesktopSearchType('hymns')}
                            className={`py-1 px-3 text-xs font-bold rounded-full transition-all duration-200 whitespace-nowrap ${desktopSearchType === 'hymns'
                              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                              : 'text-gray-400 hover:text-white'
                              }`}
                          >
                            ترانيم
                          </button>
                          <button
                            onClick={() => handleSetDesktopSearchType('bible')}
                            className={`py-1 px-3 text-xs font-bold rounded-full transition-all duration-200 whitespace-nowrap ${desktopSearchType === 'bible'
                              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                              : 'text-gray-400 hover:text-white'
                              }`}
                          >
                            الكتاب
                          </button>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-4 bg-white/10 shrink-0" />

                        {/* Hymns Search Input */}
                        {desktopSearchType === 'hymns' && (
                          <div className="relative flex-1 flex items-center">
                            <input
                              type="text"
                              value={presetSearchQuery}
                              onChange={(e) => setPresetSearchQuery(e.target.value)}
                              placeholder="ابحث عن ترنيمة..."
                              className="w-full bg-transparent py-0.5 px-2 text-sm text-white placeholder-white/30 focus:outline-none text-right"
                            />
                            {isSearchingPreset ? (
                              <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
                            ) : presetSearchQuery ? (
                              <button
                                onClick={() => { setPresetSearchQuery(''); setPresetSearchResults([]); }}
                                className="text-white/30 hover:text-white/80 shrink-0 p-0.5 rounded-full hover:bg-white/5 transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <Search className="w-4 h-4 text-white/20 shrink-0 pointer-events-none" />
                            )}
                          </div>
                        )}

                        {/* Bible Search & Picker Controls - inline */}
                        {desktopSearchType === 'bible' && (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <div className="relative flex-1 flex items-center">
                              <input
                                type="text"
                                value={bibleSearchQuery}
                                onChange={(e) => setBibleSearchQuery(e.target.value)}
                                placeholder="ابحث في الآيات..."
                                className="w-full bg-transparent py-0.5 px-2 text-sm text-white placeholder-white/30 focus:outline-none text-right"
                              />
                              {bibleSearchQuery ? (
                                <button
                                  onClick={() => setBibleSearchQuery('')}
                                  className="text-white/30 hover:text-white/80 shrink-0 p-0.5 rounded-full hover:bg-white/5 transition-all"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              ) : (
                                <Search className="w-4 h-4 text-white/20 shrink-0 pointer-events-none" />
                              )}
                            </div>
                            <div className="w-px h-4 bg-white/10 shrink-0" />
                            <button
                              onClick={() => setBiblePickerOpen(o => o === 'book_present' ? null : 'book_present')}
                              className="bible-picker-btn flex items-center gap-1 text-[11px] font-bold text-gray-300 hover:text-white transition-colors shrink-0 whitespace-nowrap"
                            >
                              <span className="opacity-50 text-[10px]">السفر:</span>
                              <span className="max-w-[55px] truncate">{bibleModalBook?.bookName || '...'}</span>
                              <ChevronDown className="w-3 h-3 opacity-50" />
                            </button>
                            <button
                              onClick={() => setBiblePickerOpen(o => o === 'chapter_present' ? null : 'chapter_present')}
                              disabled={!bibleModalBook}
                              className="bible-picker-btn flex items-center gap-1 text-[11px] font-bold text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
                            >
                              <span className="opacity-50 text-[10px]">الأصحاح:</span>
                              <span>{bibleModalChapter || '0'}</span>
                              <ChevronDown className="w-3 h-3 opacity-50" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Dropdown Recommendations Box for Hymns */}
                      {desktopSearchType === 'hymns' && presetSearchResults.length > 0 && (
                        <div className="absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-2 custom-scrollbar flex flex-col gap-1.5 z-[100]">
                          {presetSearchResults.map((hymn) => (
                            <button
                              key={hymn._id}
                              onClick={() => {
                                setSelectedLyricsHymn(hymn);
                                setDataShowIndex(0);
                                setPresetSearchQuery('');
                                setPresetSearchResults([]);

                                const slides = buildHymnPresentationSlides(hymn.lyrics, {
                                  showChords,
                                  viewportHeight: presentationViewport.height,
                                  viewportWidth: presentationViewport.width,
                                });
                                broadcastLocalSlide(slides, 0, hymn.title);
                              }}
                              className="w-full text-right px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-sky-500/25 border border-white/5 hover:border-sky-500/30 transition-all flex items-center justify-between gap-3 active:scale-[0.98]"
                            >
                              <span className="truncate">{hymn.title}</span>
                              {hymn.party && (
                                <span className="text-[9px] font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full shrink-0">
                                  {Array.isArray(hymn.party) ? hymn.party[0] : hymn.party}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Dropdown Recommendations Box for Bible Search Hits */}
                      {desktopSearchType === 'bible' && bibleSearchQuery.trim() && bibleSearchResults.length > 0 && (
                        <div className="absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-2 custom-scrollbar flex flex-col gap-1.5 z-[100]">
                          {bibleSearchResults.map((hit, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                presentBibleFromSearchHit(hit);
                                setBibleSearchQuery('');
                                setBibleSearchResults([]);
                              }}
                              className="w-full text-right px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-sky-300 bg-white/5 hover:bg-sky-500/25 border border-white/5 hover:border-sky-500/30 transition-all flex flex-col gap-1 active:scale-[0.98]"
                            >
                              <span className="text-sky-400 font-bold text-[10px]">{hit.bookName} {hit.chapter}:{hit.verseNumber}</span>
                              <span className="truncate text-gray-300 font-medium text-[11px] text-right" dangerouslySetInnerHTML={{ __html: hit.text.replace(/<b[^>]*>(.*?)<\/b>/g, '$1') }} />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Dropdown Book Selection Grid */}
                      {desktopSearchType === 'bible' && biblePickerOpen === 'book_present' && (
                        <div className="bible-picker-dropdown absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-3 custom-scrollbar z-[100]">
                          <div className="grid grid-cols-3 gap-1.5">
                            {bibleModalBooks.map((book) => (
                              <button
                                key={book._id}
                                className={`px-2 py-1.5 rounded-xl text-center text-[10px] font-bold transition-all truncate border ${bibleModalBook?.bookName === book.bookName
                                  ? 'bg-sky-500 text-white border-sky-400'
                                  : 'bg-white/5 text-gray-300 border-white/5 hover:bg-sky-500/25 hover:border-sky-500/30'
                                  }`}
                                onClick={() => {
                                  setBibleModalBook(book);
                                  setBibleModalChapter(null);
                                  setBiblePickerOpen('chapter_present');
                                }}
                              >
                                {book.bookName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dropdown Chapter Selection Grid */}
                      {desktopSearchType === 'bible' && biblePickerOpen === 'chapter_present' && (
                        <div className="bible-picker-dropdown absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-3 custom-scrollbar z-[100]">
                          <div className="grid grid-cols-6 gap-1.5">
                            {bibleModalChapters.map((ch) => (
                              <button
                                key={ch}
                                className={`h-8 rounded-xl flex items-center justify-center text-[11px] font-bold transition-all border ${bibleModalChapter === ch
                                  ? 'bg-sky-500 text-white border-sky-400'
                                  : 'bg-white/5 text-gray-300 border-white/5 hover:bg-sky-500/25 hover:border-sky-500/30'
                                  }`}
                                onClick={() => {
                                  setBibleModalChapter(ch);
                                  setBiblePickerOpen(null);
                                }}
                              >
                                {ch}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {dataShowId ? (
                        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded-full text-sm font-medium shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" /> متصل
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-white/5 border border-white/10 text-gray-400 px-4 py-1.5 rounded-full text-sm font-medium">
                          <div className="w-2 h-2 rounded-full bg-gray-500" /> غير متصل
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Main Content: Grid & Preview */}
                  <div className="flex-1 flex gap-8 p-8 min-h-0 overflow-hidden" dir="rtl">

                    {/* Preview Panel (Right Side) */}
                    <div className="hidden lg:flex flex-col w-80 xl:w-[450px] shrink-0 h-full">
                      <div className="flex justify-between items-center mb-4 px-1">
                        <span className="text-sm font-semibold text-gray-400">معاينة</span>
                        <span className="text-lg font-bold text-gray-100 tracking-wide">ملخص الشاشة الثانية</span>
                      </div>
                      <div
                        className="flex-1 border border-white/10 rounded-3xl p-8 flex flex-col justify-center items-center text-center relative shadow-[inset_0_0_40px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300"
                        style={{
                          background: dataShowActiveBg === 'default'
                            ? 'radial-gradient(ellipse 80% 60% at 50% 40%, #0d1527 0%, #070a14 100%)'
                            : `url(${dataShowActiveBg}) center/cover no-repeat`
                        }}
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-gray-500/20 to-transparent" />
                        <div className="text-2xl sm:text-4xl font-extrabold text-white leading-relaxed wrap-break-word whitespace-pre-line drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)]">
                          {dataShowSlides[dataShowIndex] ? dataShowSlides[dataShowIndex].text.replace(/\[.*?\]/g, '') : 'لا يوجد نص'}
                        </div>
                        {dataShowBlackout && (
                          <div className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col justify-center items-center gap-3 transition-all duration-300 z-20">
                            <EyeOff className="w-10 h-10 text-amber-500/80 animate-pulse" />
                            <span className="text-sm font-bold text-amber-500/80">الشاشة الحية مخفية (Blackout)</span>
                          </div>
                        )}
                        <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md border border-white/5 px-3 py-1 rounded-lg text-xs font-medium text-gray-400">
                          معاينة
                        </div>
                      </div>
                    </div>

                    {/* Slides Grid (Left Side) */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pl-2">
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 pb-4">
                        {dataShowSlides.map((slide, i) => {
                          const isActive = dataShowIndex === i;
                          const isChorus = slide.type === 'chorus';
                          return (
                            <button
                              key={i}
                              onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                              className={`relative flex flex-col h-44 p-5 rounded-2xl border text-right transition-all duration-300 overflow-hidden group outline-none
                                ${isActive
                                  ? 'bg-sky-900/40 border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.15)] ring-1 ring-sky-400/50 z-10 scale-[1.02]'
                                  : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] shadow-lg shadow-black/20'}`}
                            >
                              {isActive && <div className="absolute inset-0 bg-linear-to-br from-sky-500/10 to-transparent pointer-events-none" />}
                              <div className="flex items-center justify-between w-full mb-4 relative z-10" dir="ltr">
                                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${isActive ? 'bg-sky-500/20 text-sky-300' : 'bg-black/30 text-gray-400'}`}>
                                  {i + 1}
                                </span>
                                <div className="flex items-center gap-2">
                                  {isActive && (
                                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-red-500 text-white px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 animate-pulse" /> Live
                                    </span>
                                  )}
                                  {slide.title && (
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full backdrop-blur-sm
                                      ${isChorus ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-white/5 text-gray-300 border border-white/10'}`}>
                                      {slide.title}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex-1 w-full text-[15px] font-bold leading-relaxed text-gray-100 line-clamp-4 relative z-10 wrap-break-word whitespace-pre-line text-right">
                                {slide.text.replace(/\[.*?\]/g, '')}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Quick Settings Footer (Bottom Bar) */}
                  <div className="shrink-0 bg-[#0d1321] border-t border-white/5 z-20" dir="rtl">

                    {/* Toggle Header Bar */}
                    <button
                      onClick={() => setShowQuickSettings(v => !v)}
                      className="w-full flex items-center justify-between px-8 py-3 hover:bg-white/[0.03] transition-colors group"
                    >
                      <span className="text-xs font-bold text-gray-500 tracking-widest uppercase group-hover:text-gray-400 transition-colors">Quick Settings</span>
                      <div className="flex items-center gap-2 text-gray-600 group-hover:text-gray-400 transition-colors">
                        <span className="text-[10px] font-medium">{showQuickSettings ? 'إخفاء' : 'إظهار'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showQuickSettings ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Collapsible Content */}
                    {showQuickSettings && (
                      <div className="px-8 pb-5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-bold text-gray-300 tracking-wide"></span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 font-medium">LiveAudioBadge</span>
                            <button onClick={toggleAudio} className={`p-2 rounded-full transition-all active:scale-95 ${isAudioActive ? 'bg-sky-500/20 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                              {isAudioActive ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>

                        {/* Background Images Selection Grid (Collapsible) */}
                        {showBgSelector && (
                          <div className="mb-4 p-4 bg-black/40 border border-white/5 rounded-2xl flex flex-col gap-3 transition-all duration-300" dir="rtl">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400">خلفية الشاشة الحية (أقصى حد: 5 صور)</span>
                              <span className="text-[11px] text-gray-500 font-medium">تم رفع {dataShowBackgrounds.length} من أصل 5 صور</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 py-1">
                              {/* Default Option */}
                              <button
                                onClick={() => handleSelectBackground('default')}
                                className={`relative w-16 h-12 rounded-xl overflow-hidden border flex-none flex items-center justify-center text-[10px] font-bold text-white transition-all active:scale-95
                                  ${dataShowActiveBg === 'default'
                                    ? 'border-sky-400 ring-2 ring-sky-400/30'
                                    : 'border-white/10 opacity-70 hover:opacity-100 shadow-md'}`}
                                style={{
                                  background: 'radial-gradient(ellipse 80% 60% at 50% 40%, #0d1527 0%, #070a14 100%)'
                                }}
                              >
                                الافتراضي
                              </button>

                              {/* Uploaded Backgrounds */}
                              {dataShowBackgrounds.map((bg, idx) => {
                                const isActive = dataShowActiveBg === bg;
                                return (
                                  <div key={idx} className="relative w-16 h-12 rounded-xl flex-none group">
                                    <button
                                      onClick={() => handleSelectBackground(bg)}
                                      className={`w-full h-full rounded-xl overflow-hidden border transition-all active:scale-95
                                        ${isActive
                                          ? 'border-sky-400 ring-2 ring-sky-400/30'
                                          : 'border-white/10 opacity-70 hover:opacity-100 shadow-md'}`}
                                    >
                                      <img src={bg} alt="custom bg" className="w-full h-full object-cover" />
                                    </button>
                                    <button
                                      onClick={(e) => handleDeleteBackground(bg, e)}
                                      className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-500/90 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-90"
                                      title="حذف"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })}

                              {/* Upload Slot */}
                              {dataShowBackgrounds.length < 5 && (
                                <label className="w-16 h-12 rounded-xl border border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all active:scale-95 flex-none shadow-md">
                                  <PlusCircle className="w-5 h-5 text-gray-400 hover:text-white" />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUploadBackground}
                                    className="hidden"
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Controls & Connection Row */}
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          {/* Left side in RTL (UI Actions) */}
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              onClick={toggleBlackout}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all hover:scale-105 active:scale-95
                                ${dataShowBlackout
                                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-pulse'
                                  : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'}`}
                            >
                              {dataShowBlackout ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                              {dataShowBlackout ? 'إظهار الشاشة' : 'إخفاء الشاشة'}
                            </button>
                            <button
                              onClick={() => setShowBgSelector(!showBgSelector)}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all hover:scale-105 active:scale-95
                                ${showBgSelector
                                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                                  : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'}`}
                            >
                              <Moon className="w-4 h-4" /> المظهر
                            </button>
                            <button
                              onClick={handleReset}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
                            >
                              <RotateCcw className="w-4 h-4" /> إعادة تعيين
                            </button>

                            <div className="h-6 w-px bg-white/10 mx-1"></div>

                            {/* Font Scale Control Widget */}
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                              <button
                                onClick={decreaseFontSize}
                                disabled={dataShowFontScale <= 0.5}
                                className="p-1.5 hover:bg-white/10 rounded-full text-gray-300 disabled:opacity-20 transition-all active:scale-90"
                                title="تصغير الخط"
                              >
                                <ZoomOut className="w-4 h-4" />
                              </button>
                              <span className="text-xs font-mono text-gray-300 min-w-[40px] text-center select-none">
                                {Math.round(dataShowFontScale * 100)}%
                              </span>
                              <button
                                onClick={increaseFontSize}
                                disabled={dataShowFontScale >= 2.0}
                                className="p-1.5 hover:bg-white/10 rounded-full text-gray-300 disabled:opacity-20 transition-all active:scale-90"
                                title="تكبير الخط"
                              >
                                <ZoomIn className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Right side in RTL (Session Management) */}
                          <div className="flex items-center gap-3 bg-black/30 p-1.5 rounded-2xl border border-white/5" dir="ltr">
                            {!dataShowId ? (
                              <>
                                <input type="text" value={dataShowIdInput} onChange={e => setDataShowIdInput(e.target.value)}
                                  placeholder="Room ID..."
                                  className="bg-transparent px-3 py-1.5 text-sm text-white focus:outline-none w-32 placeholder:text-gray-600"
                                  onKeyDown={e => { if (e.key === 'Enter') handleCreateSession(); }}
                                />
                                <button onClick={handleCreateSession} disabled={isCreatingSession} className="px-4 py-1.5 bg-sky-500/80 hover:bg-sky-500 active:scale-95 rounded-xl text-sm font-bold text-white transition-all">
                                  {isCreatingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                                </button>
                                <button onClick={handleJoinSession} disabled={isJoiningSession} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-sm font-bold text-white transition-all">
                                  Join
                                </button>
                              </>
                            ) : (
                              <>
                                <a href={`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`} target="_blank" rel="noopener noreferrer"
                                  className="px-4 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 text-xs font-bold hover:bg-indigo-500/30 active:scale-95 transition-all flex items-center gap-1.5">
                                  <Tv2 className="w-3.5 h-3.5" /> Display
                                </a>
                                <button onClick={() => { if (isAudioActive) toggleAudio(); clearDisplay(); setDataShowId(''); setSessionExpiresAt(null); localStorage.removeItem('myLivePresentationId'); }}
                                  className="px-4 py-1.5 rounded-xl bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-5~00/30 active:scale-95 transition-all flex items-center gap-1.5">
                                  <X className="w-3.5 h-3.5" /> End
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

              </div >
            </Portal >
          )
          }


        </div >
      )}

      {/* This is the Add/Edit Note form */}
      {noteModalConfig && (
        <Portal>
          <div
            className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-6"
            style={{ isolation: 'isolate' }}
          >
            {/* Backdrop - stopPropagation prevents bible modal from reacting */}
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); setNoteModalConfig(null); setNoteText(''); }}
            />
            <div
              className="relative w-full sm:max-w-lg bg-gradient-to-b from-[#0d1a2d] to-[#080f1c] border border-indigo-500/20 rounded-t-3xl sm:rounded-3xl shadow-[0_0_60px_-10px_rgba(99,102,241,0.3)] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative top bar mobile */}
              <div className="sm:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1" />

              {/* Glowing header strip */}
              <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

              <div className="px-6 py-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {noteModalConfig.existingNote ? (language === 'ar' ? 'تعديل الملاحظة' : 'Edit Note') : (language === 'ar' ? 'إضافة ملاحظة' : 'Add Note')}
                    </h3>
                    <p className="text-[10px] text-indigo-400/60 font-mono uppercase tracking-widest mt-0.5">
                      {noteModalConfig.type === 'bible' ? `Verse ${noteModalConfig.data.verseNumber}` : 'Hymn'}
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

              {/* Verse preview */}
              <div className="mx-6 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-sm text-white/50 leading-relaxed line-clamp-3" dir="rtl">
                  {noteModalConfig.type === 'bible' ? noteModalConfig.data.text : noteModalConfig.data.title}
                </p>
              </div>

              <div className="px-6 pb-2">
                <textarea
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={language === 'ar' ? 'اكتب ملاحظتك هنا...' : 'Write your note here...'}
                  rows={4}
                  className="w-full bg-white/[0.04] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 resize-none text-sm leading-relaxed transition-all"
                  dir="rtl"
                />
              </div>

              <div className="flex items-center gap-3 px-6 py-5">
                <button
                  onClick={() => { setNoteModalConfig(null); setNoteText(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all border border-white/10"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={isSubmittingNote || !noteText.trim()}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  {isSubmittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {language === 'ar' ? 'حفظ الملاحظة' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* This is the View Note overlay */}
      {viewNoteConfig && (
        <Portal>
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-8"
            style={{ isolation: 'isolate' }}
            onClick={(e) => { e.stopPropagation(); setViewNoteConfig(null); }}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <div
              className="relative w-full max-w-md bg-gradient-to-b from-[#0d1a2d] to-[#080f1c] border border-indigo-500/30 rounded-3xl shadow-[0_0_80px_-10px_rgba(99,102,241,0.4)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Ambient glow */}
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />

              <div className="p-6">
                {/* Reference tag */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/25">
                    <BookOpen className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
                      Verse {viewNoteConfig.verse.verseNumber}
                    </span>
                  </div>
                </div>

                {/* The verse text */}
                <div className="mb-5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-white/60 text-sm leading-relaxed" dir="rtl">
                    {viewNoteConfig.verse.text}
                  </p>
                </div>

                {/* Divider with label */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-indigo-500/20" />
                  <span className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-widest">Your Note</span>
                  <div className="flex-1 h-px bg-indigo-500/20" />
                </div>

                {/* The note */}
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-500 to-indigo-500/0 rounded-full" />
                  <p className="pl-4 text-indigo-100 text-sm leading-relaxed" dir="rtl">
                    {viewNoteConfig.note}
                  </p>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setViewNoteConfig(null);
                      setNoteText(viewNoteConfig.note);
                      setNoteModalConfig({ type: 'bible', data: viewNoteConfig.verse, existingNote: viewNoteConfig.note });
                    }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 transition-all"
                  >
                    Edit Note
                  </button>
                  <button
                    onClick={() => setViewNoteConfig(null)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-indigo-600/80 hover:bg-indigo-500 text-white transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

    </div >

  </section >

  )
}



// Sub-component for handling Key/Chords toggle state
function KeyDisplay({ scale, relatedChords, onTranspose }) {
  const [showChords, setShowChords] = useState(false);

  return (
    <div className="flex flex-col items-start sm:items-center gap-2 w-full">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold px-3 py-1 rounded-full border border-white/5 
          ${scale ? 'text-blue-300 bg-blue-500/10' : 'text-gray-600'}`}>
          {scale || '-'}
        </span>

        {/* Transpose Controls */}
        <div className="flex items-center rounded-lg border border-white/10 overflow-hidden bg-white/5">
          <button
            onClick={(e) => { e.stopPropagation(); onTranspose(-1); }}
            className="px-2 py-0.5 hover:bg-blue-500/10 text-[10px] sm:text-xs text-red-300 font-bold border-r border-white/5"
            title="Transpose -1"
          >
            -
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTranspose(1); }}
            className="px-2 py-0.5 hover:bg-blue-500/10 text-[10px] sm:text-xs text-green-300 font-bold border-l border-white/5"
            title="Transpose +1"
          >
            +
          </button>
        </div>

        {relatedChords && (
          <button
            onClick={() => setShowChords(!showChords)}
            className={`p-1 rounded-full transition-all duration-300 border border-transparent
              ${showChords
                ? 'bg-sky-500/20 text-sky-300 rotate-180 border-sky-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
            title="Show Related Chords"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        )}
      </div>

      <AnimatePresence>
        {showChords && relatedChords && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -5 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -5 }}
            className="overflow-hidden w-full flex justify-start sm:justify-center"
          >
            <div className="mt-1 flex flex-wrap justify-start sm:justify-center gap-1.5 w-full sm:max-w-[200px]">
              {relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
                <span key={i} className="text-[10px] font-bold text-sky-200 bg-sky-900/30 px-1.5 py-0.5 rounded border border-sky-500/20">
                  {chord}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HymnItem({ humn, index, categories, addToWorkspace, isHymnInWorkspace, canEdit, delete_Hymn, openEditModal, variants, t, openLyrics, openPresentation, vocalsMode, UserRole, setNoteModalConfig }) {
  const [transposeStep, setTransposeStep] = useState(0);

  // Handle adding to workspace with transposed values
  // 1. Calculate transposed scale and chords
  const currentScale = transposeScale(humn.scale, transposeStep);
  const currentChords = transposeChords(humn.relatedChords, transposeStep);

  // Handle adding to workspace with transposed values
  const handleAddToWorkspace = () => {
    // 2. Transpose chords embedded in lyrics
    const transposedLyrics = transposeLyrics(humn.lyrics, transposeStep);

    addToWorkspace({
      ...humn,
      scale: currentScale,
      relatedChords: currentChords,
      lyrics: transposedLyrics
    });
  };

  return (
    <motion.div
      variants={variants}
      className="group relative grid grid-cols-12 gap-2 sm:gap-4 p-3 sm:p-5 items-center 
                 bg-[#13132b]/60 hover:bg-[#1a1a38] 
                 border border-white/5 hover:border-sky-500/30 
                 rounded-2xl transition-all duration-300 backdrop-blur-sm
                 hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
    >
      {/* Hover Glow Gradient */}
      <div className="absolute inset-0 rounded-2xl bg-linear-to-r from-sky-500/5 via-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {vocalsMode && humn.lyrics && (
        <button
          id={index === 0 ? 'tour-presentation-mobile' : undefined}
          onClick={() => openPresentation(humn, transposeStep)}
          className="absolute top-3 right-3 sm:hidden p-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-500/50 transition-all z-30 backdrop-blur-md shadow-lg shadow-sky-500/10 active:scale-95"
          title="Open Presentation Mode"
        >
          <Monitor className="w-5 h-5 text-sky-400" />
        </button>
      )}

      {/* Index */}
      <div className="col-span-1 sm:col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
        {(index + 1).toString().padStart(2, '0')}
      </div>

      {/* BPM and Time Signature Display */}
      {((humn.BPM && humn.BPM !== "None") || (humn.timeSignature && humn.timeSignature !== "None")) && (
        <div className={`absolute lg:top-1 top-2 right-2 flex items-center gap-2 bg-black/40 pr-3 pl-1 py-0.5 rounded-full border border-white/5 z-20 backdrop-blur-sm transition-opacity ${vocalsMode ? 'opacity-0 pointer-events-none' : ''}`}>
          {humn.BPM && <Metronome id={humn._id} bpm={humn.BPM} timeSignature={(humn.timeSignature && humn.timeSignature !== "None") ? humn.timeSignature : "4/4"} minimal={true} />}
          <div className="flex gap-2 text-[10px] font-mono text-gray-500">
            {humn.BPM && <span>{humn.BPM} bpm</span>}
            {humn.BPM && humn.timeSignature && humn.timeSignature !== "None" && <span className="text-gray-600">|</span>}
            {humn.timeSignature && humn.timeSignature !== "None" && <span>{humn.timeSignature}</span>}
          </div>
        </div>
      )}

      {/* Song Title */}
      <div className="col-span-11 sm:col-span-5 md:col-span-5 relative z-10 flex items-center gap-2  py-4">
        <div className="flex -space-x-1.5 overflow-hidden p-1">
          {(Array.isArray(humn.party) ? humn.party : [humn.party]).map((p, idx) => {
            const matchedCat = categories.find(c => c.id === p) || { icon: Music };
            const CatIcon = matchedCat.icon;
            return (
              <CatIcon
                key={idx}
                className="w-4 h-4 text-gray-400 group-hover:text-sky-300 transition-colors shrink-0 bg-[#0c0c20] rounded-full ring-2 ring-[#13132b]"
                title={matchedCat.label}
              />
            );
          })}
        </div>
        <h3 className="font-bold text-base sm:text-lg text-gray-200 group-hover:text-white transition-colors tracking-wide">
          {humn.title}
        </h3>
      </div>

      {/* Key/Scale - Under Title on Mobile (Left Aligned), Center on Desktop */}
      <div className={`col-span-12 sm:col-span-2 relative z-10 flex items-center justify-start sm:justify-center -mt-2 sm:mt-0 pl-2 sm:pl-0 lg:top-2 transition-opacity ${vocalsMode ? 'opacity-0 pointer-events-none' : ''}`}>
        <KeyDisplay
          scale={currentScale}
          relatedChords={currentChords}
          onTranspose={(val) => setTransposeStep(prev => prev + val)}
        />
      </div>


      {/* Actions */}
      <div className="col-span-6 sm:col-span-1 flex justify-center items-center gap-2 relative z-10 lg:top-2 px-2">
        <button
          onClick={handleAddToWorkspace}
          disabled={isHymnInWorkspace(humn._id)}
          className={`p-2.5 rounded-xl transition-all duration-300 flex-1 sm:flex-none flex justify-center
            ${isHymnInWorkspace(humn._id)
              ? 'text-green-400 bg-green-500/10 cursor-default'
              : 'text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 bg-white/5 sm:bg-transparent'}`}
          title={isHymnInWorkspace(humn._id) ? t("addedToWorkspace") : t("addToWorkspace")}
        >
          {isHymnInWorkspace(humn._id) ? <Check className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
        </button>

        {UserRole === 'PROGRAMER' ? (
          <button
            onClick={() => delete_Hymn(humn._id)}
            className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all bg-white/5 sm:bg-transparent flex-1 sm:flex-none flex justify-center"
            title={t("deleteSong")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : null
        }


        {canEdit && (
          <>
            <button
              onClick={() => openEditModal(humn)}
              className="p-2.5 rounded-xl text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all bg-white/5 sm:bg-transparent flex-1 sm:flex-none flex justify-center"
              title={t("editSong")}
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </>
        )}

      </div>


      {/* Media Link */}
      <div className="col-span-6 sm:col-span-3 flex flex-row sm:flex-row justify-center items-center gap-1 sm:gap-2 relative z-10 lg:top-2">

        {/* {humn.link ? (
          <a
            href={humn.link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
          >
            <PlayCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">{t("listen")}</span>
          </a>
        ) : (
          <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/5 text-gray-600 border border-white/5 w-full sm:w-auto justify-center cursor-default group/soon relative overflow-hidden">
            <PlayCircle className="w-4 h-4 shrink-0 opacity-20" />
            <span className="text-xs sm:text-sm font-medium">{t("listen")}</span>
          </div>
        )} */}

        {humn.lyrics && (
          <>
            <button
              onClick={() => openLyrics(humn, transposeStep)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">{t("lyrics")}</span>
            </button>

            {/* Presentation Button - Vocals Mode only */}
            {vocalsMode && (
              <button
                id={index === 0 ? 'tour-presentation-desktop' : undefined}
                onClick={() => openPresentation(humn, transposeStep)}
                className="hidden sm:flex p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-500/50 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10"
                title="Open Presentation Mode"
              >
                <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </>
        )}

        {!humn.link && !humn.lyrics && (
          <span className="text-gray-700 text-xs">—</span>
        )}
      </div>


    </motion.div>
  );
}