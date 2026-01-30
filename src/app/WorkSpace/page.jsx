'use client';
import React, { useContext, useState, useEffect } from 'react';
import { transposeScale, transposeChords } from '../utils/musicUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, Trash2, Heart, Music, ListMusic, Gift, Star, Sparkles, GraduationCap, FileText, X, Monitor, Guitar } from 'lucide-react';
import Metronome from '../Metronome/page';
import { HymnsContext } from '../context/Hymns_Context';
import { UserContext } from '../context/User_Context';
import Portal from '../Portal/Portal';

export default function WorkSpace() {
    const { workspace, removeFromWorkspace } = useContext(HymnsContext);
    const { HymnIds, setHymnIds } = useContext(UserContext);

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
    const [showChords, setShowChords] = useState(true);

    const lyricsThemes = {
        warm: { bg: '#F8F5EE', text: '#222222', label: 'Warm' },
        dark: { bg: '#14181f', text: '#f1f1f1', label: 'Dark' },
        main: { bg: '#0E2238', text: '#EDEDED', label: 'Main' }
    };
    const [isClosing, setIsClosing] = useState(false);

    // Data Show State
    const [showDataShow, setShowDataShow] = useState(false);
    const [dataShowIndex, setDataShowIndex] = useState(0);


    const dataShowSlides = selectedLyricsHymn?.lyrics
        ?.replace(/\[.*?\]/g, '') // Remove chords
        .split('\n\n')
        .map(b => b.trim())
        .filter(Boolean) || [];

    const openLyrics = (hymn) => {
        setSelectedLyricsHymn(hymn);
        setLyricsTheme('main');
        setFontSize(18);
        setShowChords(true);
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

    const renderLyricsWithChords = (text) => {
        if (!text) return null;

        return text.split('\n').map((line, i) => (
            <div
                key={i}
                className="relative my-2 w-full text-center"
                style={{ fontSize: `${fontSize}px`, minHeight: '1.5em' }}
            >
                {line ? line.split(/(\[.*?\])/g).map((part, j) => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                        if (!showChords) return null;
                        const chord = part.slice(1, -1);
                        return (
                            <span key={j} className="inline-block relative w-0 overflow-visible mx-0.5 align-top">
                                <span
                                    className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 font-bold whitespace-nowrap shadow-sm"
                                    style={{
                                        color: lyricsTheme === 'warm' ? '#0369a1' : '#38bdf8',
                                        fontSize: `${fontSize * 0.75}px`,
                                        textShadow: lyricsTheme === 'warm' ? 'none' : '0 1px 2px rgba(0,0,0,0.5)'
                                    }}
                                    dir="ltr"
                                >
                                    {chord}
                                </span>
                            </span>
                        );
                    }
                    return <span key={j}>{part}</span>;
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
                    <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-full mb-4 border border-white/10 backdrop-blur-xl">
                        <ListMusic className="w-8 h-8 text-sky-400" />
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-extrabold bg-linear-to-br from-sky-300 via-blue-400 to-indigo-500 text-transparent bg-clip-text drop-shadow-lg">
                        My Workspace
                    </h1>
                    <p className="mt-2 text-gray-400">Manage your setlist for the service</p>
                </div>

                {/* Content Table */}
                <div className="relative">
                    {/* Table Header */}
                    <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest bg-white/5 rounded-t-2xl border-b border-white/10 mx-2">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-11 sm:col-span-5 md:col-span-5">Song Title</div>
                        <div className="col-span-2 text-center bg-white/5 rounded-lg py-1">Key / Chords</div>
                        <div className="col-span-3 text-center">Media</div>
                        <div className="col-span-1 text-center">Remove</div>
                    </div>

                    {/* List Body */}
                    <motion.div
                        className="flex flex-col gap-3 mt-2 pb-20"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                    >
                        {workspace.length > 0 ? (
                            workspace.map((hymn, index) => (
                                <WorkspaceItem
                                    key={hymn._id || index}
                                    hymn={hymn}
                                    index={index}
                                    categories={categories}
                                    removeFromWorkspace={removeFromWorkspace}
                                    variants={itemVariants}
                                    openLyrics={openLyrics}
                                />
                            ))
                        ) : (
                            <div className="p-20 text-center flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                                <Heart className="w-12 h-12 mb-4 opacity-50 text-sky-400" />
                                <h3 className="text-xl font-bold text-gray-300 mb-2">Your workspace is empty</h3>
                                <p className="text-sm text-gray-500">Go to the Hymns Library to add some songs.</p>
                            </div>
                        )}
                    </motion.div>
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
                                            className={`p-2 rounded-lg transition-all ${showChords
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
                                <div className="p-8 overflow-y-auto custom-scrollbar">
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

                            {/* Data Show Modal */}
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
                                            {dataShowIndex + 1} / {dataShowSlides.length}
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
                                                className="w-full h-full flex items-center justify-center px-10 text-center"
                                            >
                                                <p
                                                    className="text-white font-bold whitespace-pre-line select-none"
                                                    style={{
                                                        fontSize: "clamp(32px, 8vw, 64px)",
                                                        lineHeight: 1.6
                                                    }}
                                                    dir="rtl"
                                                >
                                                    {dataShowSlides[dataShowIndex]}
                                                </p>
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                </Portal>
                            )}
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

function WorkspaceItem({ hymn, index, categories, removeFromWorkspace, variants, openLyrics }) {
    const [transposeStep, setTransposeStep] = useState(0);

    const currentScale = transposeScale(hymn.scale, transposeStep);
    const currentChords = transposeChords(hymn.relatedChords, transposeStep);

    return (
        <motion.div
            variants={variants}
            className="group relative grid grid-cols-12 gap-2 sm:gap-4 p-3 sm:p-5 items-center 
                               bg-[#13132b]/60 hover:bg-[#1a1a38] 
                               border border-white/5 hover:border-sky-500/30 
                               rounded-2xl transition-all duration-300 backdrop-blur-sm
                               hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] hover:-translate-y-0.5"
        >
            {/* Index */}
            <div className="col-span-1 sm:col-span-1 text-center font-mono text-xs sm:text-sm text-gray-600 group-hover:text-sky-400 transition-colors">
                {(index + 1).toString().padStart(2, '0')}
            </div>

            {/* BPM and Time Signature Display */}
            {(hymn.BPM || hymn.timeSignature) && (
                <div className="absolute lg:top-1 top-2 right-2 flex items-center gap-2 bg-black/40 pr-3 pl-1 py-0.5 rounded-full border border-white/5 z-20 backdrop-blur-sm">
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
            <div className="col-span-12 sm:col-span-2 relative z-10 flex items-center justify-start sm:justify-center -mt-2 sm:mt-0 pl-2 sm:pl-0 lg:top-2">
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
            <div className="col-span-6 sm:col-span-3 flex flex-row sm:flex-row justify-center items-center gap-2 relative z-10 lg:top-2">


                {hymn.link && (
                    <a
                        href={hymn.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
                    >
                        <PlayCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Listen</span>
                    </a>
                )}

                {hymn.lyrics && (
                    <button
                        onClick={() => openLyrics(hymn)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 text-gray-400 hover:text-sky-300 border border-white/5 hover:border-sky-500/30 transition-all group-hover:shadow-lg group-hover:shadow-sky-500/10 w-full sm:w-auto justify-center"
                    >
                        <FileText className="w-4 h-4" />
                        <span className="text-sm font-medium">Lyrics</span>
                    </button>
                )}


                {!hymn.link && !hymn.lyrics && (
                    <span className="text-gray-700 text-xs">—</span>
                )}
            </div>
        </motion.div>
    );
}