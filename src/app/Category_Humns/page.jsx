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
  const [formData, setFormData] = useState({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', party: ['all'], BPM: '', timeSignature: 'None' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingHymnId, setEditingHymnId] = useState(null); // Track which hymn is being edited

  // Lyrics Modal State
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
  const [lyricsTheme, setLyricsTheme] = useState('main');
  const [fontSize, setFontSize] = useState(18);
  const [showChords, setShowChords] = useState(true); // Toggle for chords visibility
  const lyricsScrollRef = React.useRef(null); // Ref for lyrics scroll container

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

    let lyricsArray = selectedLyricsHymn.lyrics;

    // If lyrics is still a string (legacy), split it
    if (typeof lyricsArray === 'string') {
      const lyricsToUse = selectedLyricsHymn.transposeStep
        ? transposeLyrics(lyricsArray, selectedLyricsHymn.transposeStep)
        : lyricsArray;

      return lyricsToUse
        .replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
        .split('\n\n')
        .map(b => b.trim())
        .filter(Boolean);
    }

    // Handles the new Array of objects format
    if (Array.isArray(lyricsArray)) {
      const lyricsToUse = selectedLyricsHymn.transposeStep
        ? transposeLyrics(lyricsArray, selectedLyricsHymn.transposeStep)
        : lyricsArray;

      const slides = [];
      lyricsToUse.forEach(stanza => {
        // Split the stanza text into blocks by empty lines
        const blocks = stanza.text.split(/\n\s*\n/).filter(b => b.trim() !== '');
        blocks.forEach(block => {
          const text = block.replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '');
          slides.push({ title: stanza.title, type: stanza.type, text });
        });
      });
      return slides;
    }

    return [];

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
      let slides = [];
      if (Array.isArray(selectedLyricsHymn.lyrics)) {
        const lyricsToUse = selectedLyricsHymn.transposeStep
          ? transposeLyrics(selectedLyricsHymn.lyrics, selectedLyricsHymn.transposeStep)
          : selectedLyricsHymn.lyrics;

        lyricsToUse.forEach(stanza => {
          const blocks = stanza.text.split(/\n\s*\n/).filter(b => b.trim() !== '');
          blocks.forEach(block => {
            slides.push({
              title: stanza.title,
              type: stanza.type,
              text: block.replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
            });
          });
        });
      } else {
        const lyricsToUse = selectedLyricsHymn.transposeStep
          ? transposeLyrics(selectedLyricsHymn.lyrics, selectedLyricsHymn.transposeStep)
          : (selectedLyricsHymn.lyrics || '');

        slides = lyricsToUse
          .replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
          .split('\n\n')
          .map(b => b.trim())
          .filter(Boolean);
      }

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
      setFormData({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', BPM: '', timeSignature: 'None', party: ['all'] });
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
      setFormData({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', party: ['all'], BPM: '', timeSignature: 'None' });
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
      party: activeTab === 'all' ? ['all'] :
        activeTab === 'christmass' ? ['christmass'] :
          activeTab === 'easter' ? ['easter'] :
            activeTab === 'newyear' ? ['newyear'] :
              activeTab === 'motherday' ? ['motherday'] :
                activeTab === 'graduation' ? ['graduation'] : ['all']
    }));
    setEditingHymnId(null); // Reset editing mode
    setShowModal(true);
  };

  const openEditModal = (hymn) => {
    // Pre-fill form with hymn data for editing
    setFormData({
      title: hymn.title || '',
      lyrics: Array.isArray(hymn.lyrics) ? hymn.lyrics : (hymn.lyrics ? [{ type: 'verse', title: '1', text: hymn.lyrics }] : []),
      scale: hymn.scale || '',
      relatedChords: hymn.relatedChords || '',
      link: hymn.link || '',
      party: Array.isArray(hymn.party) ? hymn.party : [hymn.party || 'all'],
      BPM: hymn.BPM || '',
      timeSignature: hymn.timeSignature || 'None'
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



  const renderLyricsWithChords = (lyricsData) => {
    if (!lyricsData) return null;

    const currentTheme = lyricsThemes[lyricsTheme];

    // Helper to render a single text block
    const renderBlock = (text, stanzaType) => {
      const isChorus = stanzaType === 'chorus';
      const textColor = currentTheme.text;
      const fontWeight = isChorus ? 'font-bold' : 'font-medium';

      return text.split('\n').map((line, i) => (
        <div
          key={i}
          className={`relative w-full text-center ${showChords && line.includes('[') ? 'mt-8 mb-2' : 'my-2'} ${fontWeight}`}
          style={{ fontSize: `${fontSize}px`, minHeight: '1.5em' }}
          dir="rtl"
        >
          <div className="flex flex-wrap justify-center items-baseline leading-relaxed tracking-wide">
            {line ? line.split(/(\[.*?\])/g).map((part, j) => {
              if (part.startsWith('[') && part.endsWith(']')) {
                if (!showChords) return null;
                const chord = part.slice(1, -1);
                const transposedChord = selectedLyricsHymn?.transposeStep
                  ? transposeChords(chord, selectedLyricsHymn.transposeStep)
                  : chord;

                return (
                  <span key={j} className="inline-flex flex-col-reverse items-center align-baseline mx-1.5 select-none translate-y-[0.1em]">
                    {/* Invisible anchor to reserve width and define baseline */}
                    <span className="invisible whitespace-nowrap leading-none px-2" style={{ fontSize: '0.7em' }} dir="ltr">
                      {transposedChord}
                    </span>
                    {/* The Chord: Responsive flex layout prevents overlap and alignment issues */}
                    <span
                      className="font-bold whitespace-nowrap mb-1 px-2 py-0.5 rounded-md border transition-colors duration-300"
                      style={{
                        backgroundColor: isChorus ? 'rgba(255,255,255,0.1)' : 'rgba(56, 189, 248, 0.1)',
                        borderColor: isChorus ? 'rgba(255,255,255,0.2)' : 'rgba(56, 189, 248, 0.2)',
                        color: currentTheme.chord,
                        fontSize: `0.7em`,
                        lineHeight: '1',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                      dir="ltr"
                    >
                      {transposedChord}
                    </span>
                  </span>
                );
              }
              return (
                <span key={j} className="whitespace-pre-wrap transition-colors duration-300" style={{ color: textColor }}>
                  {part}
                </span>
              );
            }) : <div className="h-4" />}
          </div>
        </div>
      ));
    };

    if (Array.isArray(lyricsData)) {
      return lyricsData.map((stanza, idx) => (
        <div key={idx} className={`mb-12 flex flex-col items-center ${stanza.type === 'chorus' ? 'bg-white/5 py-4 px-2 rounded-2xl mx-[-1rem] sm:mx-0' : ''}`}>
          {stanza.title && <div className={`text-xs mb-4 font-bold tracking-widest px-3 py-1 rounded-full border ${stanza.type === 'chorus' ? 'text-sky-300 border-sky-400/30 bg-sky-500/10' : 'text-gray-400 border-white/10 bg-white/5'}`}>{stanza.title}</div>}
          {renderBlock(stanza.text, stanza.type)}
        </div>
      ));
    }

    // Legacy single string rendering
    return <div className="mb-12">{renderBlock(lyricsData, 'verse')}</div>;
  };

  const renderPresentationSlideWithChords = (slideData) => {
    if (!slideData) return null;

    // Handle string or object {type, title, text}
    const text = typeof slideData === 'string' ? slideData : slideData.text;
    const title = typeof slideData !== 'string' ? slideData.title : null;
    const type = typeof slideData !== 'string' ? slideData.type : 'verse';

    const isChorus = type === 'chorus';

    return (
      <>
        {title && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 text-white/50 text-sm sm:text-lg font-black tracking-widest px-4 py-1.5 rounded-full border border-white/10 bg-white/5 uppercase" dir="rtl">
            {title}
          </div>
        )}
        {text.split('\n').map((line, i) => (
          <div
            key={i}
            className={`relative w-full text-center ${showChords && line.includes('[') ? 'mt-4 mb-2' : 'my-2'}`}
            style={{ fontSize: 'clamp(32px, 8vw, 64px)', lineHeight: '1.6' }}
            dir="rtl"
          >
            {line ? line.split(/(\[.*?\])/g).map((part, j) => {
              if (part.startsWith('[') && part.endsWith(']')) {
                if (!showChords) return null;
                const chord = part.slice(1, -1);
                const transposedChord = selectedLyricsHymn?.transposeStep
                  ? transposeChords(chord, selectedLyricsHymn.transposeStep)
                  : chord;
                return (
                  <span key={j} className="inline-flex flex-col-reverse items-center align-baseline relative mx-[0.15em] select-none translate-y-[0.1em]">
                    {/* Invisible placeholder reserves the width */}
                    <span className="invisible whitespace-nowrap leading-none" style={{ fontSize: '0.5em' }} dir="ltr">
                      {transposedChord}
                    </span>
                    {/* The Chord: Flex-based positioning ensures it stays above text and pushes lines apart naturally to prevent overlap */}
                    <span
                      className="font-black whitespace-nowrap mb-[0.2em] text-sky-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                      style={{
                        fontSize: '0.5em',
                        lineHeight: '1',
                      }}
                      dir="ltr"
                    >
                      {transposedChord}
                    </span>
                  </span>
                );
              }
              return <span key={j} className={`font-bold whitespace-pre-wrap leading-relaxed select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] tracking-tight text-white`}>{part}</span>;
            }) : <br />}
          </div>
        ))}
      </>
    );
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
                className={`fixed inset-0 z-9999 flex justify-center items-center p-4 transition-all duration-300
                ${isClosing ? "opacity-0 backdrop-blur-sm" : "opacity-100 backdrop-blur-md bg-black/70"}`}
              >
                <div
                  className={`w-full max-w-md max-h-[90vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative transform transition-all duration-300
                  ${isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
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
                              newArray.push({ type: 'verse', title: String(newArray.filter(l => l.type === 'verse').length + 1), text: '' });
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
                              newArray.push({ type: 'chorus', title: 'القرار', text: '' });
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
                            placeholder="كلمات المقطع هنا..."
                            value={stanza.text}
                            onChange={(e) => {
                              const newArray = [...formData.lyrics];
                              newArray[idx].text = e.target.value;
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
                      disabled={isSubmitting || !formData.title}
                      className={`mt-4 w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all
                      ${isSubmitting
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

          {/* --- Lyrics Modal --- */}
          {showLyricsModal && selectedLyricsHymn && (
            <Portal>
              <div
                className={`fixed inset-0 z-9999 flex justify-center items-end sm:items-center transition-opacity duration-300
                ${isClosing ? 'opacity-0' : 'opacity-100'} bg-black/70`}
              >
                <motion.div
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0 }}
                  style={{
                    backgroundColor: lyricsThemes[lyricsTheme].bg,
                    boxShadow: lyricsTheme === 'warm' ? '0 10px 40px rgba(139, 94, 60, 0.15)' : '0 10px 40px rgba(0, 0, 0, 0.5)'
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
                </motion.div>
              </div>
            </Portal>
          )}

          {/* --- Data Show (Presentation) Modal - Independent --- */}
          {showDataShow && selectedLyricsHymn && (
            <Portal>
              <div
                id="showDataContainer"
                className="fixed inset-0 z-10000 bg-black flex items-center justify-center"
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
      <div className="absolute inset-0 rounded-2xl bg-linear-to-r from-sky-500/5 via-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {vocalsMode && (
        <button
          onClick={() => openPresentation(humn, transposeStep)}
          className="absolute top-3 right-3 sm:hidden p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/50 transition-all z-30 backdrop-blur-md shadow-lg shadow-purple-500/10 active:scale-95"
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

        {humn.link ? (
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
            <span className="text-xs sm:text-sm font-medium">Coming soon</span>
          </div>
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
