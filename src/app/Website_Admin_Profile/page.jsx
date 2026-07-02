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
import { Edit2, Eye, X, PlusCircle, Music, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import StanzaSlideControls from '../components/StanzaSlideControls';
import {
  normalizeStanzaForEdit,
  prepareLyricsForSave,
  sanitizeSlideBreaks,
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

  const { data: adminTasksData, isLoading, refetch } = useQuery({
    queryKey: ['adminTasks'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/hymns/admin-tasks`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      return res.data;
    },
    enabled: !!isLogin && (UserRole === 'WEBSITE_ADMIN' || UserRole === 'PROGRAMER'),
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

  return (
    <section className="min-h-screen bg-[#050510] text-white pt-24 pb-20 px-4 md:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        
        <div className="flex items-center gap-4 bg-white/5 p-6 rounded-2xl border border-white/10">
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
          </div>
        </div>

        {roleData === 'PROGRAMER' ? (
          chunkData.map((adminChunk, i) => (
            <AdminTaskSection key={i} admin={adminChunk.admin} tasks={adminChunk.tasks} openEditModal={openEditModal} openLyrics={openLyrics} />
          ))
        ) : (
          <AdminTaskSection tasks={chunkData} openEditModal={openEditModal} openLyrics={openLyrics} />
        )}

        {/* --- Edit Modal --- */}
        <AnimatePresence>
          {isModalOpen && (
            <Portal>
              <div className="fixed inset-0 z-[9999] flex justify-center items-center bg-black/70 backdrop-blur-sm p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="w-full max-w-md max-h-[90vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative"
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

                    <button
                      onClick={() => edit_Hymn(editingHymnId)}
                      disabled={isSubmitting || !formData.title || !formData.lyrics?.length || formData.lyrics.some(l => !l.text.trim())}
                      className={`mt-4 w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all ${(isSubmitting || !formData.title || !formData.lyrics?.length) ? 'bg-gray-600 cursor-not-allowed' : 'bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500'}`}
                    >
                      {isSubmitting ? t("updating") : t("updateSong")}
                    </button>
                  </div>
                </motion.div>
              </div>
            </Portal>
          )}
        </AnimatePresence>

        {/* --- Lyrics Modal --- */}
        <AnimatePresence>
          {showLyricsModal && selectedLyricsHymn && (
            <Portal>
              <div className="fixed inset-0 z-[9999] flex justify-center items-center bg-black/70 backdrop-blur-sm p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="w-full max-w-lg max-h-[85vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative p-6"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white text-center w-full">{selectedLyricsHymn.title}</h3>
                    <button onClick={() => setShowLyricsModal(false)} className="text-gray-400 hover:text-white absolute top-6 right-6">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="space-y-6" dir="rtl">
                    {Array.isArray(selectedLyricsHymn.lyrics) ? (
                      selectedLyricsHymn.lyrics.map((stanza, idx) => (
                        <div key={idx} className={`p-4 rounded-xl border border-white/5 ${stanza.type === 'chorus' ? 'bg-sky-500/10 border-sky-500/20' : 'bg-white/5'}`}>
                          <div className={`text-sm font-bold mb-3 ${stanza.type === 'chorus' ? 'text-sky-300' : 'text-gray-400'}`}>
                            {stanza.type === 'chorus' ? 'القرار' : `العدد ${stanza.title}`}
                          </div>
                          <div className="text-lg leading-loose text-white whitespace-pre-wrap font-medium">
                            {stanza.text}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-lg leading-loose text-white whitespace-pre-wrap font-medium text-center">
                        {typeof selectedLyricsHymn.lyrics === 'string' ? selectedLyricsHymn.lyrics : 'No lyrics available'}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            </Portal>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function AdminTaskSection({ admin, tasks, openEditModal, openLyrics }) {
  return (
    <div className="bg-[#0c0c20] border border-white/10 rounded-2xl p-6">
      {admin && (
        <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-4">
          Admin: <span className="text-sky-400">{admin.Name}</span>
          <span className="text-gray-500 text-sm ml-4">({tasks.length} tasks)</span>
        </h2>
      )}
      {!admin && (
        <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-4 flex justify-between">
          <span>Your Tasks</span>
          <span className="text-sky-400">{tasks.length} Hymns</span>
        </h2>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <CheckCircle size={48} className="mx-auto mb-4 opacity-50" />
          <p>No hymns need editing at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((hymn) => (
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

              <div className="mt-2 relative z-0">
                <h3 className="text-lg font-bold text-white mb-1" dir="rtl">{hymn.title}</h3>
                <p className="text-xs text-gray-400 line-clamp-2" dir="rtl">
                  {typeof hymn.lyrics === 'string' ? hymn.lyrics : hymn.lyrics?.[0]?.text}
                </p>
              </div>

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
      )}
    </div>
  );
}
