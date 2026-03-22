'use client';
import React, { useContext, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, Trash2, Heart, Music, Gift, Star, Sparkles, GraduationCap, FileText, X, Monitor, Guitar, Calendar, PlusCircle, Radio, ExternalLink, Tv2, ChevronUp, Mic, MicOff, EyeOff } from 'lucide-react';
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
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-400">
                            Custom Lyrics (Edit & Print)
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    const newArray = Array.isArray(localLyrics) ? [...localLyrics] : (typeof localLyrics === 'string' && localLyrics.trim() ? [{ type: 'verse', title: '1', text: localLyrics }] : []);
                                    newArray.push({ type: 'verse', title: String(newArray.filter(l => l.type === 'verse').length + 1), text: '' });
                                    setLocalLyrics(newArray);
                                }}
                                className="text-[10px] font-bold px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                            >
                                + العدد
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const newArray = Array.isArray(localLyrics) ? [...localLyrics] : (typeof localLyrics === 'string' && localLyrics.trim() ? [{ type: 'verse', title: '1', text: localLyrics }] : []);
                                    newArray.push({ type: 'chorus', title: 'القرار', text: '' });
                                    setLocalLyrics(newArray);
                                }}
                                className="text-[10px] font-bold px-2 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition-colors"
                            >
                                + القرار
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {Array.isArray(localLyrics) ? (
                            localLyrics.map((stanza, sIdx) => (
                                <div key={sIdx} className={`p-4 rounded-xl border relative flex flex-col gap-3 transition-colors ${stanza.type === 'chorus' ? 'bg-sky-500/10 border-sky-500/30 shadow-[inset_0_0_20px_rgba(56,189,248,0.05)]' : 'bg-[#151525] border-white/10'}`}>
                                    <div className="flex justify-between items-center gap-2 pb-2 border-b border-white/5">
                                        <input
                                            type="text"
                                            value={stanza.title}
                                            onChange={(e) => {
                                                const newArray = [...localLyrics];
                                                newArray[sIdx].title = e.target.value;
                                                setLocalLyrics(newArray);
                                            }}
                                            className={`text-sm font-bold bg-transparent border-none outline-none w-32 px-1 focus:ring-0 ${stanza.type === 'chorus' ? 'text-white placeholder-white/50' : 'text-gray-300 placeholder-gray-500'}`}
                                            placeholder={stanza.type === 'chorus' ? "القرار" : "1"}
                                            dir="rtl"
                                        />
                                        
                                        <div className="flex items-center gap-3 flex-wrap flex-row-reverse">
                                            {/* Chord Toolbar for this specific text area */}
                                            {hymn.relatedChords && (
                                                <div className="flex gap-1.5 flex-wrap justify-end pl-3 border-l border-white/10">
                                                    {hymn.relatedChords.split(/[, ]+/).filter(Boolean).map((chord, cIdx) => (
                                                        <button
                                                            key={cIdx}
                                                            onClick={() => {
                                                                 const textareaId = `lyrics-textarea-ws-${hymn._id}-${sIdx}`;
                                                                 const input = document.getElementById(textareaId);
                                                                 if (input) {
                                                                     const start = input.selectionStart;
                                                                     const end = input.selectionEnd;
                                                                     const text = input.value;
                                                                     const newText = text.substring(0, start) + `[${chord}]` + text.substring(end);
                                                                     const newArray = [...localLyrics];
                                                                     newArray[sIdx].text = newText;
                                                                     setLocalLyrics(newArray);
                                                                     setTimeout(() => {
                                                                         input.selectionStart = input.selectionEnd = start + chord.length + 2;
                                                                         input.focus();
                                                                     }, 0);
                                                                 }
                                                            }}
                                                            className="text-[10px] font-black px-2.5 py-1 rounded-md cursor-pointer select-none bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 hover:text-white transition-all shadow-sm active:scale-95"
                                                            type="button"
                                                        >
                                                            {chord}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <button
                                                onClick={() => {
                                                    if (!confirm('هل تريد مسح هذا المقطع؟')) return;
                                                    const newArray = localLyrics.filter((_, i) => i !== sIdx);
                                                    setLocalLyrics(newArray);
                                                }}
                                                className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-full hover:bg-red-500/10"
                                                title="Remove section"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        id={`lyrics-textarea-ws-${hymn._id}-${sIdx}`}
                                        value={stanza.text}
                                        onChange={(e) => {
                                            const newArray = [...localLyrics];
                                            newArray[sIdx].text = e.target.value;
                                            setLocalLyrics(newArray);
                                        }}
                                        rows={3}
                                        className="w-full p-3 rounded-lg bg-black/40 border border-black/50 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition min-h-[100px] resize-y whitespace-pre-wrap text-sm leading-relaxed custom-scrollbar shadow-inner"
                                        dir="rtl"
                                        placeholder="كلمات المقطع هنا..."
                                    />
                                </div>
                            ))
                        ) : (
                            <textarea
                                value={localLyrics}
                                onChange={(e) => setLocalLyrics(e.target.value)}
                                rows={6}
                                className="w-full p-3 rounded-xl bg-black/40 border border-sky-500/30 text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition min-h-[150px] resize-y whitespace-pre-wrap text-sm leading-relaxed custom-scrollbar shadow-inner"
                                dir="rtl"
                                placeholder="Write lyrics here or add sections above..."
                            />
                        )}
                    </div>
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
    const lyricsScrollRef = useRef(null); // Ref for lyrics scroll container
    // Persist showChords state in localStorage for lyrics modal
    const [showChords, setShowChords] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('workspace_showChords');
            if (saved !== null) return saved === 'true';
        }
        return true;
    });

    // --- Presentation Advanced State & Refs ---
    const thumbContainerRef = useRef(null);
    const localDisplayRef = useRef(null);
    const LOCAL_CHANNEL = 'taspe_presenter';

    const broadcastLocalSlide = React.useCallback((slides, index, hymnTitle) => {
        const slide = slides[index];
        if (!slide) return;
        const ch = new BroadcastChannel(LOCAL_CHANNEL);
        ch.postMessage({
            type: 'slide',
            slide,
            hymn: hymnTitle,
            index,
            total: slides.length
        });
        ch.close();
    }, [LOCAL_CHANNEL]);

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

        let lyricsArray = selectedLyricsHymn.lyrics;

        // If lyrics is still a string (legacy), split it
        if (typeof lyricsArray === 'string') {
            const lyricsToUse = selectedLyricsHymn.transposeStep
                ? transposeLyrics(lyricsArray, selectedLyricsHymn.transposeStep)
                : lyricsArray;

            return lyricsToUse
                .replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
                .split('\n\n')
                .map(b => b.trim())
                .filter(Boolean);
        }

        // Handles the new Array of objects format
        if (Array.isArray(lyricsArray)) {
            const lyricsToUse = selectedLyricsHymn.transposeStep
                ? transposeLyrics(lyricsArray, selectedLyricsHymn.transposeStep)
                : lyricsArray;

            const slides = [];
            lyricsToUse.forEach(stanza => {
                // Split the stanza text into blocks by empty lines
                const blocks = stanza.text.split(/\n\s*\n/).filter(b => b.trim() !== '');
                blocks.forEach(block => {
                    const text = block.replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '');
                    slides.push({ title: stanza.title, type: stanza.type, text });
                });
            });
            return slides;
        }

        return [];
    }, [selectedLyricsHymn?.lyrics, selectedLyricsHymn?.transposeStep, showChords]);

    const openLyrics = (hymn, transposeStep = 0) => {
        setSelectedLyricsHymn({ ...hymn, transposeStep });
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

    const openPresentation = (hymn, transposeStep = 0) => {
        setSelectedLyricsHymn({ ...hymn, transposeStep });
        setShowChords(vocalsMode ? false : true);
        setDataShowIndex(0);
        setShowDataShow(true);

        // Open / focus the local display window - Only on desktop/tablet (sm breakpoint)
        if (window.innerWidth >= 640) {
            if (!localDisplayRef.current || localDisplayRef.current.closed) {
                localDisplayRef.current = window.open('/presentation/local', 'taspe_local_display', 'width=1280,height=720');
            } else {
                localDisplayRef.current.focus();
            }
        }
    };

    const closeLyricsModal = () => {
        setIsClosing(true);
        setTimeout(() => {
            setShowLyricsModal(false);
            setSelectedLyricsHymn(null);
            setIsClosing(false);
        }, 300);
    };

    // Attached via onScroll prop to guarantee firing in Portals

    // Prevent background scrolling when lyrics modal or presentation is open
    React.useEffect(() => {
        if (showLyricsModal || showDataShow || showSetlistModal) {
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
    }, [showLyricsModal, showDataShow, showSetlistModal]);

    // Data Show Swipe - Native Touch Events (No Library)
    useEffect(() => {
        if (!showDataShow) return;

        let touchStartX = 0;
        let touchEndX = 0;
        const minSwipeDistance = 50;
        let elementRef = null;

        const handleKey = (e) => {
            // Left = Next slide
            if (e.key === 'ArrowLeft' && dataShowIndex < dataShowSlides.length - 1) {
                const nextIdx = dataShowIndex + 1;
                setDataShowIndex(nextIdx);
                broadcastLocalSlide(dataShowSlides, nextIdx, selectedLyricsHymn?.title);
            }

            // Right = Previous slide
            if (e.key === 'ArrowRight' && dataShowIndex > 0) {
                const prevIdx = dataShowIndex - 1;
                setDataShowIndex(prevIdx);
                broadcastLocalSlide(dataShowSlides, prevIdx, selectedLyricsHymn?.title);
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
                const nextIdx = dataShowIndex + 1;
                setDataShowIndex(nextIdx);
                broadcastLocalSlide(dataShowSlides, nextIdx, selectedLyricsHymn?.title);
            }

            // Swipe Left (Previous Slide) - RTL
            if (swipeDistance > minSwipeDistance && dataShowIndex > 0) {
                const prevIdx = dataShowIndex - 1;
                setDataShowIndex(prevIdx);
                broadcastLocalSlide(dataShowSlides, prevIdx, selectedLyricsHymn?.title);
            }
        };

        // Wait for DOM to be ready (fixes first-time touch event issue)
        const timer = setTimeout(() => {
            const element = document.getElementById('mobileSlideArea');
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
    }, [showDataShow, dataShowIndex, dataShowSlides.length, broadcastLocalSlide, selectedLyricsHymn?.title]);

    // Auto-scroll active thumbnail into view
    useEffect(() => {
        if (showDataShow && thumbContainerRef.current) {
            const activeBtn = thumbContainerRef.current.children[dataShowIndex];
            if (activeBtn) {
                activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [dataShowIndex, showDataShow]);

    // Robust broadcast sync: whenever session connects or hymn changes while presentation is open
    useEffect(() => {
        if (showDataShow && dataShowId && selectedLyricsHymn && isConnected) {
            let slides = [];
            if (Array.isArray(selectedLyricsHymn.lyrics)) {
                selectedLyricsHymn.lyrics.forEach(stanza => {
                    const blocks = stanza.text.split(/\n\s*\n/).filter(b => b.trim() !== '');
                    blocks.forEach(block => {
                        slides.push({
                            title: stanza.title,
                            type: stanza.type,
                            text: block.replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
                        });
                    });
                });
            } else {
                slides = (selectedLyricsHymn.lyrics || '')
                    .replace(showChords ? /\[/g : /\[.*?\]/g, showChords ? ' [' : '')
                    .split('\n\n')
                    .map(b => b.trim())
                    .filter(Boolean);
            }
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

    const renderLyricsWithChords = (lyricsData) => {
        if (!lyricsData) return null;
        const currentTheme = lyricsThemes[lyricsTheme];

        const parseSegments = (line) => {
            const parts = line.split(/(\[.*?\])/g);
            const segments = [];
            let i = 0;
            while (i < parts.length) {
                const part = parts[i];
                if (part && part.startsWith('[') && part.endsWith(']')) {
                    segments.push({
                        chord: part.slice(1, -1),
                        text: parts[i + 1] ?? '',
                    });
                    i += 2;
                } else {
                    if (part) segments.push({ chord: null, text: part });
                    i++;
                }
            }
            return segments;
        };

        const renderLine = (line, stanzaType, i) => {
            const isChorus = stanzaType === 'chorus';
            const segments = parseSegments(line);
            const anyHasChords = line.includes('[');

            if (!line.trim()) return <div key={i} className="h-4" />;

            return (
                <div
                    key={i}
                    className={`flex flex-wrap justify-center items-end w-full leading-relaxed ${showChords && anyHasChords ? 'mt-8 mb-2' : 'my-2'}`}
                    dir="rtl"
                >
                    {segments.map((seg, j) => {
                        const transposedChord = (showChords && seg.chord)
                            ? (selectedLyricsHymn?.transposeStep ? transposeChords(seg.chord, selectedLyricsHymn.transposeStep) : seg.chord)
                            : null;

                        return (
                            <span key={j} className={`inline-flex flex-col items-start ${showChords ? 'min-w-[0.2em]' : ''}`}>
                                {/* Chord row - Absolutely clean, no badges */}
                                {showChords && (
                                    <span
                                        className="block font-bold whitespace-nowrap overflow-visible h-[1.2em] mb-[-0.1em] px-0.5 select-none"
                                        dir="ltr"
                                        style={{
                                            color: currentTheme.chord,
                                            fontSize: '0.85em',
                                            lineHeight: '1',
                                            visibility: seg.chord ? 'visible' : 'hidden'
                                        }}
                                    >
                                        {transposedChord || '\u00A0'}
                                    </span>
                                )}
                                {/* Lyrics row */}
                                <span
                                    style={{ color: currentTheme.text, fontSize: `${fontSize}px` }}
                                    className={`${isChorus ? 'font-black' : 'font-bold'} ${showChords ? 'whitespace-pre' : ''} transition-colors duration-300`}
                                >
                                    {seg.text || '\u00A0'}
                                </span>
                            </span>
                        );
                    })}
                </div>
            );
        };

        if (Array.isArray(lyricsData)) {
            return lyricsData.map((stanza, idx) => (
                <div key={idx} className={`mb-12 flex flex-col items-center ${stanza.type === 'chorus' ? 'bg-white/5 py-8 px-6 rounded-3xl mx-[-1rem] sm:mx-0 border border-white/5 shadow-inner' : ''}`}>
                    {stanza.title && (
                        <div className={`text-[10px] mb-6 font-black tracking-[0.2em] px-4 py-1.5 rounded-full border uppercase ${stanza.type === 'chorus' ? 'text-sky-300 border-sky-400/30 bg-sky-500/10' : 'text-gray-400 border-white/10 bg-white/5'}`}>
                            {stanza.title}
                        </div>
                    )}
                    {stanza.text.split('\n').map((line, i) => renderLine(line, stanza.type, i))}
                </div>
            ));
        }

        return <div className="mb-12">{lyricsData.split('\n').map((line, i) => renderLine(line, 'verse', i))}</div>;
    };

    const renderPresentationSlideWithChords = (slideData) => {
        if (!slideData) return null;

        const text = typeof slideData === 'string' ? slideData : slideData.text;
        const title = typeof slideData !== 'string' ? slideData.title : null;
        const type = typeof slideData !== 'string' ? slideData.type : 'verse';
        const isChorus = type === 'chorus';

        const parseSegments = (line) => {
            const parts = line.split(/(\[.*?\])/g);
            const segments = [];
            let i = 0;
            while (i < parts.length) {
                const part = parts[i];
                if (part && part.startsWith('[') && part.endsWith(']')) {
                    segments.push({
                        chord: part.slice(1, -1),
                        text: parts[i + 1] ?? '',
                    });
                    i += 2;
                } else {
                    if (part) segments.push({ chord: null, text: part });
                    i++;
                }
            }
            return segments;
        };

        return (
            <>
                {title && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 text-white/50 text-[11px] sm:text-base font-black tracking-[0.4em] px-6 py-2 rounded-full border border-white/10 bg-white/5 uppercase select-none" dir="rtl">
                        {title}
                    </div>
                )}
                <div className="w-full h-full flex flex-col items-center justify-center gap-6 sm:gap-10 px-6 sm:px-12">
                    {text.split('\n').map((line, i) => {
                        if (!line.trim()) return <div key={i} className="h-[1em]" />;

                        const segments = parseSegments(line);
                        const anyHasChords = line.includes('[');

                        return (
                            <div
                                key={i}
                                className={`flex flex-wrap justify-center items-end w-full ${showChords && anyHasChords ? 'mt-[2.2em]' : 'my-[1em]'}`}
                                dir="rtl"
                            >
                                {segments.map((seg, j) => {
                                    const transposedChord = (showChords && seg.chord)
                                        ? (selectedLyricsHymn?.transposeStep ? transposeChords(seg.chord, selectedLyricsHymn.transposeStep) : seg.chord)
                                        : null;

                                    return (
                                        <span key={j} className={`inline-flex flex-col items-start ${showChords ? 'min-w-[0.2em]' : ''}`}>
                                            {/* Chord row */}
                                            {showChords && (
                                                <span
                                                    className="block font-black whitespace-nowrap overflow-visible leading-none select-none mb-3"
                                                    dir="ltr"
                                                    style={{
                                                        color: '#38BDF8',
                                                        fontSize: '0.6em',
                                                        visibility: seg.chord ? 'visible' : 'hidden',
                                                        textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                                                    }}
                                                >
                                                    {transposedChord || '\u00A0'}
                                                </span>
                                            )}
                                            {/* Lyrics row */}
                                            <span
                                                className={`font-bold ${showChords ? 'whitespace-pre-wrap' : ''} leading-relaxed select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] tracking-tight ${isChorus ? 'text-yellow-300' : 'text-white'}`}
                                                style={{ fontSize: 'clamp(28px, 7vw, 90px)' }}
                                            >
                                                {seg.text || '\u00A0'}
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </>
        );
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
                            className={`fixed inset-0 z-[9999] flex justify-center items-end sm:items-center transition-all duration-300
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
                                {(() => {
                                    const hasChords = selectedLyricsHymn?.lyrics ? (
                                        typeof selectedLyricsHymn.lyrics === 'string'
                                            ? selectedLyricsHymn.lyrics.includes('[')
                                            : (Array.isArray(selectedLyricsHymn.lyrics) && selectedLyricsHymn.lyrics.some(s => s.text.includes('[')))
                                    ) : false;

                                    return (
                                        <div
                                            ref={lyricsScrollRef}
                                            className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col"
                                            data-lenis-prevent-wheel
                                        >
                                            {/* Sticky Header - Title, Presentation & Close Buttons (Always visible) */}
                                            <div
                                                className={`sticky top-0 z-50 pt-2 pb-4 flex flex-col shrink-0 transition-colors duration-500`}
                                                style={{
                                                    backgroundColor: lyricsThemes[lyricsTheme].bg,
                                                    borderBottom: `1px solid ${lyricsTheme === 'warm' ? 'rgba(120,50,0,0.05)' : 'rgba(255,255,255,0.05)'}`
                                                }}
                                            >
                                                {/* Decorative Pull Bar for Mobile */}
                                                <div className="sm:hidden w-12 bg-gray-400/20 rounded-full mx-auto shrink-0 h-1.5 mb-4" />

                                                <div className="px-6 flex justify-between items-center gap-4">
                                                    <div className="flex flex-col min-w-0">
                                                        <h2 className={`text-2xl sm:text-3xl font-bold truncate tracking-tight transition-colors duration-300 ${lyricsTheme === 'warm' ? 'text-[#1A1A1A]' : 'text-white'}`}>
                                                            {selectedLyricsHymn.title}
                                                        </h2>
                                                        <div className={`text-xs uppercase tracking-[0.2em] font-bold opacity-50 ${lyricsTheme === 'warm' ? 'text-gray-500' : 'text-sky-400'}`}>
                                                            Lyrics {hasChords ? "& Chords" : ""}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                openPresentation(selectedLyricsHymn, selectedLyricsHymn.transposeStep || 0);
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

                                                {/* Smooth transparent gradient shadow covering text rolling under */}
                                                <div className="absolute top-full left-0 right-0 h-6 pointer-events-none"
                                                    style={{
                                                        background: lyricsTheme === 'warm'
                                                            ? 'linear-gradient(to bottom, #FDFBF7, transparent)'
                                                            : lyricsTheme === 'dark'
                                                                ? 'linear-gradient(to bottom, #0F172A, transparent)'
                                                                : 'linear-gradient(to bottom, #0E2238, transparent)'
                                                    }}
                                                />
                                            </div>

                                            {/* Naturally Scrolling Toolbar - Elegantly slides under Sticky Header when scrolled */}
                                            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                                                <div className="flex items-center gap-2">
                                                    {/* Chords Toggle */}
                                                    <button
                                                        onClick={() => setShowChords(!showChords)}
                                                        disabled={vocalsMode || !hasChords}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${vocalsMode ? 'hidden' : ''}
                                                                    ${!hasChords
                                                                ? (lyricsTheme === 'warm' ? 'bg-black/5 text-black/20 border-black/10 cursor-not-allowed' : 'bg-white/5 text-white/10 border-white/5 cursor-not-allowed')
                                                                : (showChords
                                                                    ? (lyricsTheme === 'warm' ? 'bg-black text-white border-black' : 'bg-sky-500 text-white border-sky-500')
                                                                    : (lyricsTheme === 'warm' ? 'bg-transparent text-black/50 border-black/20' : 'bg-transparent text-white/30 border-white/10'))
                                                            }`}
                                                    >
                                                        {!hasChords ? <Mic className="w-3.5 h-3.5 opacity-40" /> : (showChords ? <Guitar className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />)}
                                                        {!hasChords ? "Chords coming soon" : (showChords ? "Chords On" : "Chords Off")}
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
                                    );
                                })()}

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
                )}
                {/* --- Data Show (Presentation) Presenter View - Independent --- */}
                {showDataShow && selectedLyricsHymn && (
                    <Portal>
                        <div id="showDataContainer" className="fixed inset-0 z-10000 bg-[#020617] flex flex-col">
                            {/* ── Shared Header ── */}
                            <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0f172a] border-b border-white/10 shrink-0 z-20">
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">{selectedLyricsHymn.title}</h2>
                                    <p className="text-[10px] sm:text-xs text-sky-400 font-medium">
                                        <span className="sm:hidden">Swipe or tap a part below</span>
                                        <span className="hidden sm:inline">Presenter View • Click a cut to broadcast</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                    {isConnected && (
                                        <span className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-full">
                                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                            LIVE · {dataShowId}
                                        </span>
                                    )}
                                    <span className="sm:hidden text-xs font-mono text-white/40">
                                        {dataShowSlides.length} / {dataShowIndex + 1}
                                    </span>
                                    <button
                                        onClick={() => setShowDataShow(false)}
                                        className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-all border border-white/10 hover:border-red-500/30"
                                        title="Close"
                                    >
                                        <X className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </button>
                                </div>
                            </div>

                            {/* ══ MOBILE VIEW ══ */}
                            <div className="flex-1 flex flex-col sm:hidden min-h-0">
                                <div id="mobileSlideArea" className="flex-1 flex flex-col min-h-0 relative">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={dataShowIndex}
                                            initial={{ opacity: 0, x: -30 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 30 }}
                                            transition={{ duration: 0.18, ease: 'easeInOut' }}
                                            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-4 text-center overflow-hidden"
                                        >
                                            {(() => {
                                                const s = dataShowSlides[dataShowIndex];
                                                if (!s) return null;
                                                const isChorus = s.type === 'chorus';
                                                return (
                                                    <>
                                                        {s.title && (
                                                            <div className={`absolute top-4 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1 rounded-full border
                                                                    ${isChorus ? 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' : 'text-white/40 bg-white/5 border-white/10'}`}
                                                                dir="rtl"
                                                            >
                                                                {s.title}
                                                            </div>
                                                        )}
                                                        <div className="w-full flex flex-col items-center gap-0 overflow-hidden" dir="rtl">
                                                            {s.text.split('\n').map((line, idx) => {
                                                                if (!line.trim()) return <div key={idx} className="h-2" />;
                                                                const parts = line.split(/(\[.*?\])/g);
                                                                const segs = [];
                                                                let pi = 0;
                                                                while (pi < parts.length) {
                                                                    const p = parts[pi];
                                                                    if (p && p.startsWith('[') && p.endsWith(']')) {
                                                                        segs.push({ chord: p.slice(1, -1), text: parts[pi + 1] ?? '' });
                                                                        pi += 2;
                                                                    } else {
                                                                        if (p) segs.push({ chord: null, text: p });
                                                                        pi++;
                                                                    }
                                                                }
                                                                const anyChords = line.includes('[');

                                                                return (
                                                                    <div key={idx} className={`flex flex-wrap justify-center items-end w-full ${showChords && anyChords ? 'mt-[1.1em]' : 'my-[0.1em]'}`} dir="rtl">
                                                                        {segs.map((seg, j) => {
                                                                            const transposedChord = (showChords && seg.chord)
                                                                                ? (selectedLyricsHymn?.transposeStep ? transposeChords(seg.chord, selectedLyricsHymn.transposeStep) : seg.chord)
                                                                                : null;

                                                                            return (
                                                                                <span key={j} className="inline-flex flex-col items-start min-w-[0.2em]">
                                                                                    {showChords && (
                                                                                        <span className="block font-black whitespace-nowrap leading-none select-none mb-1" dir="ltr"
                                                                                            style={{ color: '#38BDF8', fontSize: 'clamp(9px, 2vw, 14px)', visibility: seg.chord ? 'visible' : 'hidden' }}>
                                                                                            {transposedChord || '\u00A0'}
                                                                                        </span>
                                                                                    )}
                                                                                    <span
                                                                                        className={`font-bold whitespace-pre-wrap leading-snug select-none drop-shadow-lg tracking-tight ${isChorus ? 'text-yellow-300' : 'text-white'}`}
                                                                                        style={{ fontSize: 'clamp(24px, 6.5vw, 52px)' }}
                                                                                    >
                                                                                        {seg.text || '\u00A0'}
                                                                                    </span>
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </motion.div>
                                    </AnimatePresence>
                                </div>

                                {/* Dot nav + arrow buttons */}
                                <div className="flex items-center justify-center gap-5 py-2.5 shrink-0">
                                    <button
                                        onClick={() => { if (dataShowIndex < dataShowSlides.length - 1) { const ni = dataShowIndex + 1; setDataShowIndex(ni); broadcastLocalSlide(dataShowSlides, ni, selectedLyricsHymn?.title); } }}
                                        disabled={dataShowIndex === dataShowSlides.length - 1}
                                        className="p-2 rounded-full bg-white/5 border border-white/10 text-white/50 disabled:opacity-20 transition-all active:scale-90"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                    </button>
                                    <div dir="rtl" className="flex gap-1.5 overflow-x-auto max-w-[60vw]" style={{ scrollbarWidth: 'none' }}>
                                        {dataShowSlides.map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                                                className={`flex-none rounded-full transition-all duration-200 ${i === dataShowIndex ? 'w-5 h-2 bg-sky-400' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => { if (dataShowIndex > 0) { const ni = dataShowIndex - 1; setDataShowIndex(ni); broadcastLocalSlide(dataShowSlides, ni, selectedLyricsHymn?.title); } }}
                                        disabled={dataShowIndex === 0}
                                        className="p-2 rounded-full bg-white/5 border border-white/10 text-white/50 disabled:opacity-20 transition-all active:scale-90"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                    </button>
                                </div>

                                {/* Bottom thumbnail strip */}
                                <div className="shrink-0 bg-black/50 border-t border-white/10 py-3 px-3">
                                    <div ref={thumbContainerRef} className="flex gap-2.5 overflow-x-auto pb-1" dir="rtl" style={{ scrollbarWidth: 'none' }}>
                                        {dataShowSlides.map((slide, i) => {
                                            const isActive = dataShowIndex === i;
                                            const isChorus = slide.type === 'chorus';
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                                                    className={`relative flex-none flex flex-col w-24 h-20 p-2 rounded-xl border text-right transition-all duration-200 overflow-hidden
                                                            ${isActive
                                                            ? 'bg-sky-500/25 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                                                            : 'bg-white/5 border-white/10 opacity-60 active:opacity-100'}`}
                                                >
                                                    {isActive && <div className="absolute inset-0 bg-linear-to-b from-sky-500/10 to-transparent pointer-events-none" />}
                                                    <div className="flex items-center justify-between mb-1 relative z-10" dir="ltr">
                                                        <span className="text-[9px] font-mono text-gray-500">{i + 1}</span>
                                                        {isActive
                                                            ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                                            : slide.title && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${isChorus ? 'text-yellow-300 bg-yellow-500/20' : 'text-gray-400 bg-white/10'}`}>{slide.title.slice(0, 6)}</span>
                                                        }
                                                    </div>
                                                    <div className="flex-1 text-[9px] font-semibold text-gray-300 line-clamp-3 leading-tight text-right relative z-10">
                                                        {slide.text.replace(/\[.*?\]/g, '')}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* ══ DESKTOP VIEW: Grid of cuts + session footer ══ */}
                            <div className="hidden sm:flex flex-1 flex-col min-h-0">
                                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" dir="rtl">
                                    <div className="max-w-7xl mx-auto grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-4">
                                        {dataShowSlides.map((slide, i) => {
                                            const isActive = dataShowIndex === i;
                                            const isChorus = slide.type === 'chorus';
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                                                    className={`relative flex flex-col h-40 p-4 rounded-2xl border text-right transition-all duration-200 overflow-hidden group
                                                            ${isActive
                                                            ? 'bg-sky-500/20 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.3)] z-10'
                                                            : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]'}`}
                                                >
                                                    {isActive && <div className="absolute inset-0 bg-linear-to-b from-sky-500/10 to-transparent pointer-events-none" />}
                                                    <div className="flex items-center justify-between w-full mb-3 relative z-10" dir="ltr">
                                                        <span className="text-[10px] font-mono text-gray-500">{i + 1}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {isActive && (
                                                                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" /> Live
                                                                </span>
                                                            )}
                                                            {slide.title && (
                                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                                                                                ${isChorus ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-white/10 text-gray-300 border border-white/10'}`}>
                                                                    {slide.title}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 w-full text-sm font-bold leading-relaxed text-gray-200 line-clamp-4 relative z-10 wrap-break-word whitespace-pre-line text-right">
                                                        {slide.text.replace(/\[.*?\]/g, '')}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Desktop Live Session Footer */}
                                <div className="shrink-0 bg-[#0f172a] border-t border-white/10 px-6 py-3 z-20">
                                    {!dataShowId ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                                                <Tv2 className="w-4 h-4" />
                                                <span className="font-semibold">HDMI Session</span>
                                            </div>
                                            <div className="flex flex-1 items-center gap-2">
                                                <input type="text" value={dataShowIdInput} onChange={e => setDataShowIdInput(e.target.value)}
                                                    placeholder='Room ID, e.g. "sunday-01"'
                                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-400 placeholder:text-gray-600 min-w-0"
                                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateSession(); }}
                                                />
                                                <button onClick={handleCreateSession} className="px-4 py-2 bg-sky-500 hover:bg-sky-400 rounded-xl text-sm font-bold transition-all whitespace-nowrap">Create</button>
                                                <button onClick={handleJoinSession} className="px-4 py-2 bg-indigo-500/80 hover:bg-indigo-500 rounded-xl text-sm font-bold transition-all whitespace-nowrap">Join</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <a href={`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/20 transition-all">
                                                <Tv2 className="w-4 h-4" /> Open Display Window
                                            </a>
                                            <a href={`/presentation/remote?dataShowId=${encodeURIComponent(dataShowId)}`} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/20 transition-all">
                                                <ExternalLink className="w-4 h-4" /> Mobile Remote
                                            </a>
                                            <button onClick={toggleAudio}
                                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${isAudioActive ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                                                {isAudioActive ? <Mic className="w-4 h-4 animate-pulse text-sky-400" /> : <MicOff className="w-4 h-4" />}
                                                {isAudioActive ? 'Mic On' : 'Mic Off'}
                                            </button>
                                            <button onClick={() => { if (isAudioActive) toggleAudio(); clearDisplay(); setDataShowId(''); localStorage.removeItem('myLivePresentationId'); }}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all ml-auto">
                                                <X className="w-4 h-4" /> End Session
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
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
                    onClick={() => openPresentation(hymn, transposeStep)}
                    className="absolute top-3 right-3 sm:hidden p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-500/50 transition-all z-30 backdrop-blur-md shadow-lg shadow-purple-500/10 active:scale-95"
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
            {((hymn.BPM && hymn.BPM !== "None") || (hymn.timeSignature && hymn.timeSignature !== "None")) && (
                <div className={`absolute lg:top-1 top-2 right-2 flex items-center gap-2 bg-black/40 pr-3 pl-1 py-0.5 rounded-full border border-white/5 z-20 backdrop-blur-sm transition-opacity ${vocalsMode ? 'opacity-0 pointer-events-none' : ''}`}>
                    {hymn.BPM && <Metronome id={hymn._id} bpm={hymn.BPM} timeSignature={(hymn.timeSignature && hymn.timeSignature !== "None") ? hymn.timeSignature : "4/4"} minimal={true} />}
                    <div className="flex gap-2 text-[10px] font-mono text-gray-500">
                        {hymn.BPM && <span>{hymn.BPM} bpm</span>}
                        {hymn.BPM && hymn.timeSignature && hymn.timeSignature !== "None" && <span className="text-gray-600">|</span>}
                        {hymn.timeSignature && hymn.timeSignature !== "None" && <span>{hymn.timeSignature}</span>}
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
                {hymn.link ? (
                    <a
                        href={hymn.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
                    >
                        <PlayCircle className="w-4 h-4 shrink-0" />
                        <span className="text-xs sm:text-sm font-medium">Listen</span>
                    </a>
                ) : (
                    <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/5 text-gray-600 border border-white/5 w-full sm:w-auto justify-center cursor-default group/soon relative overflow-hidden">
                        <PlayCircle className="w-4 h-4 shrink-0 opacity-20" />
                        <span className="text-xs sm:text-sm font-medium">Coming soon</span>
                    </div>
                )}

                {hymn.lyrics && (
                    <>
                        <button
                            onClick={() => openLyrics(hymn, transposeStep)}
                            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
                        >
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="text-xs sm:text-sm font-medium">Lyrics</span>
                        </button>

                        {/* Presentation Button - Icon Only, Visible in Vocal Mode (Desktop Only) */}
                        {vocalsMode && (
                            <button
                                onClick={() => openPresentation(hymn, transposeStep)}
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