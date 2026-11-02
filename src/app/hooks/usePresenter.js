'use client';

import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { UserContext } from '../context/User_Context';
import { useLanguage } from '../context/LanguageContext';
import { useBibleForm } from '../bible_form/useBibleForm';
import { usePresentation } from './usePresentation';
import { getApiBaseUrl } from '../utils/apiBase';
import { buildHymnPresentationSlides } from '../utils/hymnSlides';
import { transposeLyrics } from '../utils/musicUtils';
import { selectLocalHymns } from '../utils/hymnSearch';
import { downloadedHymnsQueryOptions } from '../utils/hymnsCache';
import { openLocalDisplay, prepareLocalDisplay } from '../presentation/local/openLocalDisplay';

const API_ROOT = getApiBaseUrl();

// Shared presentation controls keep the Bible reader on its own page.
export function usePresenter({
  selectedLyricsHymn, setSelectedLyricsHymn, showChords, setShowChords,
  allHymns, isBiblePage = false, onCloseBible,
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { vocalsMode } = useContext(UserContext);
  const { t, language } = useLanguage();
  // Presenter visibility and controls.
  const [showDataShow, setShowDataShow] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(true);

  // Desktop presentation search option ('hymns' or 'bible').
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

  // Incremented when the user picks a Bible chapter in the presentation controls
  const [biblePickTick, setBiblePickTick] = useState(0);

  const [showBibleModal, setShowBibleModal] = useState(false);
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
    } catch {
      alert("Failed to join session: could not connect to server");
      setIsJoiningSession(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!showDataShow) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [showDataShow]);

  const LOCAL_CHANNEL = 'taspe_presenter';
  const localDisplayRef = React.useRef(null);
  useEffect(() => prepareLocalDisplay(), []);

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
    if (!showDataShow || !selectedLyricsHymn?.lyrics) return [];

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
    showDataShow,
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
  }, [showDataShow, dataShowIndex, dataShowSlides, selectedLyricsHymn?.title, broadcastLocalSlide]);

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
  }, [vocalsMode, setShowChords]);

  // Keep the local display in sync with the current slide — covers opening a hymn/Bible
  // presentation, toggling chords, transposing and swiping, not only button navigation.
  React.useEffect(() => {
    if (!showDataShow || !dataShowSlides.length) return;
    broadcastLocalSlide(dataShowSlides, dataShowIndex, selectedLyricsHymn?.title);
  }, [showDataShow, dataShowSlides, dataShowIndex, selectedLyricsHymn?.title, broadcastLocalSlide]);

  // Answer the display window's handshake: a freshly opened window misses anything
  // broadcast before it finished loading, so it asks for the current state on mount.
  const localStateRef = React.useRef({});
  localStateRef.current = { showDataShow, dataShowSlides, dataShowIndex, title: selectedLyricsHymn?.title, broadcastLocalSlide };
  React.useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(LOCAL_CHANNEL);
    ch.onmessage = (event) => {
      if (event.data?.type !== 'request-state') return;
      const s = localStateRef.current;
      if (s.showDataShow && s.dataShowSlides.length) {
        s.broadcastLocalSlide(s.dataShowSlides, s.dataShowIndex, s.title);
      }
    };
    return () => ch.close();
  }, []);

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
    handleSetDesktopSearchType('hymns');
    setShowDataShow(true);

    // Open / focus the local display window - Only on desktop/tablet (sm breakpoint)
    if (window.innerWidth >= 640) {
      openLocalDisplay(localDisplayRef);
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
      handleSetDesktopSearchType('bible');
      setShowDataShow(true);
      setShowBibleModal(false);

      if (typeof window !== 'undefined' && window.innerWidth >= 640) {
        openLocalDisplay(localDisplayRef);
      }
    },
    [t, setSelectedLyricsHymn, setShowChords]
  );

  const bibleController = useBibleForm({
    isOpen: isBiblePage || showBibleModal,
    presentationActive: showDataShow && desktopSearchType === 'bible',
    onClose: () => isBiblePage ? onCloseBible?.() : setShowBibleModal(false),
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
  } = bibleController;

  // Automatically load selected Bible verses into presentation slides.
  // Only replaces the slides when Bible is already on screen or the user picked a chapter —
  // restoring the last book/chapter (on open or tab switch) must not overwrite a hymn.
  const handledBiblePickRef = React.useRef(0);
  useEffect(() => {
    if (showDataShow && desktopSearchType === 'bible' && bibleModalBook?.bookName && bibleModalChapter != null && bibleModalVerses.length > 0) {
      const userPicked = biblePickTick !== handledBiblePickRef.current;
      const showingBible = !selectedLyricsHymn || selectedLyricsHymn.isBible;
      if (!userPicked && !showingBible) return;
      handledBiblePickRef.current = biblePickTick;
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
  }, [showDataShow, desktopSearchType, bibleModalBook, bibleModalChapter, bibleModalVerses, selectedLyricsHymn, setSelectedLyricsHymn, biblePickTick, t]);

  // ── Presentation Hymn Search States & Effect ──────────────────────
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [presetSearchResults, setPresetSearchResults] = useState([]);
  const [isSearchingPreset, setIsSearchingPreset] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const query = presetSearchQuery.trim();
    if (!showDataShow || !query) {
      setPresetSearchResults(prev => prev.length ? [] : prev);
      setIsSearchingPreset(false);
      return () => controller.abort();
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingPreset(true);
      try {
        let results;
        if (typeof navigator === 'undefined' || navigator.onLine) {
          try {
            const API_BASE = 'https://worship-team-api.onrender.com/api/hymns';
            const response = await axios.get(`${API_BASE}/search?limit=15&q=${encodeURIComponent(query)}`, { signal: controller.signal });
            if (Array.isArray(response.data)) results = response.data;
          } catch { /* Fall back to the downloaded hymns if online search fails. */ }
        }
        if (!results) {
          const hymns = allHymns ?? await queryClient.fetchQuery(downloadedHymnsQueryOptions);
          results = await selectLocalHymns(hymns, { query, presentation: true, signal: controller.signal });
        }
        if (!controller.signal.aborted) setPresetSearchResults(results);
      } catch (error) {
        if (!controller.signal.aborted) console.error('Presentation search error:', error);
      } finally {
        if (!controller.signal.aborted) setIsSearchingPreset(false);
      }
    }, 400);
    return () => { controller.abort(); clearTimeout(delayDebounceFn); };
  }, [presetSearchQuery, allHymns, showDataShow, queryClient]);

  return {
    bibleModalBook,
    bibleModalBooks,
    bibleModalChapter,
    bibleModalChapters,
    biblePickerOpen,
    bibleSearchQuery,
    bibleSearchResults,
    broadcastLocalSlide,
    clearDisplay,
    dataShowActiveBg,
    dataShowBackgrounds,
    dataShowBlackout,
    dataShowFontScale,
    dataShowId,
    dataShowIdInput,
    dataShowIndex,
    dataShowSlides,
    decreaseFontSize,
    desktopSearchType,
    handleCreateSession,
    handleDeleteBackground,
    handleJoinSession,
    handleReset,
    handleSelectBackground,
    handleSetDesktopSearchType,
    handleUploadBackground,
    increaseFontSize,
    isAudioActive,
    isConnected,
    isCreatingSession,
    isJoiningSession,
    isSearchingPreset,
    localDisplayRef,
    presentBibleFromSearchHit,
    presentationViewport,
    presetSearchQuery,
    presetSearchResults,
    selectedLyricsHymn,
    setBibleModalBook,
    setBibleModalChapter,
    setBiblePickTick,
    setBiblePickerOpen,
    setBibleSearchQuery,
    setBibleSearchResults,
    setDataShowId,
    setDataShowIdInput,
    setDataShowIndex,
    setPresetSearchQuery,
    setPresetSearchResults,
    setSelectedLyricsHymn,
    setSessionExpiresAt,
    setShowBgSelector,
    setShowDataShow,
    setShowQuickSettings,
    showBgSelector,
    showChords,
    showQuickSettings,
    thumbContainerRef,
    toggleAudio,
    toggleBlackout,
    showDataShow,
    showBibleModal,
    setShowBibleModal,
    bibleController,
    openPresentation,
    showSessionPanel,
    setShowSessionPanel,
    sessionExpiresAt
  };
}
