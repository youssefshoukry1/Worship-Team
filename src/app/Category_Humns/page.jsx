'use client';
import React, { useState, useContext } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../loading';
import Portal from '../Portal/Portal';
import { UserContext } from '../context/User_Context';
import { Music, Calendar, Star, Gift, Sparkles, PlayCircle, PlusCircle, Trash2, X, Heart, GraduationCap, FolderPlus, Check } from 'lucide-react';
import { HymnsContext } from '../context/Hymns_Context';

export default function Category_Humns() {
  const queryClient = useQueryClient();
  const { isLogin, UserRole } = useContext(UserContext);
  const { addToWorkspace, isHymnInWorkspace } = useContext(HymnsContext)
  // Re-introduced for Role checks
  const [activeTab, setActiveTab] = useState('all');


  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [formData, setFormData] = useState({ title: '', scale: '', relatedChords: '', link: '', party: 'All' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- API Functions ---

  // 1. Fetch Hymns
  const fetchHymns = async () => {
    let url = "https://worship-team-api.vercel.app/api/hymns";

    // Adjust URL based on Active Tab
    if (activeTab === 'christmass') {
      url = "https://worship-team-api.vercel.app/api/hymns/christmass";
    } else if (activeTab === 'easter') {
      url = "https://worship-team-api.vercel.app/api/hymns/easter";
    } else if (activeTab === 'newyear') {
      url = "https://worship-team-api.vercel.app/api/hymns/newyear";
    } else if (activeTab === 'motherday') {
      url = "https://worship-team-api.vercel.app/api/hymns/motherday";
    } else if (activeTab === 'graduation') {
      url = "https://worship-team-api.vercel.app/api/hymns/graduation";
    }

    try {
      const { data } = await axios.get(url);
      return data;
    } catch (error) {
      console.error("Error fetching hymns:", error);
      return [];
    }
  };

  // 2. Add Hymn (Post)
  const add_Hymn = async () => {
    if (!isLogin) return;
    setIsSubmitting(true);
    try {
      // User: Replace this URL with your actual Create/Post API endpoint
      const url = "https://worship-team-api.vercel.app/api/hymns/create";

      await axios.post(url, formData, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      queryClient.invalidateQueries(["humns"]);
      closeModal();
      setFormData({ title: '', scale: '', relatedChords: '', link: '', party: 'All' });
    } catch (error) {
      console.error("Error adding hymn:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Delete Hymn by ID
  const delete_Hymn = async (id) => {
    if (!isLogin) return;
    if (!confirm("Are you sure you want to delete this hymn?")) return;

    try {
      // User: Replace this URL with your actual Delete API endpoint
      const url = `https://worship-team-api.vercel.app/api/hymns/${id}`;

      await axios.delete(url, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      queryClient.invalidateQueries(["humns"]);
    } catch (error) {
      console.error("Error deleting hymn:", error);
    }
  };

  // 4. Delete All Hymns (Utility Function - Use with Caution)
  const delete_All_Hymns = async () => {
    if (!isLogin) return;
    if (!confirm("WARNING: This will delete ALL hymns. Are you sure?")) return;

    try {
      // User: Replace this URL with your actual Delete All API endpoint
      const url = "https://worship-team-api.vercel.app/api/hymns";

      await axios.delete(url, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      queryClient.invalidateQueries(["humns"]);
    } catch (error) {
      console.error("Error deleting all hymns:", error);
    }
  };

  const { data: humns = [], isLoading } = useQuery({
    queryKey: ["humns", activeTab],
    queryFn: fetchHymns,
  });

  // --- Modal Helpers ---
  const openModal = () => {
    // Pre-fill party based on active tab if specific
    setFormData(prev => ({
      ...prev,
      party: activeTab === 'all' ? 'all' :
        activeTab === 'christmass' ? 'christmass' :
          activeTab === 'easter' ? 'easter' :
            activeTab === 'newyear' ? 'newyear' :
              activeTab === 'motherday' ? 'motherday' :
                activeTab === 'graduation' ? 'graduation' : 'all'
    }));
    setShowModal(true);
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
    }, 300);
  };

  const categories = [
    { id: 'all', label: 'All Hymns', icon: Music },
    { id: 'christmass', label: 'Christmas', icon: Gift },
    { id: 'easter', label: 'Easter', icon: Star },
    { id: 'newyear', label: 'New Year', icon: Sparkles },
    { id: 'motherday', label: 'Mother Day', icon: Heart },
    { id: 'graduation', label: 'Graduation', icon: GraduationCap },
  ];

  // Helper to check permission
  const canEdit = UserRole === 'ADMIN' || UserRole === 'MANEGER';

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };



  return (
    <section id="Category_Humns" className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />

      <div className="relative z-10 max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-extrabold mb-10 text-center bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text drop-shadow-lg">
          🎶 Hymns Library
        </h1>

        {/* Categories Tabs */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeTab === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 border backdrop-blur-md relative overflow-hidden group
                  ${isActive
                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 shadow-[0_0_20px_rgba(56,189,248,0.3)]'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-sky-400/10 blur-xl rounded-full" />
                )}
                <Icon className={`w-5 h-5 relative z-10 ${isActive ? 'text-sky-300' : ''}`} />
                <span className="font-medium relative z-10">{cat.label}</span>
              </button>
            )
          })}
        </div>

        {/* Admin Controls */}
        {canEdit && (
          <div className="flex flex-wrap justify-end items-center gap-3 mb-6">
            <button
              onClick={delete_All_Hymns}
              className="group flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-all duration-300 relative overflow-hidden"
              title="Delete All Hymns"
            >
              <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={openModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full hover:bg-gray-100 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_rgba(255,255,255,0.5)] active:scale-95 font-semibold text-sm"
            >
              <PlusCircle className="w-5 h-5" />
              <span>New Hymn</span>
            </button>
          </div>
        )}

        {/* Content Table/List */}
        {isLoading ? (
          <Loading />
        ) : (
          <div className="relative">
            {/* Table Header - Hidden on small mobile for cleaner look */}
            {/* Table Header - Hidden on small mobile for cleaner look */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest bg-white/5 rounded-t-2xl border-b border-white/10 mx-2">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-11 sm:col-span-5 md:col-span-5">Song Title</div>
              <div className="col-span-2 text-center bg-white/5 rounded-lg py-1">Key / Chords</div>
              <div className="col-span-3 text-center">Media</div>
              <div className="col-span-1 text-center">Action</div>
            </div>

            {/* List Body */}
            <motion.div
              className="flex flex-col gap-3 mt-2 pb-20"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {humns.length > 0 ? (
                humns.map((humn, index) => (
                  <motion.div
                    key={humn._id || index}
                    variants={itemVariants}
                    className="group relative grid grid-cols-12 gap-4 p-4 sm:p-5 items-center 
                               bg-[#13132b]/60 hover:bg-[#1a1a38] 
                               border border-white/5 hover:border-sky-500/30 
                               rounded-2xl transition-all duration-300 backdrop-blur-sm
                               hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
                  >
                    {/* Hover Glow Gradient */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-500/5 via-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                    {/* Index */}
                    <div className="col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
                      {(index + 1).toString().padStart(2, '0')}
                    </div>

                    {/* Song Title & Mobile Info */}
                    <div className="col-span-11 sm:col-span-5 md:col-span-5 relative z-10">
                      <h3 className="font-bold text-base sm:text-lg text-gray-200 group-hover:text-white transition-colors tracking-wide">
                        {humn.title}
                      </h3>

                      {/* Mobile Row Layout */}
                                          <div className="sm:hidden mt-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {humn.scale && (
                                                    <span className="text-[10px] font-bold  text-blue-200  px-2 py-0.5 rounded-md ">
                                                        <KeyDisplay humn={humn} />
                                                    </span>
                                                )}
                                            </div>

                        <div className="flex items-center gap-3">
                          {humn.link && (
                            <a
                              href={humn.link}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/20 text-gray-300 border border-white/10 hover:bg-sky-500/20 hover:text-sky-300 hover:border-sky-500/20 text-xs font-bold transition-all"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                              Listen
                            </a>
                          )}
                          <button
                            onClick={() => addToWorkspace(humn)}
                            disabled={isHymnInWorkspace(humn._id)}
                            className={`p-2 rounded-lg border transition-all
                              ${isHymnInWorkspace(humn._id)
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20 active:scale-95'}`}
                            title={isHymnInWorkspace(humn._id) ? "Added to Workspace" : "Add to Workspace"}
                          >
                            {isHymnInWorkspace(humn._id) ? <Check className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => delete_Hymn(humn._id)}
                              className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Desktop Key/Scale */}
                    <div className="hidden sm:block col-span-2 text-center relative z-10">
                      <KeyDisplay humn={humn} />
                    </div>



                    {/* Desktop Media Link */}
                    <div className="hidden sm:flex col-span-3 justify-center relative z-10">
                      {humn.link ? (
                        <a
                          href={humn.link}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10"
                        >
                          <PlayCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">Listen</span>
                        </a>
                      ) : (
                        <span className="text-gray-700 text-xs">—</span>
                      )}
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden sm:flex col-span-1 justify-center gap-2 relative z-10">
                      <button
                        onClick={() => addToWorkspace(humn)}
                        disabled={isHymnInWorkspace(humn._id)}
                        className={`p-2.5 rounded-xl transition-all duration-300
                          ${isHymnInWorkspace(humn._id)
                            ? 'text-green-400 bg-green-500/10 cursor-default'
                            : 'text-gray-400 hover:text-purple-400 hover:bg-purple-500/10'}`}
                        title={isHymnInWorkspace(humn._id) ? "Added to Workspace" : "Add to Workspace"}
                      >
                        {isHymnInWorkspace(humn._id) ? <Check className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
                      </button>

                      {canEdit && (
                        <button
                          onClick={() => delete_Hymn(humn._id)}
                          className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Delete Song"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="p-20 text-center flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                  <Music className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No hymns found in this category.</p>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* --- Add Hymn Modal --- */}
        {showModal && (
          <Portal>
            <div
              className={`fixed inset-0 z-[9999] flex justify-center items-center p-4 transition-all duration-300
                ${isClosing ? "opacity-0 backdrop-blur-sm" : "opacity-100 backdrop-blur-md bg-black/70"}`}
            >
              <div
                className={`w-full max-w-md max-h-[90vh] bg-[#0c0c20] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto relative transform transition-all duration-300
                  ${isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
              >
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                    🎵 Add New Hymn
                  </h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-white transition">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Form */}
                <div className="p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Song Title</label>
                    <input
                      type="text"
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                      placeholder="e.g. Amazing Grace"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Scale</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition"
                        placeholder="e.g. C Major"
                        value={formData.scale}
                        onChange={(e) => setFormData({ ...formData, scale: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Category</label>
                      <select
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition [&>option]:bg-gray-900"
                        value={formData.party}
                        onChange={(e) => setFormData({ ...formData, party: e.target.value })}
                      >
                        <option value="all">All / General</option>
                        <option value="christmass">Christmas</option>
                        <option value="easter">Easter</option>
                        <option value="newyear">New Year</option>
                        <option value="motherday">Mother Day</option>
                        <option value="graduation">Graduation</option>
                      </select>
                    </div>
                  </div>



                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Related Chords</label>
                    <input
                      type="text"
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition placeholder-gray-600"
                      placeholder="e.g. G, C, D, Em"
                      value={formData.relatedChords}
                      onChange={(e) => setFormData({ ...formData, relatedChords: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 text-sm mb-2">YouTube Link (Optional)</label>
                    <input
                      type="text"
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition"
                      placeholder="https://youtube.com/..."
                      value={formData.link}
                      onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                    />
                  </div>

                  <button
                    onClick={add_Hymn}
                    disabled={isSubmitting || !formData.title}
                    className={`mt-4 w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all
                      ${isSubmitting
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
                  >
                    {isSubmitting ? 'Adding...' : 'Add Song'}
                  </button>
                </div>

              </div>
            </div>
          </Portal>
        )}
      </div>
    </section >
  )
}

// Sub-component for handling Key/Chords toggle state
function KeyDisplay({ humn }) {
  const [showChords, setShowChords] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold px-3 py-1 rounded-full border border-white/5 
          ${humn.scale ? 'text-blue-300 bg-blue-500/10' : 'text-gray-600'}`}>
          {humn.scale || '-'}
        </span>

        {humn.relatedChords && (
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
        {showChords && humn.relatedChords && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -5 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -5 }}
            className="overflow-hidden"
          >
            <div className="mt-1 flex flex-wrap justify-center gap-1.5 max-w-[150px]">
              {humn.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
                <span key={i} className="text-[10px] uppercase font-bold text-sky-200 bg-sky-900/30 px-1.5 py-0.5 rounded border border-sky-500/20">
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
