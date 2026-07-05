'use client';
import React, { useState, useContext } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../loading';
import Portal from '../Portal/Portal';
import { UserContext } from '../context/User_Context';
import { useLanguage } from "../context/LanguageContext";
import { showToast } from '../components/ToastContainer';
import { Edit2, Eye, X, PlusCircle, Music, ShieldAlert, CheckCircle, Clock, Monitor, Copy, Share2, ClipboardCheck } from 'lucide-react';
import StanzaSlideControls from '../components/StanzaSlideControls';
import {
  normalizeStanzaForEdit,
  prepareLyricsForSave,
  sanitizeSlideBreaks,
  buildHymnPresentationSlides,
} from '../utils/hymnSlides';

const API_URL = 'https://worship-team-api.onrender.com/api';

export default function Website_Admin_Profile() {
  const { t, language } = useLanguage();
  const { isLogin, UserRole, churchId } = useContext(UserContext);
  const queryClient = useQueryClient();

  const [editingHymnId, setEditingHymnId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '', lyrics: [], scale: '', relatedChords: '', link: '', party: ['all'], BPM: '', timeSignature: 'None'
  });

  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
  const [lyricsTheme, setLyricsTheme] = useState('main');
  const [lyricsFontSize, setLyricsFontSize] = useState(18);
  const [lyricsShowChords, setLyricsShowChords] = useState(true);
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [showSummaryDetails, setShowSummaryDetails] = useState(true);

  const lyricsThemes = {
    warm: { bg: '#FDFBF7', text: '#1A1A1A', label: 'Warm', accent: '#0F172A', chord: '#2563EB', border: 'rgba(0, 0, 0, 0.05)' },
    dark: { bg: '#0F172A', text: '#F1F5F9', label: 'Dark', accent: '#38BDF8', chord: '#7DD3FC', border: 'rgba(255, 255, 255, 0.05)' },
    main: { bg: '#0E2238', text: '#F8F9FA', label: 'Main', accent: '#60A5FA', chord: '#38BDF8', border: 'rgba(96, 165, 250, 0.1)' },
  };

  const [showDataShow, setShowDataShow] = useState(false);
  const [dataShowIndex, setDataShowIndex] = useState(0);
  const [presentationViewport, setPresentationViewport] = useState({ width: 1200, height: 900 });

  const localDisplayRef = React.useRef(null);
  const thumbContainerRef = React.useRef(null);

  const LOCAL_CHANNEL = 'taspe_presenter';

  const broadcastLocalSlide = React.useCallback((slides, index, hymnTitle) => {
    const slide = slides[index];
    if (!slide) return;
    const ch = new BroadcastChannel(LOCAL_CHANNEL);
    ch.postMessage({
      type: 'slide',
      slide,
      hymn: hymnTitle,
      index,
      total: slides.length
    });
    ch.close();
  }, []);

  const openPresentation = (hymn) => {
    setSelectedLyricsHymn(hymn);
    setDataShowIndex(0);
    setShowDataShow(true);

    if (typeof window !== 'undefined' && window.innerWidth >= 640) {
      if (!localDisplayRef.current || localDisplayRef.current.closed) {
        localDisplayRef.current = window.open('/presentation/local', 'taspe_local_display', 'width=1280,height=720');
      } else {
        localDisplayRef.current.focus();
      }
    }
  };

  const dataShowSlides = React.useMemo(() => {
    if (!selectedLyricsHymn?.lyrics) return [];
    return buildHymnPresentationSlides(selectedLyricsHymn.lyrics, {
      showChords: lyricsShowChords,
      viewportHeight: presentationViewport.height,
      viewportWidth: presentationViewport.width,
    });
  }, [selectedLyricsHymn?.lyrics, lyricsShowChords, presentationViewport.height, presentationViewport.width]);

  // Prevent background scrolling when lyrics modal, edit modal, or presentation modal is open
  React.useEffect(() => {
    const isAnyModalOpen = isModalOpen || showLyricsModal || showDataShow;
    if (isAnyModalOpen) {
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
  }, [isModalOpen, showLyricsModal, showDataShow]);

  // Sync presentation viewport resize
  React.useEffect(() => {
    if (!showDataShow || typeof window === 'undefined') return;
    const updateViewport = () => {
      setPresentationViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [showDataShow]);

  // Swipe & Key listener for Presentation mode
  React.useEffect(() => {
    if (!showDataShow) return;

    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;
    let elementRef = null;

    const handleKey = (e) => {
      if (e.key === 'ArrowLeft' && dataShowIndex < dataShowSlides.length - 1) {
        const nextIdx = dataShowIndex + 1;
        setDataShowIndex(nextIdx);
        broadcastLocalSlide(dataShowSlides, nextIdx, selectedLyricsHymn?.title);
      }
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
      if (swipeDistance < -minSwipeDistance && dataShowIndex < dataShowSlides.length - 1) {
        const nextIdx = dataShowIndex + 1;
        setDataShowIndex(nextIdx);
        broadcastLocalSlide(dataShowSlides, nextIdx, selectedLyricsHymn?.title);
      }
      if (swipeDistance > minSwipeDistance && dataShowIndex > 0) {
        const prevIdx = dataShowIndex - 1;
        setDataShowIndex(prevIdx);
        broadcastLocalSlide(dataShowSlides, prevIdx, selectedLyricsHymn?.title);
      }
    };

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
  }, [showDataShow, dataShowIndex, dataShowSlides.length, broadcastLocalSlide, selectedLyricsHymn]);

  // Auto-scroll active thumbnail into view
  React.useEffect(() => {
    if (showDataShow && thumbContainerRef.current) {
      const activeBtn = thumbContainerRef.current.children[dataShowIndex];
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [dataShowIndex, showDataShow]);

  // Initial broadcast when presenting starts
  React.useEffect(() => {
    if (showDataShow && selectedLyricsHymn) {
      broadcastLocalSlide(dataShowSlides, dataShowIndex, selectedLyricsHymn?.title);
    }
  }, [showDataShow, selectedLyricsHymn, dataShowSlides, dataShowIndex, broadcastLocalSlide]);

  const [adminPage, setAdminPage] = useState(1);
  const [adminLimit] = useState(18);

  const { data: adminTasksData, isLoading, refetch } = useQuery({
    queryKey: ['adminTasks', adminPage, adminLimit],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/hymns/admin-tasks?page=${adminPage}&limit=${adminLimit}`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      return res.data;
    },
    enabled: !!isLogin && (UserRole === 'WEBSITE_ADMIN' || UserRole === 'PROGRAMER'),
    keepPreviousData: true,
  });

  const openEditModal = (hymn) => {
    let rawLyrics = hymn.lyrics || [];
    setFormData({
      title: hymn.title || '',
      lyrics: rawLyrics.map(normalizeStanzaForEdit),
      scale: hymn.scale || '',
      relatedChords: hymn.relatedChords || '',
      link: hymn.link || '',
      party: hymn.party && hymn.party.length ? hymn.party : ['all'],
      BPM: hymn.BPM || '',
      timeSignature: hymn.timeSignature || 'None'
    });
    setEditingHymnId(hymn._id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingHymnId(null);
  };

  const openLyrics = (hymn) => {
    setSelectedLyricsHymn(hymn);
    setShowLyricsModal(true);
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
  // ────────────────────────────────────────────────────────────────

  const edit_Hymn = async (id) => {
    if (!isLogin) return;
    if (!formData.title.trim()) { alert(t("enterTitle")); return; }
    if (!Array.isArray(formData.lyrics) || formData.lyrics.length === 0) { alert(t("addSection")); return; }
    if (formData.lyrics.some(l => !l.text.trim())) { alert(t("sectionTextRequired")); return; }

    setIsSubmitting(true);
    try {
      const response = await axios.patch(`${API_URL}/hymns/${id}`, { ...formData, lyrics: prepareLyricsForSave(formData.lyrics) }, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      if (response.status === 202 && response.data?.pending) {
        showToast({ message: 'Request queued as pending', type: 'info', duration: 7000 });
      } else {
        showToast({ message: 'Hymn updated successfully!', type: 'success', duration: 4000 });
      }
      closeModal();
      refetch();
    } catch (error) {
      console.error("Error editing hymn:", error);
      showToast({ message: 'Error updating hymn', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Loading />;
  if (!isLogin || (UserRole !== 'WEBSITE_ADMIN' && UserRole !== 'PROGRAMER')) return null;

  const roleData = adminTasksData?.role;
  const chunkData = adminTasksData?.data || [];
  const approvedSummary = adminTasksData?.approvedSummary || {};
  const approvedCount = approvedSummary.totalApproved || 0;
  const recentApproved = approvedSummary.recentApproved || [];
  const rejectedCount = approvedSummary.totalRejected || 0;
  const recentRejected = approvedSummary.recentRejected || [];
  const approvedLabel = roleData === 'PROGRAMER' ? 'Approved by you' : 'Approved by PROGRAMER';
  const rejectedLabel = roleData === 'PROGRAMER' ? 'Rejected by you' : 'Rejected by PROGRAMER';
  const totalHymns = adminTasksData?.totalTasksCount || 0;
  const totalPages = adminTasksData?.totalPages || 1;

  return (
    <section className="min-h-screen bg-[#050510] text-white pt-24 pb-20 px-4 md:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white/5 p-6 rounded-2xl border border-white/10">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400">
                <ShieldAlert size={32} />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-linear-to-r from-rose-400 to-pink-500 bg-clip-text text-transparent">
                  Admin Editing Tasks
                </h1>
                <p className="text-gray-400 mt-2 text-sm">
                  {roleData === 'PROGRAMER' ? 'Overview of all Website Admin tasks' : 'Hymns assigned to you that require structuring'}
                </p>
                <div className="mt-2 inline-flex items-center px-3 py-1 bg-sky-500/20 border border-sky-500/30 text-sky-400 rounded-lg text-sm font-bold">
                  Total Hymns to Edit: {totalHymns}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowSummaryDetails(prev => !prev)}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {showSummaryDetails ? 'Hide summary' : 'Show summary'}
            </button>
          </div>

          {showSummaryDetails && (
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-[0_18px_40px_rgba(8,30,63,0.18)] transition hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-sky-200 uppercase tracking-[0.18em] font-semibold">Tasks to edit</p>
                      <h2 className="mt-3 text-3xl font-bold text-white">{totalHymns}</h2>
                      <p className="mt-2 text-xs text-gray-400">Assigned songs waiting for your update.</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
                      <Music className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="bg-[#081127] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-sky-200 uppercase tracking-[0.18em] font-semibold">{approvedLabel}</p>
                      <h2 className="mt-3 text-3xl font-bold text-white">{approvedCount}</h2>
                      <p className="mt-2 text-xs text-gray-400">Total approved hymns.</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-white">
                      <ClipboardCheck className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="bg-[#0d1322] border border-white/10 rounded-3xl p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Approved</p>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">{recentApproved.length}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {recentApproved.length > 0 ? (
                      recentApproved.slice(0, 3).map((item, index) => (
                        <div key={`approved-${index}`} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-sm text-white">
                          <p className="font-semibold truncate">{item.title}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400">No approved hymns yet.</p>
                    )}
                  </div>
                </div>

                <div className="bg-[#0d1322] border border-white/10 rounded-3xl p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-300">Rejected</p>
                    <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-200">{recentRejected.length}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {recentRejected.length > 0 ? (
                      recentRejected.slice(0, 3).map((item, index) => (
                        <div key={`rejected-${index}`} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-sm text-white">
                          <p className="font-semibold truncate">{item.title}</p>
                          <p className="mt-1 text-xs text-rose-100/90 break-words">{item.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400">No rejected hymns yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {roleData === 'WEBSITE_ADMIN' && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
              <span>
                Showing page {adminPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdminPage((prev) => Math.max(1, prev - 1))}
                  disabled={adminPage === 1}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-white disabled:opacity-50 hover:bg-slate-900/90 transition"
                >
                  Previous
                </button>
                <button
                  onClick={() => setAdminPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={adminPage === totalPages}
                  className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-white disabled:opacity-50 hover:bg-slate-900/90 transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {roleData === 'PROGRAMER' ? (
            chunkData.map((adminChunk, i) => (
              <AdminTaskSection
                key={i}
                admin={adminChunk.admin}
                tasks={adminChunk.tasks}
                openEditModal={openEditModal}
                openLyrics={openLyrics}
                userRole={UserRole}
                totalTasksCount={adminChunk.tasks.length}
              />
            ))
          ) : (
            <AdminTaskSection
              tasks={chunkData}
              openEditModal={openEditModal}
              openLyrics={openLyrics}
              userRole={UserRole}
              totalTasksCount={totalHymns}
            />
          )}

          {/* --- Edit Modal --- */}
          <AnimatePresence>
            {isModalOpen && (
              <Portal>
                <div className="fixed inset-0 z-[9990] flex justify-center items-center bg-black/70 backdrop-blur-sm p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="w-full max-w-md max-h-[90vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative"
                    data-lenis-prevent-wheel
                  >
                    <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                      <h2 className="text-2xl font-bold bg-linear-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                        {editingHymnId ? `✏️ ${t("editHymn")}` : `🎵 ${t("addNewHymn")}`}
                      </h2>
                      <button onClick={closeModal} className="text-gray-400 hover:text-white transition">
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="p-6 flex flex-col gap-4">
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">{t("songTitle")}</label>
                        <input
                          type="text"
                          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                      </div>

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
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5"
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
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 hover:bg-sky-500/30 text-sky-200 transition-colors flex items-center gap-1.5"
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
                              <button
                                type="button"
                                onClick={() => {
                                  if (!confirm('هل تريد مسح هذا المقطع؟')) return;
                                  const newArray = formData.lyrics.filter((_, i) => i !== idx);
                                  setFormData({ ...formData, lyrics: newArray });
                                }}
                                className="text-gray-500 hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <textarea
                              dir="rtl"
                              className="w-full p-3 rounded-lg bg-black/40 border border-black/50 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition min-h-[100px] resize-y text-sm"
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
                      </div>

                      <div className="flex gap-3 mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLyricsHymn({
                              title: formData.title || 'Hymn Preview',
                              lyrics: prepareLyricsForSave(formData.lyrics)
                            });
                            setShowLyricsModal(true);
                          }}
                          disabled={!formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim())}
                          className={`flex-1 py-3.5 rounded-xl font-bold transition-all border border-sky-500/30 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 flex items-center justify-center gap-2 ${(!formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim())) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <Eye size={18} />
                          {language === 'ar' ? 'معاينة الكلمات' : (language === 'de' ? 'Vorschau' : 'Preview')}
                        </button>
                        <button
                          onClick={() => edit_Hymn(editingHymnId)}
                          disabled={isSubmitting || !formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim())}
                          className={`flex-1 py-3.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${(isSubmitting || !formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim())) ? 'bg-gray-600 cursor-not-allowed' : 'bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500'}`}
                        >
                          <Edit2 size={18} />
                          {isSubmitting ? t("updating") : t("updateSong")}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </Portal>
            )}
          </AnimatePresence>

          {/* --- Lyrics Modal — matches Category_Hymns style --- */}
          {showLyricsModal && selectedLyricsHymn && (
            <Portal>
              <div className="fixed inset-0 z-[9995] flex justify-center items-end sm:items-center bg-black/70">
                <div
                  style={{
                    backgroundColor: lyricsThemes[lyricsTheme].bg,
                    boxShadow: lyricsTheme === 'warm' ? '0 10px 40px rgba(139, 94, 60, 0.15)' : '0 10px 40px rgba(0, 0, 0, 0.5)',
                    willChange: 'transform, opacity'
                  }}
                  className="w-full sm:max-w-3xl h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-[2.5rem] flex flex-col relative overflow-hidden"
                >
                  {(() => {
                    const hasChords = selectedLyricsHymn?.lyrics ? (
                      typeof selectedLyricsHymn.lyrics === 'string'
                        ? selectedLyricsHymn.lyrics.includes('[')
                        : (Array.isArray(selectedLyricsHymn.lyrics) && selectedLyricsHymn.lyrics.some(s => s.text?.includes('[')))
                    ) : false;

                    const currentTheme = lyricsThemes[lyricsTheme];

                    const parseSegments = (line) => {
                      const parts = line.split(/(\[.*?\])/g);
                      const segments = [];
                      let i = 0;
                      while (i < parts.length) {
                        const part = parts[i];
                        if (part && part.startsWith('[') && part.endsWith(']')) {
                          segments.push({ chord: part.slice(1, -1), text: parts[i + 1] ?? '' });
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
                      if (!line.trim()) return <div key={i} className="h-4" />;

                      return (
                        <div key={i} className={`flex flex-wrap justify-center items-end w-full leading-relaxed ${lyricsShowChords && anyHasChords ? 'mt-8 mb-2' : 'my-2'}`} dir="rtl">
                          {segments.map((seg, j) => (
                            <span key={j} className={`inline-flex flex-col items-center max-w-full ${lyricsShowChords ? 'min-w-[0.2em]' : ''}`}>
                              {lyricsShowChords && (
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
                                  {seg.chord || '\u00A0'}
                                </span>
                              )}
                              <span
                                style={{ color: currentTheme.text, fontSize: `${lyricsFontSize}px` }}
                                className={`${isChorus ? 'font-black' : 'font-bold'} whitespace-pre-wrap break-words text-center transition-colors duration-300`}
                              >
                                {seg.text || '\u00A0'}
                              </span>
                            </span>
                          ))}
                        </div>
                      );
                    };

                    const renderLyrics = (lyricsData) => {
                      if (!lyricsData) return null;
                      if (Array.isArray(lyricsData)) {
                        return lyricsData.map((stanza, idx) => (
                          <div key={idx} className={`mb-12 flex flex-col items-center ${stanza.type === 'chorus' ? 'bg-white/5 py-8 px-6 rounded-3xl mx-[-1rem] sm:mx-0 border border-white/5 shadow-inner' : ''}`}>
                            {stanza.title && (
                              <div className={`text-[10px] mb-6 font-black tracking-[0.2em] px-4 py-1.5 rounded-full border uppercase ${stanza.type === 'chorus' ? 'text-sky-300 border-sky-400/30 bg-sky-500/10' : 'text-gray-400 border-white/10 bg-white/5'}`}>
                                {stanza.title}
                              </div>
                            )}
                            {stanza.text?.split('\n').map((line, i) => renderLine(line, stanza.type, i))}
                          </div>
                        ));
                      }
                      return <div className="mb-12">{lyricsData.split('\n').map((line, i) => renderLine(line, 'verse', i))}</div>;
                    };

                    return (
                      <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col" style={{ WebkitOverflowScrolling: 'touch' }} data-lenis-prevent-wheel>
                        {/* Sticky Header */}
                        <div
                          className="sticky top-0 z-50 pt-2 pb-4 flex flex-col shrink-0 transition-colors duration-500"
                          style={{
                            backgroundColor: lyricsThemes[lyricsTheme].bg,
                            borderBottom: `1px solid ${lyricsTheme === 'warm' ? 'rgba(120,50,0,0.05)' : 'rgba(255,255,255,0.05)'}`
                          }}
                        >
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
                                  openPresentation(selectedLyricsHymn);
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
                                onClick={() => setShowLyricsModal(false)}
                                className={`p-2 rounded-full transition-all ${lyricsTheme === 'warm' ? 'hover:bg-black/5 text-black/40 hover:text-black' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}
                              >
                                <X className="w-6 h-6" />
                              </button>
                            </div>
                          </div>
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

                        {/* Toolbar */}
                        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                          <div className="flex items-center gap-2">
                            {/* Chords Toggle */}
                            <button
                              onClick={() => setLyricsShowChords(!lyricsShowChords)}
                              disabled={!hasChords}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border
                              ${!hasChords
                                  ? (lyricsTheme === 'warm' ? 'bg-black/5 text-black/20 border-black/10 cursor-not-allowed' : 'bg-white/5 text-white/10 border-white/5 cursor-not-allowed')
                                  : (lyricsShowChords
                                    ? (lyricsTheme === 'warm' ? 'bg-black text-white border-black' : 'bg-sky-500 text-white border-sky-500')
                                    : (lyricsTheme === 'warm' ? 'bg-transparent text-black/50 border-black/20' : 'bg-transparent text-white/30 border-white/10'))
                                }`}
                            >
                              {!hasChords ? '♪' : (lyricsShowChords ? '🎸' : '👁‍🗨')}
                              {!hasChords ? 'No chords' : (lyricsShowChords ? 'Chords On' : 'Chords Off')}
                            </button>

                            {/* Font Controls */}
                            <div className={`flex items-center rounded-xl border transition-colors duration-300 ${lyricsTheme === 'warm' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                              <button
                                onClick={() => setLyricsFontSize(prev => Math.max(14, prev - 2))}
                                disabled={lyricsFontSize <= 14}
                                className={`p-2 transition-all disabled:opacity-20 ${lyricsTheme === 'warm' ? 'hover:text-black' : 'hover:text-white text-white/60'}`}
                              >
                                <span className="text-xs font-black">A-</span>
                              </button>
                              <div className={`w-px h-4 ${lyricsTheme === 'warm' ? 'bg-black/10' : 'bg-white/10'}`} />
                              <button
                                onClick={() => setLyricsFontSize(prev => Math.min(48, prev + 2))}
                                disabled={lyricsFontSize >= 48}
                                className={`p-2 transition-all disabled:opacity-20 ${lyricsTheme === 'warm' ? 'hover:text-black' : 'hover:text-white text-white/60'}`}
                              >
                                <span className="text-sm font-black">A+</span>
                              </button>
                            </div>
                          </div>

                          {/* Right side: Theme Selector + Copy + Share buttons */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Theme Selector */}
                            <div className={`flex p-1 rounded-xl border transition-colors duration-300 ${lyricsTheme === 'warm' ? 'bg-amber-900/5 border-amber-900/10' : 'bg-white/5 border-white/10'}`}>
                              {Object.entries(lyricsThemes).map(([key, theme]) => (
                                <button
                                  key={key}
                                  onClick={() => setLyricsTheme(key)}
                                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 relative overflow-hidden
                                  ${lyricsTheme === key ? 'shadow-lg scale-100 z-10' : 'opacity-40 hover:opacity-100 scale-95'}`}
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

                        {/* Lyrics Content */}
                        <div className="px-6 sm:px-10 py-10">
                          <div className="w-full max-w-2xl mx-auto transition-all duration-500" dir="rtl">
                            {renderLyrics(selectedLyricsHymn.lyrics)}
                          </div>
                          <div className="h-20" />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bottom Gradient */}
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

          {/* --- Data Show (Presentation) Presenter View - Independent --- */}
          {showDataShow && selectedLyricsHymn && (
            <Portal>
              <div id="showDataContainer" className="fixed inset-0 z-[10000] bg-[#020617] flex flex-col">
                {/* ── Shared Header ── */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0f172a] border-b border-white/10 shrink-0 z-20">
                  <div className="flex flex-col min-w-0">
                    <h2 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">{selectedLyricsHymn.title}</h2>
                    <p className="text-[10px] sm:text-xs text-sky-400 font-medium">
                      Presenter View • Click a cut to broadcast to HDMI Display
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
                                    <div key={idx} className={`flex flex-wrap justify-center items-end w-full ${lyricsShowChords && anyChords ? 'mt-[1.1em]' : 'my-[0.1em]'}`} dir="rtl">
                                      {segs.map((seg, j) => (
                                        <span key={j} className="inline-flex flex-col items-center min-w-[0.2em] max-w-full">
                                          {lyricsShowChords && (
                                            <span className="block font-black whitespace-nowrap leading-none select-none mb-1" dir="ltr"
                                              style={{ color: '#38BDF8', fontSize: 'clamp(9px, 2vw, 14px)', visibility: seg.chord ? 'visible' : 'hidden' }}>
                                              {seg.chord || '\u00A0'}
                                            </span>
                                          )}
                                          <span
                                            className={`font-bold whitespace-pre-wrap break-words text-center leading-snug select-none drop-shadow-lg tracking-tight ${isChorus ? 'text-yellow-300' : 'text-white'}`}
                                            style={{
                                              fontSize: 'clamp(24px, 6.5vw, 52px)',
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

                {/* ══ DESKTOP VIEW ══ */}
                <div className="hidden sm:flex flex-1 flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" dir="rtl" data-lenis-prevent-wheel>
                    <div className="max-w-7xl mx-auto grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-4">
                      {dataShowSlides.map((slide, i) => {
                        const isActive = dataShowIndex === i;
                        const isChorus = slide.type === 'chorus';
                        return (
                          <button
                            key={i}
                            onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                            className={`relative flex flex-col h-40 p-4 rounded-2xl border text-right transition-all duration-200 overflow-hidden group
                            ${isActive
                                ? 'bg-sky-500/20 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.3)] z-10'
                                : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]'}`}
                          >
                            {isActive && <div className="absolute inset-0 bg-linear-to-b from-sky-500/10 to-transparent pointer-events-none" />}
                            <div className="flex items-center justify-between w-full mb-3 relative z-10" dir="ltr">
                              <span className="text-[10px] font-mono text-gray-500">{i + 1}</span>
                              <div className="flex items-center gap-1.5">
                                {isActive && (
                                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" /> Live
                                  </span>
                                )}
                                {slide.title && (
                                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                  ${isChorus ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-white/10 text-gray-300 border border-white/10'}`}>
                                    {slide.title}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex-1 w-full text-sm font-bold leading-relaxed text-gray-200 line-clamp-4 relative z-10 wrap-break-word whitespace-pre-line text-right">
                              {slide.text.replace(/\[.*?\]/g, '')}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Portal>
          )}
        </div>
      </div>
    </section>
  );
}

function AdminTaskSection({ admin, tasks, openEditModal, openLyrics, userRole, totalTasksCount }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const totalPages = Math.ceil(tasks.length / itemsPerPage);
  const currentTasks = tasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="bg-[#0c0c20] border border-white/10 rounded-2xl p-6">
      {admin && (
        <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-4">
          Admin: <span className="text-sky-400">{admin.Name}</span>
          <span className="text-gray-500 text-sm ml-4">({totalTasksCount ?? tasks.length} tasks)</span>
        </h2>
      )}
      {!admin && (
        <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-4 flex justify-between">
          <span>Your Tasks</span>
          <span className="text-sky-400">{totalTasksCount ?? tasks.length} Hymns</span>
        </h2>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <CheckCircle size={48} className="mx-auto mb-4 opacity-50" />
          <p>No hymns need editing at the moment.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="max-h-[500px] overflow-y-auto custom-scrollbar pr-2" data-lenis-prevent-wheel>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentTasks.map((hymn) => (
                <div key={hymn._id} className="bg-white/5 border border-white/10 p-5 rounded-xl hover:bg-white/10 transition-colors relative flex flex-col justify-between h-full">

                  {/* Status Markers */}
                  {hymn.adminStatus === 'pending' && (
                    <div className="absolute top-3 right-3 bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                      <Clock size={12} /> Pending Review
                    </div>
                  )}
                  {hymn.adminStatus === 'approved' && (
                    <div className="absolute top-3 right-3 bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                      <CheckCircle size={12} /> Approved
                    </div>
                  )}
                  {hymn.adminStatus === 'rejected' && (
                    <div className="absolute top-3 right-3 bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                      <ShieldAlert size={12} /> Rejected
                    </div>
                  )}

                  <div className="mt-2 relative z-0">
                    <h3 className="text-lg font-bold text-white mb-1" dir="rtl">{hymn.title}</h3>
                    {userRole !== 'PROGRAMER' && (
                      <p className="text-xs text-gray-400 line-clamp-2" dir="rtl">
                        {typeof hymn.lyrics === 'string' ? hymn.lyrics : hymn.lyrics?.[0]?.text}
                      </p>
                    )}
                  </div>

                  {hymn.adminStatus === 'rejected' && hymn.reviewNote && (
                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 flex gap-2 relative z-0" dir="rtl">
                      <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{hymn.reviewNote}</span>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4 pt-4 border-t border-white/10 relative z-0">
                    <button
                      onClick={() => openEditModal(hymn)}
                      className="flex-1 flex items-center justify-center gap-2 bg-sky-500/20 text-sky-300 py-2 rounded-lg font-bold text-sm hover:bg-sky-500/30 transition-colors"
                    >
                      <Edit2 size={16} /> Edit
                    </button>
                    <button
                      onClick={() => openLyrics(hymn)}
                      className="flex-none p-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
                      title="View Lyrics"
                    >
                      <Eye size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-4 pt-4 border-t border-white/10">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-lg bg-white/5 text-white disabled:opacity-50 transition-colors hover:bg-white/10"
              >
                Previous
              </button>
              <span className="text-gray-400 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-lg bg-white/5 text-white disabled:opacity-50 transition-colors hover:bg-white/10"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}