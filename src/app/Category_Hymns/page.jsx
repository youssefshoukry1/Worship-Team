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
import { Music, Star, Gift, Sparkles, PlayCircle, PlusCircle, Trash2, X, GraduationCap, FolderPlus, Check, Edit2, Search, FileText, Monitor, Guitar, Eye, EyeOff, Radio, ExternalLink, Tv2, Mic, MicOff, BookOpen, ChevronDown, ChevronRight, Heart, Loader2, Copy, Share2, ClipboardCheck, Moon, RotateCcw, ZoomOut, ZoomIn, Cross, User } from 'lucide-react';
import { HymnsContext } from '../context/Hymns_Context';
import { useLanguage } from "../context/LanguageContext";
import { showToast } from '../components/ToastContainer';
import { Virtuoso } from "react-virtuoso";
import { usePresentation } from '../hooks/usePresentation';
import { getApiBaseUrl } from '../utils/apiBase';
import { useRouter } from 'next/navigation';
import { isApp } from '../utils/ReactQueryProvider';
import StanzaSlideControls from '../components/StanzaSlideControls';
import {
  buildHymnPresentationSlides,
  normalizeStanzaForEdit,
  prepareLyricsForSave,
  sanitizeSlideBreaks,
} from '../utils/hymnSlides';
import { useCategoryHymnsTour } from './Tour/useCategoryHymnsTour';
import { BibleForm, useBibleForm } from './bible_form/page';
import Pray from '../normal_UserProfile/Pray';


const API_ROOT = getApiBaseUrl();

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

  // Initialize the hymns offline cache on startup
  useEffect(() => {
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

  const [showBibleModal, setShowBibleModal] = useState(false);
  const [showPrayModal, setShowPrayModal] = useState(false);
  const [prayProfile, setPrayProfile] = useState({ prayTime: [] });

  const updatePrayProfileState = (modifier) => {
    setPrayProfile((previous) => {
      const updatedProfile = typeof modifier === 'function' ? modifier(previous) : modifier;
      if (updatedProfile && user_id) {
        import('localforage').then(({ default: localforage }) => {
          localforage.setItem(`profile_data_${user_id}`, updatedProfile).catch(console.error);
        });
      }
      return updatedProfile;
    });
  };

  useEffect(() => {
    if (!showPrayModal || !isLogin || !user_id) return;

    let ignore = false;
    const loadPrayProfile = async () => {
      const localforage = (await import('localforage')).default;
      const cacheKey = `profile_data_${user_id}`;
      const cachedData = await localforage.getItem(cacheKey);
      if (cachedData && !ignore) setPrayProfile(cachedData);

      try {
        const response = await fetch(`${API_ROOT}/users/my-profile`, {
          headers: { Authorization: `Bearer ${isLogin}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (ignore) return;
        updatePrayProfileState({
          user: data.user,
          bibleNotes: data.user?.bibleNotes?.sort((a, b) => new Date(b.date) - new Date(a.date)) || [],
          bibleHighlights: data.user?.bibleHighlights?.sort((a, b) => new Date(b.date) - new Date(a.date)) || [],
          prayTime: data.user?.prayTime?.sort((a, b) => new Date(b.date) - new Date(a.date)) || [],
        });
      } catch (error) {
        if (!cachedData) console.error('Error fetching prayer profile:', error);
      }
    };

    loadPrayProfile();
    return () => { ignore = true; };
  }, [showPrayModal, isLogin, user_id]);

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
    const isAnyModalOpen = showModal || showLyricsModal || showDataShow || showBibleModal || showPrayModal;

    const overflowValue = isAnyModalOpen ? 'hidden' : '';

    document.body.style.overflow = overflowValue;
    document.documentElement.style.overflow = overflowValue;

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [showModal, showLyricsModal, showDataShow, showBibleModal, showPrayModal]);

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

  const bibleController = useBibleForm({
    isOpen: showBibleModal,
    presentationActive: showDataShow && desktopSearchType === 'bible',
    onClose: () => setShowBibleModal(false),
    onPresent: openBiblePresentation,
  });
  const {
    bibleSearchQuery,
    setBibleSearchQuery,
    bibleSearchResults,
    setBibleSearchResults,
    bibleModalBooks,
    bibleModalBook,
    setBibleModalBook,
    bibleModalChapters,
    bibleModalChapter,
    setBibleModalChapter,
    bibleModalVerses,
    biblePickerOpen,
    setBiblePickerOpen,
    presentBibleFromSearchHit,
    setNoteModalConfig,
  } = bibleController;

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

  const hymnCategories = [
    { id: 'all', label: t("AllHymns"), icon: Music },
    { id: 'christmas', label: t("Christmas"), icon: Gift },
    { id: 'prayer_times', label: t("PrayerTimes"), icon: Star },
    { id: 'praise', label: t("Praise"), icon: Sparkles },
    { id: 'cross', label: t("Cross"), icon: Cross },
    { id: 'kids', label: t("Kids"), icon: GraduationCap },
  ];

  const categories = [
    {
      id: 'profile',
      label: language === 'ar' ? 'مساحتي' : language === 'de' ? 'Mein Profil' : 'My Profile',
      icon: User,
      path: '/normal_UserProfile',
    },
    {
      id: 'workspace',
      label: language === 'ar' ? 'مساحة العمل' : language === 'de' ? 'Arbeitsbereich' : 'Workspace',
      icon: Monitor,
      path: '/WorkSpace',
    },
    {
      id: 'pray-form',
      label: language === 'ar' ? 'وقت الصلاة' : language === 'de' ? 'Gebetszeit' : 'Pray Time',
      icon: Heart,
      onClick: () => setShowPrayModal(true),
    },
    {
      id: 'bible-form',
      label: t('bible'),
      icon: BookOpen,
      onClick: () => setShowBibleModal(true),
    },
  ];

  // Helper to check permission
  const canEdit = UserRole === 'LYRICS_ADMIN' || UserRole === 'PROGRAMER';

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
              const isActive = (cat.id === 'bible-form' && showBibleModal) || (cat.id === 'pray-form' && showPrayModal);
              return (
                <button
                  key={cat.id}
                  id={cat.id === 'bible-form' ? 'tour-bible-btn' : undefined}
                  onClick={() => cat.path ? router.push(cat.path) : cat.onClick?.()}
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
                  {cat.path && <ChevronRight className="w-4 h-4 relative z-10 opacity-70" />}
                </button>
              )
            })}
          </div>

      }





      {/* Admin Controls */}
      <div className="flex flex-wrap justify-end items-center gap-3 mb-6">
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
        <div id="tour-live-session" className="relative">
          <div className={`relative p-[1px] rounded-full overflow-hidden transition-all duration-300
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
                      categories={hymnCategories}
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
                          {hymnCategories.map((cat) => {
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


          <BibleForm controller={bibleController} />
          {showPrayModal && (
            <Portal>
              <div
                className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-6 backdrop-blur-md"
                data-lenis-prevent
                onClick={() => setShowPrayModal(false)}
              >
                <div
                  className="relative my-auto w-full max-w-5xl rounded-3xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setShowPrayModal(false)}
                    className="absolute right-3 top-3 z-20 rounded-lg border border-white/10 bg-slate-950/80 p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
                    aria-label="Close prayer form"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <Pray
                    profile={prayProfile}
                    updateProfileState={updatePrayProfileState}
                    userId={user_id}
                    token={isLogin}
                  />
                </div>
              </div>
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
