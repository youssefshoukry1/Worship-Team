'use client';
import React, { useState, useContext, useEffect, useRef } from 'react';

import { transposeScale, transposeChords, transposeLyrics } from '../utils/musicUtils';
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../_loading';
import Portal from '../Portal/Portal';
import Metronome from './MetronomeLauncher';
import { UserContext } from '../context/User_Context';
// Add BookOpen to this line
import { Music, Star, Gift, Sparkles, PlusCircle, Trash2, X, GraduationCap, FolderPlus, Check, Edit2, Search, FileText, Monitor, Radio, Tv2, Mic, MicOff, Loader2, Cross } from 'lucide-react';
import { HymnsContext } from '../context/Hymns_Context';
import { useLanguage } from "../context/LanguageContext";
import { showToast } from '../components/ToastContainer';
import { Virtuoso } from "react-virtuoso";
import { getApiBaseUrl } from '../utils/apiBase';
import { useRouter } from 'next/navigation';
import { isApp } from '../utils/platform';
import { downloadedHymnsQueryOptions } from '../utils/hymnsCache';
import { syncDownloadedHymns } from '../services/hymnsSync';
import { invalidateProfile, readCachedProfile, refreshProfile, writeCachedProfile } from '../utils/profileCache';

import { normalizeStanzaForEdit, prepareLyricsForSave } from '../utils/hymnSlides';
import { useCategoryHymnsTour } from '../Tour/useCategoryHymnsTour';
import { createDeferredFeature, createFeatureBoundary } from '../components/DeferredFeature';
import HymnLyricsView from './HymnLyrics';
import HymnPresentationView from './HymnPresentation';
import { useLocalHymns } from '../hooks/useLocalHymns';
import { usePresenter } from '../hooks/usePresenter';

const BibleForm = createDeferredFeature(() => import('../bible_form/BibleReader'), 'Bible reader');
const Pray = createDeferredFeature(() => import('../pray/page'), 'prayer form', { inline: true });
const HymnEditor = createDeferredFeature(() => import('./HymnEditor'), 'hymn editor');
const HymnLyrics = createFeatureBoundary(HymnLyricsView, 'lyrics');
const HymnPresentation = createFeatureBoundary(HymnPresentationView, 'presentation');

const API_ROOT = getApiBaseUrl();
const EMPTY_HYMNS = [];

