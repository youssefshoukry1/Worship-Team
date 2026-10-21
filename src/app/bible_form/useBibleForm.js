'use client';

import React, { useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';
import { UserContext } from '../context/User_Context';
import { HymnsContext } from '../context/Hymns_Context';
import { useLanguage } from '../context/LanguageContext';
import { showToast } from '../components/ToastContainer';
import { normalizeBibleBooksFromApi } from '../utils/bibleBooks';
import { getApiBaseUrl } from '../utils/apiBase';
import { initLocalBible, prepareLocalBible, getLocalBibleIndex, searchLocalBible, isTranslationDownloaded, downloadTranslationToLocal, getKnownDownloadedTranslations, getDownloadedTranslations } from '../utils/bibleSync';
import { queueOfflineAction } from '../utils/offlineQueue';
import { invalidateProfile, refreshProfile } from '../utils/profileCache';
import { readTabJson, readTabResource, tabReadKey } from '../utils/tabRequests';
import { HIGHLIGHT_COLORS, BIBLE_LAST_POS_KEY } from './bibleShared';

const API_ROOT = getApiBaseUrl();

const BIBLE_API = `${API_ROOT}/bible`;

const LOCAL_BIBLE_NOTES_KEY = 'taspe7_local_bible_notes';

const BIBLE_LAST_VERSES_KEY = 'taspe7_bible_last_verses';

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

function getInitialBibleBooks() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BIBLE_CACHED_BOOKS_KEY);
    return raw ? JSON.parse(raw) : [];
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
  const { isLogin, user_id } = useContext(UserContext);
  const { addToWorkspace } = useContext(HymnsContext);
  const { t, language } = useLanguage();

  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleSearchResults, setBibleSearchResults] = useState([]);
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
  const [bibleModalVerses, setBibleModalVerses] = useState(initialBibleRef.current.verses);
  const [bibleSelectedVerseIds, setBibleSelectedVerseIds] = useState(new Set());

  // Lock bottom nav when verses are selected
  useEffect(() => {
    const isLocked = isOpen && bibleSelectedVerseIds.size > 0;
    window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: isLocked } }));
    return () => {
      window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: false } }));
    };
  }, [isOpen, bibleSelectedVerseIds.size]);

  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState({ loading: false, type: null, text: '', error: null, isLimit: false });
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
  const [bibleModalBooksReady, setBibleModalBooksReady] = useState(false);
  const [biblePickerOpen, setBiblePickerOpen] = useState(null);
  const bibleBookPickerRef = useRef(null);
  const bibleChapterPickerRef = useRef(null);
  const bibleScrollContainerRef = useRef(null);
  const [isSavingBible, setIsSavingBible] = useState(false);

  // Auto-scroll to top on chapter or book change
  useEffect(() => {
    if (bibleScrollContainerRef.current) {
      bibleScrollContainerRef.current.scrollTop = 0;
    }
  }, [bibleModalBook, bibleModalChapter]);

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

  useEffect(() => {
    let cancelled = false;
    if (isOpen) {
      setBibleHighlights(readLocalBibleHighlights());
      if (user_id) {
        const token = localStorage.getItem("user_Taspe7_Token");
        if (token) {
          refreshProfile(API_ROOT, token, user_id).then(profile => {
            if (cancelled) return;
            if (profile.user?.bibleHighlights) {
              const serverHighlights = {};
              profile.user.bibleHighlights.forEach(h => {
                if (h.verseId && h.color) {
                  serverHighlights[String(h.verseId)] = h.color;
                }
              });
              localStorage.setItem(LOCAL_BIBLE_HIGHLIGHTS_KEY, JSON.stringify(serverHighlights));
              setBibleHighlights(serverHighlights);
            }
          }).catch(() => { });
        }
      }
    }
    return () => { cancelled = true; };
  }, [isOpen, user_id]);

  const handleApplyHighlight = async (colorId) => {
    invalidateProfile(API_ROOT, isLogin);
    const selectedIds = Array.from(bibleSelectedVerseIds);
    if (!selectedIds.length) return;

    // Toggle off if all selected verses already have this color
    const isTogglingOff = colorId && selectedIds.every(id => bibleHighlights[id] === colorId);
    const targetColor = isTogglingOff ? null : colorId;

    const newHighlights = { ...bibleHighlights };

    // Optimistic UI update
    selectedIds.forEach(id => {
      if (targetColor) {
        newHighlights[id] = targetColor;
        writeLocalBibleHighlight(id, targetColor);
      } else {
        delete newHighlights[id];
        writeLocalBibleHighlight(id, null);
      }
    });
    setBibleHighlights(newHighlights);

    // Auto close context menu by deselecting
    setBibleSelectedVerseIds(new Set());

    if (!user_id) return;
    const token = localStorage.getItem("user_Taspe7_Token");
    if (!token) return;

    try {
      const promises = selectedIds.map(async (id) => {
        const verse = bibleModalVerses.find(v => v._id === id);
        if (!verse) return;

        if (targetColor) {
          await axios.post(`${API_ROOT.replace(/\/api$/, '')}/api/users/bible-highlight`, {
            userid: user_id,
            verseId: id,
            bookName: verse.bookName || bibleModalBook?.name || '',
            chapter: verse.chapter || bibleModalChapter?.number || 1,
            verseNumber: verse.verseNumber,
            color: targetColor,
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
    } finally {
      invalidateProfile(API_ROOT, token);
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
  // Pre-seeded with known translations so all pills appear immediately,
  // even before the /translations endpoint responds.
  const [availableTranslations, setAvailableTranslations] = useState(['AVD', 'ERV-AR', 'KEH']);
  const setBibleTranslation = (t) => {
    setBibleTranslationRaw(t);
    if (typeof window !== 'undefined') localStorage.setItem('taspe7_bible_translation', t);
    // Reset selection and search while keeping active book & chapter position
    setBibleModalVerses([]);
    setBibleSelectedVerseIds(new Set());
    setBibleModalChapters([]);
    setBibleSearchQuery('');
    setBibleSearchResults([]);
  };

  // --- Offline Translation Downloads State ---
  const [downloadedTranslations, setDownloadedTranslations] = useState(() => new Set(getKnownDownloadedTranslations()));
  const [isDownloadingTranslation, setIsDownloadingTranslation] = useState(null);
  const [isCheckingOffline, setIsCheckingOffline] = useState(() => !getKnownDownloadedTranslations().includes(getInitialTranslation()));

  // Closed Hymns tools only schedule first-install preparation. Already saved
  // Bibles stay on disk until a Bible tool actually needs the verses.
  useEffect(() => {
    if (!isOpen && !presentationActive) {
      const prepare = () => { prepareLocalBible().catch(() => {}); };
      if (window.requestIdleCallback) {
        const id = window.requestIdleCallback(prepare, { timeout: 3000 });
        return () => window.cancelIdleCallback(id);
      }
      const id = window.setTimeout(prepare, 1000);
      return () => window.clearTimeout(id);
    }

    let cancelled = false;
    initLocalBible().then((data) => {
      if (!cancelled && data && data.length > 0) {
        setDownloadedTranslations(prev => {
          const next = new Set(prev);
          next.add('AVD');
          return next;
        });
        if ((localStorage.getItem('taspe7_bible_translation') || 'AVD') === 'AVD') {
          setIsCheckingOffline(false);
        }
      }
    }).catch(() => { });
    // Let shared preparation finish; only stop updates to this closed view.
    return () => { cancelled = true; };
  }, [isOpen, presentationActive]);

  // Check which translations are offline when modal opens or available translations change
  useEffect(() => {
    if (!isOpen && !presentationActive) return;
    let cancelled = false;
    const checkOffline = async () => {
      try {
        const active = await getDownloadedTranslations(availableTranslations);
        if (!cancelled) {
          setDownloadedTranslations(active);
          setIsCheckingOffline(false);
        }
      } catch {
        if (!cancelled) setIsCheckingOffline(false);
      }
    };
    checkOffline();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, availableTranslations]);

  const toggleDownloadTranslation = async (tr, autoSelect = false) => {
    if (downloadedTranslations.has(tr) || isDownloadingTranslation === tr) {
      if (autoSelect && tr !== bibleTranslation) {
        setBibleTranslation(tr);
      }
      return;
    }
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
        if (autoSelect || bibleTranslation === tr) {
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
      setIsDownloadingTranslation(null);
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
      const targetTranslations = translations && translations.length > 0 ? translations : availableTranslations;
      const finalCompareData = {};

      // Fetch downloaded translations locally (Fast & Offline)
      for (const t of targetTranslations) {
        const isDownloaded = downloadedTranslations.has(t) || (await isTranslationDownloaded(t));
        if (isDownloaded) {
          try {
            const index = await getLocalBibleIndex(t);
            if (index && index.versesMap) {
              const chapterKey = `${bibleModalBook.bookName}_${parseInt(bibleModalChapter)}`;
              const allVerses = index.versesMap.get(chapterKey) || [];
              const numsSet = new Set(verseNumbers.map(Number));
              const matched = allVerses.filter(v => numsSet.has(Number(v.verseNumber)));
              finalCompareData[t] = matched;
            }
          } catch (localErr) {
            console.warn(`Local fetch failed for ${t}:`, localErr);
          }
        }
      }

      setCompareData(finalCompareData);
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
    if ((!isOpen && !(presentationActive)) || translationsFetchedRef.current) return;
    translationsFetchedRef.current = true;
    readTabJson(`${BIBLE_API}/translations`)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableTranslations(data);
        }
      })
      .catch(() => { /* keep the default ['AVD','KEH'] */ });
  }, [isOpen, presentationActive]);

  // ─── Load books when modal opens or presentation Bible mode is active ───
  useEffect(() => {
    if (!isOpen && !(presentationActive)) return;
    setBibleSelectedVerseIds(new Set());
    let cancelled = false;
    (async () => {
      try {
        // Books are the same across translations — prefer local index (fast/offline)
        const index = await getLocalBibleIndex();
        if (index && index.books && index.books.length > 0) {
          const normalized = normalizeBibleBooksFromApi(index.books);
          if (!cancelled) {
            setBibleModalBooks(normalized);
            if (typeof window !== 'undefined') localStorage.setItem(BIBLE_CACHED_BOOKS_KEY, JSON.stringify(normalized));
          }
        } else {
          const data = await readTabJson(`${BIBLE_API}/books?lang=arabic`);
          const normalized = normalizeBibleBooksFromApi(data);
          if (!cancelled) {
            setBibleModalBooks(normalized);
            if (typeof window !== 'undefined') localStorage.setItem(BIBLE_CACHED_BOOKS_KEY, JSON.stringify(normalized));
          }
        }
      } catch {
        if (!cancelled && bibleModalBooks.length === 0) setBibleModalBooks([]);
      } finally {
        if (!cancelled) setBibleModalBooksReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive]);

  // Restore last book/chapter after books are loaded
  useEffect(() => {
    if (!bibleModalBooksReady || bibleModalBooks.length === 0) return;
    try {
      const saved = localStorage.getItem(BIBLE_LAST_POS_KEY);
      if (!saved) return;
      const { bookName, chapter } = JSON.parse(saved);
      const book = bibleModalBooks.find(b => b.bookName === bookName);
      if (book) {
        setBibleModalBook(book);
        if (chapter != null) setBibleModalChapter(chapter);
      }
    } catch { }
  }, [bibleModalBooksReady]);

  // ─── Load chapters when book or translation changes (synced with presentation) ───
  useEffect(() => {
    if ((!isOpen && !(presentationActive)) || !bibleModalBook?.bookName) {
      setBibleModalChapters([]);
      setBibleSelectedVerseIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setBibleModalBrowseLoading(true);
      try {
        const isDownloaded = downloadedTranslations.has(bibleTranslation) || (await isTranslationDownloaded(bibleTranslation));
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
        // If not downloaded, do not hit API. Only downloaded translations are used.
        if (!cancelled) setBibleModalChapters([]);
      } catch {
        if (!cancelled) setBibleModalChapters([]);
      } finally {
        if (!cancelled) setBibleModalBrowseLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, bibleModalBook, bibleTranslation, downloadedTranslations]);

  // ─── Load verses when chapter or translation changes (synced with presentation) ───
  useEffect(() => {
    if ((!isOpen && !(presentationActive)) || !bibleModalBook?.bookName || bibleModalChapter == null) {
      setBibleModalVerses([]);
      setBibleSelectedVerseIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setBibleModalBrowseLoading(true);
      try {
        const isDownloaded = downloadedTranslations.has(bibleTranslation) || (await isTranslationDownloaded(bibleTranslation));
        if (isDownloaded) {
          // use local index for instant offline-first response
          const index = await getLocalBibleIndex(bibleTranslation);
          if (index) {
            const verses = index.versesMap.get(`${bibleModalBook.bookName}_${parseInt(bibleModalChapter)}`) || [];
            if (!cancelled) {
              setBibleModalVerses(verses);
              saveLastCachedVerses(bibleModalBook.bookName, bibleModalChapter, verses, bibleTranslation);
              setBibleModalBrowseLoading(false);
            }
            return;
          }
        }
        // If not downloaded, do not hit API. Only downloaded translations are used.
        if (!cancelled && bibleModalVerses.length === 0) setBibleModalVerses([]);
      } catch {
        if (!cancelled && bibleModalVerses.length === 0) setBibleModalVerses([]);
      } finally {
        if (!cancelled) setBibleModalBrowseLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, bibleModalBook?.bookName, bibleModalChapter, bibleTranslation, downloadedTranslations]);


  // Bible Search Debounce Effect
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if ((!isOpen && !presentationActive) || !bibleSearchQuery.trim()) {
      setBibleSearchResults([]);
      setIsSearchingBible(false);
      return () => controller.abort();
    }

    const searchBible = async () => {
      if (!bibleSearchQuery.trim()) {
        setBibleSearchResults([]);
        return;
      }
      setIsSearchingBible(true);
      try {
        const isDownloaded = downloadedTranslations.has(bibleTranslation) || (await isTranslationDownloaded(bibleTranslation));
        if (isDownloaded) {
          const localResults = await searchLocalBible(bibleSearchQuery, bibleTranslation, { signal: controller.signal });
          if (!cancelled) setBibleSearchResults(localResults || []);
        } else {
          if (!cancelled) setBibleSearchResults([]);
        }
      } catch (error) {
        if (!cancelled) console.error("Bible search error:", error);
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
      controller.abort();
      clearTimeout(handler);
    };
  }, [bibleSearchQuery, bibleTranslation, downloadedTranslations, isOpen, presentationActive]);

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

    invalidateProfile(API_ROOT, token);
    setIsSubmittingNote(true);
    try {
      if (noteModalConfig.type === 'bible') {
        const verseOrVerses = noteModalConfig.data;
        const verses = Array.isArray(verseOrVerses) ? verseOrVerses : [verseOrVerses];
        await Promise.all(verses.map(async (v) => {
          await postUsersWithFallback('bible-note', {
            userid,
            verseId: v._id,
            bookName: bibleModalBook?.bookName || v.bookName || 'Unknown',
            chapter: bibleModalChapter || v.chapter || 1,
            verseNumber: v.verseNumber,
            text: v.text,
            note: noteText
          }, { headers: { Authorization: `Bearer ${token}` } });
        }));
        // Update local state immediately for instant feedback
        setVerseNotes(prev => {
          const next = { ...prev };
          verses.forEach(v => {
            next[v._id] = noteText;
            writeLocalBibleNote(v._id, noteText);
          });
          return next;
        });
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

      if (isNetworkError) {
        if (noteModalConfig?.type === 'bible') {
          const verseOrVerses = noteModalConfig.data;
          const verses = Array.isArray(verseOrVerses) ? verseOrVerses : [verseOrVerses];
          for (const v of verses) {
            await queueOfflineAction(`${API_ROOT}/users/bible-note`, 'POST', {
              userid,
              verseId: v._id,
              bookName: bibleModalBook?.bookName || v.bookName || 'Unknown',
              chapter: bibleModalChapter || v.chapter || 1,
              verseNumber: v.verseNumber,
              text: v.text,
              note: noteText
            }, { Authorization: `Bearer ${token}` });

            writeLocalBibleNote(v?._id, noteText);
          }
          setVerseNotes(prev => {
            const next = { ...prev };
            verses.forEach(v => { next[v?._id] = noteText; });
            return next;
          });
          setBibleSelectedVerseIds(new Set());
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
        const verseOrVerses = noteModalConfig.data;
        const verses = Array.isArray(verseOrVerses) ? verseOrVerses : [verseOrVerses];
        verses.forEach(v => {
          writeLocalBibleNote(v?._id, noteText);
        });
        setVerseNotes(prev => {
          const next = { ...prev };
          verses.forEach(v => { next[v?._id] = noteText; });
          return next;
        });
        setBibleSelectedVerseIds(new Set());
        setNoteModalConfig(null);
        setNoteText('');
        alert('Saved locally on this device. Backend note route is still returning 404.');
        return;
      }
      console.error('Failed to save note:', err?.response?.data || err.message);
      alert('Failed to save note: ' + (err?.response?.data?.message || err.message));
    } finally {
      invalidateProfile(API_ROOT, token);
      setIsSubmittingNote(false);
    }
  };

  // Load user's existing bible notes on login
  useEffect(() => {
    if ((!isOpen && !presentationActive) || !isLogin || !user_id) return;
    let cancelled = false;
    setVerseNotes(readLocalBibleNotes());
    const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
    if (!token) return;
    // Fetch user's notes and index by verseId for O(1) lookup
    readTabResource(tabReadKey(`${API_ROOT}/users/my-notes`, token), signal =>
      getUsersWithFallback('my-notes', { headers: { Authorization: `Bearer ${token}` }, signal }).then(response => response.data))
      .then(data => {
        if (cancelled) return;
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
        if (!cancelled) setVerseNotes(readLocalBibleNotes());
      });
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, isLogin, user_id]);

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
        const avdIndex = await getLocalBibleIndex('AVD');
        if (avdIndex) {
          list = avdIndex.versesMap.get(`${hit.bookName}_${parseInt(hit.chapter)}`) || [];
        }
      }

      if (!list.length) return;
      const idx = list.findIndex((v) => v.verseNumber === hit.verseNumber);

      // Keep Book & Chapter picker states in sync
      const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
      if (book) {
        setBibleModalBook(book);
        setBibleModalChapter(hit.chapter);
      }

      onPresent({
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
            onPresent({
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
    isSearchingBible,
    showBibleSearchBar, setShowBibleSearchBar,
    bibleModalBooks, setBibleModalBooks,
    bibleModalBook, setBibleModalBook,
    bibleModalChapters, setBibleModalChapters,
    bibleModalChapter, setBibleModalChapter,
    bibleModalVerses, setBibleModalVerses,
    bibleSelectedVerseIds, setBibleSelectedVerseIds,
    aiAnalysis, setAiAnalysis, showAiOptions, setShowAiOptions,
    bibleVerseFontSize, setBibleVerseFontSize,
    bibleAddedSuccess,
    bibleModalBrowseLoading,
    biblePickerOpen, setBiblePickerOpen,
    bibleBookPickerRef, bibleChapterPickerRef,
    isSavingBible,
    bibleVerseSpacing, handleSetBibleVerseSpacing,
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
    viewNoteConfig, setViewNoteConfig,
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
