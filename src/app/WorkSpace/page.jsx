'use client';
import React, { useContext, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, Trash2, Heart, Music, Gift, Star, Sparkles, GraduationCap, FileText, X, Monitor, Guitar, Calendar, PlusCircle, Radio, ExternalLink, Tv2, ChevronUp, Mic, MicOff } from 'lucide-react';
import Metronome from '../Metronome/page';
import { HymnsContext } from '../context/Hymns_Context';
import { UserContext } from '../context/User_Context';
import Portal from '../Portal/Portal';
import { Virtuoso } from 'react-virtuoso';
import { transposeScale, transposeChords, transposeLyrics } from '../utils/musicUtils';
import { usePresentation } from '../hooks/usePresentation';
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://worship-team-api.onrender.com/api";

const SetlistCustomizerCard = ({ hymn, idx, updateWorkspaceHymn }) => {
    const [localLyrics, setLocalLyrics] = useState(hymn.lyrics || '');
    const [localFontSize, setLocalFontSize] = useState(hymn.customFontSize || 0); // 0 means auto
    const [isEditingLyrics, setIsEditingLyrics] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localLyrics !== hymn.lyrics || localFontSize !== (hymn.customFontSize || 0)) {
                updateWorkspaceHymn(hymn._id, {
                    lyrics: localLyrics,
                    customFontSize: localFontSize === 0 ? null : localFontSize
                });
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [localLyrics, localFontSize, hymn._id, hymn.lyrics, hymn.customFontSize, updateWorkspaceHymn]);



    return (
        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 hover:border-sky-500/40 hover:bg-white/10 transition-all duration-200">
            <div className="flex flex-wrap flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300 font-bold text-sm">
                        {idx + 1}
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <h3 className="font-semibold text-base sm:text-lg text-white">
                            {hymn.title}
                        </h3>
                        <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            Key: {hymn.scale || '-'}
                        </span>
                        {localFontSize > 0 && (
                            <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                Font Size: {localFontSize}px
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex bg-black/30 rounded-lg p-1 border border-white/10 shrink-0">
                    <button
                        onClick={() => setIsEditingLyrics(!isEditingLyrics)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${isEditingLyrics ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Edit Lyrics
                    </button>
                    <div className="w-px bg-white/10 mx-1"></div>
                    <div className="flex items-center gap-2 px-2 text-xs font-bold text-gray-400">
                        <span>PDF Zoom:</span>
                        <button
                            onClick={() => setLocalFontSize(prev => prev === 0 ? 14 : Math.max(10, prev - 1))}
                            className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-white flex items-center justify-center"
                        >-</button>
                        <span className="w-6 text-center text-white">{localFontSize === 0 ? 'A' : localFontSize}</span>
                        <button
                            onClick={() => setLocalFontSize(prev => prev === 0 ? 14 : Math.min(30, prev + 1))}
                            className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-white flex items-center justify-center"
                        >+</button>
                        {localFontSize !== 0 && (
                            <button
                                onClick={() => setLocalFontSize(0)}
                                className="w-6 h-6 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center ml-1"
                                title="Reset to Auto"
                            ><X size={12} /></button>
                        )}
                    </div>
                </div>
            </div>

            {isEditingLyrics && (
                <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-400">
                            Custom Lyrics (Edit & Print)
                        </span>
                        <span className="text-[10px] text-gray-500">Auto-saves as you type</span>
                    </div>
                    <textarea
                        value={localLyrics}
                        onChange={(e) => setLocalLyrics(e.target.value)}
                        rows={6}
                        className="w-full bg-black/40 border border-sky-500/30 rounded-xl text-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-sky-400 text-white font-medium custom-scrollbar"
                        dir="rtl"
                    />
                </div>
            )}

            <div className="space-y-3">
                {(hymn.musitionNotes || []).map((note, nIdx) => (
                    <div
                        key={nIdx}
                        className="bg-black/30 p-3 sm:p-4 rounded-2xl border border-white/5 flex flex-col gap-3"
                    >
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="sm:w-40 flex flex-col gap-1">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    Role
                                </span>
                                <select
                                    value={note.role}
                                    onChange={(e) => {
                                        const newNotes = [...hymn.musitionNotes];
                                        newNotes[nIdx].role = e.target.value;
                                        updateWorkspaceHymn(hymn._id, { musitionNotes: newNotes });
                                    }}
                                    className="w-full bg-sky-900/40 text-xs font-bold text-sky-200 border border-sky-500/40 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-400"
                                >
                                    <option value="General">General</option>
                                    <option value="Guitar">Guitar</option>
                                    <option value="Piano">Piano</option>
                                    <option value="Drums">Drums</option>
                                    <option value="Bass">Bass</option>
                                    <option value="Vocals">Vocals</option>
                                </select>
                            </div>

                            <div className="flex-1 flex flex-col gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    Instruction / Intro
                                </span>
                                <textarea
                                    value={note.note}
                                    onChange={(e) => {
                                        const newNotes = [...hymn.musitionNotes];
                                        newNotes[nIdx].note = e.target.value;
                                        updateWorkspaceHymn(hymn._id, { musitionNotes: newNotes });
                                    }}
                                    rows={2}
                                    placeholder="e.g. Soft pad intro, drums enter on chorus, repeat bridge 2x..."
                                    className="w-full bg-transparent border border-white/10 rounded-xl text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-gray-600"
                                />
                            </div>
                        </div>

                        {/* Lyrics Reference / Line Input */}
                        <div className="flex flex-col gap-2 mt-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Lyrics Reference (Optional)
                            </span>
                            <input
                                type="text"
                                value={note.line || ''}
                                onChange={(e) => {
                                    const newNotes = [...hymn.musitionNotes];
                                    newNotes[nIdx].line = e.target.value;
                                    updateWorkspaceHymn(hymn._id, { musitionNotes: newNotes });
                                }}
                                placeholder="e.g. Type some lyrics to reference here..."
                                className="w-full bg-transparent border border-white/10 rounded-xl text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-gray-600"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => {
                                    const newNotes = hymn.musitionNotes.filter((_, i) => i !== nIdx);
                                    updateWorkspaceHymn(hymn._id, { musitionNotes: newNotes });
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all"
                            >
                                <X size={14} />
                                Remove
                            </button>
                        </div>
                    </div>
                ))}

                <button
                    onClick={() => {
                        const newNotes = [
                            ...(hymn.musitionNotes || []),
                            { role: 'General', note: '' }
                        ];
                        updateWorkspaceHymn(hymn._id, { musitionNotes: newNotes });
                    }}
                    className="w-full py-2.5 border border-dashed border-white/10 rounded-xl text-xs font-semibold text-gray-400 hover:text-sky-300 hover:border-sky-500/40 hover:bg-sky-500/10 transition-all"
                >
                    + Add Instruction / Intro
                </button>
            </div>
        </div>
    );
};

export default function WorkSpace() {
    //3 button ui & ux
    // ── Smart Dock ─────────────────────────────────────────────────────
    const [dockOpen, setDockOpen] = useState(false);
    const [dockToast, setDockToast] = useState('');
    const [dockToastVisible, setDockToastVisible] = useState(false);
    const dlRef = useRef(null);
    const saveRef = useRef(null);
    const noteRef = useRef(null);

    const showDockToast = (msg) => {
        setDockToast(msg);
        setDockToastVisible(true);
        setTimeout(() => setDockToastVisible(false), 2200);
    };

    const addDockRipple = (e, ref) => {
        const btn = ref.current;
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const el = document.createElement('span');
        el.className = 'dock-ripple';
        el.style.cssText = `left:${e.clientX - rect.left - 30}px;top:${e.clientY - rect.top - 30}px`;
        btn.appendChild(el);
        setTimeout(() => el.remove(), 500);
    };

    useEffect(() => {
        if (!dockOpen) return;
        const fn = (e) => {
            if (!e.target.closest('.dock-pill') && !e.target.closest('.dock-fab')) setDockOpen(false);
        };
        document.addEventListener('pointerdown', fn);
        return () => document.removeEventListener('pointerdown', fn);
    }, [dockOpen]);
    // ───────────────────────────────────────────────────────────────────
    const { workspace, removeFromWorkspace, updateWorkspaceHymn } = useContext(HymnsContext);
    const { isLogin, UserRole, vocalsMode } = useContext(UserContext);

    // Categories Configuration for Icon Lookup
    const categories = [
        { id: 'all', label: 'All Hymns', icon: Music },
        { id: 'christmass', label: 'Christmas', icon: Gift },
        { id: 'easter', label: 'Easter', icon: Star },
        { id: 'newyear', label: 'New Year', icon: Sparkles },
        { id: 'motherday', label: 'Mother Day', icon: Heart },
        { id: 'graduation', label: 'Graduation', icon: GraduationCap },
    ];

    // Animation Variants (Reusable from Category_Humns for consistency)
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

    // Lyrics Modal State
    const [showLyricsModal, setShowLyricsModal] = useState(false);
    const [selectedLyricsHymn, setSelectedLyricsHymn] = useState(null);
    const [lyricsTheme, setLyricsTheme] = useState('main');
    const [fontSize, setFontSize] = useState(18);
    // Persist showChords state in localStorage for lyrics modal
    const [showChords, setShowChords] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('workspace_showChords');
            if (saved !== null) return saved === 'true';
        }
        return true;
    });

    const lyricsThemes = {
        warm: { bg: '#F8F5EE', text: '#222222', label: 'Warm' },
        dark: { bg: '#14181f', text: '#f1f1f1', label: 'Dark' },
        main: { bg: '#0E2238', text: '#EDEDED', label: 'Main' }
    };
    const [isClosing, setIsClosing] = useState(false);

    // Data Show State
    const [showDataShow, setShowDataShow] = useState(false);
    const [dataShowIndex, setDataShowIndex] = useState(0);

    // ── Live Presentation (Socket.io) ──────────────────────────────────
    const [dataShowId, setDataShowId] = useState('');
    const [dataShowIdInput, setDataShowIdInput] = useState('');
    const [showSessionPanel, setShowSessionPanel] = useState(false);

    useEffect(() => {
        const savedSession = localStorage.getItem('myLivePresentationId');
        if (savedSession) {
            const checkSession = async () => {
                try {
                    const BASE_URL = "https://worship-team-api.onrender.com/api";
                    const response = await fetch(`${BASE_URL}/presentation/check/${encodeURIComponent(savedSession)}`);
                    const data = await response.json();
                    if (data.exists) {
                        setDataShowId(savedSession);
                    } else {
                        localStorage.removeItem('myLivePresentationId');
                    }
                } catch (e) {
                    console.error(e);
                }
            };
            checkSession();
        }
    }, []);

    const { isConnected, broadcastHymn, broadcastSlide, clearDisplay, toggleAudio, isAudioActive } = usePresentation(
        dataShowId || null,
        'controller'
    );

    const handleCreateSession = async () => {
        if (dataShowId || localStorage.getItem('myLivePresentationId')) {
            alert("You already have an active Live Presentation on this device. Please end it first.");
            return;
        }

        const id = dataShowIdInput.trim();
        if (!id) return;

        try {
            const BASE_URL = "https://worship-team-api.onrender.com/api";
            const response = await fetch(`${BASE_URL}/presentation/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataShowId: id })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setDataShowId(id);
                localStorage.setItem('myLivePresentationId', id);
                setShowSessionPanel(false);
            } else {
                alert(data.error || "Failed to create session");
            }
        } catch (error) {
            alert("Failed to create session");
        }
    };

    const handleJoinSession = async () => {
        const id = dataShowIdInput.trim();
        if (!id) return;

        try {
            const BASE_URL = "https://worship-team-api.onrender.com/api";
            const response = await fetch(`${BASE_URL}/presentation/check/${encodeURIComponent(id)}`);
            const data = await response.json();
            if (data.exists) {
                window.open(`/presentation/display?dataShowId=${encodeURIComponent(id)}`, '_blank');
                setShowSessionPanel(false);
            } else {
                alert("Presentation room does not exist or has expired.");
            }
        } catch (error) {
            alert("Failed to join session: could not connect to server");
        }
    };
    // ──────────────────────────────────────────────────────────────────

    const [showSetlistModal, setShowSetlistModal] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isSavingEvent, setIsSavingEvent] = useState(false);
    const [showEventPicker, setShowEventPicker] = useState(false);
    const [churchEvents, setChurchEvents] = useState([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);

    const fetchChurchEvents = async () => {
        setIsLoadingEvents(true);
        try {
            const response = await fetch(`${API_URL}/events`, {
                headers: {
                    'Authorization': `Bearer ${isLogin}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setChurchEvents(data);
            }
        } catch (error) {
            console.error('Fetch events error:', error);
        } finally {
            setIsLoadingEvents(false);
        }
    };

    const saveToEvent = async (eventId, eventName) => {
        setIsSavingEvent(true);
        try {
            // Create a snapshot with current transpositions applied
            const snappedHymns = workspace.map(hymn => {
                const transposeStep = (typeof window !== 'undefined' && localStorage.getItem(`transpose_${hymn._id}`)) ? parseInt(localStorage.getItem(`transpose_${hymn._id}`), 10) : 0;
                if (transposeStep === 0) return hymn;

                return {
                    ...hymn,
                    scale: transposeScale(hymn.scale, transposeStep),
                    relatedChords: transposeChords(hymn.relatedChords, transposeStep),
                    lyrics: transposeLyrics(hymn.lyrics, transposeStep)
                };
            });

            // If eventId exists, we update (patch). If not, we might create (but user usually selects).
            // Based on user request "I will choose", we primarily target existing events.
            const url = eventId ? `${API_URL}/events/edit/${eventId}` : `${API_URL}/events/create`;
            const method = eventId ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${isLogin}`
                },
                body: JSON.stringify({
                    eventName: eventName,
                    hymns: snappedHymns
                })
            });

            if (response.ok) {
                setShowEventPicker(false);
                alert('Event updated successfully with this setlist!');
            } else {
                alert('Failed to save event');
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Error connecting to server');
        } finally {
            setIsSavingEvent(false);
        }
    };

    const downloadSetlistPDF = async () => {
        setIsDownloading(true);
        try {
            // Apply current transpose steps to workspace hymns before exporting to PDF
            const transposedWorkspace = workspace.map(hymn => {
                const transposeStep = (typeof window !== 'undefined' && localStorage.getItem(`transpose_${hymn._id}`)) ? parseInt(localStorage.getItem(`transpose_${hymn._id}`), 10) : 0;
                if (transposeStep === 0) return hymn;

                return {
                    ...hymn,
                    scale: transposeScale(hymn.scale, transposeStep),
                    relatedChords: transposeChords(hymn.relatedChords, transposeStep),
                    lyrics: transposeLyrics(hymn.lyrics, transposeStep)
                };
            });

            const response = await fetch(`${API_URL}/events/generate-pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${isLogin}`
                },
                body: JSON.stringify({
                    hymns: transposedWorkspace,
                    churchName: (typeof window !== 'undefined' && localStorage.getItem('user_Taspe7_ChurchName')) || 'Taspe7',
                    hideChords: !showChords
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Setlist-${new Date().getTime()}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                showDockToast('✓ PDF downloaded');
            } else {
                alert('Failed to generate PDF');
            }
        } catch (error) {
            console.error('Download error:', error);
            alert('Error connecting to server');
        } finally {
            setIsDownloading(false);
        }
    };



    const dataShowSlides = React.useMemo(() => {
        if (!selectedLyricsHymn?.lyrics) return [];

        // Lyrics in workspace are already transposed when added
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
        // Restore last showChords preference from localStorage
        const saved = typeof window !== 'undefined' ? localStorage.getItem('workspace_showChords') : null;
        setShowChords(saved !== null ? saved === 'true' : (vocalsMode ? false : true));
        setShowLyricsModal(true);
    };
    // Persist showChords to localStorage when changed
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('workspace_showChords', showChords);
        }
    }, [showChords]);

    // Open presentation mode directly
    const openPresentation = (hymn) => {
        setSelectedLyricsHymn(hymn);
        setShowChords(vocalsMode ? false : true);
        setShowDataShow(true);
        setDataShowIndex(0);
    };

    const closeLyricsModal = () => {
        setIsClosing(true);
        setTimeout(() => {
            setShowLyricsModal(false);
            setSelectedLyricsHymn(null);
            setIsClosing(false);
        }, 300);
    };

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

    // Robust broadcast sync: whenever session connects or hymn changes while presentation is open
    useEffect(() => {
        if (showDataShow && dataShowId && selectedLyricsHymn && isConnected) {
            const slides = selectedLyricsHymn.lyrics
                ? selectedLyricsHymn.lyrics.replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '').split('\n\n').map(b => b.trim()).filter(Boolean)
                : [];
            broadcastHymn(selectedLyricsHymn, slides);
            broadcastSlide(dataShowIndex);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showDataShow, dataShowId, selectedLyricsHymn, isConnected, broadcastHymn, showChords]);

    // Broadcast slide change whenever dataShowIndex moves exclusively
    useEffect(() => {
        if (showDataShow && dataShowId && selectedLyricsHymn && isConnected) {
            broadcastSlide(dataShowIndex);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataShowIndex]);

    // Sync showChords with vocalsMode
    useEffect(() => {
        if (vocalsMode) {
            setShowChords(false);
        } else {
            setShowChords(true);
        }
    }, [vocalsMode]);

    const renderLyricsWithChords = (text) => {
        if (!text) return null;

        return text.split('\n').map((line, i) => (
            <div
                key={i}
                className={`relative w-full text-center ${showChords && line.includes('[') ? 'mt-[1.2rem] mb-2' : 'my-2'}`}
                style={{ fontSize: `${fontSize}px`, minHeight: '1.5em', lineHeight: '1.8' }}
                dir="rtl"
            >
                {line ? line.split(/(\[.*?\])/g).map((part, j) => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                        if (!showChords) return null;
                        const chord = part.slice(1, -1);
                        return (
                            <span key={j} className="inline-block relative overflow-visible mx-[0.1em] align-baseline whitespace-pre-line leading-relaxed" style={{ lineHeight: '1' }}>
                                {/* Hidden placeholder to reserve space and prevent overlapping */}
                                <span className="invisible whitespace-nowrap" style={{ fontSize: `0.75em` }} dir="ltr">
                                    {chord}
                                </span>
                                <span
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 font-bold whitespace-nowrap shadow-sm mb-1"
                                    style={{
                                        color: lyricsTheme === 'warm' ? '#0369a1' : '#38bdf8',
                                        fontSize: `0.75em`,
                                        textShadow: lyricsTheme === 'warm' ? 'none' : '0 2px 4px rgba(0,0,0,0.8)'
                                    }}
                                    dir="ltr"
                                >
                                    {chord}
                                </span>
                            </span>
                        );
                    }
                    return <span key={j} className="whitespace-pre-line leading-relaxed">{part}</span>;
                }) : <br />}
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
                                <span className="invisible whitespace-nowrap" style={{ fontSize: '0.7em' }} dir="ltr">
                                    {chord}
                                </span>
                                <span
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 font-bold whitespace-nowrap shadow-sm mb-1 text-sky-300 pointer-events-none"
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
                    return <span key={j} className="text-white font-bold whitespace-pre-line leading-relaxed select-none">{part}</span>;
                }) : <br />}
            </div>
        ));
    };

    return (
        <section id='WorkSpace-section' className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] text-white px-4 sm:px-6 py-16 relative overflow-hidden">
            {/* Background Gradients - Matching Category Page */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,0.15),transparent_70%)]" />

            <div className="relative z-10 max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-10">

                    <h1 className="text-3xl sm:text-5xl font-extrabold bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text drop-shadow-lg">
                        My Workspace
                    </h1>
                    <p className="mt-2 text-gray-400">Manage your setlist for the service</p>

                    {/* Smart Floating Dock */}
                    <div className="relative flex justify-center mt-6">
                        <div className={`dock-toast-inline ${dockToastVisible ? 'visible' : ''}`}>{dockToast}</div>

                        <div className="dock-wrapper-inline">
                            {/* main button */}
                            {!dockOpen ? (
                                <button
                                    className="dock-fab-sm"
                                    onClick={() => setDockOpen(true)}
                                    aria-label="Open actions"
                                >
                                    <ChevronUp size={16} className="dock-fab-icon" strokeWidth={2.5} />
                                    <span className="dock-fab-label">Actions</span>
                                </button>
                            ) : (
                                <div className="dock-pill">
                                    {/* notes button */}
                                    <button
                                        ref={noteRef}
                                        className="act-btn act-btn--notes"
                                        onClick={(e) => { addDockRipple(e, noteRef); setShowSetlistModal(true); setDockOpen(false); }}
                                    >
                                        <span className="act-icon"><FileText size={17} strokeWidth={2.2} /></span>
                                        <span className="act-label">Notes</span>
                                    </button>

                                    <div className="dock-divider" />
                                    {/* save event button */}
                                    {['ADMIN', 'MANEGER', 'PROGRAMER', 'Admin', 'Maneger', 'Programer'].includes(UserRole) && (
                                        <button
                                            ref={saveRef}
                                            className="act-btn act-btn--save"
                                            disabled={workspace.length === 0 || isSavingEvent}
                                            onClick={(e) => { addDockRipple(e, saveRef); fetchChurchEvents(); setShowEventPicker(true); setDockOpen(false); }}
                                        >
                                            {isSavingEvent
                                                ? <span className="dock-btn-spinner" />
                                                : <span className="act-icon"><Music size={17} strokeWidth={2.2} /></span>}
                                            <span className="act-label">{isSavingEvent ? 'Saving…' : 'Save'}</span>
                                        </button>
                                    )}

                                    <div className="dock-divider" />
                                    {/* pdf download button */}
                                    <button
                                        ref={dlRef}
                                        className="act-btn act-btn--download"
                                        disabled={workspace.length === 0 || isDownloading}
                                        onClick={(e) => { addDockRipple(e, dlRef); downloadSetlistPDF(); setDockOpen(false); }}
                                    >
                                        {isDownloading
                                            ? <span className="dock-btn-spinner" />
                                            : <span className="act-icon"><Monitor size={17} strokeWidth={2.2} /></span>}
                                        <span className="act-label">{isDownloading ? 'Exporting…' : 'PDF'}</span>
                                    </button>

                                    <div className="dock-divider" />

                                    <button className="dock-close-btn" onClick={() => setDockOpen(false)} aria-label="Close">
                                        <X size={15} strokeWidth={2.5} />
                                    </button>

                                </div>
                            )}
                        </div>
                    </div>
                    {/* ── Live Session Panel ───────────────────────────────────── */}
                    <div className="mt-6">
                        {/* Toggle button */}
                        <button
                            onClick={() => setShowSessionPanel(p => !p)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl transition-all font-bold text-sm border
                                ${isConnected
                                    ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            <Radio className={`w-4 h-4 ${isConnected ? 'animate-pulse' : ''}`} />
                            {isConnected ? (
                                <><span className="text-[10px] text-green-500 font-black uppercase tracking-widest">● LIVE</span> · {dataShowId}</>
                            ) : 'Start Live Session'}
                        </button>

                        {/* Session setup drawer */}
                        {showSessionPanel && (
                            <div className="mt-3 p-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm mx-auto w-full sm:w-auto sm:min-w-[400px]">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Live Presentation Room</p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        value={dataShowIdInput}
                                        onChange={e => setDataShowIdInput(e.target.value)}
                                        placeholder='Room code  e.g. "sunday-01"'
                                        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-gray-600 w-full"
                                        onKeyDown={e => { if (e.key === 'Enter') handleJoinSession(); }}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCreateSession}
                                            className="flex-1 sm:flex-none px-4 py-2 bg-sky-500 hover:bg-sky-400 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                                        >
                                            Create
                                        </button>
                                        <button
                                            onClick={handleJoinSession}
                                            className="flex-1 sm:flex-none px-4 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                                        >
                                            Join
                                        </button>
                                    </div>
                                </div>

                                {dataShowId && (
                                    <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
                                        {/* Open projector window */}
                                        <a
                                            href={`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/20 transition-all flex-1"
                                        >
                                            <Tv2 size={13} /> Open Display Window
                                        </a>
                                        {/* Open mobile remote */}
                                        <a
                                            href={`/presentation/remote?dataShowId=${encodeURIComponent(dataShowId)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/20 transition-all flex-1"
                                        >
                                            <ExternalLink size={13} /> Mobile Remote
                                        </a>

                                        {/* Microphone Toggle Button */}
                                        <button
                                            onClick={toggleAudio}
                                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all flex-1 ${isAudioActive
                                                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            {isAudioActive ? <Mic size={13} className="text-sky-400 animate-pulse" /> : <MicOff size={13} />}
                                            {isAudioActive ? 'Mic On' : 'Turn On Mic'}
                                        </button>

                                        {/* End Session Button */}
                                        <button
                                            onClick={() => {
                                                if (isAudioActive) toggleAudio();
                                                clearDisplay();
                                                setDataShowId('');
                                                localStorage.removeItem('myLivePresentationId');
                                            }}
                                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all w-full sm:w-auto"
                                        >
                                            <X size={13} /> End Session
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* ──────────────────────────────────────────────────────────── */}
                </div>

                {/* Content Table */}
                <div className="relative">
                    {/* Table Header */}
                    <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest bg-white/5 rounded-t-2xl border-b border-white/10 mx-2">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-11 sm:col-span-5 md:col-span-5">Song Title</div>
                        <div className="col-span-2 text-center bg-white/5 rounded-lg py-1">Key / Chords</div>
                        <div className="col-span-1 text-center">Remove</div>
                        <div className="col-span-3 text-center">Media</div>
                    </div>

                    {/* List Body with react-virtuoso */}
                    {workspace.length > 0 ? (
                        <div className="pb-20 mt-2">
                            <Virtuoso
                                useWindowScroll
                                data={workspace}
                                itemContent={(index, hymn) => (
                                    <div className="pb-3">
                                        <WorkspaceItem
                                            hymn={hymn}
                                            index={index}
                                            categories={categories}
                                            removeFromWorkspace={removeFromWorkspace}
                                            variants={itemVariants}
                                            openLyrics={openLyrics}
                                            openPresentation={openPresentation}
                                            vocalsMode={vocalsMode}
                                        />
                                    </div>
                                )}
                            />
                        </div>
                    ) : (
                        <div className="p-20 text-center flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed mt-2 pb-20">
                            <Heart className="w-12 h-12 mb-4 opacity-50 text-sky-400" />
                            <h3 className="text-xl font-bold text-gray-300 mb-2">Your workspace is empty</h3>
                            <p className="text-sm text-gray-500">Go to the Hymns Library to add some songs.</p>
                        </div>
                    )}
                </div>

                {/* --- Lyrics Modal --- */}
                {showLyricsModal && selectedLyricsHymn && (
                    <Portal>
                        <div
                            className={`fixed inset-0 z-9999 flex justify-center items-center p-4 transition-all duration-300
                ${isClosing ? "opacity-0 backdrop-blur-sm" : "opacity-100 backdrop-blur-md bg-black/70"}`}
                        >
                            <div
                                style={{ backgroundColor: lyricsThemes[lyricsTheme].bg }}
                                className={`w-full max-w-2xl max-h-[85vh] border border-white/10 rounded-2xl shadow-2xl flex flex-col relative transform transition-all duration-300
                  ${isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
                            >
                                {/* Modern Data Show Button */}
                                <button
                                    onClick={() => {
                                        setShowDataShow(true);
                                        setDataShowIndex(0);
                                    }}
                                    className="group flex items-center min-h-12 gap-2 px-4 rounded-xl text-sm font-semibold transition-all duration-300 border backdrop-blur-md relative overflow-hidden shadow-lg
                                        bg-linear-to-r from-purple-500/10 to-pink-500/10 border-purple-400/30 text-purple-200 
                                        hover:from-purple-500/20 hover:to-pink-500/20 hover:border-purple-400/50 hover:shadow-purple-500/25 hover:scale-105 active:scale-95"
                                >
                                    <div className="absolute inset-0 bg-purple-400/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <Monitor className="w-4 h-4 relative z-10 group-hover:scale-110 transition-transform" />
                                    <span className="relative z-10">Presentation</span>
                                </button>

                                {/* Header */}
                                <div className={`p-6 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 transition-colors duration-300
                      ${lyricsTheme === 'warm' ? 'bg-black/5 border-black/5' : 'bg-white/5'}`}>

                                    <div className="flex-1 min-w-0">
                                        <h2 className={`text-2xl font-bold truncate ${lyricsTheme === 'warm' ? 'text-gray-800' : 'bg-linear-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent'}`}>
                                            {selectedLyricsHymn.title}
                                        </h2>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setShowChords(!showChords)}
                                            disabled={vocalsMode}
                                            className={`p-2 rounded-lg transition-all ${vocalsMode ? 'opacity-0 pointer-events-none' : ''} ${showChords
                                                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                                }`}
                                            title={showChords ? "Hide Chords" : "Show Chords"}
                                        >
                                            <Guitar className="w-5 h-5" />
                                        </button>

                                        {/* Font Size Controls */}
                                        <div className={`flex items-center rounded-lg border ${lyricsTheme === 'warm' ? 'bg-white border-black/10' : 'bg-black/20 border-white/10'}`}>
                                            <button
                                                onClick={() => setFontSize(prev => Math.max(14, prev - 2))}
                                                disabled={fontSize <= 14}
                                                className={`px-3 py-1.5 text-xs font-bold border-r ${lyricsTheme === 'warm' ? 'border-black/5 text-gray-600 hover:bg-black/5' : 'border-white/5 text-gray-300 hover:bg-white/10'} disabled:opacity-30`}
                                            >
                                                A-
                                            </button>
                                            <button
                                                onClick={() => setFontSize(prev => Math.min(36, prev + 2))}
                                                disabled={fontSize >= 36}
                                                className={`px-3 py-1.5 text-xs font-bold ${lyricsTheme === 'warm' ? 'text-gray-600 hover:bg-black/5' : 'text-gray-300 hover:bg-white/10'} disabled:opacity-30`}
                                            >
                                                A+
                                            </button>
                                        </div>

                                        {/* Theme Toggles */}
                                        <div className={`flex p-1 rounded-lg border ${lyricsTheme === 'warm' ? 'bg-white border-black/10' : 'bg-black/20 border-white/10'}`}>
                                            {Object.entries(lyricsThemes).map(([key, theme]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => setLyricsTheme(key)}
                                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-200
                                ${lyricsTheme === key
                                                            ? 'shadow-sm transform scale-105'
                                                            : 'opacity-50 hover:opacity-100'}`}
                                                    style={{
                                                        backgroundColor: lyricsTheme === key ? theme.text : 'transparent',
                                                        color: lyricsTheme === key ? theme.bg : (lyricsTheme === 'warm' ? '#222' : '#fff')
                                                    }}
                                                >
                                                    {theme.label}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={closeLyricsModal}
                                            className={`transition ${lyricsTheme === 'warm' ? 'text-gray-400 hover:text-gray-700' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-8 overflow-y-auto custom-scrollbar" data-lenis-prevent-wheel>
                                    <p
                                        style={{
                                            color: lyricsThemes[lyricsTheme].text,
                                            fontSize: `${fontSize}px`,
                                            lineHeight: 1.6
                                        }}
                                        className="leading-relaxed whitespace-pre-wrap font-medium font-sans text-center transition-all duration-200"
                                        dir="rtl"
                                    >
                                        {renderLyricsWithChords(selectedLyricsHymn.lyrics)}
                                    </p>
                                </div>
                            </div>

                        </div>

                    </Portal>
                )}

                {/* --- Data Show (Presentation) Modal - Independent --- */}
                {showDataShow && selectedLyricsHymn && (
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
                                    transition={{ duration: 0.1, ease: "easeInOut" }}
                                    className="w-full h-full flex flex-col items-center justify-center px-10 text-center"
                                >
                                    {renderPresentationSlideWithChords(dataShowSlides[dataShowIndex])}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </Portal>
                )}

                {/* --- Setlist Notes Modal --- */}
                {showSetlistModal && (
                    <Portal>
                        <div className="fixed inset-0 z-9999 flex justify-center items-center p-4 bg-black/70 backdrop-blur-md">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="w-full max-w-4xl max-h-[90vh] bg-[#0E2238] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                            >
                                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                                    <div>
                                        <h2 className="text-2xl font-bold text-sky-400">Setlist Performance Notes</h2>
                                        <p className="text-sm text-gray-400">Add instructions for the band and intros for each song</p>
                                    </div>
                                    <button onClick={() => setShowSetlistModal(false)} className="text-gray-400 hover:text-white">
                                        <X size={24} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" data-lenis-prevent-wheel>
                                    {workspace.map((hymn, idx) => (
                                        <SetlistCustomizerCard
                                            key={hymn._id}
                                            hymn={hymn}
                                            idx={idx}
                                            updateWorkspaceHymn={updateWorkspaceHymn}
                                        />
                                    ))}
                                </div>

                                <div className="p-6 border-t border-white/10 bg-white/5 text-right">
                                    <button
                                        onClick={() => setShowSetlistModal(false)}
                                        className="bg-sky-500 hover:bg-sky-400 px-8 py-2 rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20"
                                    >
                                        Apply & Close
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </Portal>
                )}

                {/* --- Event Picker Modal --- */}
                {showEventPicker && (
                    <Portal>
                        <div className="fixed inset-0 z-9999 flex justify-center items-center p-4 bg-black/70 backdrop-blur-md text-white">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="w-full max-w-lg bg-[#0E2238] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                            >
                                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                                    <h2 className="text-xl font-bold text-sky-400">Select Event to Save Setlist</h2>
                                    <button onClick={() => setShowEventPicker(false)} className="text-gray-400 hover:text-white transition-colors">
                                        <X size={24} />
                                    </button>
                                </div>

                                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-3 custom-scrollbar text-white" data-lenis-prevent-wheel>
                                    {isLoadingEvents ? (
                                        <div className="flex justify-center p-10">
                                            <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                                        </div>
                                    ) : churchEvents.length > 0 ? (
                                        churchEvents.map(event => (
                                            <button
                                                key={event._id}
                                                onClick={() => saveToEvent(event._id, event.eventName)}
                                                className="w-full text-left p-4 rounded-2xl bg-white/5 hover:bg-sky-500/10 border border-white/5 hover:border-sky-500/30 transition-all flex justify-between items-center group"
                                            >
                                                <span className="font-semibold text-gray-200 group-hover:text-white transition-colors">{event.eventName}</span>
                                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                    <Calendar size={12} />
                                                    {new Date(event.createdAt).toLocaleDateString()}
                                                </div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="text-center py-10 text-gray-500">
                                            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                            <p>No events found for your church.</p>
                                        </div>
                                    )}

                                    <div className="pt-4 border-t border-white/5">
                                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Or create a new one:</p>
                                        <button
                                            onClick={() => {
                                                const name = prompt("Enter New Event Name:");
                                                if (name) saveToEvent(null, name);
                                            }}
                                            className="w-full p-4 rounded-2xl border border-dashed border-white/10 text-gray-400 hover:text-sky-300 hover:border-sky-500/40 hover:bg-sky-500/5 transition-all flex items-center justify-center gap-2 font-bold"
                                        >
                                            <PlusCircle size={18} />
                                            New Service / Event
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </Portal>
                )}
            </div>
        </section>
    )
}

// Sub-component for handling Key/Chords toggle state (Reused)
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

function WorkspaceItem({ hymn, index, categories, removeFromWorkspace, variants, openLyrics, openPresentation, vocalsMode }) {
    const [transposeStep, setTransposeStep] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(`transpose_${hymn._id}`);
            return saved ? parseInt(saved, 10) : 0;
        }
        return 0;
    });
    const currentScale = transposeScale(hymn.scale, transposeStep);
    const currentChords = transposeChords(hymn.relatedChords, transposeStep);
    const currentLyrics = hymn.lyrics ? transposeLyrics(hymn.lyrics, transposeStep) : '';

    // Persist transpose step to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (transposeStep === 0) {
                localStorage.removeItem(`transpose_${hymn._id}`);
            } else {
                localStorage.setItem(`transpose_${hymn._id}`, transposeStep);
            }
        }
    }, [transposeStep, hymn._id]);

    return (
        <motion.div
            variants={variants}
            className="group relative grid grid-cols-12 gap-2 sm:gap-4 p-3 sm:p-5 items-center 
                               bg-[#13132b]/60 hover:bg-[#1a1a38] 
                               border border-white/5 hover:border-sky-500/30 
                               rounded-2xl transition-all duration-300 backdrop-blur-sm
                               hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
        >
            {vocalsMode && (
                <button
                    onClick={() => openPresentation({ ...hymn, scale: currentScale, relatedChords: currentChords, lyrics: currentLyrics }, transposeStep)}
                    className="absolute bottom-3 right-3 sm:hidden p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/50 transition-all z-30 backdrop-blur-md shadow-lg shadow-purple-500/10 active:scale-95"
                    title="Open Presentation Mode"
                >
                    <Monitor className="w-5 h-5" />
                </button>
            )}

            {/* Index */}
            <div className="col-span-1 sm:col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
                {(index + 1).toString().padStart(2, '0')}
            </div>

            {/* BPM and Time Signature Display */}
            {(hymn.BPM || hymn.timeSignature) && (
                <div className={`absolute lg:top-1 top-2 right-2 flex items-center gap-2 bg-black/40 pr-3 pl-1 py-0.5 rounded-full border border-white/5 z-20 backdrop-blur-sm transition-opacity ${vocalsMode ? 'opacity-0 pointer-events-none' : ''}`}>
                    {hymn.BPM && <Metronome id={hymn._id} bpm={hymn.BPM} timeSignature={hymn.timeSignature || "4/4"} minimal={true} />}
                    <div className="flex gap-2 text-[10px] font-mono text-gray-500">
                        {hymn.BPM && <span>{hymn.BPM} bpm</span>}
                        {hymn.BPM && hymn.timeSignature && <span className="text-gray-600">|</span>}
                        {hymn.timeSignature && <span>{hymn.timeSignature}</span>}
                    </div>
                </div>
            )}

            {/* Song Title */}
            <div className="col-span-11 sm:col-span-5 md:col-span-5 relative z-10 flex items-center gap-2 py-4">
                {(() => {
                    const matchedCat = categories.find(c => c.id === hymn.party) || { icon: Music };
                    const CatIcon = matchedCat.icon;
                    return (
                        <CatIcon
                            className="w-4 h-4 text-gray-500 group-hover:text-sky-300 transition-colors shrink-0"
                            title={matchedCat.label}
                        />
                    );
                })()}
                <h3 className="font-bold text-sm sm:text-lg text-gray-200 group-hover:text-white transition-colors tracking-wide truncate">
                    {hymn.title}
                </h3>
            </div>

            {/* Key/Scale - Under Title on Mobile (Left Aligned), Center on Desktop */}
            <div className={`col-span-12 sm:col-span-2 relative z-10 flex items-center justify-start sm:justify-center -mt-2 sm:mt-0 pl-2 sm:pl-0 lg:top-2 transition-opacity ${vocalsMode ? 'opacity-0 pointer-events-none' : ''}`}>
                <KeyDisplay
                    scale={currentScale}
                    relatedChords={currentChords}
                    onTranspose={(val) => setTransposeStep(prev => prev + val)}
                />
            </div>

            {/* Remove Action */}
            <div className="col-span-6 sm:col-span-1 flex justify-center items-center relative z-10 px-2 lg:top-2">
                <button
                    onClick={() => removeFromWorkspace(hymn._id)}
                    className="p-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5 sm:border-transparent hover:border-red-500/20 bg-white/5 sm:bg-transparent flex-1 sm:flex-none flex justify-center "
                    title="Remove from Workspace "
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Media Link */}
            <div className="col-span-6 sm:col-span-3 flex flex-row sm:flex-row justify-center items-center gap-1 sm:gap-2 relative z-10 lg:top-2">
                {hymn.link && (
                    <a
                        href={hymn.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
                    >
                        <PlayCircle className="w-4 h-4 shrink-0" />
                        <span className="text-xs sm:text-sm font-medium">Listen</span>
                    </a>
                )}

                {hymn.lyrics && (
                    <>
                        <button
                            onClick={() => openLyrics({ ...hymn, scale: currentScale, relatedChords: currentChords, lyrics: currentLyrics }, transposeStep)}
                            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
                        >
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="text-xs sm:text-sm font-medium">Lyrics</span>
                        </button>

                        {/* Presentation Button - Icon Only, Visible in Vocal Mode (Desktop Only) */}
                        {vocalsMode && (
                            <button
                                onClick={() => openPresentation({ ...hymn, scale: currentScale, relatedChords: currentChords, lyrics: currentLyrics }, transposeStep)}
                                className="hidden sm:flex p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/50 transition-all group-hover:shadow-lg group-hover:shadow-purple-500/10"
                                title="Open Presentation Mode"
                            >
                                <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                        )}
                    </>
                )}

                {!hymn.link && !hymn.lyrics && (
                    <span className="text-gray-700 text-xs">—</span>
                )}
            </div>
        </motion.div>
    );
}