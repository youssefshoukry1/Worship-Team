'use client'
import React, { useContext, useState } from 'react'
import Login from '../login/page'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserContext } from '../context/User_Context'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2, Edit2, Plus, Church as ChurchIcon, Users, Loader2, X, Save,
  Music, Clock, CheckCircle2, XCircle, AlertCircle, ChevronDown,
  RefreshCw, Eye, MessageSquare, Filter, Shield
} from 'lucide-react'
import Loading from '../loading'
import Portal from '../Portal/Portal'
import { showToast } from '../components/ToastContainer'

const API_URL = "https://worship-team-api.onrender.com/api";

// ─── Action type badge config ─────────────────────────────────────────────────
const ACTION_CONFIG = {
  create: { label: 'CREATE', color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  edit:   { label: 'EDIT',   color: 'text-amber-300',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30' },
  delete: { label: 'DELETE', color: 'text-red-300',     bg: 'bg-red-500/15',     border: 'border-red-500/30' },
};

// ─── Status badge config ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: 'Pending',  Icon: Clock,         color: 'text-sky-300',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  approved: { label: 'Approved', Icon: CheckCircle2,  color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  rejected: { label: 'Rejected', Icon: XCircle,       color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
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
function PendingCard({ request, onApprove, onRejectOpen, processingId }) {
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
      <div className={`h-0.5 w-full ${
        request.actionType === 'create' ? 'bg-emerald-500' :
        request.actionType === 'edit'   ? 'bg-amber-500'   : 'bg-red-500'
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
            <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 ${
              request.requestedByRole === 'ADMIN' ? 'text-amber-400' :
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

        {/* Payload preview toggle */}
        {hasPayload && request.actionType !== 'delete' && (
          <button
            onClick={() => setExpanded(p => !p)}
            className="flex items-center gap-1.5 text-[11px] text-sky-400/70 hover:text-sky-300 transition-colors mb-3 font-medium"
          >
            <Eye className="w-3 h-3" />
            {expanded ? 'Hide' : 'Preview'} payload
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
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
                {request.payload.BPM   && <div><span className="text-sky-400">BPM:</span>   {request.payload.BPM}</div>}
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
        pending:  list.filter(r => r.status === 'pending').length,
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
    { key: 'pending',  label: 'Pending',  count: allCounts.pending },
    { key: 'approved', label: 'Approved', count: allCounts.approved },
    { key: 'rejected', label: 'Rejected', count: allCounts.rejected },
    { key: 'all',      label: 'All',      count: allCounts.all },
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
              activeFilter === tab.key
                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count != null && (
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                activeFilter === tab.key ? 'bg-violet-500/40 text-violet-200' : 'bg-white/10 text-gray-400'
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
