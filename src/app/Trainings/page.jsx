"use client";

import React, { useContext, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import Login from '../login/page'

import {
  PlayCircle,
  Mic,
  Trash2,
  PlusCircle,
  FileText,
  Edit3,
  X,
  Monitor,
  Guitar,
  EyeOff
} from "lucide-react";
import { UserContext } from "../context/User_Context";
import { HymnsContext } from "../context/Hymns_Context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Loading from "../loading";
import Portal from '../Portal/Portal.jsx'
import { useLanguage } from "../context/LanguageContext";

export default function Trainings() {
  const queryClient = useQueryClient();
  const { isLogin, UserRole, user_id, churchId, UserStatus, vocalsMode } = useContext(UserContext);
  const { workspace } = useContext(HymnsContext);
  const { t, language, setLanguage } = useLanguage();

  if (!isLogin) return <Login />;

  // Access Control: Only 'approved' users can access the Training page
  if (isLogin && UserStatus !== "approved") {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center text-white p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl text-center max-w-md shadow-2xl"
        >
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold mb-4 bg-linear-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">
            Access Denied
          </h1>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Your account is currently pending approval. Please contact your team administrator to gain access to the Training section.
          </p>
          <button
            onClick={() => window.location.href = "/"}
            className="w-full py-4 px-6 rounded-2xl bg-linear-to-r from-sky-500 to-blue-600 font-bold hover:shadow-lg hover:shadow-sky-500/20 transition-all active:scale-95"
          >
            Return Home
          </button>
        </motion.div>
      </div>
    );
  }

  const [showModel, setShowmodel] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [modalType, setModalType] = useState("add");
  const [song, setSong] = useState("");
  const [scale, setScale] = useState("");
  const [link, setLink] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentSongId, setCurrentSongId] = useState(null);
  const [submitClicked, setSubmitClicked] = useState(false);
  const [selectedHymns, setSelectedHymns] = useState([]); // Store full hymn objects
  const [selectedAddSongEventId, setSelectedAddSongEventId] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState("");

  // Lyrics Modal State
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
  const [lyricsTheme, setLyricsTheme] = useState('main');
  const [fontSize, setFontSize] = useState(18);
  const [showChords, setShowChords] = useState(true);
  const isScrolledRef = React.useRef(false); // Track scroll for controls hide
  const lyricsScrollRef = useRef(null); // Ref for lyrics scroll container
  // Refs for direct DOM manipulation to avoid lag on mobile
  const pullBarRef = React.useRef(null);
  const subtitleRef = React.useRef(null);
  const toolbarRef = React.useRef(null);
  const fadeRef = React.useRef(null);

  // Sync showChords with vocalsMode
  useEffect(() => {
    if (vocalsMode) {
      setShowChords(false);
    } else {
      setShowChords(true);
    }
  }, [vocalsMode]);


  const lyricsThemes = {
    warm: {
      bg: '#FDFBF7',
      text: '#1A1A1A',
      label: 'Warm',
      accent: '#0F172A',
      chord: '#2563EB',
      border: 'rgba(0,0,0,0.05)'
    },
    dark: {
      bg: '#0F172A',
      text: '#F1F5F9',
      label: 'Dark',
      accent: '#38BDF8',
      chord: '#7DD3FC',
      border: 'rgba(255,255,255,0.05)'
    },
    main: {
      bg: '#0E2238',
      text: '#F8F9FA',
      label: 'Main',
      accent: '#60A5FA',
      chord: '#38BDF8',
      border: 'rgba(96,165,250,0.1)'
    }
  };

  // Data Show State
  const [showDataShow, setShowDataShow] = useState(false);
  const [dataShowIndex, setDataShowIndex] = useState(0);

  const dataShowSlides = React.useMemo(() => {
    if (!selectedLyricsHymn?.lyrics) return [];

    return selectedLyricsHymn.lyrics
      .split('\n\n')
      .map(b => b.trim())
      .filter(Boolean)
      .map(slide => showChords ? slide.replace(/\[/g, ' [') : slide.replace(/\[.*?\]/g, ''));
  }, [selectedLyricsHymn?.lyrics, showChords]);


  const openLyrics = (hymn) => {
    setSelectedLyricsHymn(hymn);
    setLyricsTheme('main');
    setFontSize(18);
    setShowChords(vocalsMode ? false : true);
    isScrolledRef.current = false; // Reset scroll state for fresh open
    setShowLyricsModal(true);
  };

  const closeLyricsModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowLyricsModal(false);
      setSelectedLyricsHymn(null);
      setIsClosing(false);
    }, 300);
  };

  // Handle lyrics scroll
  const handleLyricsScroll = useCallback(() => {
    const el = lyricsScrollRef.current;
    if (!el) return;
    const isScrolled = el.scrollTop > 40;
    if (isScrolledRef.current !== isScrolled) {
        isScrolledRef.current = isScrolled;
        // Use direct DOM manipulation to bypass React state updates and avoid lag
        if (pullBarRef.current) {
            pullBarRef.current.style.transform = isScrolled ? 'translateY(-10px) scaleY(0)' : 'translateY(0) scaleY(1)';
            pullBarRef.current.style.opacity = isScrolled ? '0' : '1';
            pullBarRef.current.style.height = isScrolled ? '0px' : '6px';
            pullBarRef.current.style.marginTop = isScrolled ? '0px' : '16px';
            pullBarRef.current.style.marginBottom = isScrolled ? '0px' : '8px';
        }
        if (subtitleRef.current) {
            subtitleRef.current.style.transform = isScrolled ? 'translateY(-10px) translateZ(0)' : 'translateY(0) translateZ(0)';
            subtitleRef.current.style.opacity = isScrolled ? '0' : '0.5';
            subtitleRef.current.style.maxHeight = isScrolled ? '0px' : '32px';
        }
        if (toolbarRef.current) {
            toolbarRef.current.style.transform = isScrolled ? 'translateY(-10px) translateZ(0)' : 'translateY(0) translateZ(0)';
            toolbarRef.current.style.opacity = isScrolled ? '0' : '1';
            toolbarRef.current.style.maxHeight = isScrolled ? '0px' : '160px';
            toolbarRef.current.style.marginBottom = isScrolled ? '0px' : '12px';
            toolbarRef.current.style.pointerEvents = isScrolled ? 'none' : 'auto';
        }
        if (fadeRef.current) {
            fadeRef.current.style.opacity = isScrolled ? '1' : '0';
        }
    }
  }, []);

  // Attached via onScroll prop to guarantee firing in Portals

  // Prevent background scrolling when lyrics modal is open
  React.useEffect(() => {
    if (showLyricsModal) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [showLyricsModal]);

  // Data Show Swipe - Native Touch Events (No Library)
  useEffect(() => {
    if (!showDataShow) return;

    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;
    let elementRef = null;

    const handleKey = (e) => {
      // الشمال = التالي (LTR: Left = Next)
      if (e.key === 'ArrowLeft' && dataShowIndex < dataShowSlides.length - 1) {
        setDataShowIndex(i => i + 1);
      }

      // اليمين = السابق (LTR: Right = Previous)
      if (e.key === 'ArrowRight' && dataShowIndex > 0) {
        setDataShowIndex(i => i - 1);
      }

      if (e.key === 'Escape') {
        setShowDataShow(false);
      }
    };

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const swipeDistance = touchStartX - touchEndX;

      // Swipe Right (Next Slide) - RTL
      if (swipeDistance < -minSwipeDistance && dataShowIndex < dataShowSlides.length - 1) {
        setDataShowIndex(i => i + 1);
      }

      // Swipe Left (Previous Slide) - RTL
      if (swipeDistance > minSwipeDistance && dataShowIndex > 0) {
        setDataShowIndex(i => i - 1);
      }
    };

    // Wait for DOM to be ready (fixes first-time touch event issue)
    const timer = setTimeout(() => {
      const element = document.getElementById('showDataContainer');
      if (element) {
        elementRef = element;
        element.addEventListener('touchstart', handleTouchStart, { passive: true });
        element.addEventListener('touchend', handleTouchEnd, { passive: true });
      }
    }, 0);

    window.addEventListener('keydown', handleKey);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
      if (elementRef) {
        elementRef.removeEventListener('touchstart', handleTouchStart);
        elementRef.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [showDataShow, dataShowIndex, dataShowSlides.length]);

  const currentShowChords = vocalsMode ? false : showChords;

  const renderLyricsWithChords = (text) => {
    if (!text) return null;

    const currentTheme = lyricsThemes[lyricsTheme];

    return text.split('\n').map((line, i) => (
      <div
        key={i}
        className={`relative w-full text-center ${showChords && line.includes('[') ? 'mt-8 mb-2' : 'my-2'}`}
        style={{ fontSize: `${fontSize}px`, minHeight: '1.5em' }}
        dir="rtl"
      >
        <div className="flex flex-wrap justify-center items-baseline leading-relaxed tracking-wide">
          {line ? line.split(/(\[.*?\])/g).map((part, j) => {
            if (part.startsWith('[') && part.endsWith(']')) {
              if (!showChords) return null;
              const chord = part.slice(1, -1);
              return (
                <span key={j} className="inline-block relative overflow-visible mx-1 align-baseline">
                  <span className="invisible whitespace-nowrap" style={{ fontSize: '0.7em' }} dir="ltr">
                    {chord}
                  </span>
                  <span
                    className="absolute bottom-full left-1/2 -translate-x-1/2 font-bold whitespace-nowrap mb-1 transition-colors duration-300"
                    style={{
                      color: currentTheme.chord,
                      fontSize: `0.7em`,
                    }}
                    dir="ltr"
                  >
                    {chord}
                  </span>
                </span>
              );
            }
            return (
              <span key={j} className="whitespace-pre-wrap transition-colors duration-300" style={{ color: currentTheme.text }}>
                {part}
              </span>
            );
          }) : <div className="h-4" />}
        </div>
      </div>
    ));
  };

  const renderPresentationSlideWithChords = (text) => {
    if (!text) return null;

    return text.split('\n').map((line, i) => (
      <div
        key={i}
        className={`relative w-full text-center ${showChords && line.includes('[') ? 'mt-[1em] mb-2' : 'my-2'}`}
        style={{ fontSize: 'clamp(32px, 8vw, 64px)', lineHeight: '1.6' }}
        dir="rtl"
      >
        {line ? line.split(/(\[.*?\])/g).map((part, j) => {
          if (part.startsWith('[') && part.endsWith(']')) {
            if (!showChords) return null;
            const chord = part.slice(1, -1);
            return (
              <span key={j} className="inline-block relative overflow-visible mx-[0.1em] align-baseline text-white font-bold whitespace-pre-line leading-relaxed select-none" style={{ lineHeight: '1' }}>
                {/* Invisible placeholder reserves the width so text spacing is correct */}
                <span className="invisible whitespace-nowrap" style={{ fontSize: '0.7em' }} dir="ltr">
                  {chord}
                </span>
                <span
                  className="absolute bottom-full left-1/2 -translate-x-1/2 font-bold whitespace-nowrap mb-1 text-sky-300 pointer-events-none"
                  style={{
                    fontSize: '0.7em',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                  }}
                  dir="ltr"
                >
                  {chord}
                </span>
              </span>
            );
          }
          return <span key={j} className="text-white font-bold whitespace-pre-wrap leading-relaxed select-none">{part}</span>;
        }) : <br />}
      </div>
    ));
  };

  const get_All_Users = () => {
    if (!isLogin) return [];
    return axios
      .get(`https://worship-team-api.onrender.com/api/users/my-church`, {
        headers: { Authorization: `Bearer ${isLogin}` },
      })
      .then((res) => res.data)
      .catch(() => []);
  };

  const delete_song = (userid, songid) => {
    if (!isLogin) return <Login />;
    return axios
      .delete(`https://worship-team-api.onrender.com/api/users/${userid}/${songid}`, {
        headers: { Authorization: `Bearer ${isLogin}` },
      })
      .then(() => queryClient.invalidateQueries(["data", isLogin]))
      .catch(() => []);
  };

  const add_song = async (userid, { hymns }) => {
    if (!isLogin) return <Login />;
    setSubmitClicked(true);
    return axios
      .patch(
        `https://worship-team-api.onrender.com/api/users/${userid}/${churchId}`,
        { hymns },
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
    if (!isLogin) return <Login />;
    setSubmitClicked(true);
    return axios.patch(
      `https://worship-team-api.onrender.com/api/users/${userid}/${songid}/${churchId}`,
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

  const { data = [], isLoading } = useQuery({
    queryKey: ["data", isLogin],
    queryFn: get_All_Users,
    enabled: !!isLogin,
  });

  if (isLoading) return <Loading />;

  // --- منطق الفلترة المتوافق مع الـ Populated Backend ---
  const filteredData = data.filter((user) => {
    // 1. استثناء: يجب أن يكون المستخدم مفعّل عنده الـ Training
    if (!user.isInTraining) return false;

    // 2. الرتب العالية ترى الجميع (Admin, MANEGER, PROGRAMER)
    const upperRoles = ["Admin", "MANEGER", "PROGRAMER", "ADMIN"]; // أضفت ADMIN احتياطاً لحالة الحروف
    if (upperRoles.includes(UserRole)) return true;

    // 3. للمستخدم العادي: نرى أنفسنا ومن معنا في نفس الـ Event
    if (user._id === user_id) return true;

    const myData = data.find(u => u._id === user_id);
    if (!myData || !myData.trainingEvents) return false;

    // استخراج الـ IDs من الـ Populated Objects ومقارنتها كـ Strings
    const myEventIds = myData.trainingEvents.map(ev => (ev._id || ev).toString());
    const theirEventIds = (user.trainingEvents || []).map(ev => (ev._id || ev).toString());

    return theirEventIds.some(id => myEventIds.includes(id));
  });

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
    if (type === "add") {
      setSelectedHymns([]);
      setSelectedAddSongEventId("");
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
        {filteredData.length > 0 ? (
          filteredData.map((m, i) => (
            <motion.div
              key={m._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -5, boxShadow: "0 20px 40px -10px rgba(14, 165, 233, 0.2)" }}
              className="relative bg-[#0f172a]/80 backdrop-blur-xl rounded-3xl p-1 shadow-2xl border border-white/10 group overflow-hidden flex flex-col h-full"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-sky-500 via-blue-500 to-indigo-500 opacity-80" />

              <div className="p-6 sm:p-7 flex flex-col h-full relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                                    bg-sky-500/10 text-sky-300 border border-sky-500/20">
                        <Mic className="w-3 h-3" /> Vocal
                      </span>
                      {m.trainingEvents?.map((event, idx) => event?.eventName && (
                        <span key={event._id || idx} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                                      bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {event.eventName}
                        </span>
                      ))}
                    </div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      {m.Name}
                    </h2>
                    <p className="text-sm text-gray-400 font-medium">{m.name}</p>
                  </div>

                  {(["Admin", "MANEGER", "PROGRAMER", "ADMIN"].includes(UserRole) || user_id === m._id) && (
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

                {/* Reports List */}
                {m.reports && m.reports.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {m.reports.map((report, idx) => {
                      const reportContent = report.text || report.report || (typeof report === 'string' ? report : "");
                      if (!reportContent) return null;

                      return (
                        <motion.button
                          key={report._id || idx}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => { setReportText(reportContent); setShowReportModal(true); }}
                          className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider
                                    bg-white/5 text-gray-400 border border-white/10 
                                    hover:bg-sky-500/10 hover:text-sky-300 hover:border-sky-500/20 
                                    transition-all duration-300 backdrop-blur-sm"
                        >

                          Report {idx + 1}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                <div className="flex-1 min-h-[150px] relative">
                  <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar" data-lenis-prevent-wheel>
                    <div className="flex flex-col gap-3 pb-2">
                      {m.songs_Array && m.songs_Array.length > 0 ? (
                        m.songs_Array.map((p, idx) => {
                          const hymn = p.hymnId ? { ...p.hymnId, ...p } : p;
                          return (
                            <div
                              key={p._id || idx}
                              className="group relative flex items-center gap-3 p-3 
                                      bg-[#13132b]/40 hover:bg-[#1a1a38] 
                                      border border-white/5 hover:border-sky-500/30 
                                      rounded-xl transition-all duration-300 backdrop-blur-sm"
                            >
                              {/* Index */}
                              <div className="font-mono text-xs text-gray-600 group-hover:text-sky-400 transition-colors w-5 text-center shrink-0">
                                {(idx + 1).toString().padStart(2, '0')}
                              </div>

                              {/* Title & Key */}
                              <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-sm text-gray-200 group-hover:text-white transition-colors truncate">
                                    {p.title}
                                  </h3>
                                  {p.eventId && m.trainingEvents?.some(e => (e._id || e) === p.eventId) && (
                                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                      {m.trainingEvents.find(e => (e._id || e) === p.eventId)?.eventName || 'Assigned Event'}
                                    </span>
                                  )}
                                </div>
                                <KeyDisplay humn_parameter={p} />
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                {p.lyrics ? (
                                  <button
                                    onClick={() => openLyrics(p)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors"
                                    title={t("lyrics")}
                                  >
                                    <FileText className="w-4 h-4" />
                                  </button>
                                ) : null}

                                {p.link ? (
                                  <a
                                    href={p.link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors"
                                    title="Listen"
                                  >
                                    <PlayCircle className="w-4 h-4" />
                                  </a>
                                ) : null}

                                {(["Admin", "MANEGER", "PROGRAMER", "ADMIN"].includes(UserRole) || user_id === m._id) && (
                                  <button
                                    onClick={() => delete_song(m._id, p._id)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Remove Song"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
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
          ))
        ) : (
          <div className="col-span-full text-center py-20 text-gray-400">
            لا يوجد أعضاء مضافين للتدريب في الحفلات الخاصة بك حالياً.
          </div>
        )}
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
              data-lenis-prevent-wheel
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
                  <>
                    {selectedUser?.trainingEvents?.length > 0 && (
                      <select
                        value={selectedAddSongEventId}
                        onChange={(e) => setSelectedAddSongEventId(e.target.value)}
                        className="p-3 rounded-lg bg-white/20 border border-white/30 text-white outline-none focus:ring-2 focus:ring-sky-400 mb-2"
                      >
                        <option value="" className="bg-[#0f172a] text-gray-400">Select Event (Optional)</option>
                        {selectedUser.trainingEvents.map((ev) => (
                          <option key={ev._id || ev} value={ev._id || ev} className="bg-[#0f172a] text-white">
                            {ev.eventName || 'Unnamed Event'}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2" data-lenis-prevent-wheel>
                      {workspace.length === 0 ? (
                        <div className="text-center text-gray-400 py-4">No hymns in Workspace yet.</div>
                      ) : (
                        workspace.map((h) => (
                          <label key={h._id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition border border-white/5">
                            <input
                              type="checkbox"
                              checked={selectedHymns.some(sh => sh._id === h._id)}
                              onChange={() => {
                                setSelectedHymns((prev) =>
                                  prev.some((sh) => sh._id === h._id)
                                    ? prev.filter((sh) => sh._id !== h._id)
                                    : [...prev, h]
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
                  </>
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
                    if (modalType === "add") {
                      const hymnsWithEvent = selectedHymns.map(h => ({
                        ...h,
                        eventId: selectedAddSongEventId || null
                      }));
                      add_song(selectedUser._id, { hymns: hymnsWithEvent });
                    }
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

      {/* --- Lyrics Modal --- */}
      {showLyricsModal && selectedLyricsHymn && (
        <Portal>
          <div
            className={`fixed inset-0 z-9999 flex justify-center items-end sm:items-center transition-all duration-300
                ${isClosing ? "opacity-0 backdrop-blur-sm" : "opacity-100 backdrop-blur-md bg-black/60"}`}
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              style={{
                backgroundColor: lyricsThemes[lyricsTheme].bg,
                boxShadow: lyricsTheme === 'warm' ? '0 10px 40px rgba(0, 0, 0, 0.1)' : '0 10px 40px rgba(0, 0, 0, 0.5)'
              }}
              className={`w-full sm:max-w-3xl h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-[2.5rem] flex flex-col relative transition-colors duration-500 overflow-hidden`}
            >
              {/* Decorative Pull Bar for Mobile — pure CSS, no JS animation */}
              <div
                  ref={pullBarRef}
                  className="sm:hidden w-12 bg-gray-400/20 rounded-full mx-auto shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
                  style={{
                      willChange: 'transform, opacity, height, margin',
                      height: isScrolledRef.current ? '0px' : '6px',
                      marginTop: isScrolledRef.current ? '0px' : '16px',
                      marginBottom: isScrolledRef.current ? '0px' : '8px',
                      opacity: isScrolledRef.current ? 0 : 1,
                      transform: isScrolledRef.current ? 'translateY(-10px) scaleY(0)' : 'translateY(0) scaleY(1)'
                  }}
              />

              {/* Header Content */}
              <div className={`px-6 flex flex-col border-b shrink-0 transition-colors duration-300
                      ${lyricsTheme === 'warm' ? 'border-amber-900/10' : 'border-white/5'}`}>

                {/* Always-visible title row */}
                <div className="flex justify-between items-center gap-4 py-4">
                  <div className="flex flex-col min-w-0">
                    <h2 className={`text-2xl sm:text-3xl font-bold truncate tracking-tight transition-colors duration-300 ${lyricsTheme === 'warm' ? 'text-[#1A1A1A]' : 'text-white'}`}>
                      {selectedLyricsHymn.title}
                    </h2>
                    {/* Subtitle — pure CSS opacity+transform, no height change */}
                    <div
                        ref={subtitleRef}
                        className={`text-xs uppercase tracking-[0.2em] font-bold overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${lyricsTheme === 'warm' ? 'text-gray-500' : 'text-sky-400'}`}
                        style={{
                            willChange: 'opacity, transform, max-height',
                            opacity: isScrolledRef.current ? 0 : 0.5,
                            maxHeight: isScrolledRef.current ? '0px' : '32px',
                            transform: isScrolledRef.current ? 'translateY(-10px) translateZ(0)' : 'translateY(0) translateZ(0)'
                        }}
                    >
                        Lyrics & Chords
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowDataShow(true);
                        setDataShowIndex(0);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
                                      ${lyricsTheme === 'warm'
                          ? 'bg-black/5 text-black hover:bg-black/10'
                          : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                      <Monitor className="w-4 h-4" />
                      <span className="hidden sm:inline">Presentation</span>
                    </button>

                    <button
                      onClick={closeLyricsModal}
                      className={`p-2 rounded-full transition-all ${lyricsTheme === 'warm' ? 'hover:bg-black/5 text-black/40 hover:text-black' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* Toolbar — hidden on scroll. CSS max-height clip: zero layout reflow */}
                <div
                    ref={toolbarRef}
                    className="flex flex-wrap items-center justify-between gap-3 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
                    style={{
                        willChange: 'opacity, transform, max-height, margin',
                        opacity: isScrolledRef.current ? 0 : 1,
                        maxHeight: isScrolledRef.current ? '0px' : '160px',
                        marginBottom: isScrolledRef.current ? '0px' : '12px',
                        pointerEvents: isScrolledRef.current ? 'none' : 'auto',
                        transform: isScrolledRef.current ? 'translateY(-10px) translateZ(0)' : 'translateY(0) translateZ(0)'
                    }}
                >
                  <div className="flex items-center gap-2">
                    {/* Chords Toggle */}
                    <button
                      onClick={() => setShowChords(!showChords)}
                      disabled={vocalsMode}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${vocalsMode ? 'hidden' : ''}
                              ${showChords
                          ? (lyricsTheme === 'warm' ? 'bg-black text-white border-black' : 'bg-sky-500 text-white border-sky-500')
                          : (lyricsTheme === 'warm' ? 'bg-transparent text-black/50 border-black/20' : 'bg-transparent text-white/30 border-white/10')
                        }`}
                    >
                      {showChords ? <Guitar className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {showChords ? "Chords On" : "Chords Off"}
                    </button>

                    {/* Font Controls */}
                    <div className={`flex items-center rounded-xl border transition-colors duration-300 ${lyricsTheme === 'warm' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                      <button
                        onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                        disabled={fontSize <= 14}
                        className={`p-2 transition-all disabled:opacity-20 ${lyricsTheme === 'warm' ? 'hover:text-black' : 'hover:text-white text-white/60'}`}
                      >
                        <span className="text-xs font-black">A-</span>
                      </button>
                      <div className={`w-px h-4 ${lyricsTheme === 'warm' ? 'bg-black/10' : 'bg-white/10'}`} />
                      <button
                        onClick={() => setFontSize(prev => Math.min(48, prev + 2))}
                        disabled={fontSize >= 48}
                        className={`p-2 transition-all disabled:opacity-20 ${lyricsTheme === 'warm' ? 'hover:text-black' : 'hover:text-white text-white/60'}`}
                      >
                        <span className="text-sm font-black">A+</span>
                      </button>
                    </div>
                  </div>

                  {/* Theme Selector */}
                  <div className={`flex p-1 rounded-xl border transition-colors duration-300 ${lyricsTheme === 'warm' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                    {Object.entries(lyricsThemes).map(([key, theme]) => (
                      <button
                        key={key}
                        onClick={() => setLyricsTheme(key)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 relative overflow-hidden
                                ${lyricsTheme === key
                            ? 'shadow-lg scale-100 z-10'
                            : 'opacity-40 hover:opacity-100 scale-95'}`}
                        style={{
                          backgroundColor: lyricsTheme === key ? theme.bg : 'transparent',
                          color: lyricsTheme === key ? theme.text : (lyricsTheme === 'warm' ? '#1A1A1A' : '#fff'),
                          border: lyricsTheme === key ? `1px solid ${theme.border || 'transparent'}` : 'none'
                        }}
                      >
                        {theme.label}
                        {lyricsTheme === key && (
                          <motion.div layoutId="activeTheme" className="absolute inset-0 rounded-lg border-2 border-sky-400/20" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div
                ref={lyricsScrollRef}
                onScroll={handleLyricsScroll}
                className="flex-1 overflow-y-auto custom-scrollbar relative"
                data-lenis-prevent-wheel
              >
                {/* Top fade-out gradient — appears when scrolled */}
                <div
                  ref={fadeRef}
                  className="sticky top-0 left-0 right-0 h-8 pointer-events-none z-10 transition-opacity duration-400"
                  style={{
                    opacity: isScrolledRef.current ? 1 : 0,
                    transform: 'translateZ(0)', // Force GPU layer
                    background: lyricsTheme === 'warm'
                      ? 'linear-gradient(to bottom, #FDFBF7, transparent)'
                      : lyricsTheme === 'dark'
                        ? 'linear-gradient(to bottom, #0F172A, transparent)'
                        : 'linear-gradient(to bottom, #0E2238, transparent)'
                  }}
                />
                <div className="px-6 sm:px-10 py-10">
                  <div
                    className="w-full max-w-2xl mx-auto transition-all duration-500"
                    dir="rtl"
                  >
                    {renderLyricsWithChords(selectedLyricsHymn.lyrics)}
                  </div>
                  {/* Extra spacing at bottom for better scrolling feel */}
                  <div className="h-20" />
                </div>
              </div>

              {/* Aesthetic Footer Gradient */}
              <div className={`absolute bottom-0 left-0 right-0 h-12 pointer-events-none transition-colors duration-500
                    ${lyricsTheme === 'warm'
                  ? 'bg-linear-to-t from-[#FDFBF7] to-transparent'
                  : lyricsTheme === 'dark'
                    ? 'bg-linear-to-t from-[#0F172A] to-transparent'
                    : 'bg-linear-to-t from-[#0E2238] to-transparent'
                }`}
              />
            </motion.div>
          </div>
        </Portal>
      )}      {showDataShow && selectedLyricsHymn && (
        <Portal>
          <div
            id="showDataContainer"
            className="fixed inset-0 z-10000 bg-black flex items-center justify-center"
          >
            {/* Exit Button */}
            <button
              onClick={() => setShowDataShow(false)}
              className="absolute top-6 right-6 text-white/60 hover:text-white transition-all hover:scale-110 z-10 p-2 rounded-full hover:bg-white/10"
            >
              <X size={32} />
            </button>

            {/* Counter */}
            <div className="absolute bottom-6 text-white/50 text-sm font-mono z-10">
              {dataShowSlides.length} / {dataShowIndex + 1}
            </div>

            {/* Navigation Arrows - LTR: Left=Next, Right=Previous */}
            {dataShowIndex < dataShowSlides.length - 1 && (
              <button
                onClick={() => setDataShowIndex(i => i + 1)}
                className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-all hover:scale-125 z-10 p-3 rounded-full hover:bg-white/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            )}
            {dataShowIndex > 0 && (
              <button
                onClick={() => setDataShowIndex(i => i - 1)}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-all hover:scale-125 z-10 p-3 rounded-full hover:bg-white/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            )}

            {/* Swipe Indicator (Mobile) */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/30 text-xs flex items-center gap-2 sm:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              <span>Swipe to navigate</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-180"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </div>

            {/* Slide with Fade */}
            <AnimatePresence mode="wait">
              <motion.div
                key={dataShowIndex}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="w-full h-full flex flex-col items-center justify-center px-10 text-center"
              >
                {renderPresentationSlideWithChords(dataShowSlides[dataShowIndex])}
              </motion.div>
            </AnimatePresence>

          </div>
        </Portal>
      )}

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowReportModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#0f172a] border border-white/10 p-5 rounded-2xl w-full max-w-sm shadow-2xl relative"
              >
                <button
                  onClick={() => setShowReportModal(false)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 mb-3 text-indigo-400">
                  <FileText className="w-5 h-5" />
                  <h3 className="font-bold text-sm uppercase tracking-wider">User Report</h3>
                </div>

                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-1" data-lenis-prevent-wheel>
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {reportText}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </section>
  );
}

function KeyDisplay({ humn_parameter }) {
  const [showChords, setShowChords] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/5 
          ${humn_parameter.scale ? 'text-blue-300 bg-blue-500/10' : 'text-gray-600'}`}>
          {humn_parameter.scale || '-'}
        </span>

        {humn_parameter.relatedChords && (
          <button
            onClick={() => setShowChords(!showChords)}
            className={`p-0.5 rounded-full transition-all duration-300 border border-transparent 
              ${showChords
                ? 'bg-sky-500/20 text-sky-300 rotate-180 border-sky-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
            title="Show Related Chords"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        )}
      </div>

      <AnimatePresence>
        {showChords && humn_parameter.relatedChords && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -5 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -5 }}
            className="overflow-hidden w-full"
          >
            <div className="mt-1 flex flex-wrap gap-1 w-full">
              {humn_parameter.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, i) => (
                <span key={i} className="text-[9px] uppercase font-bold text-sky-200 bg-sky-900/30 px-1 py-0.5 rounded border border-sky-500/20">
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