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
  PauseCircle, // أيقونة للإيقاف
  PlayCircle   // أيقونة للبدء
} from 'lucide-react';

const API_URL = "https://worship-team-api.vercel.app/api";

export default function Dashboard() {
  const { isLogin, UserRole, churchId } = useContext(UserContext);
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState(null);

  // --- API Functions ---
  const fetchPendingUsers = async () => {
    if (!isLogin) return [];
    try {
      const res = await axios.get(`${API_URL}/users/pending`, {
        headers: { Authorization: `Bearer ${isLogin}` },
      });
      return res.data;
    } catch (error) { return []; }
  };

  const fetchAll_ChurchID_Users = async () => {
    if (!isLogin) return [];
    try {
      const res = await axios.get(`${API_URL}/users/my-church`, {
        headers: { Authorization: `Bearer ${isLogin}` },
      });
      return res.data;
    } catch (error) { return []; }
  };

  const toggleTrainingStatus = async (userId, currentStatus) => {
    if (!isLogin || !churchId) return;
    setProcessingId(userId);
    try {
      await axios.patch(
        `${API_URL}/users/training/${userId}`,
        { isInTraining: !currentStatus }, // تم التعديل ليطابق الـ Backend
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      queryClient.invalidateQueries(['AllUsersChurch']);
    } catch (error) {
      alert("Failed to update status.");
    } finally {
      setProcessingId(null);
    }
  };

  // ... (باقي الدوال handleStatusChange و handleRoleChange و resetAllTraining بدون تغيير)
  const handleStatusChange = async (userId, newStatus) => {
    if (!isLogin) return;
    setProcessingId(userId);
    try {
      await axios.patch(`${API_URL}/users/status/${userId}`, { status: newStatus }, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries(['pendingUsers']);
    } finally { setProcessingId(null); }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!isLogin || !churchId) return;
    setProcessingId(userId);
    try {
      await axios.patch(`${API_URL}/users/role/${userId}/${churchId}`, { role: newRole }, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries(['AllUsersChurch']);
    } finally { setProcessingId(null); }
  };

  const resetAllTraining = async () => {
    if (!isLogin || !churchId || !confirm("Reset all?")) return;
    setProcessingId("RESET_ALL");
    try {
      await axios.patch(`${API_URL}/users/training/reset/${churchId}`, {}, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries(['AllUsersChurch']);
    } finally { setProcessingId(null); }
  };

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

  if (isLoadingPending && isLoadingChurch) return <Loading />;

  return (
    <section className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative z-10">
        
        <h1 className="text-3xl sm:text-5xl font-extrabold mb-12 text-center bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text flex items-center justify-center gap-4">
          <ShieldAlert className="w-10 h-10 text-sky-400" /> Admin Dashboard
        </h1>
{/* ---------------- PENDING APPROVALS SECTION ---------------- */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-sky-500 flex items-center">
            Pending Approvals
            <span className="ml-3 text-sm font-normal text-sky-300 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
              {pendingUsers.length} Requests
            </span>
          </h2>

          {pendingUsers.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md"
            >
              <div className="bg-sky-500/10 p-4 rounded-full mb-3">
                <Check className="w-8 h-8 text-sky-400" />
              </div>
              <p className="text-gray-400">No pending requests.</p>
            </motion.div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {pendingUsers.map((user, idx) => (
                  <motion.div
                    key={user._id || idx}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl relative group"
                  >
                    {/* Simplified Pending Card Content (kept from your code) */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center border border-white/10">
                        <User className="w-6 h-6 text-gray-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{user.Name}</h3>
                        <p className="text-xs text-sky-400">{user.role || 'USER'}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-4 text-sm text-gray-400">
                      <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg">
                        <Mail className="w-3 h-3 text-sky-500" /> {user.email}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleStatusChange(user._id, 'rejected')}
                        disabled={processingId === user._id}
                        className="py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 flex justify-center items-center gap-2"
                      >
                        <X className="w-4 h-4" /> Reject
                      </button>
                      <button
                        onClick={() => handleStatusChange(user._id, 'approved')}
                        disabled={processingId === user._id}
                        className="py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 flex justify-center items-center gap-2"
                      >
                        <Check className="w-4 h-4" /> Approve
                      </button>
                    </div>
                    {processingId === user._id && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
                          <Loading className="scale-75" />
                        </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ---------------- CHURCH MEMBERS MANAGEMENT ---------------- */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-l-4 border-indigo-500 pl-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-400" /> Church Members
            </h2>
            <button onClick={resetAllTraining} className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg transition-all text-sm">
              <RefreshCw className={`w-4 h-4 ${processingId === "RESET_ALL" ? "animate-spin" : ""}`} /> Reset All
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {UsersChurch.map((user) => (
              <motion.div
                key={user._id}
                layout
                className={`relative p-5 rounded-2xl border backdrop-blur-md transition-all duration-500 ${
                  user.isInTraining ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10' : 'bg-white/5 border-white/10'
                }`}
              >
                {/* Active Indicator Glow */}
                {user.isInTraining && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-indigo-500/20 px-2 py-1 rounded-full border border-indigo-500/30">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Active</span>
                  </div>
                )}

                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${user.isInTraining ? 'border-indigo-400 bg-indigo-400/20' : 'border-white/10 bg-white/5'}`}>
                    <User className={`w-6 h-6 ${user.isInTraining ? 'text-indigo-300' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">{user.Name}</h3>
                    <select
                      value={user.role || 'USER'}
                      onChange={(e) => handleRoleChange(user._id, e.target.value)}
                      className="bg-transparent text-xs text-indigo-400 font-medium outline-none cursor-pointer mt-1"
                    >
                      <option className="bg-slate-900" value="USER">USER</option>
                      <option className="bg-slate-900" value="ADMIN">ADMIN</option>
                      <option className="bg-slate-900" value="MANEGER">MANAGER</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <BookOpen className={`w-4 h-4 ${user.isInTraining ? 'text-indigo-400' : 'text-gray-600'}`} />
                    <span className={`text-sm font-medium ${user.isInTraining ? 'text-indigo-200' : 'text-gray-500'}`}>
                      Training Mode
                    </span>
                  </div>

                  <button
                    onClick={() => toggleTrainingStatus(user._id, user.isInTraining)}
                    disabled={processingId === user._id}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      user.isInTraining 
                        ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                  >
                    {user.isInTraining ? (
                      <><PauseCircle className="w-4 h-4" /> Stop</>
                    ) : (
                      <><PlayCircle className="w-4 h-4" /> Start</>
                    )}
                  </button>
                </div>

                {/* Small & Clean Loading Overlay */}
                {processingId === user._id && (
                  <div className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px] flex items-center justify-center z-20 rounded-2xl">
                    <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
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