"use client";

import React, { useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { UserContext } from '../context/User_Context';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../loading';
import { 
  Check, 
  X, 
  ShieldAlert, 
  User, 
  Mail, 
  BookOpen, 
  RefreshCw, 
  Users,
  PlusCircle,
  Calendar,
  Music,
  Trash2
} from 'lucide-react';

const API_URL = "https://worship-team-api.vercel.app/api";

export default function Dashboard() {
  const { isLogin, UserRole, churchId } = useContext(UserContext);
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState(null);
  const [newEventName, setNewEventName] = useState("");

  // --- 1. API Fetching Functions ---
  
  const fetchPendingUsers = async () => {
    const res = await axios.get(`${API_URL}/users/pending`, {
      headers: { Authorization: `Bearer ${isLogin}` },
    });
    return res.data;
  };

  const fetchAll_ChurchID_Users = async () => {
    const res = await axios.get(`${API_URL}/users/my-church`, {
      headers: { Authorization: `Bearer ${isLogin}` },
    });
    return res.data;
  };

  const fetchChurchEvents = async () => {
    const res = await axios.get(`${API_URL}/events`, {
      headers: { Authorization: `Bearer ${isLogin}` },
    });
    return res.data;
  };

  // --- 2. Action Handlers ---

  const handleCreateEvent = async () => {
    if (!newEventName) return;
    setProcessingId("CREATE_EVENT");
    try {
      await axios.post(`${API_URL}/events/create`, 
        { eventName: newEventName },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      setNewEventName("");
      queryClient.invalidateQueries(['churchEvents']);
    } finally { setProcessingId(null); }
  };

  const toggleUserInEvent = async (userId, eventId) => {
    setProcessingId(`${userId}-${eventId}`);
    try {
      await axios.patch(`${API_URL}/events/toggle/${userId}/${eventId}`, {}, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      queryClient.invalidateQueries(['AllUsersChurch']);
    } finally { setProcessingId(null); }
  };

  const handleStatusChange = async (userId, newStatus) => {
    setProcessingId(userId);
    try {
      await axios.patch(`${API_URL}/users/status/${userId}`, { status: newStatus }, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries(['pendingUsers']);
      queryClient.invalidateQueries(['AllUsersChurch']);
    } finally { setProcessingId(null); }
  };

  const handleRoleChange = async (userId, newRole) => {
    setProcessingId(userId);
    try {
      await axios.patch(`${API_URL}/users/role/${userId}/${churchId}`, { role: newRole }, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries(['AllUsersChurch']);
    } finally { setProcessingId(null); }
  };

  const resetAllTraining = async () => {
    if (!confirm("هل أنت متأكد من مسح جميع بيانات التدريب والحفلات لكل الأعضاء؟")) return;
    setProcessingId("RESET_ALL");
    try {
      await axios.patch(`${API_URL}/users/training/reset/${churchId}`, {}, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries(['AllUsersChurch']);
    } finally { setProcessingId(null); }
  };

  // --- 3. React Query Hooks ---

  const { data: pendingUsers = [], isLoading: isLoadingPending } = useQuery({
    queryKey: ['pendingUsers', isLogin],
    queryFn: fetchPendingUsers,
    enabled: !!isLogin,
  });

  const { data: UsersChurch = [], isLoading: isLoadingChurch } = useQuery({
    queryKey: ['AllUsersChurch', isLogin],
    queryFn: fetchAll_ChurchID_Users,
    enabled: !!isLogin,
  });

  const { data: churchEvents = [], isLoading: isLoadingEvents } = useQuery({
    queryKey: ['churchEvents', isLogin],
    queryFn: fetchChurchEvents,
    enabled: !!isLogin,
  });

  if (isLoadingPending || isLoadingChurch || isLoadingEvents) return <Loading />;

  return (
    <section className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative z-10">
        
        <h1 className="text-3xl sm:text-5xl font-extrabold mb-12 text-center bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text flex items-center justify-center gap-4">
          <ShieldAlert className="w-10 h-10 text-sky-400" /> Admin Dashboard
        </h1>

        {/* ---------------- 1. EVENT MANAGEMENT SECTION ---------------- */}
        <div className="mb-12 p-6 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Calendar className="text-sky-400 w-6 h-6" /> Quick Event Setup (إنشاء حفلة)
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <input 
              type="text"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="اسم الحفلة (مثلاً: حفلة القيامة 2026)"
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-sky-500 transition-all text-sm"
            />
            <button 
              onClick={handleCreateEvent}
              disabled={processingId === "CREATE_EVENT"}
              className="bg-sky-500 hover:bg-sky-600 px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {processingId === "CREATE_EVENT" ? <RefreshCw className="animate-spin w-4 h-4" /> : <PlusCircle className="w-5 h-5" />}
              Create Event
            </button>
          </div>
        </div>

        {/* ---------------- 2. PENDING APPROVALS ---------------- */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-sky-500 flex items-center justify-between">
            <div className="flex items-center">
              Pending Approvals
              <span className="ml-3 text-sm font-normal text-sky-300 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
                {pendingUsers.length} Requests
              </span>
            </div>
          </h2>

          {pendingUsers.length === 0 ? (
            <div className="py-12 bg-white/5 rounded-3xl border border-white/10 text-center text-gray-400">
              No pending requests.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {pendingUsers.map((user) => (
                  <motion.div
                    key={user._id}
                    layout
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 relative"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center border border-white/10">
                        <User className="w-6 h-6 text-gray-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{user.Name}</h3>
                        <p className="text-xs text-sky-400 uppercase tracking-tighter">{user.role}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => handleStatusChange(user._id, 'rejected')} className="py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-xs">Reject</button>
                      <button onClick={() => handleStatusChange(user._id, 'approved')} className="py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">Approve</button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ---------------- 3. CHURCH MEMBERS & EVENT ASSIGNMENT ---------------- */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-l-4 border-indigo-500 pl-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-400" /> Member Management
            </h2>
            <button onClick={resetAllTraining} className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg transition-all text-sm">
              <RefreshCw className={`w-4 h-4 ${processingId === "RESET_ALL" ? "animate-spin" : ""}`} /> Reset All Training
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {UsersChurch.map((user) => (
              <motion.div
                key={user._id}
                layout
                className="relative p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-indigo-400/30 bg-indigo-400/10">
                    <User className="w-6 h-6 text-indigo-300" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg leading-tight">{user.Name}</h3>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user._id, e.target.value)}
                      className="bg-transparent text-xs text-indigo-400 outline-none cursor-pointer mt-1"
                    >
                      <option className="bg-slate-900" value="USER">USER</option>
                      <option className="bg-slate-900" value="ADMIN">ADMIN</option>
                      <option className="bg-slate-900" value="MANEGER">MANAGER</option>
                    </select>
                  </div>
                </div>

                {/* Event Tags Selection */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                    <Music className="w-3 h-3" /> Assign to Training Events
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {churchEvents.length === 0 && <span className="text-xs text-gray-600">No events created yet.</span>}
                    {churchEvents.map((event) => {
                      const isActive = user.trainingEvents?.some(e => e._id === event._id || e === event._id);
                      const isLocalProcessing = processingId === `${user._id}-${event._id}`;
                      
                      return (
                        <button
                          key={event._id}
                          onClick={() => toggleUserInEvent(user._id, event._id)}
                          disabled={isLocalProcessing}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1.5 ${
                            isActive 
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-lg shadow-sky-500/10' 
                            : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/30'
                          }`}
                        >
                          {isLocalProcessing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                          {event.eventName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Loading Overlay for Global Card actions */}
                {processingId === user._id && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-2xl">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}