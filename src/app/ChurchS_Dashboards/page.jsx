'use client'
import React, { useContext, useEffect, useMemo, useState } from 'react'
import Login from '../login/page'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserContext } from '../context/User_Context'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2, Edit2, Plus, Church as ChurchIcon, Users, Loader2, X, Save,
  Music, Clock, CheckCircle2, XCircle, AlertCircle, ChevronDown,
  RefreshCw, Eye, MessageSquare, Filter, Shield, Monitor
} from 'lucide-react'
import Loading from '../loading'
import Portal from '../Portal/Portal'
import { showToast } from '../components/ToastContainer'
import { buildHymnPresentationSlides } from '../utils/hymnSlides'

const API_URL = "https://worship-team-api.onrender.com/api";

// ─── Action type badge config ─────────────────────────────────────────────────
const ACTION_CONFIG = {
  create: { label: 'CREATE', color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  edit: { label: 'EDIT', color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  delete: { label: 'DELETE', color: 'text-red-300', bg: 'bg-red-500/15', border: 'border-red-500/30' },
};

// ─── Status badge config ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: { label: 'Pending', Icon: Clock, color: 'text-sky-300', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  approved: { label: 'Approved', Icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  rejected: { label: 'Rejected', Icon: XCircle, color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/20' },
};

// ─── Formatters ───────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Single pending request card
// ─────────────────────────────────────────────────────────────────────────────
function PendingCard({ request, onApprove, onRejectOpen, onViewLyrics, processingId }) {
  const [expanded, setExpanded] = useState(false);
  const action = ACTION_CONFIG[request.actionType] || ACTION_CONFIG.create;
  const status = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
  const StatusIcon = status.Icon;
  const isProcessing = processingId === request._id;

  const hasPayload = request.payload && Object.keys(request.payload).length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-[#0f172a]/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden relative group"
    >
      {/* top accent bar — color based on action */}
      <div className={`h-0.5 w-full ${request.actionType === 'create' ? 'bg-emerald-500' :
        request.actionType === 'edit' ? 'bg-amber-500' : 'bg-red-500'
        }`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-[10px] font-extrabold tracking-widest px-2.5 py-0.5 rounded-full border ${action.bg} ${action.color} ${action.border}`}>
                {action.label}
              </span>
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${status.bg} ${status.color} ${status.border}`}>
                <StatusIcon className="w-3 h-3" />
                {status.label}
              </span>
            </div>
            {/* Hymn title */}
            <h3 className="text-base font-bold text-white truncate" title={request.hymnTitle}>
              {request.hymnTitle || '—'}
            </h3>
          </div>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 mb-4">
          <div>
            <span className="text-gray-600 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Requested by</span>
            <span className="text-gray-200 font-medium">{request.requestedByName}</span>
            <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 ${request.requestedByRole === 'ADMIN' ? 'text-amber-400' :
              request.requestedByRole === 'MANEGER' ? 'text-violet-400' : 'text-sky-400'
              }`}>{request.requestedByRole}</span>
          </div>
          <div className="text-right">
            <span className="text-gray-600 block text-[10px] font-bold uppercase tracking-wider mb-0.5">Submitted</span>
            <span className="text-gray-300">{timeAgo(request.createdAt)}</span>
          </div>
        </div>

        {/* Rejection note (if any) */}
        {request.status === 'rejected' && request.reviewNote && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300 flex gap-2">
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{request.reviewNote}</span>
          </div>
        )}
        {request.status === 'approved' && request.reviewNote && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex gap-2">
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{request.reviewNote}</span>
          </div>
        )}

        {/* Music info chips — visible at a glance when payload has scale/chords/BPM/timeSignature */}
        {(request.payload?.scale || request.payload?.relatedChords || request.payload?.BPM || (request.payload?.timeSignature && request.payload.timeSignature !== 'None')) && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {request.payload?.scale && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                <span className="text-indigo-500">Scale</span> {request.payload.scale}
              </span>
            )}
            {request.payload?.BPM && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">
                <span className="text-yellow-500">BPM</span> {request.payload.BPM}
              </span>
            )}
            {request.payload?.timeSignature && request.payload.timeSignature !== 'None' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                <span className="text-amber-500">Time</span> {request.payload.timeSignature}
              </span>
            )}
            {request.payload?.relatedChords && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300">
                <span className="text-green-500">Chords</span> {request.payload.relatedChords}
              </span>
            )}
          </div>
        )}
        {hasPayload && request.actionType !== 'delete' && (
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setExpanded(p => !p)}
              className="flex items-center gap-1.5 text-[11px] text-sky-400/70 hover:text-sky-300 transition-colors font-medium"
            >
              <Eye className="w-3 h-3" />
              {expanded ? 'Hide' : 'Preview'} payload
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {request.payload.lyrics && (
              <button
                onClick={() => onViewLyrics(request)}
                className="flex items-center gap-1.5 text-[11px] bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded-lg text-violet-300 hover:bg-violet-500/20 transition-colors font-bold"
              >
                <Music className="w-3 h-3" />
                Show Lyrics
              </button>
            )}
          </div>
        )}
        <AnimatePresence>
          {expanded && hasPayload && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 text-[11px] text-gray-300 font-mono leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
                {request.payload.title && <div><span className="text-sky-400">title:</span> {request.payload.title}</div>}
                {request.payload.scale && <div><span className="text-sky-400">scale:</span> {request.payload.scale}</div>}
                {request.payload.BPM && <div><span className="text-sky-400">BPM:</span>   {request.payload.BPM}</div>}
                {request.payload.timeSignature && request.payload.timeSignature !== 'None' && <div><span className="text-sky-400">timeSig:</span> {request.payload.timeSignature}</div>}
                {request.payload.relatedChords && <div><span className="text-sky-400">chords:</span> {request.payload.relatedChords}</div>}
                {request.payload.party && <div><span className="text-sky-400">party:</span> {Array.isArray(request.payload.party) ? request.payload.party.join(', ') : request.payload.party}</div>}
                {request.payload.lyrics && (
                  <div>
                    <span className="text-sky-400">lyrics:</span>{' '}
                    <span className="text-gray-500 italic">
                      {Array.isArray(request.payload.lyrics)
                        ? `[${request.payload.lyrics.length} sections]`
                        : `${String(request.payload.lyrics).slice(0, 80)}…`}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons — only for pending */}
        {request.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={() => onRejectOpen(request)}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all disabled:opacity-40"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </button>
            <button
              onClick={() => onApprove(request._id)}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/25 text-xs font-bold transition-all disabled:opacity-40"
            >
              {isProcessing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <CheckCircle2 className="w-3.5 h-3.5" />}
              Approve
            </button>
          </div>
        )}

        {/* Reviewed by */}
        {request.status !== 'pending' && request.reviewedByName && (
          <div className="text-[10px] text-gray-600 mt-1 text-right">
            Reviewed by <span className="text-gray-400 font-semibold">{request.reviewedByName}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING PANEL (PROGRAMER only)
// ─────────────────────────────────────────────────────────────────────────────
function PendingHymnsPanel({ isLogin }) {
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState('pending');
  const [processingId, setProcessingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
  const [lyricsTheme, setLyricsTheme] = useState('main');
  const [lyricsFontSize, setLyricsFontSize] = useState(18);
  const [lyricsShowChords, setLyricsShowChords] = useState(true);

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

  // Prevent background scrolling when lyrics modal or presentation modal is open
  React.useEffect(() => {
    const isAnyModalOpen = !!rejectTarget || showLyricsModal || showDataShow;
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
  }, [rejectTarget, showLyricsModal, showDataShow]);

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
        broadcastLocalSlide(dataShowSlides, nextIdx, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle);
      }
      if (e.key === 'ArrowRight' && dataShowIndex > 0) {
        const prevIdx = dataShowIndex - 1;
        setDataShowIndex(prevIdx);
        broadcastLocalSlide(dataShowSlides, prevIdx, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle);
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
        broadcastLocalSlide(dataShowSlides, nextIdx, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle);
      }
      if (swipeDistance > minSwipeDistance && dataShowIndex > 0) {
        const prevIdx = dataShowIndex - 1;
        setDataShowIndex(prevIdx);
        broadcastLocalSlide(dataShowSlides, prevIdx, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle);
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
      broadcastLocalSlide(dataShowSlides, dataShowIndex, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle);
    }
  }, [showDataShow, selectedLyricsHymn, dataShowSlides, dataShowIndex, broadcastLocalSlide]);

  const { data: pendingList = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['hymnsPending', activeFilter, isLogin],
    queryFn: async () => {
      const params = activeFilter !== 'all' ? `?status=${activeFilter}` : '';
      const res = await axios.get(`${API_URL}/hymns/pending${params}`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      return res.data;
    },
    enabled: !!isLogin,
    staleTime: 0,        // always re-fetch when tab switches
    refetchOnMount: true,
  });

  // Count badges for tabs
  const { data: allCounts = {} } = useQuery({
    queryKey: ['hymnsPendingCounts', isLogin],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/hymns/pending`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      const list = res.data;
      return {
        all: list.length,
        pending: list.filter(r => r.status === 'pending').length,
        approved: list.filter(r => r.status === 'approved').length,
        rejected: list.filter(r => r.status === 'rejected').length,
      };
    },
    enabled: !!isLogin,
    staleTime: 0,
    refetchOnMount: true,
  });

  const handleApprove = async (pendingId) => {
    setProcessingId(pendingId);
    try {
      await axios.post(`${API_URL}/hymns/pending/${pendingId}/approve`, {}, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      showToast({ message: '✅ Hymn request approved successfully!', type: 'success', duration: 4000 });
      queryClient.invalidateQueries({ queryKey: ['hymnsPending'] });
      queryClient.invalidateQueries({ queryKey: ['hymnsPendingCounts', isLogin] });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Failed to approve request', type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      await axios.post(
        `${API_URL}/hymns/pending/${rejectTarget._id}/reject`,
        { reviewNote: rejectNote },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      showToast({ message: '❌ Request rejected.', type: 'info', duration: 4000 });
      queryClient.invalidateQueries({ queryKey: ['hymnsPending'] });
      queryClient.invalidateQueries({ queryKey: ['hymnsPendingCounts', isLogin] });
      setRejectTarget(null);
      setRejectNote('');
    } catch (err) {
      console.error(err);
      showToast({ message: 'Failed to reject request', type: 'error' });
    } finally {
      setRejectLoading(false);
    }
  };

  const TABS = [
    { key: 'pending', label: 'Pending', count: allCounts.pending },
    { key: 'approved', label: 'Approved', count: allCounts.approved },
    { key: 'rejected', label: 'Rejected', count: allCounts.rejected },
    { key: 'all', label: 'All', count: allCounts.all },
  ];

  return (
    <div className="mb-16">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 pl-4 border-l-4 border-violet-500">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-6 h-6 text-violet-400" />
            Hymn Approval Queue
            {allCounts.pending > 0 && (
              <span className="text-sm font-extrabold px-2.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 animate-pulse">
                {allCounts.pending} pending
              </span>
            )}
          </h2>
          <p className="text-gray-500 text-sm mt-1">Review and approve hymn changes submitted by team members</p>
        </div>
        <button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['hymnsPending'] });
            queryClient.invalidateQueries({ queryKey: ['hymnsPendingCounts'] });
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 text-sm transition-all self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${activeFilter === tab.key
              ? 'bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
              : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count != null && (
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${activeFilter === tab.key ? 'bg-violet-500/40 text-violet-200' : 'bg-white/10 text-gray-400'
                }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      ) : isError ? (
        <div className="py-12 text-center text-red-400 bg-red-500/5 border border-red-500/20 rounded-2xl">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          Failed to load pending requests. <button onClick={refetch} className="underline ml-1">Retry</button>
        </div>
      ) : pendingList.length === 0 ? (
        <div className="py-16 bg-white/5 rounded-3xl border border-white/10 text-center">
          <Music className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No {activeFilter !== 'all' ? activeFilter : ''} requests found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {pendingList.map(req => (
              <PendingCard
                key={req._id}
                request={req}
                onApprove={handleApprove}
                onRejectOpen={(r) => { setRejectTarget(r); setRejectNote(''); }}
                onViewLyrics={(r) => { setSelectedLyricsHymn(r.payload || r); setShowLyricsModal(true); }}
                processingId={processingId}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Rejection modal */}
      <AnimatePresence>
        {rejectTarget && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setRejectTarget(null)}
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative bg-[#1e293b] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500" />

                <button
                  onClick={() => setRejectTarget(null)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Reject Request</h2>
                    <p className="text-xs text-gray-500 truncate max-w-[250px]">{rejectTarget.hymnTitle}</p>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="text-sm text-gray-400 mb-2 block">
                    Rejection note <span className="text-gray-600">(optional)</span>
                  </label>
                  <textarea
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    rows={3}
                    placeholder="Explain why this request is being rejected…"
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 transition-colors resize-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setRejectTarget(null)}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 font-bold text-sm transition-all border border-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectSubmit}
                    disabled={rejectLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-sm border border-red-500/30 transition-all disabled:opacity-50"
                  >
                    {rejectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Confirm Reject
                  </button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>

      {/* Lyrics Modal — matches Category_Hymns style */}
      {showLyricsModal && selectedLyricsHymn && (
        <Portal>
          <div className="fixed inset-0 z-9999 flex justify-center items-end sm:items-center bg-black/70">
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
                            {selectedLyricsHymn.title || selectedLyricsHymn.hymnTitle}
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
          <div id="showDataContainer" className="fixed inset-0 z-10000 bg-[#020617] flex flex-col">
            {/* ── Shared Header ── */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0f172a] border-b border-white/10 shrink-0 z-20">
              <div className="flex flex-col min-w-0">
                <h2 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">{selectedLyricsHymn.title || selectedLyricsHymn.hymnTitle}</h2>
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
                  onClick={() => { if (dataShowIndex < dataShowSlides.length - 1) { const ni = dataShowIndex + 1; setDataShowIndex(ni); broadcastLocalSlide(dataShowSlides, ni, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle); } }}
                  disabled={dataShowIndex === dataShowSlides.length - 1}
                  className="p-2 rounded-full bg-white/5 border border-white/10 text-white/50 disabled:opacity-20 transition-all active:scale-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <div dir="rtl" className="flex gap-1.5 overflow-x-auto max-w-[60vw]" style={{ scrollbarWidth: 'none' }}>
                  {dataShowSlides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle); }}
                      className={`flex-none rounded-full transition-all duration-200 ${i === dataShowIndex ? 'w-5 h-2 bg-sky-400' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => { if (dataShowIndex > 0) { const ni = dataShowIndex - 1; setDataShowIndex(ni); broadcastLocalSlide(dataShowSlides, ni, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle); } }}
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
                        onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle); }}
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
                        onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title || selectedLyricsHymn?.hymnTitle); }}
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function ChurchS_Dashboards() {
  const queryClient = useQueryClient();
  const { isLogin, UserRole } = useContext(UserContext);

  // States for Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState(null);

  // Form States
  const [churchName, setChurchName] = useState("");
  const [processing, setProcessing] = useState(false);

  // 1. Fetch Churches
  const { data: churches = [], isLoading: loadingChurches } = useQuery({
    queryKey: ['churches', isLogin],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/church`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      return res.data;
    },
    enabled: !!isLogin
  });

  // 2. Fetch All System Users (to show with churches)
  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['systemUsers', isLogin],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/users/all-system-users`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      return res.data;
    },
    enabled: !!isLogin
  });

  const REVIEW_STORAGE_KEY = 'church-dashboard-review-window';
  const [reviewWindowActive, setReviewWindowActive] = useState(false);
  const [reviewWindowStartedAt, setReviewWindowStartedAt] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(REVIEW_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (parsed?.active && parsed?.startedAt) {
        setReviewWindowActive(true);
        setReviewWindowStartedAt(parsed.startedAt);
      }
    } catch (error) {
      console.error('Failed to load review window state', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const payload = reviewWindowActive && reviewWindowStartedAt
      ? { active: true, startedAt: reviewWindowStartedAt }
      : { active: false, startedAt: null };

    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(payload));
  }, [reviewWindowActive, reviewWindowStartedAt]);

  const dailyAdminReviewList = useMemo(() => {
    if (!Array.isArray(allUsers) || !reviewWindowActive || !reviewWindowStartedAt) return [];

    const startTime = new Date(reviewWindowStartedAt);
    if (Number.isNaN(startTime.getTime())) return [];

    return allUsers
      .filter((user) => user?.role === 'WEBSITE_ADMIN' || user?.role === 'MUSIC_ADMIN')
      .map((user) => {
        const approvedCount = Array.isArray(user?.approvedByProgramerHistory)
          ? user.approvedByProgramerHistory.filter((entry) => {
            const approvedAt = entry?.approvedAt ? new Date(entry.approvedAt) : null;
            if (!approvedAt || Number.isNaN(approvedAt.getTime())) return false;
            return approvedAt >= startTime;
          }).length
          : 0;

        return {
          ...user,
          approvedCount,
        };
      })
      .filter((user) => user.approvedCount < 4)
      .sort((a, b) => a.approvedCount - b.approvedCount || (a.Name || '').localeCompare(b.Name || ''));
  }, [allUsers, reviewWindowActive, reviewWindowStartedAt]);

  // Role Check
  const allowedRoles = ['PROGRAMER', 'MANEGER', 'ADMIN'];
  if (!isLogin) return <Login />;

  if (UserRole && !allowedRoles.includes(UserRole)) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
        <h1 className="text-2xl font-bold text-red-500 text-center px-4">
          Access Denied: Only Admins, Managers, and Programmers can access this dashboard.
        </h1>
      </div>
    )
  }

  if (loadingChurches || loadingUsers) return <Loading />;

  // Actions
  const handleAddChurch = async () => {
    if (!churchName.trim()) return;
    setProcessing(true);
    try {
      await axios.post(`${API_URL}/church/createChurch`, { name: churchName }, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      queryClient.invalidateQueries(['churches']);
      setIsAddModalOpen(false);
      setChurchName("");
    } catch (err) {
      console.error(err);
      alert("Failed to create church");
    } finally {
      setProcessing(false);
    }
  }

  const handleUpdateChurch = async () => {
    if (!selectedChurch || !churchName.trim()) return;
    setProcessing(true);
    try {
      await axios.patch(`${API_URL}/church/${selectedChurch._id}`, { name: churchName }, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      queryClient.invalidateQueries(['churches']);
      setIsEditModalOpen(false);
      setSelectedChurch(null);
      setChurchName("");
    } catch (err) {
      console.error(err);
      alert("Failed to update church");
    } finally {
      setProcessing(false);
    }
  }

  const handleDeleteChurch = async (id) => {
    if (!window.confirm("Are you sure? This will delete the church!")) return;
    try {
      await axios.delete(`${API_URL}/church/${id}`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      queryClient.invalidateQueries(['churches']);
    } catch (err) {
      console.error(err);
      alert("Failed to delete church");
    }
  }

  const handleUserRoleChange = async (userId, newRole) => {
    if (!userId || !newRole) return;
    try {
      await axios.patch(`${API_URL}/users/system/role/${userId}`, { role: newRole }, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      queryClient.invalidateQueries(['systemUsers']);
    } catch (err) {
      console.error(err);
      alert("Failed to update user role");
    }
  }

  const openEditModal = (church) => {
    setSelectedChurch(church);
    setChurchName(church.name);
    setIsEditModalOpen(true);
  }

  return (
    <section className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />
      {/* Subtle violet glow for PROGRAMER panel */}
      {UserRole === 'PROGRAMER' && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.06),transparent_60%)]" />
      )}

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-center bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text drop-shadow-lg flex items-center gap-4">
            <ChurchIcon className="w-10 h-10 sm:w-12 sm:h-12 text-sky-400" />
            Church Dashboard
          </h1>

          <button
            onClick={() => { setChurchName(""); setIsAddModalOpen(true); }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-linear-to-r from-sky-500 to-blue-600 font-bold hover:shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:-translate-y-1 transition-all"
          >
            <Plus className="w-5 h-5" />
            Add Church
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className={`w-4 h-4 mt-0.5 ${reviewWindowActive ? 'text-emerald-300' : 'text-amber-300'}`} />
            <div>
              <p className="text-sm font-semibold text-white">Daily hymn review</p>
              <p className="text-xs text-gray-400">
                {reviewWindowActive
                  ? `Tracking approvals since ${new Date(reviewWindowStartedAt).toLocaleString()}.`
                  : 'Start a day to begin tracking who is below the 4-hymn target.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (reviewWindowActive) {
                setReviewWindowActive(false);
                setReviewWindowStartedAt(null);
              } else {
                setReviewWindowActive(true);
                setReviewWindowStartedAt(new Date().toISOString());
              }
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${reviewWindowActive ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
          >
            {reviewWindowActive ? 'End Day' : 'Start Day'}
          </button>
        </div>

        {reviewWindowActive && dailyAdminReviewList.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-200">Needs attention today</p>
                <p className="text-xs text-amber-100/80">
                  {dailyAdminReviewList.length} website admin{dailyAdminReviewList.length > 1 ? 's are' : ' is'} below the 4-hymn target for the current review day.
                </p>
              </div>
            </div>
            <div className="text-xs text-amber-100/70">
              <div className="font-semibold">{dailyAdminReviewList.slice(0, 3).map((user) => `${user.Name || 'Unnamed'} (${user.approvedCount}/4)`).join(', ')}</div>
              <div>End the day to reset and start again.</div>
            </div>
          </div>
        )}

        {/* ── PROGRAMER ONLY: Pending Hymn Approval Panel ────────────────── */}
        {UserRole === 'PROGRAMER' && (
          <PendingHymnsPanel isLogin={isLogin} />
        )}

        {/* ── Churches Grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {churches.map((church) => {
            // Filter users for this church
            const churchUsers = allUsers.filter(u => u.churchId === church._id);

            return (
              <motion.div
                key={church._id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl relative group overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-sky-500 via-blue-500 to-indigo-500 opacity-80" />

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <h2 className="text-2xl font-bold text-white tracking-tight break-words flex-1 pr-4">
                    {church.name}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(church)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 transition-colors"
                      title="Edit Church"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteChurch(church._id)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-colors"
                      title="Delete Church"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-black/20 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 text-sky-400 mb-3 font-semibold text-sm uppercase tracking-wider">
                    <Users className="w-4 h-4" />
                    <span>Registered Users ({churchUsers.length})</span>
                  </div>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                    {churchUsers.length > 0 ? (
                      churchUsers.map(u => (
                        <div key={u._id} className="flex justify-between items-center text-sm p-2 rounded-lg bg-white/5 border border-white/5">
                          <span className="text-gray-200 truncate max-w-[40%]" title={u.Name}>{u.Name}</span>

                          <select
                            value={u.role || 'USER'}
                            onChange={(e) => handleUserRoleChange(u._id, e.target.value)}
                            className={`text-xs px-2 py-0.5 rounded-lg border outline-none cursor-pointer transition-colors max-w-[50%]
                                                            ${u.role === 'ADMIN' || u.role === 'MANEGER' || u.role === 'PROGRAMER'
                                ? 'border-amber-500/30 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                                : 'border-sky-500/20 text-sky-300/70 bg-sky-500/5 hover:bg-sky-500/10'}`}
                          >
                            <option value="USER" className="bg-[#0f172a] text-gray-300">USER</option>
                            <option value="ADMIN" className="bg-[#0f172a] text-amber-300">ADMIN</option>
                            <option value="MANEGER" className="bg-[#0f172a] text-emerald-300">MANEGER</option>
                            <option value="PROGRAMER" className="bg-[#0f172a] text-sky-300">PROGRAMER</option>
                            <option value="WEBSITE_ADMIN" className="bg-[#0f172a] text-rose-300">WEBSITE_ADMIN</option>
                            <option value="MUSIC_ADMIN" className="bg-[#0f172a] text-indigo-300">MUSIC_ADMIN</option>
                          </select>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm italic">No users found.</p>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  ID: {church._id}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {(isAddModalOpen || isEditModalOpen) && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative bg-[#1e293b] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-sky-500 to-blue-600" />
                <button
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <h2 className="text-2xl font-bold text-white mb-6">
                  {isAddModalOpen ? 'Create New Church' : 'Update Church'}
                </h2>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Church Name</label>
                    <input
                      type="text"
                      value={churchName}
                      onChange={(e) => setChurchName(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500/50 transition-colors"
                      placeholder="Enter church name..."
                      autoFocus
                    />
                  </div>

                  <button
                    onClick={isAddModalOpen ? handleAddChurch : handleUpdateChurch}
                    disabled={processing}
                    className="w-full bg-linear-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold py-3 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {isAddModalOpen ? 'Create Church' : 'Save Changes'}
                  </button>
                </div>
              </motion.div>
            </div>
          </Portal>
        )}
      </AnimatePresence>
    </section>
  )
}
