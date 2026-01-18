"use client";

import React, { useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { UserContext } from '../context/User_Context';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../loading';
import { Check, X, ShieldAlert, User, Mail, Calendar, Edit3 } from 'lucide-react';

// Using localhost to access the new backend changes locally as per user request context.
// utilizing port 4000 based on backend config.
const API_URL = "https://worship-team-api.vercel.app/api/users";

export default function Dashboard() {
  const { isLogin, UserRole, churchId } = useContext(UserContext);
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState(null);

  const fetchPendingUsers = async () => {
    if (!isLogin) return [];
    try {
      const res = await axios.get(`${API_URL}/pending`, {
        headers: { Authorization: `Bearer ${isLogin}` },
      });
      return res.data;
    } catch (error) {
      console.error("Error fetching pending users:", error);
      return [];
    }
  };

  const handleStatusChange = async (userId, newStatus) => {
    if (!isLogin) return;
    setProcessingId(userId);
    try {
      await axios.patch(
        `${API_URL}/status/${userId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      queryClient.invalidateQueries(['pendingUsers']);
    } catch (error) {
      console.error(`Error setting status to ${newStatus}:`, error);
      alert("Failed to update status. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!isLogin || !churchId) return;
    setProcessingId(userId);
    try {
      // Route: /role/:userid/:churchId
      await axios.patch(
        `${API_URL}/role/${userId}/${churchId}`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      queryClient.invalidateQueries(['pendingUsers']);
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Failed to update role. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const { data: pendingUsers = [], isLoading, isError } = useQuery({
    queryKey: ['pendingUsers', isLogin],
    queryFn: fetchPendingUsers,
    enabled: !!isLogin,
  });

  if (isLoading) return <Loading />;

  return (
    <section className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />

      <div className="max-w-7xl mx-auto relative z-10">
        <h1 className="text-3xl sm:text-5xl font-extrabold mb-12 text-center bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text drop-shadow-lg flex items-center justify-center gap-4">
          <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-sky-400" />
          Admin Dashboard
        </h1>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-sky-500">
            Pending Approvals
            <span className="ml-3 text-sm font-normal text-sky-300 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
              {pendingUsers.length} Requests
            </span>
          </h2>

          {pendingUsers.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md"
            >
              <div className="bg-sky-500/10 p-6 rounded-full mb-4">
                <Check className="w-12 h-12 text-sky-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-300">All caught up!</h3>
              <p className="text-gray-500 mt-2">No pending user requests at the moment.</p>
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
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    whileHover={{ y: -5 }}
                    className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl overflow-hidden relative group"
                  >
                    {/* Glow Effect */}
                    <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                      <div className="w-16 h-16 bg-sky-500/20 rounded-full blur-xl absolute -top-4 -right-4" />
                    </div>

                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-linear-to-br from-gray-700 to-gray-900 flex items-center justify-center border border-white/10 shadow-inner">
                          <User className="w-6 h-6 text-gray-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white leading-tight">{user.Name}</h3>

                          {/* Role Selector */}
                          <div className="mt-2 flex items-center gap-2">
                            <select
                              value={user.role || 'USER'}
                              onChange={(e) => handleRoleChange(user._id, e.target.value)}
                              disabled={processingId === user._id || (UserRole !== 'Admin' && UserRole !== 'MANEGER')}
                              className="bg-black/40 border border-white/10 text-xs rounded-lg px-2 py-1 text-sky-300 outline-none focus:border-sky-500/50 cursor-pointer hover:bg-black/60 transition-colors"
                            >
                              <option value="USER">USER</option>
                              <option value="ADMIN">ADMIN</option>
                              <option value="MANEGER">MANEGER</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-3 text-sm text-gray-400 bg-black/20 p-2 rounded-lg">
                        <Mail className="w-4 h-4 text-sky-500" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      {user.createdAt && (
                        <div className="flex items-center gap-3 text-sm text-gray-400 bg-black/20 p-2 rounded-lg">
                          <Calendar className="w-4 h-4 text-sky-500" />
                          <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleStatusChange(user._id, 'rejected')}
                        disabled={processingId === user._id}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                      >
                        <X className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleStatusChange(user._id, 'approved')}
                        disabled={processingId === user._id}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed group/btn shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                      >
                        <Check className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                        Approve
                      </button>
                    </div>

                    {processingId === user._id && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
                        <Loading className="scale-100" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
