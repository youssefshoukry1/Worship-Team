import React, { useState, useRef, useEffect } from 'react';
import Portal from '../../Portal/Portal';
import { X, Mic, Guitar, EyeOff, ClipboardCheck, Copy, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { transposeChords } from '../../utils/musicUtils';

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

const HymnsBibleLyricsModal = ({ item, showModal, onClose }) => {
    const [lyricsTheme, setLyricsTheme] = useState('main');
    const [fontSize, setFontSize] = useState(18);
    const [showChords, setShowChords] = useState(true);
    const [copiedLyrics, setCopiedLyrics] = useState(false);
    const lyricsScrollRef = useRef(null);

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (showModal) {
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
    }, [showModal]);

    if (!showModal || !item) return null;

    const isBible = item.type === 'bible' || item.isBible || (item.verses && !item.lyrics);
    const lyricsData = isBible ? item.verses : item.lyrics;
    const hasChords = lyricsData ? (
        typeof lyricsData === 'string'
            ? lyricsData.includes('[')
            : (Array.isArray(lyricsData) && lyricsData.some(s => s.text?.includes('[')))
    ) : false;

    const getLyricsPlainText = () => {
        const title = item.title || item.bookName || '';
        if (!lyricsData) return title;
        const stripChords = (text) => text.replace(/\[.*?\]/g, '');
        let lines = [`🎵 ${title}`, ''];

        if (Array.isArray(lyricsData)) {
            if (isBible) {
                lyricsData.forEach((v) => {
                    lines.push(`[Verse ${v.verseNumber}]`);
                    lines.push(stripChords(v.text || ''));
                    lines.push('');
                });
            } else {
                lyricsData.forEach((stanza) => {
                    const label = stanza.title
                        ? (stanza.type === 'chorus' ? `[Chorus - ${stanza.title}]` : `[Verse ${stanza.title}]`)
                        : (stanza.type === 'chorus' ? '[Chorus]' : '[Verse]');
                    lines.push(label);
                    lines.push(stripChords(stanza.text || ''));
                    lines.push('');
                });
            }
        } else if (typeof lyricsData === 'string') {
            lines.push(stripChords(lyricsData));
        }

        return lines.join('\n').trim();
    };

    const handleCopyLyrics = async () => {
        const text = getLyricsPlainText();
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const el = document.createElement('textarea');
            el.value = text;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
        setCopiedLyrics(true);
        setTimeout(() => setCopiedLyrics(false), 2500);
    };

    const handleShareLyrics = async () => {
        const text = getLyricsPlainText();
        const title = item.title || item.bookName || 'Hymn';
        if (navigator.share) {
            try {
                await navigator.share({ title, text });
                return;
            } catch { }
        }
        await handleCopyLyrics();
    };

    const renderLyricsWithChords = (data) => {
        if (!data) return null;
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

            if (line.trim() === '---') return null;
            if (!line.trim()) return <div key={i} className="h-4" />;

            return (
                <div
                    key={i}
                    className={`flex flex-wrap justify-center items-end w-full leading-relaxed ${showChords && anyHasChords ? 'mt-8 mb-2' : 'my-2'}`}
                    dir="rtl"
                >
                    {segments.map((seg, j) => {
                        const transposedChord = (showChords && seg.chord)
                            ? (item.transposeStep ? transposeChords(seg.chord, item.transposeStep) : seg.chord)
                            : null;

                        return (
                            <span key={j} className={`inline-flex flex-col items-center max-w-full ${showChords ? 'min-w-[0.2em]' : ''}`}>
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
                                <span
                                    style={{ color: currentTheme.text, fontSize: `${fontSize}px` }}
                                    className={`${isChorus ? 'font-black' : 'font-bold'} whitespace-pre-wrap break-words text-center transition-colors duration-300`}
                                >
                                    {seg.text || '\u00A0'}
                                </span>
                            </span>
                        );
                    })}
                </div>
            );
        };

        if (Array.isArray(data)) {
            if (isBible) {
                return data.map((verse, idx) => (
                    <div key={idx} className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/5 text-right" dir="rtl">
                        <div className="text-[10px] mb-2 font-black tracking-widest text-sky-400 opacity-60">VERSE {verse.verseNumber}</div>
                        <div className="text-xl sm:text-2xl text-white font-bold leading-relaxed">{verse.text}</div>
                    </div>
                ));
            }

            return data.map((stanza, idx) => (
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

        return <div className="mb-12">{data.split('\n').map((line, i) => renderLine(line, 'verse', i))}</div>;
    };

    return (
        <Portal>
            <div className={`fixed inset-0 z-[9999] flex justify-center items-end sm:items-center bg-black/70`}>
                <div
                    style={{
                        backgroundColor: lyricsThemes[lyricsTheme].bg,
                        boxShadow: lyricsTheme === 'warm' ? '0 10px 40px rgba(0, 0, 0, 0.1)' : '0 10px 40px rgba(0, 0, 0, 0.5)',
                        willChange: 'transform, opacity'
                    }}
                    className={`w-full sm:max-w-3xl h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-[2.5rem] flex flex-col relative overflow-hidden`}
                >
                    <div
                        ref={lyricsScrollRef}
                        className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col"
                        data-lenis-prevent-wheel
                    >
                        <div
                            className={`sticky top-0 z-50 pt-2 pb-4 flex flex-col shrink-0 transition-colors duration-500`}
                            style={{
                                backgroundColor: lyricsThemes[lyricsTheme].bg,
                                borderBottom: `1px solid ${lyricsTheme === 'warm' ? 'rgba(120,50,0,0.05)' : 'rgba(255,255,255,0.05)'}`
                            }}
                        >
                            <div className="sm:hidden w-12 bg-gray-400/20 rounded-full mx-auto shrink-0 h-1.5 mb-4" />

                            <div className="px-6 flex justify-between items-center gap-4">
                                <div className="flex flex-col min-w-0">
                                    <h2 className={`text-2xl sm:text-3xl font-bold truncate tracking-tight transition-colors duration-300 ${lyricsTheme === 'warm' ? 'text-[#1A1A1A]' : 'text-white'}`}>
                                        {item.title || item.bookName}
                                    </h2>
                                    <div className={`text-xs uppercase tracking-[0.2em] font-bold opacity-50 ${lyricsTheme === 'warm' ? 'text-gray-500' : 'text-sky-400'}`}>
                                        Lyrics {hasChords ? "& Chords" : ""}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={onClose}
                                        className={`p-2 rounded-full transition-all ${lyricsTheme === 'warm' ? 'hover:bg-black/5 text-black/40 hover:text-black' : 'hover:bg-white/5 text-white/40 hover:text-white'}`}
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>

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

                        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowChords(!showChords)}
                                    disabled={!hasChords}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border 
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

                            <div className="flex items-center gap-2 flex-wrap">
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
                                                <motion.div layoutId="activeThemeModal" className="absolute inset-0 rounded-lg border-2 border-sky-400/20" />
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={handleCopyLyrics}
                                    title="Copy lyrics"
                                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border overflow-hidden
                                        ${copiedLyrics
                                            ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/30'
                                            : (lyricsTheme === 'warm'
                                                ? 'bg-black/5 text-black/60 border-black/10 hover:bg-black/10 hover:text-black'
                                                : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white')}`}
                                >
                                    {copiedLyrics ? (
                                        <>
                                            <ClipboardCheck className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Copy</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={handleShareLyrics}
                                    title="Share lyrics"
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border
                                        ${lyricsTheme === 'warm'
                                            ? 'bg-black/5 text-black/60 border-black/10 hover:bg-sky-500 hover:text-white hover:border-sky-400'
                                            : 'bg-white/5 text-white/60 border-white/10 hover:bg-sky-500 hover:text-white hover:border-sky-400'}`}
                                >
                                    <Share2 className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Share</span>
                                </button>
                            </div>
                        </div>

                        <div className="px-6 sm:px-10 py-10 relative min-h-full">
                            <div className="w-full max-w-2xl mx-auto transition-all duration-500" dir="rtl">
                                {renderLyricsWithChords(lyricsData)}
                            </div>
                            <div className="h-20" />
                        </div>
                    </div>

                    <div className={`absolute bottom-0 left-0 right-0 h-12 pointer-events-none transition-colors duration-500
                        ${lyricsTheme === 'warm'
                            ? 'bg-linear-to-t from-[#FDFBF7] to-transparent'
                            : lyricsTheme === 'dark'
                                ? 'bg-linear-to-t from-[#0F172A] to-transparent'
                                : 'bg-linear-to-t from-[#0E2238] to-transparent'
                        }`}
                    />
                </div>
            </div>
        </Portal>
    );
};

export default HymnsBibleLyricsModal;
