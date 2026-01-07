"use client";

import React, { useContext, useState } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlayCircle,
  Mic,
  Trash2,
  PlusCircle,
  Edit3
} from "lucide-react";
import { UserContext } from "../context/User_Context";
import { HymnsContext } from "../context/Hymns_Context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Loading from "../loading";
import Portal from '../Portal/Portal.jsx'
export default function Trainings() {
  const queryClient = useQueryClient();
  const { isLogin, UserRole, user_id, churchId } = useContext(UserContext);
  const { workspace } = useContext(HymnsContext);

  const [showModel, setShowmodel] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [modalType, setModalType] = useState("add"); // "add" أو "update"
  const [song, setSong] = useState("");
  const [scale, setScale] = useState("");
  const [link, setLink] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentSongId, setCurrentSongId] = useState(null);
  const [submitClicked, setSubmitClicked] = useState(false);
  // Removed availableHymns and isLoadingHymns because we use 'workspace' directly
  const [selectedHymnIds, setSelectedHymnIds] = useState([]);

  const get_All_Users = () => {
    if (!isLogin) return <LogIn />;
    return axios
      .get(`https://worship-team-api.vercel.app/api/users/${churchId}`, {
        headers: { Authorization: `Bearer ${isLogin}` },
      })
      .then((res) => res.data)
      .catch(() => []);
  };

  const delete_song = (userid, songid) => {
    if (!isLogin) return <LogIn />;
    return axios
      .delete(`https://worship-team-api.vercel.app/api/users/${userid}/${songid}`, {
        headers: { Authorization: `Bearer ${isLogin}` },
      })
      .then(() => queryClient.invalidateQueries(["data", isLogin]))
      .catch(() => []);
  };

  const add_song = async (userid, { hymnIds }) => {
    if (!isLogin) return <LogIn />;
    setSubmitClicked(true);
    return axios
      .patch(
        `https://worship-team-api.vercel.app/api/users/${userid}/${churchId}`,
        { hymnIds },
        { headers: { Authorization: `Bearer ${isLogin}` } }
      )
      .then((res) => {
        queryClient.invalidateQueries(["data", isLogin]);
        resetModal();
        setSubmitClicked(false);
        return res.data;
      })
      .catch((err) => {
        console.error(err);
        setSubmitClicked(false);
        return [];
      });
  };

  const update_song = async (userid, songid, { song, scale, link }) => {
    if (!isLogin) return <LogIn />;
    setSubmitClicked(true);
    return axios.patch(
      `https://worship-team-api.vercel.app/api/users/${userid}/${songid}/${churchId}`,
      { song, scale, link },
      { headers: { Authorization: `Bearer ${isLogin}` } }
    )
      .then(() => {
        queryClient.invalidateQueries(["data", isLogin]);
        resetModal();
        setSubmitClicked(false);
      })
      .catch(() => setSubmitClicked(false));
  };

  const delete_All_Songs = async (userid) => {
    if (!isLogin) return <LogIn />;
    return axios
      .delete(`https://worship-team-api.vercel.app/api/users/${userid}/allsongs/${churchId}`,
        { headers: { Authorization: `Bearer ${isLogin}` } }
      ).then(() => {
        queryClient.invalidateQueries(['data', isLogin])
      }).catch(() => { })

  }

  const { data = [], isLoading } = useQuery({
    queryKey: ["data", isLogin],
    queryFn: get_All_Users,
    enabled: !!isLogin,
  });

  if (isLoading) return <Loading />;

  const openModal = (type, user, songObj = null) => {
    setSelectedUser(user);
    setModalType(type);
    if (type === "update" && songObj) {
      setSong(songObj.song);
      setScale(songObj.scale);
      setLink(songObj.link);
      setCurrentSongId(songObj._id);
    } else {
      setSong("");
      setScale("");
      setLink("");
      setCurrentSongId(null);
    }
    setShowmodel(true);

    // We don't need to fetch from API anymore, we use 'workspace' from context.

    if (type === "add") {
      setSelectedHymnIds([]);
    }
  }

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowmodel(false);
      setIsClosing(false);
    }, 300);
  };

  const resetModal = () => {
    setSong("");
    setScale("");
    setLink("");
    setCurrentSongId(null);
    closeModal();
  }

  return (
    <section className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />

      <h1 className="text-3xl sm:text-5xl font-extrabold mb-14 text-center bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text drop-shadow-lg">
        🎶 Training Schedule
      </h1>

      <div className="grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-3 relative z-10 items-start">
        {data.filter((e) => e.role === 'USER').map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -5, boxShadow: "0 20px 40px -10px rgba(14, 165, 233, 0.2)" }}
            className="relative bg-[#0f172a]/80 backdrop-blur-xl rounded-3xl p-1 shadow-2xl border border-white/10 group overflow-hidden flex flex-col h-full"
          >
            {/* Gradient Top Border */}
            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-sky-500 via-blue-500 to-indigo-500 opacity-80" />

            <div className="p-6 sm:p-7 flex flex-col h-full relative z-10">
              {/* Header Section */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                                  bg-sky-500/10 text-sky-300 border border-sky-500/20">
                      <Mic className="w-3 h-3" /> Vocal
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    {m.Name}
                  </h2>
                  <p className="text-sm text-gray-400 font-medium">{m.name}</p>
                </div>

                {/* Add Song Action */}
                {(UserRole === 'Admin' || UserRole === 'MANEGER' || user_id === m._id) && (
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openModal("add", m)}
                    className="p-2 rounded-full bg-linear-to-br from-green-500/20 to-emerald-500/20 text-green-400 hover:text-green-300 border border-green-500/30 shadow-lg shadow-green-500/10 transition-colors"
                  >
                    <PlusCircle className="w-6 h-6" />
                  </motion.button>
                )}
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 min-h-[150px] relative">
                <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                  <div className="flex flex-col gap-3 pb-2">
                    {m.songs_Array.length > 0 ? (
                      m.songs_Array.map((p, idx) => (
                        <div
                          key={idx}
                          className="group relative grid grid-cols-12 gap-4 p-4 sm:p-5 items-center 
                                   bg-[#13132b]/60 hover:bg-[#1a1a38] 
                                   border border-white/5 hover:border-sky-500/30 
                                   rounded-2xl transition-all duration-300 backdrop-blur-sm
                                   hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
                        >
                          {/* Hover Glow Gradient */}
                          <div className="absolute inset-0 rounded-2xl bg-linear-to-r from-sky-500/5 via-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                          {/* Index */}
                          <div className="col-span-2 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
                            {(idx + 1).toString().padStart(2, '0')}
                          </div>

                          {/* Song Title */}
                          <div className="col-span-10 relative z-10 flex items-center">
                            <h3 className="font-bold text-base sm:text-lg text-gray-200 group-hover:text-white transition-colors tracking-wide truncate">
                              {p.title}
                            </h3>
                          </div>

                          {/* Key/Scale - Always Under Title (Left Aligned) */}
                          <div className="col-span-12 relative z-10 flex items-center justify-start -mt-2 pl-2">
                            <KeyDisplay humn_parameter={p} />
                          </div>

                          {/* Media Link */}
                          <div className="col-span-6 flex justify-center items-center relative z-10">
                            {p.link ? (
                              <a
                                href={p.link}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all w-full justify-center"
                              >
                                <PlayCircle className="w-4 h-4" />
                                <span className="text-sm font-medium">Listen</span>
                              </a>
                            ) : (
                              <span className="text-gray-700 text-xs">—</span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="col-span-6 flex justify-center items-center relative z-10">
                            {(UserRole === 'Admin' || UserRole === 'MANEGER' || user_id === m._id) && (
                              <button
                                onClick={() => delete_song(m._id, p._id)}
                                className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5 hover:border-red-500/20 bg-white/5 flex-1 flex justify-center"
                                title="Remove Song"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-gray-500 opacity-60">
                        <motion.div
                          animate={{ rotate: [0, 10, -10, 0] }}
                          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                        >
                          <Mic className="w-10 h-10 mb-2 opacity-30" />
                        </motion.div>
                        <p className="text-sm">No songs assigned yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {showModel && (
        <Portal>
          <div
            className={`fixed inset-0 z-999 flex justify-center items-center p-4 transition-all duration-300
              ${isClosing ? "opacity-0 backdrop-blur-sm" : "opacity-100 backdrop-blur-md bg-black/70"}`}
          >
            <div
              className={`w-full max-w-md max-h-[90vh] bg-white/10 border border-white/20 backdrop-blur-xl p-6 rounded-2xl shadow-2xl overflow-y-auto relative transform transition-all duration-300
                ${isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
            >
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 text-gray-300 hover:text-white transition text-xl"
              >
                ✖
              </button>

              <h2 className="text-center text-2xl font-bold mb-6 bg-linear-to-br from-sky-300 to-blue-400 bg-clip-text text-transparent">
                {modalType === "add" ? "🎵 Select Hymns" : "🎵 Update Song"}
              </h2>

              <div className="flex flex-col gap-4">
                {modalType === "add" ? (
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2">
                    {workspace.length === 0 ? (
                      <div className="text-center text-gray-400 py-4">No hymns in Workspace yet.</div>
                    ) : (
                      workspace.map((h) => (
                        <label key={h._id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition border border-white/5">
                          <input
                            type="checkbox"
                            checked={selectedHymnIds.includes(h._id)}
                            onChange={() => {
                              setSelectedHymnIds((prev) =>
                                prev.includes(h._id)
                                  ? prev.filter((id) => id !== h._id)
                                  : [...prev, h._id]
                              );
                            }}
                            className="w-5 h-5 accent-sky-500 rounded focus:ring-sky-500/50"
                          />
                          <div className="flex flex-col">
                            <span className="font-medium text-white">{h.title}</span>
                            <span className="text-xs text-sky-300/80">{h.scale}</span>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Song Name"
                      className="p-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:ring-2 focus:ring-sky-400 outline-none"
                      value={song}
                      onChange={(e) => setSong(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="YouTube Link (optional)"
                      className="p-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:ring-2 focus:ring-blue-400 outline-none"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Scale"
                      className="p-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:ring-2 focus:ring-amber-400 outline-none"
                      value={scale}
                      onChange={(e) => setScale(e.target.value)}
                    />
                  </>
                )}

                <button
                  onClick={() => {
                    if (modalType === "add") add_song(selectedUser._id, { hymnIds: selectedHymnIds });
                    else if (currentSongId) update_song(selectedUser._id, currentSongId, { song, scale, link });
                  }}
                  className={`mt-4 bg-linear-to-br from-sky-500 to-blue-600 py-3 rounded-xl text-white font-semibold transition shadow-lg shadow-blue-500/20
                    ${submitClicked ? "animate-pulse" : ""}`}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </section>
  );
}

// Sub-component for handling Key/Chords toggle state (Reused)
function KeyDisplay({ humn_parameter }) {
  const [showChords, setShowChords] = useState(false);

  return (
    <div className="flex flex-col items-start sm:items-center gap-2 w-full">
      <div className="flex items-center gap-1">
        <span className={`text-sm font-semibold px-3 py-1 rounded-full border border-white/5 
          ${humn_parameter.scale ? 'text-blue-300 bg-blue-500/10' : 'text-gray-600'}`}>
          {humn_parameter.scale || '-'}
        </span>

        {humn_parameter.relatedChords && (
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
        {showChords && humn_parameter.relatedChords && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -5 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -5 }}
            className="overflow-hidden w-full flex justify-start sm:justify-center"
          >
            <div className="mt-1 flex flex-wrap justify-start sm:justify-center gap-1.5 w-full sm:max-w-[200px]">
              {humn_parameter.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
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
