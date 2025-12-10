"use client";

import React, { useContext, useState } from "react";
import {
  PlayCircle,
  Mic,
  Trash2,
  PlusCircle,
  Edit3
} from "lucide-react";
import { UserContext } from "../context/User_Context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Loading from "../loading";
import Portal from '../Portal/Portal.jsx'
export default function Trainings() {
  const queryClient = useQueryClient();
  const { isLogin } = useContext(UserContext);

  const [showModel, setShowmodel] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [modalType, setModalType] = useState("add"); // "add" أو "update"
  const [song, setSong] = useState("");
  const [scale, setScale] = useState("");
  const [link, setLink] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentSongId, setCurrentSongId] = useState(null);
  const [submitClicked, setSubmitClicked] = useState(false);

  const get_All_Users = () => {
    if (!isLogin) return <LogIn />;
    return axios
      .get("https://worship-team-api.vercel.app/api/users", {
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

  const add_song = async (userid, { song, scale, link }) => {
    if (!isLogin) return <LogIn />;
    setSubmitClicked(true);
    return axios
      .patch(
        `https://worship-team-api.vercel.app/api/users/${userid}`,
        { song, scale, link },
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
      `https://worship-team-api.vercel.app/api/users/${userid}/${songid}`,
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
      .delete(`https://worship-team-api.vercel.app/api/users/${userid}/allsongs`,
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
    <section className="min-h-screen bg-gradient-to-br from-[#050510] via-[#0a0a1a] to-[#141432] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.1),transparent_70%)]" />

      <h1 className="text-3xl sm:text-5xl font-extrabold mb-14 text-center bg-gradient-to-r from-sky-300 via-indigo-300 to-purple-400 text-transparent bg-clip-text drop-shadow-lg">
        🎶 Training Schedule
      </h1>

      <div className="grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-3 relative z-10">
        {data.map((m, i) => (
          <div
            key={i}
            className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 sm:p-7 shadow-xl hover:shadow-sky-500/20 border border-white/10 transition"
          >
            <div className="absolute top-4 right-4">
              <span className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium 
                                bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-sm shadow-sky-500/30">
                <Mic className="w-4 h-4" /> Vocal
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold mb-6 bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
              {m.Name}
            </h2>


            {/* <button class="relative inline-flex items-center justify-center p-0.5 overflow-hidden text-sm font-medium text-heading rounded-base group bg-gradient-to-br from-purple-500 to-pink-500 group-hover:from-purple-500 group-hover:to-pink-500 hover:text-white dark:text-white focus:ring-4 focus:outline-none focus:ring-purple-200 dark:focus:ring-purple-800 rounded-3xl">
              <span class=" relative px-4 py-2.5 transition-all ease-in duration-75 bg-neutral-primary-soft rounded-base group-hover:bg-transparent group-hover:dark:bg-transparent leading-5">
                Delete All
              </span>
            </button> */}

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">{m.name}</h2>
              <PlusCircle
                onClick={() => openModal("add", m)}
                className="w-7 h-7 cursor-pointer text-green-400 hover:text-green-300 transition"
              />
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {m.songs_Array.map((p, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 rounded-full flex items-center gap-3 text-sm sm:text-base border backdrop-blur-md shadow-sm"
                >
                  <Trash2
                    onClick={() => delete_song(m._id, p._id)}
                    className="w-5 h-5 cursor-pointer text-red-400 hover:text-red-300 transition"
                  />
                  <Edit3
                    onClick={() => openModal("update", m, p)}
                    className="w-5 h-5 cursor-pointer text-yellow-400 hover:text-yellow-300 transition"
                  />
                  <span className="text-sky-300">{p.song}</span>
                  <span className="text-purple-300">🎵 {p.scale}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-auto">
              {m.songs_Array.map((l, idx) => (
                <a
                  key={idx}
                  href={l.link}
                  target="_blank"
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-cyan-200 px-3 py-1.5 rounded-lg text-xs sm:text-sm transition"
                >
                  <PlayCircle className="w-4 h-4" /> Play {idx + 1}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModel && (
        <Portal>
          <div
            className={`fixed inset-0 z-[999] flex justify-center items-center p-4 transition-all duration-300
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

              <h2 className="text-center text-2xl font-bold mb-6 bg-gradient-to-r from-sky-300 to-purple-300 bg-clip-text text-transparent">
                {modalType === "add" ? "🎵 Add Song" : "🎵 Update Song"}
              </h2>

              <div className="flex flex-col gap-4">
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
                  className="p-3 rounded-lg bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:ring-2 focus:ring-purple-400 outline-none"
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
                <button
                  onClick={() => {
                    if (modalType === "add") add_song(selectedUser._id, { song, scale, link });
                    else if (currentSongId) update_song(selectedUser._id, currentSongId, { song, scale, link });
                  }}
                  className={`mt-4 bg-gradient-to-r from-sky-500 to-purple-500 py-3 rounded-xl text-white font-semibold transition shadow-lg shadow-purple-500/20
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
