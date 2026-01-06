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
  const { isLogin, UserRole, user_id, churchId } = useContext(UserContext);

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

  const add_song = async (userid, { song, scale, link }) => {
    if (!isLogin) return <LogIn />;
    setSubmitClicked(true);
    return axios
      .patch(
        `https://worship-team-api.vercel.app/api/users/${userid}/${churchId}`,
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

      <div className="grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-3 relative z-10">
        {data.filter((e) => e.role === 'USER').map((m, i) => (
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

            <h2 className="text-xl sm:text-2xl font-semibold mb-6 bg-linear-to-br from-gray-100 to-gray-300 bg-clip-text text-transparent">
              {m.Name}
            </h2>
            {UserRole === 'Admin' || UserRole === 'MANEGER' || user_id === m._id ? (
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">{m.name}</h2>
                <PlusCircle
                  onClick={() => openModal("add", m)}
                  className="w-7 h-7 cursor-pointer text-green-400 hover:text-green-300 transition"
                />
              </div>
            ) : null
            }


            <div className="mb-6 flex flex-wrap gap-2">
              {m.songs_Array.map((p, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 rounded-full flex items-center gap-3 text-sm sm:text-base border backdrop-blur-md shadow-sm"
                >
                  {
                    UserRole === 'Admin' || user_id === m._id ? (

                      <>
                        <Trash2
                          onClick={() => delete_song(m._id, p._id)}
                          className="w-5 h-5 cursor-pointer text-red-400 hover:text-red-300 transition"
                        />
                        <Edit3
                          onClick={() => openModal("update", m, p)}
                          className="w-5 h-5 cursor-pointer text-yellow-400 hover:text-yellow-300 transition"
                        />
                      </>
                    ) : null
                  }

                  <span className="text-sky-300">{p.song}</span>
                  <span className="text-blue-300">🎵 {p.scale}</span>
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
                <button
                  onClick={() => {
                    if (modalType === "add") add_song(selectedUser._id, { song, scale, link });
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
