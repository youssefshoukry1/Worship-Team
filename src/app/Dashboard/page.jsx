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
  RefreshCw,
  Users,
  PlusCircle,
  Calendar,
  Music,
  Trash2,
  Edit,
  Settings,
  FileText,
  ChevronDown,
  ChevronUp,
  ClipboardList
} from 'lucide-react';
import Portal from '../Portal/Portal';

const API_URL = "https://worship-team-api.vercel.app/api";

export default function Dashboard() {
  const { isLogin, UserRole, churchId } = useContext(UserContext);
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState(null);
  const [newEventName, setNewEventName] = useState("");
  const [showEventsList, setShowEventsList] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editEventName, setEditEventName] = useState("");
  const [reportInputs, setReportInputs] = useState({});
  const [expandedReports, setExpandedReports] = useState({});
  const [editingReport, setEditingReport] = useState(null);
  const [showManageReports, setShowManageReports] = useState(false);

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

  const handleDeleteEvent = async (eventId) => {
    if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) return;
    setProcessingId(`DELETE_${eventId}`);
    try {
      await axios.delete(`${API_URL}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      queryClient.invalidateQueries(['churchEvents']);
      setSelectedEventId(null);
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Failed to delete event");
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateEvent = async (eventId) => {
    if (!editEventName) return;
    setProcessingId(`UPDATE_${eventId}`);
    try {
      await axios.patch(`${API_URL}/events/edit/${eventId}`,
        { eventName: editEventName },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      queryClient.invalidateQueries(['churchEvents']);
      setEditingEventId(null);
      setEditEventName("");
    } catch (error) {
      console.error("Update Error:", error);
      alert("Failed to update event");
    } finally {
      setProcessingId(null);
    }
  };

  const startEditing = (event) => {
    setEditingEventId(event._id);
    setEditEventName(event.eventName);
  };

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
      queryClient.invalidateQueries({ queryKey: ['data', isLogin] });
    } finally { setProcessingId(null); }
  };

  const handleStatusChange = async (userId, newStatus) => {
    setProcessingId(userId);
    try {
      await axios.patch(`${API_URL}/users/status/${userId}`, { status: newStatus }, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries(['pendingUsers']);
      queryClient.invalidateQueries({ queryKey: ['data', isLogin] });
    } finally { setProcessingId(null); }
  };

  const handleRoleChange = async (userId, newRole) => {
    setProcessingId(userId);
    try {
      await axios.patch(`${API_URL}/users/role/${userId}/${churchId}`, { role: newRole }, { headers: { Authorization: `Bearer ${isLogin}` } });
      queryClient.invalidateQueries({ queryKey: ['data', isLogin] });
    } finally { setProcessingId(null); }
  };

  const handleTrainingToggle = async (userId) => {
    setProcessingId(userId);
    try {
      await axios.patch(`${API_URL}/users/training-status/${userId}`, {}, { headers: { Authorization: `Bearer ${isLogin}` } }); // اتاكد ان ال id ده موجود في الداتا بيز
      queryClient.invalidateQueries({ queryKey: ['data', isLogin] });
    } finally { setProcessingId(null); }
  };

  const resetAllTraining = async () => {
    // 1. تأكد من وجود الـ churchId
    if (!churchId) {
      alert("خطأ: لم يتم العثور على معرف الكنيسة");
      return;
    }

    if (!confirm("هل أنت متأكد من مسح جميع ترانيم التدريب والحفلات لكل الأعضاء؟")) return;

    setProcessingId("RESET_ALL");

    try {
      // 2. إرسال الطلب
      await axios.patch(
        `${API_URL}/users/training/reset/${churchId}`,
        {},
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );

      // 3. الخطوة السحرية: تحديث كل المفاتيح (Invalidate Everything)
      // سنقوم بعمل Invalidate لكل الـ queries التي تبدأ بكلمات معينة لضمان مسح الكاش
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data'] }), // هذا هو المفتاح المستخدم في صفحة الـ Training
        queryClient.invalidateQueries({ queryKey: ['churchEvents'] })
      ]);

      alert("تم تصفير كافة الجداول بنجاح ✅");
    } catch (error) {
      console.error("Reset Error:", error);
      alert("حدث خطأ أثناء التصفير، تأكد من صلاحياتك");
    } finally {
      setProcessingId(null);
    }
  };

  // frontend.js

  const handleAddReport = async (userid, reportText) => {
    setProcessingId(userid);
    try {
      await axios.post(`${API_URL}/users/report`,
        { userid: userid, text: reportText },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      queryClient.invalidateQueries({ queryKey: ['data', isLogin] });
    } finally { setProcessingId(null); }
  };

  // 2. Edit Report
  const handlePatchReport = async (userid, reportId, newText) => {
    setProcessingId(userid);
    try {
      await axios.patch(`${API_URL}/users/report/${userid}`,
        { reportId, text: newText },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      );
      queryClient.invalidateQueries({ queryKey: ['data', isLogin] });
    } finally { setProcessingId(null); }
  };

  // 3. Delete Report
  const handleDeleteReport = async (userid, reportId) => {
    setProcessingId(userid);
    try {
      await axios.delete(`${API_URL}/users/report/${userid}`, {
        data: { reportId },
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      queryClient.invalidateQueries({ queryKey: ['data', isLogin] });
    } finally { setProcessingId(null); }
  };
  const toggleReportExpand = (userId, index) => {
    const key = `${userId}-${index}`;
    setExpandedReports(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // --- 3. React Query Hooks ---

  const { data: pendingUsers = [], isLoading: isLoadingPending } = useQuery({
    queryKey: ['pendingUsers', isLogin],
    queryFn: fetchPendingUsers,
    enabled: !!isLogin,
  });

  const { data: UsersChurch = [], isLoading: isLoadingChurch } = useQuery({
    queryKey: ['data', isLogin],
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

          <div className="mt-6 border-t border-white/10 pt-6">
            <button
              onClick={() => setShowEventsList(!showEventsList)}
              className="flex items-center gap-2 text-sky-400 font-bold hover:text-sky-300 transition-colors"
            >
              <Settings className="w-5 h-5" /> Events Management
            </button>

            <AnimatePresence>
              {showEventsList && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-3">
                    {churchEvents.map(event => (
                      <div key={event._id} className="bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 transition-colors">

                        {editingEventId === event._id ? (
                          <div className="flex gap-2">
                            <input
                              value={editEventName}
                              onChange={(e) => setEditEventName(e.target.value)}
                              className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1 text-sm outline-none focus:border-sky-500"
                            />
                            <button onClick={() => handleUpdateEvent(event._id)} disabled={processingId === `UPDATE_${event._id}`} className="text-emerald-400 p-1 hover:bg-emerald-500/10 rounded">
                              {processingId === `UPDATE_${event._id}` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditingEventId(null)} className="text-red-400 p-1 hover:bg-red-500/10 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div
                              onClick={() => setSelectedEventId(selectedEventId === event._id ? null : event._id)}
                              className="font-bold text-lg cursor-pointer flex justify-between items-center"
                            >
                              {event.eventName}
                              <Calendar className="w-4 h-4 text-gray-500" />
                            </div>

                            <AnimatePresence>
                              {selectedEventId === event._id && (
                                <motion.div
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -10 }}
                                  className="flex gap-2 mt-3 pt-3 border-t border-white/10"
                                >
                                  <button
                                    onClick={() => startEditing(event)}
                                    className="flex-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                                  >
                                    <Edit className="w-3 h-3" /> Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEvent(event._id)}
                                    disabled={processingId === `DELETE_${event._id}`}
                                    className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                                  >
                                    {processingId === `DELETE_${event._id}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    Delete
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </div>
                    ))}
                    {churchEvents.length === 0 && <p className="text-gray-400 text-sm">No events found.</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
            <div className="flex gap-2">
              <button onClick={() => setShowManageReports(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg transition-all text-sm">
                <ClipboardList className="w-4 h-4" /> Manage Reports
              </button>
              <button onClick={resetAllTraining} className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg transition-all text-sm">
                <RefreshCw className={`w-4 h-4 ${processingId === "RESET_ALL" ? "animate-spin" : ""}`} /> Reset All Training
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {UsersChurch.map((user) => (
              <motion.div
                key={user._id}
                layout
                className="relative p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md"
              >
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4">
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
                  <div className="flex flex-col items-end gap-1 text-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">In Training</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.isInTraining}
                        onChange={() => handleTrainingToggle(user._id)}
                        className="sr-only peer"
                        disabled={processingId === user._id}
                      />
                      <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500"></div>
                    </label>
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
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1.5 ${isActive
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

                {/* Reports Section */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1 mb-3">
                    <FileText className="w-3 h-3" /> Reports
                  </h4>

                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Add a report..."
                      value={reportInputs[user._id] || ""}
                      onChange={(e) => setReportInputs(prev => ({ ...prev, [user._id]: e.target.value }))}
                      className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-sky-500 text-gray-300"
                    />
                    <button
                      onClick={async () => {
                        const text = reportInputs[user._id];
                        if (!text) return;
                        await handleAddReport(user._id, text);
                        setReportInputs(prev => ({ ...prev, [user._id]: "" }));
                      }}
                      disabled={processingId === user._id}
                      className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {processingId === user._id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PlusCircle className="w-3 h-3" />}
                    </button>
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

        {/* Manage Reports Modal */}
        <Portal>
          <AnimatePresence>
            {showManageReports && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2"
              >
                <motion.div
                  initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                  className="bg-[#0f172a] border border-white/10 rounded-2xl w-full h-[90vh] max-w-6xl overflow-hidden flex flex-col shadow-2xl"
                >
                  <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-sky-400" /> Reports Management
                    </h2>
                    <button onClick={() => setShowManageReports(false)} className="text-gray-400 hover:text-white transition-colors p-1">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3">
                    {UsersChurch.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <p className="text-sm">No users found</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {UsersChurch.map(user => (
                          <motion.div key={user._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-white/5 to-white/3 rounded-xl p-3 border border-white/10 hover:border-sky-500/30 transition-all flex flex-col">
                            {/* User Header */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                  {user.Name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-semibold text-white text-sm truncate">{user.Name}</h3>
                                  <p className="text-xs text-gray-400">{user.role}</p>
                                </div>
                              </div>
                              {user.reports && user.reports.length > 0 && (
                                <div className="bg-sky-500/20 px-2 py-0.5 rounded-full border border-sky-500/30 flex-shrink-0">
                                  <span className="text-xs font-medium text-sky-300">{user.reports.length}</span>
                                </div>
                              )}
                            </div>

                            {/* Reports List */}
                            <div className="space-y-1 flex-1 overflow-y-auto">
                              {!user.reports || user.reports.length === 0 ? (
                                <div className="text-center py-2 px-2 rounded-lg bg-white/3 border border-dashed border-white/10">
                                  <p className="text-xs text-gray-500">No reports</p>
                                </div>
                              ) : (
                                user.reports.map((report, index) => {
                                  const reportText = report.text || report.report || (typeof report === 'string' ? report : "");
                                  const reportId = report._id;
                                  const isExpanded = expandedReports[`${user._id}-${index}`];

                                  return (
                                    <div key={reportId || index} className="bg-white/3 rounded-lg overflow-hidden border border-white/5 hover:border-sky-500/20 transition-all text-xs">
                                      {/* Report Header */}
                                      <div
                                        onClick={() => toggleReportExpand(user._id, index)}
                                        className="flex items-center justify-between p-2 cursor-pointer hover:bg-white/5 transition-colors"
                                      >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <FileText className="w-3 h-3 text-sky-400 flex-shrink-0" />
                                          {!isExpanded && reportText && (
                                            <p className="text-gray-400 truncate">{reportText}</p>
                                          )}
                                          {isExpanded && (
                                            <span className="text-gray-300 font-medium">Report {index + 1}</span>
                                          )}
                                        </div>
                                        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
                                          {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                                        </motion.div>
                                      </div>

                                      {/* Report Content */}
                                      <AnimatePresence>
                                        {isExpanded && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="border-t border-white/5"
                                          >
                                            {editingReport?.userId === user._id && editingReport?.index === index ? (
                                              <div className="p-2 space-y-1">
                                                <textarea
                                                  value={editingReport.text}
                                                  onChange={(e) => setEditingReport(prev => ({ ...prev, text: e.target.value }))}
                                                  className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-sky-500 focus:bg-black/40 resize-none"
                                                  rows="2"
                                                />
                                                <div className="flex gap-1 justify-end">
                                                  <button onClick={() => {
                                                    handlePatchReport(user._id, reportId, editingReport.text);
                                                    setEditingReport(null);
                                                  }} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 px-2 py-1 rounded transition-colors text-xs font-medium flex items-center gap-1">
                                                    <Check className="w-2.5 h-2.5" /> Save
                                                  </button>
                                                  <button onClick={() => setEditingReport(null)} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1 rounded transition-colors text-xs font-medium flex items-center gap-1">
                                                    <X className="w-2.5 h-2.5" /> Cancel
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="p-2 space-y-1">
                                                <p className="text-gray-300 whitespace-pre-wrap leading-snug max-h-24 overflow-hidden text-xs">{reportText}</p>

                                                <div className="flex justify-end gap-1 pt-1 border-t border-white/5">
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setEditingReport({ userId: user._id, index, text: reportText });
                                                    }}
                                                    className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-1.5 py-0.5 rounded transition-colors text-xs flex items-center gap-0.5"
                                                  >
                                                    <Edit className="w-2.5 h-2.5" /> Edit
                                                  </button>
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (confirm("Delete this report?")) handleDeleteReport(user._id, reportId);
                                                    }}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-1.5 py-0.5 rounded transition-colors text-xs flex items-center gap-0.5"
                                                  >
                                                    <Trash2 className="w-2.5 h-2.5" /> Delete
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </Portal>
      </div>
    </section>
  );
}