export default function Category_Humns() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLogin, UserRole, vocalsMode, user_id } = useContext(UserContext);
  const { addToWorkspace, isHymnInWorkspace } = useContext(HymnsContext)
  const { t, language, setLanguage } = useLanguage();

  // Product tour
  useCategoryHymnsTour(language);

  // Re-introduced for Role checks
  const [activeTab, setActiveTab] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', lyrics: [], scale: '', relatedChords: '', link: '', party: ['all'], BPM: '', timeSignature: 'None' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingHymnId, setEditingHymnId] = useState(null); // Track which hymn is being edited

  const [showPrayModal, setShowPrayModal] = useState(false);
  const [prayProfile, setPrayProfile] = useState({ prayTime: [] });

  const updatePrayProfileState = (modifier) => {
    setPrayProfile((previous) => {
      const updatedProfile = typeof modifier === 'function' ? modifier(previous) : modifier;
      if (updatedProfile && user_id) {
        invalidateProfile(API_ROOT, isLogin);
        writeCachedProfile(user_id, updatedProfile).catch(console.error);
      }
      return updatedProfile;
    });
  };

  useEffect(() => {
    if (!showPrayModal || !isLogin || !user_id) return;

    let ignore = false;
    const loadPrayProfile = async () => {
      const cachedData = await readCachedProfile(user_id);
      if (cachedData && !ignore) setPrayProfile(cachedData);

      try {
        const profile = await refreshProfile(API_ROOT, isLogin, user_id);
        if (ignore) return;
        setPrayProfile(profile);
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

  // Tracks hymn usage
  useEffect(() => {
    let timer;
    if (selectedLyricsHymn?._id && !selectedLyricsHymn.isBible) {
      timer = setTimeout(async () => {
        try {
          await axios.patch(`${API_ROOT}/hymns/${selectedLyricsHymn._id}/use`);
        } catch (err) {
          console.error('Error updating usage:', err);
        }
      }, 10000);
    }
    return () => clearTimeout(timer);
  }, [selectedLyricsHymn?._id, selectedLyricsHymn?.isBible]);
  const [lyricsTheme, setLyricsTheme] = useState('main');
  const [fontSize, setFontSize] = useState(18);
  const [showChords, setShowChords] = useState(true); // Toggle for chords visibility
  const { data: allHymns = EMPTY_HYMNS, isLoading: isLoadingApp } = useQuery({
    ...downloadedHymnsQueryOptions,
    enabled: isApp,
  });
  const presenter = usePresenter({ selectedLyricsHymn, setSelectedLyricsHymn, showChords, setShowChords, allHymns });
  const { showDataShow, showBibleModal, setShowBibleModal, bibleController, openPresentation, showSessionPanel, setShowSessionPanel, isJoiningSession, isConnected, dataShowId, setDataShowId, dataShowIdInput, setDataShowIdInput, handleCreateSession, handleJoinSession, isCreatingSession, toggleAudio, isAudioActive, clearDisplay, setShowDataShow } = presenter;
  const { setNoteModalConfig } = bibleController;

  const lyricsScrollRef = React.useRef(null); // Ref for lyrics scroll container
  const [copiedLyrics, setCopiedLyrics] = useState(false);

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
  const closeLyricsModal = () => {
    setShowLyricsModal(false);
    setSelectedLyricsHymn(null);
    if (lyricsModalCardRef.current) {
      lyricsModalCardRef.current.style.transform = '';
      lyricsModalCardRef.current.style.transition = '';
    }
    // لو قفل المودال قبل الـ 10 ثواني، نكنسل الطلب فوراً
    if (usageTimerRef.current) {
      clearTimeout(usageTimerRef.current);
      usageTimerRef.current = null;
      console.log("تم إلغاء تسجيل الاستخدام لأنك قفلت بدري");
    }
  };

  const lyricsModalCardRef = React.useRef(null);
  const lyricsTouchStartY = React.useRef(0);
  const lyricsPullDistance = React.useRef(0);
  const lyricsStartedAtTop = React.useRef(false);
  const lyricsWheelDelta = React.useRef(0);
  const lyricsWheelTimer = React.useRef(null);

  // Real-time interactive drag to dismiss
  const handleLyricsTouchStart = (e) => {
    lyricsTouchStartY.current = e.touches[0].clientY;
    lyricsPullDistance.current = 0;
    lyricsStartedAtTop.current = (lyricsScrollRef.current?.scrollTop ?? 0) <= 0;
    if (lyricsModalCardRef.current) {
      lyricsModalCardRef.current.style.transition = 'none';
    }
  };

  const handleLyricsTouchMove = (e) => {
    const currentY = e.touches[0].clientY;
    const currentScrollTop = lyricsScrollRef.current?.scrollTop ?? 0;
    if (currentScrollTop <= 0) {
      if (!lyricsStartedAtTop.current) {
        lyricsStartedAtTop.current = true;
        lyricsTouchStartY.current = currentY;
      }
      const deltaY = currentY - lyricsTouchStartY.current;
      if (deltaY > 0) {
        lyricsPullDistance.current = deltaY;
        if (lyricsModalCardRef.current) {
          lyricsModalCardRef.current.style.transform = `translate3d(0, ${deltaY}px, 0)`;
        }
      }
    } else {
      lyricsPullDistance.current = 0;
      lyricsStartedAtTop.current = false;
      if (lyricsModalCardRef.current) {
        lyricsModalCardRef.current.style.transform = '';
      }
    }
  };

  const handleLyricsTouchEnd = () => {
    if (lyricsModalCardRef.current) {
      lyricsModalCardRef.current.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
      if (lyricsStartedAtTop.current && lyricsPullDistance.current > 100) {
        lyricsModalCardRef.current.style.transform = 'translate3d(0, 100%, 0)';
        setTimeout(() => {
          closeLyricsModal();
        }, 220);
      } else {
        lyricsModalCardRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    } else if (lyricsStartedAtTop.current && lyricsPullDistance.current > 100) {
      closeLyricsModal();
    }
    lyricsPullDistance.current = 0;
    lyricsStartedAtTop.current = false;
  };

  const handleLyricsWheel = (e) => {
    if (!lyricsScrollRef.current) return;
    if (lyricsScrollRef.current.scrollTop <= 0 && e.deltaY < 0) {
      lyricsWheelDelta.current += Math.abs(e.deltaY);
      if (lyricsWheelDelta.current > 100) {
        lyricsWheelDelta.current = 0;
        if (lyricsModalCardRef.current) {
          lyricsModalCardRef.current.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
          lyricsModalCardRef.current.style.transform = 'translate3d(0, 100%, 0)';
          setTimeout(() => {
            closeLyricsModal();
          }, 220);
        } else {
          closeLyricsModal();
        }
      }
      if (lyricsWheelTimer.current) clearTimeout(lyricsWheelTimer.current);
      lyricsWheelTimer.current = setTimeout(() => {
        lyricsWheelDelta.current = 0;
      }, 250);
    } else {
      lyricsWheelDelta.current = 0;
    }
  };

  // Attached via onScroll prop to guarantee firing in Portals

  // Prevent background scrolling and lock bottom nav when lyrics modal is open
  React.useEffect(() => {
    if (showLyricsModal) {
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: true } }));
    } else {
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: false } }));
    }
    return () => {
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('lockBottomNav', { detail: { hidden: false } }));
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

  // Reflect a direct (PROGRAMER) hymn change in the list that is on screen.
  // App: patch the in-memory ["hymns","app"] list. The localforage copy is left alone and is
  // updated by the version sync after the change is published.
  // Web: refetch the paginated ["hymns","web",...] pages.
  const applyHymnsChange = (updateList) => {
    if (isApp) {
      queryClient.setQueryData(['hymns', 'app'], (old) => Array.isArray(old) ? updateList(old) : old);
    } else {
      queryClient.invalidateQueries({ queryKey: ['hymns', 'web'] });
    }
  };

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
      const url = "http://u8j23uxsp8ylp6cnzjaoiuvg.2.31.163.21.sslip.io/api/hymns/create";

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
      const newHymn = { ...formData, lyrics: prepareLyricsForSave(formData.lyrics), _id: response.data?._id || response.data?.hymn?._id || Date.now().toString(), usageCount: 0 };
      applyHymnsChange((list) => [newHymn, ...list]);
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
      const url = `http://u8j23uxsp8ylp6cnzjaoiuvg.2.31.163.21.sslip.io/api/hymns/${id}`;

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
      const updatedHymn = { ...formData, lyrics: prepareLyricsForSave(formData.lyrics), _id: id };
      applyHymnsChange((list) => list.map(h => h._id === id ? { ...h, ...updatedHymn } : h));
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
      const url = `http://u8j23uxsp8ylp6cnzjaoiuvg.2.31.163.21.sslip.io/api/hymns/${id}`;

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
      applyHymnsChange((list) => list.filter(h => h._id !== id));
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

  // ── APP: background sync — runs after mount, only when needed ──────────
  // Triggered by: (a) force_sync flag from dashboard, (b) BroadcastChannel signal, (c) no cache yet
  useEffect(() => {
    if (!isApp || typeof window === 'undefined') return;

    syncDownloadedHymns(queryClient);
    // Listen for real-time force sync from dashboard (same device, any tab)
    const channel = new BroadcastChannel('taspe7_sync');
    channel.onmessage = (e) => {
      if (e.data?.type === 'force_sync') syncDownloadedHymns(queryClient, { force: true });
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
    queryFn: async ({ pageParam = 0, signal }) => {
      const API_BASE = 'http://u8j23uxsp8ylp6cnzjaoiuvg.2.31.163.21.sslip.io/api/hymns';
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

      const response = await axios.get(url, { signal });
      return Array.isArray(response.data) ? response.data : [];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 20 ? allPages.length * 20 : undefined;
    }
  });

  // ── APP: Online smart search when connected ─────────────────────────
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const isSearchingOnline = isApp && Boolean(debouncedSearch?.trim()) && isOnline;

  const {
    data: appOnlineSearchResults,
    isError: isAppSearchError
  } = useQuery({
    queryKey: ["hymns", "app-search", debouncedSearch],
    enabled: isSearchingOnline,
    staleTime: 1000 * 60 * 5,
    queryFn: async ({ signal }) => {
      const API_BASE = 'http://u8j23uxsp8ylp6cnzjaoiuvg.2.31.163.21.sslip.io/api/hymns';
      const response = await axios.get(`${API_BASE}/search?limit=50&q=${encodeURIComponent(debouncedSearch)}`, { signal });
      return Array.isArray(response.data) ? response.data : [];
    },
    retry: 1
  });

  const hasOnlineSearchResults = Boolean(debouncedSearch?.trim() && isOnline && !isAppSearchError && Array.isArray(appOnlineSearchResults));
  const localHymns = useLocalHymns(allHymns, activeTab, debouncedSearch, isApp && !hasOnlineSearchResults);
  const isLoading = isApp ? isLoadingApp || (localHymns.pending && !localHymns.hasData) : isLoadingWeb;
  const humns = React.useMemo(() => {
    if (!isApp) return webData ? webData.pages.flat() : EMPTY_HYMNS;
    return hasOnlineSearchResults ? appOnlineSearchResults : localHymns.items;
  }, [webData, hasOnlineSearchResults, appOnlineSearchResults, localHymns.items]);

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

  // Helper to check permission
  const canEdit = UserRole === 'LYRICS_ADMIN' || UserRole === 'PROGRAMER';

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
    return <Loading variant="hymns" />;
  }

  return (<section id="Category_Humns" className="min-h-screen bg-[var(--app-bg)] text-white px-4 sm:px-6 py-10 relative overflow-hidden transition-colors duration-150">
    {/* Background Gradients */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_70%)] dark:opacity-25 pointer-events-none" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.08),transparent_70%)] dark:opacity-25 pointer-events-none" />

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

      {/* Admin Controls & Live Session */}
      <div className="flex flex-col items-end gap-3 mb-6 w-full">
        <div className="flex flex-wrap justify-end items-center gap-3 w-full">
          {canEdit && (
            <button
              onClick={openModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full hover:bg-gray-100 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_rgba(255,255,255,0.5)] active:scale-95 font-semibold text-sm"
            >
              <PlusCircle className="w-5 h-5" />
              <span>{t("newHymn")}</span>
            </button>
          )}

          {/* Live Session Button */}
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
          </div>
        </div>

        {showSessionPanel && (
          <div className="w-full sm:max-w-[420px] p-4 bg-[#0c1627] border border-white/10 rounded-2xl shadow-xl backdrop-blur-sm">
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

      {/* Content Table/List */}
      {isLoading ? (
        <Loading variant="hymns" />
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
                initialItemCount={Math.min(15, humns.length)}
                computeItemKey={(_index, hymn) => hymn._id}
                endReached={() => {
                  if (!isApp) {
                    if (hasNextPage && !isFetchingNextPage) {
                      fetchNextPage();
                    }
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
                      {(!isApp && isFetchingNextPage) && (
                        <div className="w-8 h-8 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mb-4" />
                      )}
                      {((!isApp && !hasNextPage) || isApp) && humns.length > 0 && (
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
            !isLoading && (
              <div className="p-20 text-center flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed mt-2 mb-20">
                <Music className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">{t("NoHymnsfoundinthiscategory")}</p>
              </div>
            )
          )}

          {/* This is the Add/Edit Hymn form */}
          {showModal && (
            <HymnEditor view={{ add_Hymn, closeModal, edit_Hymn, editingHymnId, formData, hymnCategories, isSubmitting, setFormData, t }} onLoadClose={closeModal} />
          )}

          {/* This is the Lyrics display */}
          {showLyricsModal && selectedLyricsHymn && (
            <HymnLyrics view={{ closeLyricsModal, copiedLyrics, fontSize, handleCopyLyrics, handleLyricsTouchEnd, handleLyricsTouchMove, handleLyricsTouchStart, handleLyricsWheel, handleShareLyrics, lyricsModalCardRef, lyricsScrollRef, lyricsTheme, lyricsThemes, openPresentation, renderLyricsWithChords, selectedLyricsHymn, setFontSize, setLyricsTheme, setShowChords, showChords, vocalsMode }} onLoadClose={closeLyricsModal} />
          )}

          {showBibleModal && <BibleForm controller={bibleController} onLoadClose={() => setShowBibleModal(false)} />}
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

        </div >
      )}

      {/* This is the Presentation controller screen */}
      {showDataShow && selectedLyricsHymn && (
        <HymnPresentation view={presenter} onLoadClose={() => setShowDataShow(false)} />
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

const HymnItem = React.memo(function HymnItem({ humn, index, categories, addToWorkspace, isHymnInWorkspace, canEdit, delete_Hymn, openEditModal, t, openLyrics, openPresentation, vocalsMode, UserRole, setNoteModalConfig }) {
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
    <div
      className="group relative grid grid-cols-12 gap-2 sm:gap-4 p-2.5 sm:p-4 items-center 
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
          className="absolute top-3 right-3 sm:hidden p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all z-30 backdrop-blur-md active:scale-95"
          title="Open Presentation Mode"
        >
          <Monitor className="w-5 h-5 text-white" />
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
      <div className="col-span-11 sm:col-span-5 md:col-span-5 relative z-10 flex items-center gap-2 py-2 sm:py-3">
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
                className="hidden sm:flex p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all"
                title="Open Presentation Mode"
              >
                <Monitor className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            )}
          </>
        )}

        {!humn.link && !humn.lyrics && (
          <span className="text-gray-700 text-xs">—</span>
        )}
      </div>

    </div>
  );
});
