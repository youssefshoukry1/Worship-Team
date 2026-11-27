'use client';

import React, { useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';
import { UserContext } from '../context/User_Context';
import { HymnsContext } from '../context/Hymns_Context';
import { useLanguage } from '../context/LanguageContext';
import { showToast } from '../components/ToastContainer';
import { displayBookName } from './translationLanguages';
import { getApiBaseUrl } from '../utils/apiBase';
import { isRetiredTranslation } from '../utils/platform';
import { prepareOfflineSearch, scheduleBibleMigration } from '../utils/bibleChapterStorage';
import { openBibleReader, prepareLocalBible, readLocalChapter, searchLocalBible, isTranslationDownloaded, downloadTranslationToLocal, getKnownDownloadedTranslations, getDownloadedTranslations } from '../utils/bibleSync';
import { journal, activeTeam, readerKey, readReaderMap, saveReaderMap, applyBibleMap, watchBibleChanges, writeBibleChange } from '../utils/bibleChanges';
import { queueOfflineAction } from '../utils/offlineQueue';
import { invalidateProfile, readCachedProfile, refreshProfile } from '../utils/profileCache';
import { prepareLocalAiOpening, completeLocalAiRequest, cancelLocalAiOpening } from '../utils/aiPersonalization';
import { readAiStudyMode } from '../utils/aiStudyMode';
import { buildAiNearbyVerses } from '../utils/aiJourney';
import { readAiResponseDiagrams } from '../utils/aiPracticalFlow';
import { readAiResponseError } from '../utils/aiResponseError';
import { readTabJson, readTabResource, tabReadKey } from '../utils/tabRequests';
import { HIGHLIGHT_COLORS, BIBLE_LAST_POS_KEY } from './bibleShared';
import { useTabPageActive } from '../components/TabPageActivity';
import { waitForNavigationIdle } from '../utils/navigationWork';
import { searchOnlineBible } from '../utils/onlineBibleSearch';

const API_ROOT = getApiBaseUrl();

const BIBLE_API = `${API_ROOT}/bible`;



const BIBLE_LAST_VERSES_KEY = 'taspe7_bible_last_verses';

const EMPTY_VERSES = [];
const BIBLE_CACHED_BOOKS_KEY = 'taspe7_bible_cached_books';

function getInitialBibleData() {
  if (typeof window === 'undefined') return { book: null, chapter: null, verses: [] };
  try {
    const rawPos = localStorage.getItem(BIBLE_LAST_POS_KEY);
    const rawVerses = localStorage.getItem(BIBLE_LAST_VERSES_KEY);
    const pos = rawPos ? JSON.parse(rawPos) : null;
    const cached = rawVerses ? JSON.parse(rawVerses) : null;
    const translation = localStorage.getItem('taspe7_bible_translation') || 'AVD';
    const cachedTranslation = cached?.translation || 'AVD';
    const bookName = pos?.bookName || cached?.bookName || 'تكوين';
    const chapter = pos?.chapter ?? cached?.chapter ?? 1;
    let verses = [];
    if (cached && cachedTranslation === translation && cached.bookName === bookName && Number(cached.chapter) === Number(chapter) && Array.isArray(cached.verses)) {
      verses = cached.verses;
    }
    return {
      book: { bookName, _id: bookName },
      chapter,
      verses,
    };
  } catch {
    return { book: null, chapter: null, verses: [] };
  }
}

function getInitialTranslation() {
  if (typeof window === 'undefined') return 'AVD';
  return localStorage.getItem('taspe7_bible_translation') || 'AVD';
}

function getInitialBibleBooks() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BIBLE_CACHED_BOOKS_KEY);
    const cached = JSON.parse(raw);
    const selected = getInitialTranslation();
    if (Array.isArray(cached)) return selected === 'AVD' ? cached : [];
    return cached?.translation === selected && Array.isArray(cached.books) ? cached.books : [];
  } catch {
    return [];
  }
}

function saveLastCachedVerses(bookName, chapter, verses, translation = 'AVD') {
  if (typeof window === 'undefined' || !bookName || chapter == null || !Array.isArray(verses) || verses.length === 0) return;
  try {
    localStorage.setItem(BIBLE_LAST_VERSES_KEY, JSON.stringify({ bookName, chapter, verses, translation }));
  } catch { }
}

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

