'use client';
import React, { useState, useContext } from 'react';
import { transposeScale, transposeChords } from '../utils/musicUtils';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Loading from '../loading';
import Portal from '../Portal/Portal';
import Metronome from '../Metronome/page';
import { UserContext } from '../context/User_Context';
import { Music, Calendar, Star, Gift, Sparkles, PlayCircle, PlusCircle, Trash2, X, Heart, GraduationCap, FolderPlus, Check, Edit2, Search } from 'lucide-react';
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
  const [formData, setFormData] = useState({ title: '', scale: '', relatedChords: '', link: '', party: 'All', BPM: '', timeSignature: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingHymnId, setEditingHymnId] = useState(null); // Track which hymn is being edited

  //search State
  const [search, setSearch] = useState(''); // Stores the search query text
  const [showSearchBar, setShowSearchBar] = useState(false); // Controls search input visibility

  // --- API Functions ---

  // 1. Fetch Hymns
  const fetchHymns = async () => {
    // If search is active, use search endpoint
    if (search.trim()) {
      try {
        const { data } = await axios.get(
          `https://worship-team-api.vercel.app/api/hymns/search?q=${encodeURIComponent(search)}`
        );
        return data;
      } catch (error) {
        console.error("Error searching hymns:", error);
        return [];
      }
    }

    // Otherwise, fetch by category
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

      await axios.post(url, formData, { //formData is req.body
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

  // 2. Edit Hymn (Patch)
  const edit_Hymn = async (id) => {
    if (!isLogin) return;
    setIsSubmitting(true);
    try {
      const url = `https://worship-team-api.vercel.app/api/hymns/${id}`;

      await axios.patch(url, formData, { //formData is req.body
        headers: { Authorization: `Bearer ${isLogin}` }
      });

      queryClient.invalidateQueries(["humns"]);
      closeModal();
      setFormData({ title: '', scale: '', relatedChords: '', link: '', party: 'All', BPM: '', timeSignature: '' });
      setEditingHymnId(null);
    } catch (error) {
      console.error("Error editing hymn:", error);
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

  // All data
  const { data: humns = [], isLoading } = useQuery({
    queryKey: ["humns", activeTab, search], // Re-fetch when search changes
    queryFn: fetchHymns,
  });

  ///////////////////////////////// API proccess end here /////////////////////////////

  // --- Modal Helpers ---//
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
    setEditingHymnId(null); // Reset editing mode
    setShowModal(true);
  };

  const openEditModal = (hymn) => {
    // Pre-fill form with hymn data for editing
    setFormData({
      title: hymn.title || '',
      scale: hymn.scale || '',
      relatedChords: hymn.relatedChords || '',
      link: hymn.link || '',
      party: hymn.party || 'All',
      BPM: hymn.BPM || '',
      timeSignature: hymn.timeSignature || ''
    });
    setEditingHymnId(hymn._id); // Set the ID of the hymn being edited
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
  const canEdit = UserRole === 'ADMIN' || UserRole === 'MANEGER' || UserRole === 'PROGRAMER';

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


        {/* Search Section - Centered under Title */}
        <div className="mb-8 flex items-center justify-center gap-3 relative z-20 h-12">
          {/* Search Toggle (Icon Only) */}
          <button
            onClick={() => {
              setShowSearchBar(!showSearchBar);
              if (showSearchBar) {
                setSearch(''); // Clear search when closing
              }
            }}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 border backdrop-blur-xl relative overflow-hidden group shadow-lg z-30
                 ${showSearchBar
                ? 'bg-red-500/10 border-red-500/20 text-red-400 rotate-90 scale-90'
                : 'bg-white/5 border-white/20 text-sky-200 hover:bg-white/10 hover:text-white hover:border-sky-400/30 hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]'
              }`}
            title={showSearchBar ? "Close Search" : "Search Hymns"}
          >
            {showSearchBar ? (
              <X className="w-5 h-5" />
            ) : (
              <Search className="w-5 h-5" />
            )}
          </button>

          {/* Modern Side-by-Side Glass Input */}
          <AnimatePresence>
            {showSearchBar && (
              <motion.div
                initial={{ opacity: 0, width: 0, scale: 0.9 }}
                animate={{ opacity: 1, width: '250px', scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.9 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 25 }}
                className="overflow-hidden flex items-center"
              >
                <div className="relative w-full h-10">
                  <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl shadow-inner" />

                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search for Hymn..."
                    className="w-full h-full pl-4 pr-8 py-2 bg-transparent text-sm text-white placeholder-gray-400/70 
                                outline-none relative z-10 font-light tracking-wide"
                    autoFocus
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/20 text-gray-400 hover:text-white transition-all z-20"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Categories Tabs */}
        {
          showSearchBar ?
            (null) :
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

        }





        {/* Admin Controls */}
        {canEdit && (
          <div className="flex flex-wrap justify-end items-center gap-3 mb-6">
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
                  <HymnItem
                    key={humn._id || index}
                    humn={humn}
                    index={index}
                    categories={categories}
                    addToWorkspace={addToWorkspace}
                    isHymnInWorkspace={isHymnInWorkspace}
                    canEdit={canEdit}
                    delete_Hymn={delete_Hymn}
                    openEditModal={openEditModal}
                    variants={itemVariants}
                  />
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
                    {editingHymnId ? '✏️ Edit Hymn' : '🎵 Add New Hymn'}
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">BPM</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition"
                        placeholder="e.g. 120"
                        value={formData.BPM}
                        onChange={(e) => setFormData({ ...formData, BPM: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-sm mb-2">Time Signature</label>
                      <input
                        type="text"
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition"
                        placeholder="e.g. 4/4"
                        value={formData.timeSignature}
                        onChange={(e) => setFormData({ ...formData, timeSignature: e.target.value })}
                      />
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
                    onClick={() => editingHymnId ? edit_Hymn(editingHymnId) : add_Hymn()}
                    disabled={isSubmitting || !formData.title}
                    className={`mt-4 w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all
                      ${isSubmitting
                        ? 'bg-gray-600 cursor-not-allowed'
                        : editingHymnId
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 hover:shadow-blue-500/25'
                          : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
                  >
                    {isSubmitting ? (editingHymnId ? 'Updating...' : 'Adding...') : (editingHymnId ? 'Update Song' : 'Add Song')}
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
function KeyDisplay({ scale, relatedChords, onTranspose }) {
  const [showChords, setShowChords] = useState(false);

  return (
    <div className="flex flex-col items-start sm:items-center gap-2 w-full">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold px-3 py-1 rounded-full border border-white/5 
          ${scale ? 'text-blue-300 bg-blue-500/10' : 'text-gray-600'}`}>
          {scale || '-'}
        </span>

        {/* Transpose Controls */}
        <div className="flex items-center rounded-lg border border-white/10 overflow-hidden bg-white/5">
          <button
            onClick={(e) => { e.stopPropagation(); onTranspose(-1); }}
            className="px-2 py-0.5 hover:bg-white/10 text-[10px] sm:text-xs text-red-300 font-bold border-r border-white/5"
            title="Transpose -1"
          >
            -
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTranspose(1); }}
            className="px-2 py-0.5 hover:bg-white/10 text-[10px] sm:text-xs text-green-300 font-bold border-l border-white/5"
            title="Transpose +1"
          >
            +
          </button>
        </div>

        {relatedChords && (
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
        {showChords && relatedChords && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -5 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -5 }}
            className="overflow-hidden w-full flex justify-start sm:justify-center"
          >
            <div className="mt-1 flex flex-wrap justify-start sm:justify-center gap-1.5 w-full sm:max-w-[200px]">
              {relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
                <span key={i} className="text-[10px] font-bold text-sky-200 bg-sky-900/30 px-1.5 py-0.5 rounded border border-sky-500/20">
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

function HymnItem({ humn, index, categories, addToWorkspace, isHymnInWorkspace, canEdit, delete_Hymn, openEditModal, variants }) {
  const [transposeStep, setTransposeStep] = useState(0);

  // Compute transposed values
  const currentScale = transposeScale(humn.scale, transposeStep);
  const currentChords = transposeChords(humn.relatedChords, transposeStep);

  // Handle adding to workspace with transposed values
  const handleAddToWorkspace = () => {
    addToWorkspace({
      ...humn,
      scale: currentScale,
      relatedChords: currentChords
    });
  };

  return (
    <motion.div
      variants={variants}
      className="group relative grid grid-cols-12 gap-2 sm:gap-4 p-3 sm:p-5 items-center 
                 bg-[#13132b]/60 hover:bg-[#1a1a38] 
                 border border-white/5 hover:border-sky-500/30 
                 rounded-2xl transition-all duration-300 backdrop-blur-sm
                 hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
    >
      {/* Hover Glow Gradient */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-500/5 via-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Index */}
      <div className="col-span-1 sm:col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
        {(index + 1).toString().padStart(2, '0')}
      </div>

      {/* BPM and Time Signature Display */}
      {(humn.BPM || humn.timeSignature) && (
        <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/40 pr-3 pl-1 py-0.5 rounded-full border border-white/5 z-20 backdrop-blur-sm">
          {humn.BPM && <Metronome id={humn._id} bpm={humn.BPM} minimal={true} />}
          <div className="flex gap-2 text-[10px] font-mono text-gray-500">
            {humn.BPM && <span>{humn.BPM} bpm</span>}
            {humn.BPM && humn.timeSignature && <span className="text-gray-600">|</span>}
            {humn.timeSignature && <span>{humn.timeSignature}</span>}
          </div>
        </div>
      )}

      {/* Song Title */}
      <div className="col-span-11 sm:col-span-5 md:col-span-5 relative z-10 flex items-center gap-2 py-4">
        {(() => {
          const matchedCat = categories.find(c => c.id === humn.party) || { icon: Music };
          const CatIcon = matchedCat.icon;
          return (
            <CatIcon
              className="w-4 h-4 text-gray-500 group-hover:text-sky-300 transition-colors shrink-0"
              title={matchedCat.label}
            />
          );
        })()}
        <h3 className="font-bold text-base sm:text-lg text-gray-200 group-hover:text-white transition-colors tracking-wide">
          {humn.title}
        </h3>
      </div>

      {/* Key/Scale - Under Title on Mobile (Left Aligned), Center on Desktop */}
      <div className="col-span-12 sm:col-span-2 relative z-10 flex items-center justify-start sm:justify-center -mt-2 sm:mt-0 pl-2 sm:pl-0">
        <KeyDisplay
          scale={currentScale}
          relatedChords={currentChords}
          onTranspose={(val) => setTransposeStep(prev => prev + val)}
        />
      </div>

      {/* Media Link */}
      <div className="col-span-6 sm:col-span-3 flex justify-center items-center relative z-10">
        {humn.link ? (
          <a
            href={humn.link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
          >
            <PlayCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Listen</span>
          </a>
        ) : (
          <span className="text-gray-700 text-xs">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="col-span-6 sm:col-span-1 flex justify-center items-center gap-2 relative z-10">
        <button
          onClick={handleAddToWorkspace}
          disabled={isHymnInWorkspace(humn._id)}
          className={`p-2.5 rounded-xl transition-all duration-300 flex-1 sm:flex-none flex justify-center
            ${isHymnInWorkspace(humn._id)
              ? 'text-green-400 bg-green-500/10 cursor-default'
              : 'text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 bg-white/5 sm:bg-transparent'}`}
          title={isHymnInWorkspace(humn._id) ? "Added to Workspace" : "Add to Workspace"}
        >
          {isHymnInWorkspace(humn._id) ? <Check className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
        </button>

        {canEdit && (
          <>
            <button
              onClick={() => delete_Hymn(humn._id)}
              className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all bg-white/5 sm:bg-transparent flex-1 sm:flex-none flex justify-center"
              title="Delete Song"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => openEditModal(humn)}
              className="p-2.5 rounded-xl text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all bg-white/5 sm:bg-transparent flex-1 sm:flex-none flex justify-center"
              title="Edit Song"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
