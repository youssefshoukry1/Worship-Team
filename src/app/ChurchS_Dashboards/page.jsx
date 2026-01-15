'use client'
import React, { useContext, useState } from 'react'
import Login from '../login/page'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserContext } from '../context/User_Context'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Edit2, Plus, Church as ChurchIcon, Users, Loader2, X, Save } from 'lucide-react'
import Loading from '../loading'
import Portal from '../Portal/Portal'

const API_URL = "https://worship-team-api.vercel.app/api";

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
  const allowedRoles = ['PROGRAMER', 'programers', 'Programmer'];
  if (!isLogin) return <Login />;
  if (UserRole && !allowedRoles.includes(UserRole)) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
        <h1 className="text-2xl font-bold text-red-500">Access Denied: Programmers Only</h1>
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
    // Optimization: Optimistically update UI could be done here, but invalidating query is safer
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
                                                            ${u.role === 'Admin' || u.role === 'MANEGER'
                                ? 'border-amber-500/30 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                                : 'border-sky-500/20 text-sky-300/70 bg-sky-500/5 hover:bg-sky-500/10'}`}
                          >
                            <option value="USER" className="bg-[#0f172a] text-gray-300">USER</option>
                            <option value="Admin" className="bg-[#0f172a] text-amber-300">Admin</option>
                            <option value="MANEGER" className="bg-[#0f172a] text-emerald-300">MANEGER</option>
                            <option value="PROGRAMER" className="bg-[#0f172a] text-rose-300">PROGRAMER</option>
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