export function useBibleForm({ isOpen, presentationActive, onClose, onPresent }) {
  const pageActive = useTabPageActive();
  const { isLogin, user_id } = useContext(UserContext);
  const { addToWorkspace } = useContext(HymnsContext);
  const { t, language } = useLanguage();

  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleSearchResults, setBibleSearchResults] = useState([]);
  const [bibleSearchUnavailable, setBibleSearchUnavailable] = useState(false);
  const [bibleSearchRetry, setBibleSearchRetry] = useState(0);
  const retryBibleSearch = () => setBibleSearchRetry(previous => previous + 1);
  const [isSearchingBible, setIsSearchingBible] = useState(false);
  const [showBibleSearchBar, setShowBibleSearchBar] = useState(false);

  useEffect(() => {
    if (bibleSearchQuery) {
      setShowBibleSearchBar(true);
    }
  }, [bibleSearchQuery]);
  const initialBibleRef = useRef(null);
  if (!initialBibleRef.current) {
    initialBibleRef.current = getInitialBibleData();
  }
  const [bibleModalBooks, setBibleModalBooks] = useState(getInitialBibleBooks);
  const [bibleModalBook, setBibleModalBook] = useState(initialBibleRef.current.book);
  const [bibleModalChapters, setBibleModalChapters] = useState([]);
  const [bibleModalChapter, setBibleModalChapter] = useState(initialBibleRef.current.chapter);
  const [loadedChapter, setLoadedChapter] = useState(() => ({
    translation: getInitialTranslation(), bookName: initialBibleRef.current.book?.bookName,
    chapter: initialBibleRef.current.chapter, verses: initialBibleRef.current.verses,
  }));
  const [bibleSelectedVerseIds, setBibleSelectedVerseIdsState] = useState(new Set());

  // Lock bottom nav when verses are selected
  useEffect(() => {
    if (!pageActive) return;
    const isLocked = isOpen && bibleSelectedVerseIds.size > 0;
    window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: isLocked } }));
    return () => {
      window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: false } }));
    };
  }, [pageActive, isOpen, bibleSelectedVerseIds.size]);

  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState({ loading: false, type: null, text: '', error: null, isLimit: false });
  const aiRequestRef = useRef(null);
  const clearAiAnalysis = React.useCallback(() => {
    aiRequestRef.current = null;
    setAiAnalysis({ loading: false, type: null, text: '', error: null, isLimit: false });
  }, []);
  useEffect(() => { clearAiAnalysis(); }, [user_id, isLogin, clearAiAnalysis]);
  const setBibleSelectedVerseIds = React.useCallback(next => {
    clearAiAnalysis();
    setBibleSelectedVerseIdsState(next);
  }, [clearAiAnalysis]);
  useEffect(() => () => { aiRequestRef.current = null; }, []);
  const [showAiOptions, setShowAiOptions] = useState(false);
  const [bibleVerseFontSize, setBibleVerseFontSize] = useState(() => {
    if (typeof window === 'undefined') return 20;
    const saved = localStorage.getItem('taspe7_bible_verse_font_size');
    return saved ? parseInt(saved, 10) : 20;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_bible_verse_font_size', bibleVerseFontSize.toString());
    }
  }, [bibleVerseFontSize]);

  const [bibleAddedSuccess, setBibleAddedSuccess] = useState(false);

  const [bibleModalBrowseLoading, setBibleModalBrowseLoading] = useState(false);
  const [readerIndex, setReaderIndex] = useState(null);
  const [biblePickerOpen, setBiblePickerOpen] = useState(null);
  const bibleBookPickerRef = useRef(null);
  const bibleChapterPickerRef = useRef(null);
  const bibleScrollContainerRef = useRef(null);
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

  const [bibleVerseGap, setBibleVerseGap] = useState(() => {
    if (typeof window === 'undefined') return -10;
    const stored = localStorage.getItem('taspe7_bible_verse_gap');
    const saved = stored === null ? -10 : Number(stored);
    return Number.isFinite(saved) ? Math.min(32, Math.max(-10, saved)) : -10;
  });

  const handleSetBibleVerseGap = (val) => {
    const gap = Math.min(32, Math.max(-10, val));
    setBibleVerseGap(gap);
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_bible_verse_gap', gap.toString());
    }
  };

  // View mode: 'list' (under each other) vs 'paragraph' (beside each other)
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

  const [bibleHighlights, setBibleHighlights] = useState({});
  const [imageCardConfig, setImageCardConfig] = useState(null);
  const [prayModeActive, setPrayModeActive] = useState(false);

  const [highlightColorsList, setHighlightColorsList] = useState(() => {
    if (typeof window === 'undefined') return HIGHLIGHT_COLORS;
    try {
      const savedV2 = localStorage.getItem('taspe7_custom_highlights_list_v2');
      if (savedV2) return JSON.parse(savedV2);

      const oldSaved = localStorage.getItem('taspe7_custom_highlights_list');
      if (oldSaved) {
        const oldList = JSON.parse(oldSaved);
        const customs = Array.isArray(oldList) ? oldList.filter(c => c.id && c.id.startsWith('custom-')) : [];
        return [...HIGHLIGHT_COLORS, ...customs];
      }
      return HIGHLIGHT_COLORS;
    } catch {
      return HIGHLIGHT_COLORS;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_custom_highlights_list_v2', JSON.stringify(highlightColorsList));
    }
  }, [highlightColorsList]);

  const [showColorCustomizer, setShowColorCustomizer] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('#2fc4c9');

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

  const handleApplyHighlight = async colorId => {
    const ids = Array.from(bibleSelectedVerseIds);
    const remove = !colorId || ids.every(id => bibleHighlights[id] === colorId);
    const entries = ids.flatMap(id => {
      const v = bibleModalVerses.find(verse => verse._id === id);
      return v ? [{ verseId: String(id), value: colorId, bookName: v.bookName || bibleModalBook?.name,
        chapter: v.chapter || bibleModalChapter?.number || 1, verseNumber: v.verseNumber, text: v.text }] : [];
    });
    if (!entries.length) return;
    setBibleSelectedVerseIds(new Set());
    if (!user_id || !isLogin) {
      const key = readerKey(API_ROOT, null, '', 'highlights');
      const map = applyBibleMap(readReaderMap(key), [{ remove, entries }]);
      saveReaderMap(key, map);
      setBibleHighlights(map);
      return;
    }
    try {
      await writeBibleChange(API_ROOT, user_id, isLogin, 'highlights', remove, entries);
    } catch (error) { showToast({ message: error.message, type: 'error' }); }
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
  }, [setBibleSelectedVerseIds]);

  const handleVerseNoteClick = React.useCallback((verse, existingNote) => {
    setBibleSelectedVerseIds(new Set([verse._id]));
    setShowAiOptions(false);
    setShowColorCustomizer(false);
    setNoteText(existingNote);
    setNoteModalConfig({ type: 'bible', data: [verse], existingNote, inline: true });
  }, [setBibleSelectedVerseIds]);

  // --- Translation Selector State ---
  const [bibleTranslation, setBibleTranslationRaw] = useState(getInitialTranslation);
  // Pre-seeded with known translations so all pills appear immediately,
  // even before the /translations endpoint responds.
  const [availableTranslations, setAvailableTranslations] = useState(['AVD']);
  const chapterMatches = loadedChapter?.translation === bibleTranslation &&
    loadedChapter.bookName === bibleModalBook?.bookName && loadedChapter.chapter === bibleModalChapter;
  const bibleModalVerses = chapterMatches ? loadedChapter.verses : EMPTY_VERSES;

  const translationChoice = useRef(0);
  const setBibleTranslation = React.useCallback((t) => {
    translationChoice.current++;
    if (t === bibleTranslation) return;
    setBibleTranslationRaw(t);
    if (typeof window !== 'undefined') localStorage.setItem('taspe7_bible_translation', t);
    // Reset selection and search while keeping active book & chapter position
    setReaderIndex(null);
    setIsCheckingOffline(true);
    setBibleModalBooks(getInitialBibleBooks());
    setLoadedChapter(null);
    setBibleSelectedVerseIds(new Set());
    setBibleModalChapters([]);
    setBibleSearchQuery('');
    setBibleSearchResults([]);
  }, [bibleTranslation, setBibleSelectedVerseIds]);

  // --- Offline Translation Downloads State ---
  const [downloadedTranslations, setDownloadedTranslations] = useState(() => new Set(getKnownDownloadedTranslations()));
  const [isDownloadingTranslation, setIsDownloadingTranslation] = useState(null);
  const [isCheckingOffline, setIsCheckingOffline] = useState(() => !getKnownDownloadedTranslations().includes(getInitialTranslation()));

  // Closed Hymns tools only schedule first-install preparation. Already saved
  // Bibles stay on disk until a Bible tool actually needs the verses.
  useEffect(() => {
    if (!pageActive || isOpen || presentationActive || bibleTranslation !== 'AVD') return;
    const prepare = () => { prepareLocalBible().catch(() => {}); };
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(prepare, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prepare, 1000);
    return () => window.clearTimeout(id);
  }, [pageActive, isOpen, presentationActive, bibleTranslation]);

  // Check which translations are offline when modal opens or available translations change
  useEffect(() => {
    if (!isOpen && !presentationActive) return;
    let cancelled = false;
    const checkOffline = async () => {
      try {
        const active = await getDownloadedTranslations([...new Set([...availableTranslations, bibleTranslation])]);
        if (!cancelled) {
          setDownloadedTranslations(active);
        }
      } catch {
        // Keep the known downloads if storage is temporarily unavailable.
      }
    };
    checkOffline();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, availableTranslations, bibleTranslation]);

  const toggleDownloadTranslation = async (tr, autoSelect = false) => {
    if (downloadedTranslations.has(tr) || isDownloadingTranslation === tr) {
      if (autoSelect && tr !== bibleTranslation) {
        setBibleTranslation(tr);
      }
      return;
    }
    const choice = ++translationChoice.current;
    setIsDownloadingTranslation(tr);
    try {
      const success = await downloadTranslationToLocal(tr, BIBLE_API);
      if (success) {
        setDownloadedTranslations(prev => {
          const next = new Set(prev);
          next.add(tr);
          return next;
        });
        showToast({
          message: language === 'ar' ? `تم تحميل ترجمة ${tr} بنجاح!` : `${tr} downloaded successfully!`,
          type: 'success',
        });
        if (choice !== translationChoice.current) return;
        if (bibleTranslation === tr) {
          const index = await openBibleReader(tr);
          if (choice === translationChoice.current && index && getInitialTranslation() === tr) {
            setReaderIndex(index);
            setBibleModalBooks(index.books);
          }
        } else if (autoSelect) {
          setBibleTranslation(tr);
        }
      }
    } catch (error) {
      if (error?.isNotFound) {
        showToast({
          message: language === 'ar'
            ? `ترجمة ${tr} غير متوفرة حالياً.`
            : `Translation ${tr} is not available.`,
          type: 'error',
        });
      } else {
        showToast({
          message: language === 'ar' ? 'فشل تحميل الترجمة. تأكد من اتصالك بالإنترنت.' : 'Failed to download translation. Check your connection.',
          type: 'error',
        });
      }
    } finally {
      setIsDownloadingTranslation(current => current === tr ? null : current);
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
  const compareRequest = useRef(0);
  const fetchCompareData = async (verseNumbers, translations) => {
    if (!bibleModalBook?.bookName || bibleModalChapter == null || !verseNumbers?.length) return;
    const request = ++compareRequest.current;
    setIsLoadingCompare(true);
    setCompareData(null);

    try {
      const targetTranslations = translations && translations.length > 0 ? translations : availableTranslations;
      const finalCompareData = {};
      const numsSet = new Set(verseNumbers.map(Number));

      // Fetch downloaded translations locally (Fast & Offline)
      for (const t of targetTranslations) {
        if (request !== compareRequest.current) return;
        const isDownloaded = downloadedTranslations.has(t) || (await isTranslationDownloaded(t));
        if (isDownloaded) {
          try {
            const verses = await readLocalChapter(t, bibleModalBook.bookName, bibleModalChapter);
            finalCompareData[t] = verses.filter(v => numsSet.has(Number(v.verseNumber)));
          } catch (localErr) {
            console.warn(`Local fetch failed for ${t}:`, localErr);
          }
        }
      }

      if (request === compareRequest.current) setCompareData(finalCompareData);
    } catch (err) {
      console.error('Compare fetch error', err);
      if (request === compareRequest.current) setCompareData({});
    } finally {
      if (request === compareRequest.current) setIsLoadingCompare(false);
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
  useEffect(() => {
    if (bibleSelectedVerseIds.size === 0) {
      setNoteModalConfig(current => current?.inline ? null : current);
    }
  }, [bibleSelectedVerseIds]);

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
    if (!pageActive || (!isOpen && !(presentationActive)) || translationsFetchedRef.current) return;
    translationsFetchedRef.current = true;
    readTabJson(`${BIBLE_API}/translations`)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableTranslations(data.filter(code => !isRetiredTranslation(code)));
        }
      })
      .catch(() => { /* Keep the bundled AVD translation. */ });
  }, [isOpen, presentationActive, pageActive]);

  useEffect(() => {
    if (!pageActive || (!isOpen && !presentationActive)) return;
    setBibleSelectedVerseIds(new Set());
    const selected = getInitialTranslation();
    if (selected !== bibleTranslation) {
      setBibleTranslation(selected);
      return;
    }

    let cancelled = false;
    async function openTranslation() {
      setBibleModalBrowseLoading(true);
      try {
        const index = await openBibleReader(bibleTranslation, { seedDefault: true });
        if (cancelled) return;
        if (!index) {
          if (bibleTranslation !== 'AVD') setBibleTranslation('AVD');
          return;
        }
        setReaderIndex(index);
        scheduleBibleMigration();
        setBibleModalBooks(index.books);
        setDownloadedTranslations(previous => previous.has(bibleTranslation)
          ? previous : new Set([...previous, bibleTranslation]));
        localStorage.setItem(BIBLE_CACHED_BOOKS_KEY, JSON.stringify({ translation: bibleTranslation, books: index.books }));
      } catch {
        // Keep the last cached chapter visible if storage is temporarily unavailable.
      } finally {
        if (!cancelled) {
          setIsCheckingOffline(false);
          setBibleModalBrowseLoading(false);
        }
      }
    }
    openTranslation();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, pageActive, bibleTranslation, setBibleTranslation, setBibleSelectedVerseIds]);

  useEffect(() => {
    if (!readerIndex || !pageActive || (!isOpen && !presentationActive)) return;
    const book = readerIndex.books.find(entry => entry.bookName === bibleModalBook?.bookName)
      || readerIndex.books.find(entry => entry.bookNumber === bibleModalBook?.bookNumber)
      || readerIndex.books[0];
    const chapters = readerIndex.chaptersMap.get(book.bookName);
    const chapter = bibleModalChapter == null ? null
      : chapters.includes(Number(bibleModalChapter)) ? Number(bibleModalChapter) : chapters[0];
    if (book !== bibleModalBook) setBibleModalBook(book);
    if (chapter !== bibleModalChapter) setBibleModalChapter(chapter);
    setBibleModalChapters(chapters);
    if (chapter == null) {
      setBibleModalBrowseLoading(false);
      return;
    }
    if (book !== bibleModalBook || chapter !== bibleModalChapter) return;
    let cancelled = false;
    setBibleModalBrowseLoading(true);
    Promise.resolve(readerIndex.readChapter(book.bookName, chapter)).then(verses => {
      if (cancelled || !verses) return;
      setLoadedChapter({ translation: bibleTranslation, bookName: book.bookName, chapter, verses });
      saveLastCachedVerses(book.bookName, chapter, verses, bibleTranslation);
    }).catch(() => { /* Keep a matching cached chapter during a temporary storage failure. */ })
      .finally(() => { if (!cancelled) setBibleModalBrowseLoading(false); });
    return () => { cancelled = true; };
  }, [readerIndex, pageActive, isOpen, presentationActive, bibleModalBook, bibleModalChapter, bibleTranslation]);

  useEffect(() => {
    if (pageActive && (isOpen || presentationActive) && showBibleSearchBar && navigator.onLine === false) {
      // Use the time spent typing the first offline query to prepare its index.
      prepareOfflineSearch(bibleTranslation).catch(() => {});
    }
  }, [pageActive, isOpen, presentationActive, showBibleSearchBar, bibleTranslation]);

  // Bible Search Debounce Effect
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!pageActive || (!isOpen && !presentationActive) || !bibleSearchQuery.trim()) {
      setBibleSearchResults([]);
      setBibleSearchUnavailable(false);
      setIsSearchingBible(false);
      return () => controller.abort();
    }

    const searchBible = async () => {
      if (!bibleSearchQuery.trim()) {
        setBibleSearchResults([]);
        return;
      }
      setIsSearchingBible(true);
      setBibleSearchUnavailable(false);
      let onlineBusy = false;
      try {
        // Use the server's ranked search even when this translation is cached.
        // A valid empty response is authoritative; only failures fall back.
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
          try {
            const data = await searchOnlineBible(BIBLE_API, bibleSearchQuery, bibleTranslation, { signal: controller.signal });
            await waitForNavigationIdle();
            if (!cancelled) setBibleSearchResults(data);
            return;
          } catch (error) {
            if (cancelled || controller.signal.aborted || axios.isCancel(error)) return;
            onlineBusy = error.status === 503 || [429, 503].includes(error.response?.status);
            // An unreachable API must not disable downloaded translations.
          }
        }
        const isDownloaded = downloadedTranslations.has(bibleTranslation) || (await isTranslationDownloaded(bibleTranslation));
        if (isDownloaded) {
          const localResults = await searchLocalBible(bibleSearchQuery, bibleTranslation, { signal: controller.signal });
          if (!cancelled) setBibleSearchResults(localResults || []);
        } else {
          if (!cancelled) {
            setBibleSearchResults([]);
            setBibleSearchUnavailable(onlineBusy ? 'busy' : true);
          }
        }
      } catch (error) {
        if (!cancelled) console.error("Bible search error:", error);
        if (!cancelled) {
          setBibleSearchResults([]);
          setBibleSearchUnavailable(onlineBusy ? 'busy' : true);
        }
      } finally {
        if (!cancelled) setIsSearchingBible(false);
      }
    };

    const handler = setTimeout(() => {
      searchBible();
    }, 400);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(handler);
    };
  }, [bibleSearchQuery, bibleTranslation, downloadedTranslations, isOpen, presentationActive, pageActive, bibleSearchRetry]);

  const handleSaveNote = async () => {
    if (!noteText.trim() || !noteModalConfig) return;
    const noteData = noteModalConfig.inline
      ? bibleModalVerses.filter(verse => bibleSelectedVerseIds.has(verse._id))
      : noteModalConfig.data;
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
        const verseOrVerses = noteData;
        const verses = Array.isArray(verseOrVerses) ? verseOrVerses : [verseOrVerses];
        const synced = await writeBibleChange(API_ROOT, userid, token, 'notes', false, verses.map(v => ({
          verseId: String(v._id), bookName: bibleModalBook?.bookName || v.bookName || 'Unknown',
          chapter: bibleModalChapter?.number || v.chapter || bibleModalChapter || 1,
          verseNumber: v.verseNumber, text: v.text, value: noteText,
        })));
        if (!synced) showToast({ message: 'Saved offline', type: 'offline' });
        setBibleSelectedVerseIds(new Set());
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

      if (isNetworkError && noteModalConfig?.type === 'hymn') {
          const hymn = noteModalConfig.data;
          await queueOfflineAction(`${API_ROOT}/users/hymn-note`, 'POST', {
            userid,
            hymnId: hymn._id || hymn.hymnId,
            title: hymn.title,
            note: noteText
          }, { Authorization: `Bearer ${token}` });

        setNoteModalConfig(null);
        setNoteText('');
        showToast({ message: '📶 You\'re offline — your note is saved and will sync automatically once you\'re back online.', type: 'offline', duration: 6000 });
        return;
      }

      console.error('Failed to save note:', err?.response?.data || err.message);
      alert('Failed to save note: ' + (err?.response?.data?.message || err.message));
    } finally {
      if (noteModalConfig?.type === 'hymn') invalidateProfile(API_ROOT, token);
      setIsSubmittingNote(false);
    }
  };

  useEffect(() => {
    if (!pageActive || (!isOpen && !presentationActive)) return;
    const team = user_id ? activeTeam() : '';
    let live = true;
    const revision = { notes: 0, highlights: 0 };
    const refresh = async (kind, fetchServer) => {
      const n = ++revision[kind];
      const valid = () => live && n === revision[kind];
      const key = readerKey(API_ROOT, user_id, team, kind);
      const setMap = kind === 'notes' ? setVerseNotes : setBibleHighlights;
      let cached = readReaderMap(key);
      if (user_id && !navigator.onLine && !localStorage.getItem(key)) {
        const legacy = await readCachedProfile(user_id);
        if (!valid()) return;
        const rows = kind === 'notes' ? legacy?.bibleNotes : legacy?.bibleHighlights;
        if (rows) cached = Object.fromEntries(rows.filter(r => String(r.churchId || '') === team)
          .map(row => [row.verseId, kind === 'notes' ? row.note : row.color]));
      }
      if (!user_id || !isLogin) { setMap(cached); return; }
      const scope = journal.scope(API_ROOT, user_id, kind);
      const changes = (await journal.list(scope)).filter(e => e.team === team);
      if (!valid()) return;
      setMap(applyBibleMap(cached, changes));
      if (!fetchServer) return;
      let rows;
      if (kind === 'notes') {
        const data = await readTabResource(tabReadKey(`${API_ROOT}/users/my-notes`, isLogin), signal =>
          getUsersWithFallback('my-notes', { headers: { Authorization: `Bearer ${isLogin}` }, signal }).then(res => res.data));
        rows = data?.bibleNotes;
      } else {
        const profile = await refreshProfile(API_ROOT, isLogin, user_id);
        rows = profile.bibleHighlights?.filter(row => String(row.churchId || '') === team);
      }
      if (!valid() || !Array.isArray(rows)) return;
      const base = Object.fromEntries(rows.map(row => [row.verseId, kind === 'notes' ? row.note : row.color]));
      saveReaderMap(key, base);
      setMap(applyBibleMap(base, changes.filter(e => e.status === 'pending')));
    };
    const load = (kind, server) => refresh(kind, server).catch(() => {});
    load('notes', true);
    if (isOpen) load('highlights', true);
    const off = watchBibleChanges(e => {
      if (e.owner !== user_id || e.api !== API_ROOT || (!e.reconcile && e.team !== team)) return;
      load(e.kind, e.version != null || e.reconcile || e.rejected);
    });
    return () => { live = false; off(); };
  }, [isOpen, presentationActive, pageActive, isLogin, user_id]);

  const closeBibleModal = () => {
    onClose();
    setBibleSearchQuery('');
    setBibleSearchResults([]);
    setShowBibleSearchBar(false);
    setBibleSelectedVerseIds(new Set());
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
      return `${displayBookName(bibleModalBook, bibleTranslation)} ${bibleModalChapter}:${nums[0]}`;
    } else {
      const isConsecutive = nums.every((num, i) => i === 0 || num === nums[i - 1] + 1);
      if (isConsecutive) {
        return `${displayBookName(bibleModalBook, bibleTranslation)} ${bibleModalChapter}:${nums[0]}-${nums[nums.length - 1]}`;
      } else {
        return `${displayBookName(bibleModalBook, bibleTranslation)} ${bibleModalChapter}:${nums.join('، ')}`;
      }
    }
  };

  const handleCopySelectedVerses = async () => {
    const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
    if (!selectedVersesData.length) return;
    const shareText = selectedVersesData.map(v => `[${v.verseNumber}] ${v.text}`).join('\n') + `\n(${getSelectedVersesRef()})`;

    try {
      await navigator.clipboard.writeText(shareText);
      showToast(language === 'ar' ? 'تم نسخ الآيات المختارة بنجاح!' : 'Selected verses copied successfully!');
    } catch (err) {
      console.error('Clipboard write failed', err);
      showToast(language === 'ar' ? 'تعذر نسخ النصوص' : 'Failed to copy text');
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
    if (aiRequestRef.current) return;
    setShowAiOptions(false);
    const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
    if (!selectedVersesData.length) return;
    const request = {};
    aiRequestRef.current = request;
    const isCurrent = () => aiRequestRef.current === request;
    const textContent = selectedVersesData.map(v => `[${v.verseNumber}] ${v.text}`).join(' ');
    const verseId = Array.from(bibleSelectedVerseIds).sort().join('-');
    setAiAnalysis({ loading: true, type: analysisType, text: '', error: null, isLimit: false });
    let openingReservation = null;
    let requestUserId = null;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
      requestUserId = token ? localStorage.getItem('user_Taspe7_ID') : null;
      const studyMode = readAiStudyMode(requestUserId);
      const sameAccount = () => requestUserId && localStorage.getItem('user_Taspe7_ID') === requestUserId
        && localStorage.getItem('user_Taspe7_Token') === token;
      if (sameAccount() && analysisType !== 'cross_reference') {
        const profile = await readCachedProfile(requestUserId);
        if (sameAccount()) {
          openingReservation = await prepareLocalAiOpening({
            userId: requestUserId,
            realName: profile?.user?.Name,
            bookName: bibleModalBook?.bookName,
            chapter: Number(bibleModalChapter)
          });
        }
      }
      if (!isCurrent()) {
        await cancelLocalAiOpening(requestUserId, openingReservation?.id);
        return;
      }
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const { data } = await axios.post(`${API_ROOT}/ai/analyze-verse`, {
        verseId,
        verseReference: getSelectedVersesRef(),
        textContent,
        analysisType,
        studyMode,
        ...(studyMode === 'old_man' && analysisType === 'explain' ? { nearbyVerses: buildAiNearbyVerses(bibleModalVerses, bibleSelectedVerseIds) } : {}),
        ...(openingReservation && sameAccount() ? { openingContext: openingReservation.context } : {})
      }, { headers, timeout: 25000 });
      if (!isCurrent()) {
        await cancelLocalAiOpening(requestUserId, openingReservation?.id);
        return;
      }
      if (typeof data?.explanation !== 'string' || !data.explanation.trim() || data.success === false) {
        throw Object.assign(new Error('Invalid AI API response'), { code: 'AI_INVALID_API_RESPONSE' });
      }
      let explanation = data.explanation || '';
      if (explanation && sameAccount()) {
        const opening = await completeLocalAiRequest({
          userId: requestUserId,
          bookName: bibleModalBook?.bookName,
          chapter: Number(bibleModalChapter),
          reservationId: openingReservation?.id,
          generatedOpening: data.opening
        });
        if (opening && sameAccount()) explanation = `${opening}\n${explanation}`;
      } else {
        await cancelLocalAiOpening(requestUserId, openingReservation?.id);
      }
      if (!isCurrent()) return;
      setAiAnalysis({ loading: false, type: analysisType, text: explanation, error: null, isLimit: false,
        quota: data.quota,
        studyMode, wordStudies: studyMode === 'old_man' && Array.isArray(data.wordStudies) ? data.wordStudies : [],
        ...readAiResponseDiagrams(data, analysisType, studyMode) });
    } catch (err) {
      await cancelLocalAiOpening(requestUserId, openingReservation?.id);
      if (!isCurrent()) return;
      const { message, isLimit } = readAiResponseError(err);
      setAiAnalysis({ loading: false, type: analysisType, text: '', error: message, isLimit, quota: err.response?.data?.quota });
    } finally {
      if (isCurrent()) aiRequestRef.current = null;
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

  const presentBibleFromSearchHit = async (hit) => {
    if (!hit?.bookName || hit.chapter == null || hit.verseNumber == null) return;
    const translation = hit.translation || bibleTranslation || 'AVD';
    for (const code of new Set([translation, 'AVD'])) {
      try {
        const verses = await readLocalChapter(code, hit.bookName, hit.chapter);
        if (!verses.length) continue;
        const book = bibleModalBooks.find(entry => entry.bookName === hit.bookName);
        if (book) {
          setBibleModalBook(book);
          setBibleModalChapter(hit.chapter);
        }
        const index = verses.findIndex(v => v.verseNumber === hit.verseNumber);
        onPresent({ bookName: hit.bookName, chapter: hit.chapter, verses, startIndex: Math.max(0, index) });
        return;
      } catch (error) {
        console.warn('Bible presentation chapter unavailable', code, error);
      }
    }
  };

  const goToChapterFromSearch = (hit) => {
    const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
    if (book) {
      setBibleModalBook(book);
      setBibleModalChapter(hit.chapter);
      setBibleSearchQuery('');
      setShowBibleSearchBar(false);
      if (typeof window !== 'undefined') localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: hit.bookName, chapter: hit.chapter }));
    }
  };

  const currChapterIdx = bibleModalChapters.findIndex(ch => Number(ch) === Number(bibleModalChapter));
  const hasNextChapter = currChapterIdx >= 0 && currChapterIdx < bibleModalChapters.length - 1;
  const hasPrevChapter = currChapterIdx > 0;

  const goToNextChapter = () => {
    if (!hasNextChapter || !bibleModalBook) return;
    const nextChapter = bibleModalChapters[currChapterIdx + 1];
    setBibleModalChapter(nextChapter);
    setBibleSelectedVerseIds(new Set());
    if (typeof window !== 'undefined') {
      localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: bibleModalBook.bookName, chapter: nextChapter }));
    }
  };

  const goToPrevChapter = () => {
    if (!hasPrevChapter || !bibleModalBook) return;
    const prevChapter = bibleModalChapters[currChapterIdx - 1];
    setBibleModalChapter(prevChapter);
    setBibleSelectedVerseIds(new Set());
    if (typeof window !== 'undefined') {
      localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: bibleModalBook.bookName, chapter: prevChapter }));
    }
  };

  return {
    isOpen,
    bibleSearchQuery, setBibleSearchQuery,
    bibleSearchResults, setBibleSearchResults,
    bibleSearchUnavailable,
    retryBibleSearch,
    isSearchingBible,
    showBibleSearchBar, setShowBibleSearchBar,
    bibleModalBooks, setBibleModalBooks,
    bibleModalBook, setBibleModalBook,
    bibleModalChapters, setBibleModalChapters,
    bibleModalChapter, setBibleModalChapter,
    bibleModalVerses,
    bibleSelectedVerseIds, setBibleSelectedVerseIds,
    aiAnalysis, clearAiAnalysis, showAiOptions, setShowAiOptions,
    bibleVerseFontSize, setBibleVerseFontSize,
    bibleAddedSuccess,
    bibleModalBrowseLoading,
    biblePickerOpen, setBiblePickerOpen,
    bibleBookPickerRef, bibleChapterPickerRef,
    isSavingBible,
    bibleVerseSpacing, handleSetBibleVerseSpacing,
    bibleVerseGap, handleSetBibleVerseGap,
    bibleViewMode, handleSetBibleViewMode,
    bibleHighlights,
    imageCardConfig, setImageCardConfig,
    prayModeActive, setPrayModeActive,
    highlightColorsList, setHighlightColorsList,
    showColorCustomizer, setShowColorCustomizer,
    customColorHex, setCustomColorHex,
    colorInputRef, handleTriggerColorPicker, handleColorPickerChange,
    handleApplyHighlight, handleVerseClick, handleVerseNoteClick,
    bibleTranslation, setBibleTranslation,
    availableTranslations,
    downloadedTranslations,
    isDownloadingTranslation,
    isCheckingOffline,
    toggleDownloadTranslation,
    compareModal, setCompareModal,
    compareData, isLoadingCompare,
    compareVerseNums,
    compareSelectedTranslations, setCompareSelectedTranslations,
    compareMobileTab, setCompareMobileTab,
    compareDesktopPage, setCompareDesktopPage,
    allColumns, totalPages, dpSafe, desktopColumns, mtSafe, mobileActiveCode,
    fetchCompareData, openCompare,
    verseNotes,
    noteModalConfig, setNoteModalConfig,
    noteText, setNoteText,
    isSubmittingNote,
    handleSaveNote,
    closeBibleModal,
    getSelectedVersesRef,
    handleCopySelectedVerses,
    handleOpenImageCard,
    handleAiAnalysis,
    saveBibleToWorkspace,
    openBiblePresentation: onPresent,
    presentBibleFromSearchHit,
    goToChapterFromSearch,
    goToNextChapter,
    goToPrevChapter,
    hasNextChapter,
    hasPrevChapter,
    bibleScrollContainerRef,
  };
}
