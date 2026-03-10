'use client';
import React, { useState, useContext } from 'react';
import { transposeScale, transposeChords, transposeLyrics } from '../utils/musicUtils';
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../loading';
import Portal from '../Portal/Portal';
import Metronome from '../Metronome/page';
import { UserContext } from '../context/User_Context';
import { Music, Calendar, Star, Gift, Sparkles, PlayCircle, PlusCircle, Trash2, X, Heart, GraduationCap, FolderPlus, Check, Edit2, Search, FileText, Monitor, Guitar, Eye, EyeOff, Radio, ExternalLink, Tv2, Mic, MicOff } from 'lucide-react';
import { HymnsContext } from '../context/Hymns_Context';
import { useLanguage } from "../context/LanguageContext";
import { useEffect } from "react";
import { Virtuoso } from "react-virtuoso";
import { usePresentation } from '../hooks/usePresentation';



export default function Category_Humns() {
  const queryClient = useQueryClient();
  const { isLogin, UserRole, vocalsMode } = useContext(UserContext);
  const { addToWorkspace, isHymnInWorkspace } = useContext(HymnsContext)
  const { t, language, setLanguage } = useLanguage();


  // Re-introduced for Role checks
  const [activeTab, setActiveTab] = useState('all');



  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [formData, setFormData] = useState({ title: '', lyrics: '', scale: '', relatedChords: '', link: '', party: 'All', BPM: '', timeSignature: '2/2' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingHymnId, setEditingHymnId] = useState(null); // Track which hymn is being edited

  // Lyrics Modal State
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
  const [lyricsTheme, setLyricsTheme] = useState('main');
  const [fontSize, setFontSize] = useState(18);
  const [showChords, setShowChords] = useState(true); // Toggle for chords visibility

  //Data Show
  const [showDataShow, setShowDataShow] = useState(false);
  const [dataShowIndex, setDataShowIndex] = useState(0);

  // ── Live Presentation (Socket.io) ──────────────────────────────────
  const [dataShowId, setDataShowId] = useState('');
  const [dataShowIdInput, setDataShowIdInput] = useState('');
  const [showSessionPanel, setShowSessionPanel] = useState(false);

  useEffect(() => {
    const savedSession = localStorage.getItem('myLivePresentationId');
    if (savedSession) {
      const checkSession = async () => {
        try {
          const BASE_URL = "https://worship-team-api.onrender.com/api";
          const response = await axios.get(`${BASE_URL}/presentation/check/${encodeURIComponent(savedSession)}`);
          if (response.data.exists) {
            setDataShowId(savedSession);
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

    try {
      const BASE_URL = "https://worship-team-api.onrender.com/api";
      const response = await axios.post(`${BASE_URL}/presentation/create`, { dataShowId: id });
      if (response.data.success) {
        setDataShowId(id);
        localStorage.setItem('myLivePresentationId', id);
        setShowSessionPanel(false);
      }
    } catch (error) {
      alert(error.response?.data?.error || "Failed to create session");
    }
  };

  const handleJoinSession = async () => {
    const id = dataShowIdInput.trim();
    if (!id) return;

    try {
      const BASE_URL = "https://worship-team-api.onrender.com/api";
      const response = await axios.get(`${BASE_URL}/presentation/check/${encodeURIComponent(id)}`);
      if (response.data.exists) {
        window.open(`/presentation/display?dataShowId=${encodeURIComponent(id)}`, '_blank');
        setShowSessionPanel(false);
      } else {
        alert("Presentation room does not exist or has expired.");
      }
    } catch (error) {
      alert("Failed to join session: could not connect to server");
    }
  };
  // ──────────────────────────────────────────────────────────────────

  const lyricsInputRef = React.useRef(null); // Ref for the lyrics textarea



  const dataShowSlides = React.useMemo(() => {
    if (!selectedLyricsHymn?.lyrics) return [];

    // Use transposed lyrics if transposeStep exists
    const lyricsToUse = selectedLyricsHymn.transposeStep
      ? transposeLyrics(selectedLyricsHymn.lyrics, selectedLyricsHymn.transposeStep)
      : selectedLyricsHymn.lyrics;

    return lyricsToUse
      .replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
      .split('\n\n')
      .map(b => b.trim())
      .filter(Boolean);
  }, [selectedLyricsHymn?.lyrics, selectedLyricsHymn?.transposeStep, showChords]);

  //Data show Swipe - Native Touch Events (No Library)
  useEffect(() => {
    if (!showDataShow) return;

    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;
    let elementRef = null;

    const handleKey = (e) => {
      // الشمال = التالي (LTR: Left = Next)
      if (e.key === 'ArrowLeft' && dataShowIndex < dataShowSlides.length - 1) {
        setDataShowIndex(i => i + 1);
      }

      // اليمين = السابق (LTR: Right = Previous)
      if (e.key === 'ArrowRight' && dataShowIndex > 0) {
        setDataShowIndex(i => i - 1);
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
      const element = document.getElementById('showDataContainer');
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

  // Robust broadcast sync: whenever session connects or hymn/lyrics change while presentation is open
  useEffect(() => {
    if (showDataShow && dataShowId && selectedLyricsHymn && isConnected) {
      const lyricsToUse = selectedLyricsHymn.transposeStep
        ? transposeLyrics(selectedLyricsHymn.lyrics, selectedLyricsHymn.transposeStep)
        : (selectedLyricsHymn.lyrics || '');

      const slides = lyricsToUse
        .replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
        .split('\n\n')
        .map(b => b.trim())
        .filter(Boolean);

      broadcastHymn(selectedLyricsHymn, slides);
      broadcastSlide(dataShowIndex);
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

  const openLyrics = (hymn, transposeStep = 0) => {
    setSelectedLyricsHymn({ ...hymn, transposeStep });
    setLyricsTheme('main');
    setShowChords(vocalsMode ? false : true);
    setShowLyricsModal(true);
  };

  // Open presentation mode directly
  const openPresentation = (hymn, transposeStep = 0) => {
    setSelectedLyricsHymn({ ...hymn, transposeStep });
    setShowChords(vocalsMode ? false : true);
    setShowDataShow(true);
    setDataShowIndex(0);
  };

  const closeLyricsModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowLyricsModal(false);
      setSelectedLyricsHymn(null);
      setIsClosing(false);
    }, 300);
  };

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

  // 1. Fetch Hymns
  const fetchHymns = async ({ pageParam = 0 }) => {
    // If search is active, use search endpoint (No pagination for search currently)
    if (debouncedSearch.trim()) {
      try {
        const { data } = await axios.get(
          `https://worship-team-api.onrender.com/api/hymns/search?q=${encodeURIComponent(debouncedSearch)}`
        );
        return data;
      } catch (error) {
        console.error("Error searching hymns:", error);
        return [];
      }
    }

    // Otherwise, fetch by category with pagination
    const baseUrl = "https://worship-team-api.onrender.com/api/hymns";
    let endpoint = "";

    switch (activeTab) {
      case 'christmass': endpoint = "/christmass"; break;
      case 'easter': endpoint = "/easter"; break;
      case 'newyear': endpoint = "/newyear"; break;
      case 'motherday': endpoint = "/motherday"; break;
      case 'graduation': endpoint = "/graduation"; break;
      default: endpoint = ""; break;
    }

    const url = `${baseUrl}${endpoint}?skip=${pageParam}&limit=10`;

    try {
      const { data } = await axios.get(url);
      console.log(`📊 Fetched page with skip=${pageParam}, got ${data.length} items`);
      return data;
    } catch (error) {
      console.error("Error fetching hymns:", error);
      return [];
    }
  };

  // 2. Add Hymn (Post)
  const add_Hymn = async () => {
    if (!isLogin) return;
    setIsSubmitting(true);
    try {
      // User: Replace this URL with your actual Create/Post API endpoint
      const url = "https://worship-team-api.onrender.com/api/hymns/create";

      await axios.post(url, formData, { //formData is req.body
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      queryClient.invalidateQueries(["humns"]);
      closeModal();
      setFormData({ title: '', lyrics: '', scale: '', relatedChords: '', link: '', BPM: '', timeSignature: '2/2', party: 'All' });
    } catch (error) {
      console.error("Error adding hymn:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Edit Hymn (Patch)
  const edit_Hymn = async (id) => {
    if (!isLogin) return;
    setIsSubmitting(true);
    try {
      const url = `https://worship-team-api.onrender.com/api/hymns/${id}`;

      await axios.patch(url, formData, { //formData is req.body
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      queryClient.invalidateQueries(["humns"]);
      closeModal();
      setFormData({ title: '', lyrics: '', scale: '', relatedChords: '', link: '', party: 'All', BPM: '', timeSignature: '2/2' });
      setEditingHymnId(null);
    } catch (error) {
      console.error("Error editing hymn:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Delete Hymn by ID
  const delete_Hymn = async (id) => {
    if (!isLogin) return;
    if (!confirm(t("confirmDeleteHymn"))) return;

    try {
      // User: Replace this URL with your actual Delete API endpoint
      const url = `https://worship-team-api.onrender.com/api/hymns/${id}`;

      await axios.delete(url, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      queryClient.invalidateQueries(["humns"]);
    } catch (error) {
      console.error("Error deleting hymn:", error);
    }
  };

  // All data
  // All data
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ["humns", activeTab, debouncedSearch],
    queryFn: fetchHymns,
    getNextPageParam: (lastPage, allPages) => {
      // 1. If search is active, no pagination
      if (debouncedSearch.trim()) return undefined;

      // 2. If last page is empty or has less than 10 items, we've reached the end
      // This works because backend always tries to return 10 items if available
      const hasMore = lastPage && lastPage.length === 10;
      console.log(`🔍 getNextPageParam: lastPage has ${lastPage?.length || 0} items, hasMore=${hasMore}`);

      if (!hasMore) {
        console.log('✅ End of data reached!');
        return undefined;
      }

      // 3. Otherwise, calculate next skip value
      const nextSkip = allPages.length * 10;
      console.log(`➡️ Loading next page with skip=${nextSkip}`);
      return nextSkip;
    },
    initialPageParam: 0,
  });

  // السطر القديم: const humns = data ? data.pages.flat() : [];

  // السطر الجديد (بيشيل أي عنصر متكرر بناءً على الـ _id):
  const humns = data
    ? Array.from(new Map(data.pages.flat().map(item => [item._id, item])).values())
    : [];

  // Infinite Scroll Trigger is now handled by Virtuoso's endReached prop
  ///////////////////////////////// API proccess end here /////////////////////////////

  // --- Modal Helpers ---//
  const openModal = () => {
    // Pre-fill party based on active tab if specific
    setFormData(prev => ({
      ...prev,
      party: activeTab === 'all' ? 'all' :
        activeTab === 'christmass' ? 'christmass' :
          activeTab === 'easter' ? 'easter' :
            activeTab === 'newyear' ? 'newyear' :
              activeTab === 'motherday' ? 'motherday' :
                activeTab === 'graduation' ? 'graduation' : 'all'
    }));
    setEditingHymnId(null); // Reset editing mode
    setShowModal(true);
  };

  const openEditModal = (hymn) => {
    // Pre-fill form with hymn data for editing
    setFormData({
      title: hymn.title || '',
      lyrics: hymn.lyrics || '',
      scale: hymn.scale || '',
      relatedChords: hymn.relatedChords || '',
      link: hymn.link || '',
      party: hymn.party || 'All',
      BPM: hymn.BPM || '',
      timeSignature: hymn.timeSignature || '2/2'
    });
    setEditingHymnId(hymn._id); // Set the ID of the hymn being edited
    setShowModal(true);
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
    }, 300);
  };

  const categories = [
    { id: 'all', label: t("AllHymns"), icon: Music },
    { id: 'christmass', label: t("Christmas"), icon: Gift },
    { id: 'easter', label: t("Easter"), icon: Star },
    { id: 'newyear', label: t("NewYear"), icon: Sparkles },
    { id: 'motherday', label: t("MothersDay"), icon: Heart },
    { id: 'graduation', label: t("Graduation"), icon: GraduationCap },
  ];

  // Helper to check permission
  const canEdit = UserRole === 'ADMIN' || UserRole === 'MANEGER' || UserRole === 'PROGRAMER';

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



  const renderLyricsWithChords = (text) => {
    if (!text) return null;

    const currentTheme = lyricsThemes[lyricsTheme];

    return text.split('\n').map((line, i) => (
      <div
        key={i}
        className={`relative w-full text-center ${showChords && line.includes('[') ? 'mt-8 mb-2' : 'my-2'}`}
        style={{ fontSize: `${fontSize}px`, minHeight: '1.5em' }}
        dir="rtl"
      >
        <div className="flex flex-wrap justify-center items-baseline leading-relaxed tracking-wide">
          {line ? line.split(/(\[.*?\])/g).map((part, j) => {
            if (part.startsWith('[') && part.endsWith(']')) {
              if (!showChords) return null;
              const chord = part.slice(1, -1);
              const transposedChord = selectedLyricsHymn.transposeStep
                ? transposeChords(chord, selectedLyricsHymn.transposeStep)
                : chord;

              return (
                <span key={j} className="inline-block relative overflow-visible mx-1 align-baseline">
                  {/* Invisible placeholder for width consistency */}
                  <span className="invisible whitespace-nowrap" style={{ fontSize: '0.7em' }} dir="ltr">
                    {transposedChord}
                  </span>
                  <span
                    className="absolute bottom-full left-1/2 -translate-x-1/2 font-bold whitespace-nowrap mb-1 transition-colors duration-300"
                    style={{
                      color: currentTheme.chord,
                      fontSize: `0.7em`,
                    }}
                    dir="ltr"
                  >
                    {transposedChord}
                  </span>
                </span>
              );
            }
            return (
              <span key={j} className="whitespace-pre transition-colors duration-300" style={{ color: currentTheme.text }}>
                {part}
              </span>
            );
          }) : <div className="h-4" />}
        </div>
      </div>
    ));
  };

  const renderPresentationSlideWithChords = (text) => {
    if (!text) return null;

    return text.split('\n').map((line, i) => (
      <div
        key={i}
        className={`relative w-full text-center flex flex-col items-center justify-center ${showChords && line.includes('[') ? 'mt-[1.5em] mb-4' : 'my-4'}`}
        style={{ fontSize: 'clamp(32px, 8vw, 68px)', lineHeight: '1.4' }}
        dir="rtl"
      >
        <div className="flex flex-wrap justify-center items-end">
          {line ? line.split(/(\[.*?\])/g).map((part, j) => {
            if (part.startsWith('[') && part.endsWith(']')) {
              if (!showChords) return null;
              const chord = part.slice(1, -1);
              return (
                <span key={j} className="inline-block relative h-0 w-0 overflow-visible mx-[0.2em] align-baseline">
                  <span
                    className="absolute bottom-[0.8em] left-1/2 -translate-x-1/2 font-black whitespace-nowrap text-sky-300 pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                    style={{ fontSize: '0.65em' }}
                    dir="ltr"
                  >
                    {chord}
                  </span>
                </span>
              );
            }
            return <span key={j} className="text-white font-bold whitespace-pre drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] select-none tracking-tight">{part}</span>;
          }) : <div className="h-8" />}
        </div>
      </div>
    ));
  };


  return (<section id="Category_Humns" className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-10 relative overflow-hidden">
    {/* Background Gradients */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />

    <div className="relative z-10 max-w-7xl mx-auto">


      {/* Search Section - Centered under Title */}
      <div className="mb-8 flex items-center justify-center gap-3 relative z-20 h-12">
        {/* Search Toggle (Icon Only) */}
        <button
          onClick={() => {
            setShowSearchBar(!showSearchBar);
            if (showSearchBar) {
              setSearch(''); // Clear search when closing
            }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 border backdrop-blur-xl relative overflow-hidden group shadow-lg z-30
                 ${showSearchBar
              ? 'bg-red-500/10 border-red-500/20 text-red-400 rotate-90 scale-90'
              : 'bg-white/5 border-white/20 text-sky-200 hover:bg-white/10 hover:text-white hover:border-sky-400/30 hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]'
            }`}
          title={showSearchBar ? "Close Search" : "Search Hymns"}
        >
          {showSearchBar ? (
            <X className="w-5 h-5" />
          ) : (
            <Search className="w-5 h-5" />
          )}
        </button>

        {/* Modern Side-by-Side Glass Input */}
        <AnimatePresence>
          {showSearchBar && (
            <motion.div
              initial={{ opacity: 0, width: 0, scale: 0.9 }}
              animate={{ opacity: 1, width: '250px', scale: 1 }}
              exit={{ opacity: 0, width: 0, scale: 0.9 }}
              transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 25 }}
              className="overflow-hidden flex items-center"
            >
              <div className="relative w-full h-10">
                <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl shadow-inner" />

                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full h-full pl-4 pr-8 py-2 bg-transparent text-sm text-white placeholder-gray-400/70 
                                outline-none relative z-10 font-light tracking-wide"
                  autoFocus
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Categories Tabs */}
      {
        showSearchBar ?
          (null) :
          <div className="flex flex-wrap justify-center gap-4 mb-8">
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
        <div className="relative">
          <button
            onClick={() => setShowSessionPanel(p => !p)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all font-semibold text-sm border
                  ${isConnected
                ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
          >
            <Radio className={`w-4 h-4 ${isConnected ? 'animate-pulse' : ''}`} />
            {isConnected ? (
              <><span className="text-[10px] text-green-500 font-black uppercase tracking-widest">● LIVE</span> · {dataShowId}</>
            ) : 'Live Session'}
          </button>

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
                    className="flex-1 sm:flex-none px-4 py-2 bg-sky-500 hover:bg-sky-400 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                  >
                    Create
                  </button>
                  <button
                    onClick={handleJoinSession}
                    className="flex-1 sm:flex-none px-4 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                  >
                    Join
                  </button>
                </div>
              </div>
              {dataShowId && (
                <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
                  <a
                    href={`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/20 transition-all flex-1"
                  >
                    <Tv2 size={13} /> Open Display Window
                  </a>
                  <a
                    href={`/presentation/remote?dataShowId=${encodeURIComponent(dataShowId)}`}
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
      {isLoading ? (
        <Loading />
      ) : (
        <div className="relative">
          {/* Table Header - Hidden on small mobile for cleaner look */}
          {/* Table Header - Hidden on small mobile for cleaner look */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest bg-white/5 rounded-t-2xl border-b border-white/10 mx-2">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-11 sm:col-span-5 md:col-span-5">{t("songTitle")}</div>
            <div className="col-span-2 text-center bg-white/5 rounded-lg py-1">{t("keyChords")}</div>
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
                  if (hasNextPage && !isFetchingNextPage && !debouncedSearch.trim()) {
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
                    />
                  </div>
                )}
                components={{
                  Footer: () => (
                    <div className="py-8 flex justify-center w-full flex-col items-center">
                      {isFetchingNextPage && (
                        <div className="w-8 h-8 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mb-4" />
                      )}
                      {!hasNextPage && humns.length > 0 && !debouncedSearch.trim() && (
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
            <div className="p-20 text-center flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed mt-2 mb-20">
              <Music className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">{t("NoHymnsfoundinthiscategory")}</p>
            </div>
          )}

          {/* --- Add Hymn Modal --- */}
          {showModal && (
            <Portal>
              <div
                className={`fixed inset-0 z-[9999] flex justify-center items-center p-4 transition-all duration-300
                ${isClosing ? "opacity-0 backdrop-blur-sm" : "opacity-100 backdrop-blur-md bg-black/70"}`}
              >
                <div
                  className={`w-full max-w-md max-h-[90vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative transform transition-all duration-300
                  ${isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
                  data-lenis-prevent-wheel
                >
                  {/* Header */}
                  <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
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

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-gray-400 text-sm">{t("lyrics")}</label>
                        {/* Chord Toolbar */}
                        {formData.relatedChords && (
                          <div className="flex gap-1.5 flex-wrap justify-end max-w-[70%]">
                            {formData.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  const input = lyricsInputRef.current;
                                  if (input) {
                                    const start = input.selectionStart;
                                    const end = input.selectionEnd;
                                    const text = input.value;
                                    const newText = text.substring(0, start) + `[${chord}]` + text.substring(end);
                                    setFormData({ ...formData, lyrics: newText });

                                    // Restore cursor position + move it after insertion
                                    setTimeout(() => {
                                      input.selectionStart = input.selectionEnd = start + chord.length + 2;
                                      input.focus();
                                    }, 0);
                                  }
                                }}
                                className="text-xs font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/40 hover:text-white transition-colors"
                                title={`Insert [${chord}]`}
                              >
                                {chord}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <textarea
                        ref={lyricsInputRef}
                        dir="rtl"  // ⬅️ ضيفنا دي عشان العربي يظهر صح بالأقواس
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition min-h-[150px] resize-y whitespace-pre-wrap" // ⬅️ ضيفنا whitespace-pre-wrap
                        placeholder="e.g. Amazing Grace"
                        value={formData.lyrics}
                        onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
                      />
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
                        <select
                          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition [&>option]:bg-gray-900"
                          value={formData.party}
                          onChange={(e) => setFormData({ ...formData, party: e.target.value })}
                        >
                          <option value="all">{t("allGeneral")}</option>
                          <option value="christmass">{t("christmas")}</option>
                          <option value="easter">{t("easter")}</option>
                          <option value="newyear">{t("newYear")}</option>
                          <option value="motherday">{t("motherDay")}</option>
                          <option value="graduation">{t("graduation")}</option>
                        </select>
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
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition placeholder-gray-600"
                        placeholder="e.g. G, C, D, Em"
                        value={formData.relatedChords}
                        onChange={(e) => setFormData({ ...formData, relatedChords: e.target.value })}
                      />
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
                      disabled={isSubmitting || !formData.title}
                      className={`mt-4 w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all
                      ${isSubmitting
                          ? 'bg-gray-600 cursor-not-allowed'
                          : editingHymnId
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 hover:shadow-blue-500/25'
                            : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
                    >
                      {isSubmitting ? (editingHymnId ? t("updating") : t("adding")) : (editingHymnId ? t("updateSong") : t("addSong"))}
                    </button>
                  </div>

                </div>
              </div>
            </Portal>
          )}

          {/* --- Lyrics Modal --- */}
          {showLyricsModal && selectedLyricsHymn && (
            <Portal>
              <div
                className={`fixed inset-0 z-[9999] flex justify-center items-end sm:items-center transition-all duration-300
                ${isClosing ? "opacity-0 backdrop-blur-sm" : "opacity-100 backdrop-blur-md bg-black/60"}`}
              >
                <motion.div
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0 }}
                  style={{
                    backgroundColor: lyricsThemes[lyricsTheme].bg,
                    boxShadow: lyricsTheme === 'warm' ? '0 10px 40px rgba(139, 94, 60, 0.15)' : '0 10px 40px rgba(0, 0, 0, 0.5)'
                  }}
                  className={`w-full sm:max-w-3xl h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-[2.5rem] flex flex-col relative transition-colors duration-500 overflow-hidden`}
                >
                  {/* Decorative Pull Bar for Mobile */}
                  <div className="sm:hidden w-12 h-1.5 bg-gray-400/20 rounded-full mx-auto mt-4 mb-2 shrink-0" />

                  {/* Header Content */}
                  <div className={`px-6 py-4 flex flex-col gap-4 border-b shrink-0 transition-colors duration-300
                      ${lyricsTheme === 'warm' ? 'border-amber-900/10' : 'border-white/5'}`}>

                    <div className="flex justify-between items-center gap-4">
                      <div className="flex flex-col min-w-0">
                        <h2 className={`text-2xl sm:text-3xl font-bold truncate tracking-tight transition-colors duration-300 ${lyricsTheme === 'warm' ? 'text-[#1A1A1A]' : 'text-white'}`}>
                          {selectedLyricsHymn.title}
                        </h2>
                        <div className={`text-xs uppercase tracking-[0.2em] font-bold opacity-50 ${lyricsTheme === 'warm' ? 'text-gray-500' : 'text-sky-400'}`}>
                          Lyrics & Chords
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setShowDataShow(true);
                            setDataShowIndex(0);
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

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {/* Chords Toggle */}
                        <button
                          onClick={() => setShowChords(!showChords)}
                          disabled={vocalsMode}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${vocalsMode ? 'hidden' : ''}
                              ${showChords
                              ? (lyricsTheme === 'warm' ? 'bg-black text-white border-black' : 'bg-sky-500 text-white border-sky-500')
                              : (lyricsTheme === 'warm' ? 'bg-transparent text-black/50 border-black/20' : 'bg-transparent text-white/30 border-white/10')
                            }`}
                        >
                          {showChords ? <Guitar className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          {showChords ? "Chords On" : "Chords Off"}
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
                              <motion.div layoutId="activeTheme" className="absolute inset-0 rounded-lg border-2 border-sky-400/20" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-10 py-10" data-lenis-prevent-wheel>
                    <div
                      className="w-full max-w-2xl mx-auto transition-all duration-500"
                      dir="rtl"
                    >
                      {renderLyricsWithChords(selectedLyricsHymn.lyrics)}
                    </div>
                    {/* Extra spacing at bottom for better scrolling feel */}
                    <div className="h-20" />
                  </div>

                  {/* Aesthetic Footer Gradient */}
                  <div className={`absolute bottom-0 left-0 right-0 h-12 pointer-events-none transition-colors duration-500
                    ${lyricsTheme === 'warm'
                      ? 'bg-linear-to-t from-[#FDFBF7] to-transparent'
                      : lyricsTheme === 'dark'
                        ? 'bg-linear-to-t from-[#0F172A] to-transparent'
                        : 'bg-linear-to-t from-[#0E2238] to-transparent'
                    }`}
                  />
                </motion.div>
              </div>
            </Portal>
          )}

          {/* --- Data Show (Presentation) Modal - Independent --- */}
          {showDataShow && selectedLyricsHymn && (
            <Portal>
              <div
                id="showDataContainer"
                className="fixed inset-0 z-[10000] bg-black flex items-center justify-center"
              >

                {/* Exit Button */}
                <button
                  onClick={() => setShowDataShow(false)}
                  className="absolute top-6 right-6 text-white/60 hover:text-white transition-all hover:scale-110 z-10 p-2 rounded-full hover:bg-white/10"
                >
                  <X size={32} />
                </button>

                {/* Counter */}
                <div className="absolute bottom-6 text-white/50 text-sm font-mono z-10">
                  {dataShowSlides.length} / {dataShowIndex + 1}
                </div>

                {/* Navigation Arrows - LTR: Left=Next, Right=Previous */}
                {dataShowIndex < dataShowSlides.length - 1 && (
                  <button
                    onClick={() => setDataShowIndex(i => i + 1)}
                    className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-all hover:scale-125 z-10 p-3 rounded-full hover:bg-white/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </button>
                )}
                {dataShowIndex > 0 && (
                  <button
                    onClick={() => setDataShowIndex(i => i - 1)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-all hover:scale-125 z-10 p-3 rounded-full hover:bg-white/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                )}

                {/* Swipe Indicator (Mobile) */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/30 text-xs flex items-center gap-2 sm:hidden">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                  <span>Swipe to navigate</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-180"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </div>

                {/* Slide with Fade */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={dataShowIndex}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.1, ease: "easeInOut" }}
                    className="w-full h-full flex flex-col items-center justify-center px-10 text-center"
                  >
                    {renderPresentationSlideWithChords(dataShowSlides[dataShowIndex])}
                  </motion.div>
                </AnimatePresence>

              </div>
            </Portal>
          )}
        </div>
      )}
    </div>

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

function HymnItem({ humn, index, categories, addToWorkspace, isHymnInWorkspace, canEdit, delete_Hymn, openEditModal, variants, t, openLyrics, openPresentation, vocalsMode }) {
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
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-500/5 via-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {vocalsMode && (
        <button
          onClick={() => openPresentation(humn, transposeStep)}
          className="absolute bottom-3 right-3 sm:hidden p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/50 transition-all z-30 backdrop-blur-md shadow-lg shadow-purple-500/10 active:scale-95"
          title="Open Presentation Mode"
        >
          <Monitor className="w-5 h-5 text-purple-300" />
        </button>
      )}

      {/* Index */}
      <div className="col-span-1 sm:col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
        {(index + 1).toString().padStart(2, '0')}
      </div>

      {/* BPM and Time Signature Display */}
      {(humn.BPM || humn.timeSignature) && (
        <div className={`absolute lg:top-1 top-2 right-2 flex items-center gap-2 bg-black/40 pr-3 pl-1 py-0.5 rounded-full border border-white/5 z-20 backdrop-blur-sm transition-opacity ${vocalsMode ? 'opacity-0 pointer-events-none' : ''}`}>
          {humn.BPM && <Metronome id={humn._id} bpm={humn.BPM} timeSignature={humn.timeSignature || "4/4"} minimal={true} />}
          <div className="flex gap-2 text-[10px] font-mono text-gray-500">
            {humn.BPM && <span>{humn.BPM} bpm</span>}
            {humn.BPM && humn.timeSignature && <span className="text-gray-600">|</span>}
            {humn.timeSignature && <span>{humn.timeSignature}</span>}
          </div>
        </div>
      )}

      {/* Song Title */}
      <div className="col-span-11 sm:col-span-5 md:col-span-5 relative z-10 flex items-center gap-2  py-4">
        {(() => {
          const matchedCat = categories.find(c => c.id === humn.party) || { icon: Music };
          const CatIcon = matchedCat.icon;
          return (
            <CatIcon
              className="w-4 h-4 text-gray-500 group-hover:text-sky-300 transition-colors shrink-0"
              title={matchedCat.label}
            />
          );
        })()}
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

        {canEdit && (
          <>
            <button
              onClick={() => delete_Hymn(humn._id)}
              className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all bg-white/5 sm:bg-transparent flex-1 sm:flex-none flex justify-center"
              title={t("deleteSong")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
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

        {humn.link && (
          <a
            href={humn.link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
          >
            <PlayCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">{t("listen")}</span>
          </a>
        )}

        {humn.lyrics && (
          <>
            <button
              onClick={() => openLyrics(humn, transposeStep)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">{t("lyrics")}</span>
            </button>

            {/* Presentation Button - Icon Only, Visible in Vocal Mode (Desktop Only) */}
            {vocalsMode && (
              <button
                onClick={() => openPresentation(humn, transposeStep)}
                className="hidden sm:flex p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/50 transition-all group-hover:shadow-lg group-hover:shadow-purple-500/10"
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
