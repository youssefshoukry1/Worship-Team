import React from 'react';

/**
 * ChordLyrics Component
 * 
 * Renders structured chorded lyrics (chord + text segments).
 * Handles responsive wrapping by keeping chords attached to their syllables.
 * Supports fluid font sizing and themes.
 */
const ChordLyrics = ({
    chordedLyrics,
    showChords = true,
    fontSize = 18,
    theme = {},
    presentation = false
}) => {
    if (!chordedLyrics || !Array.isArray(chordedLyrics)) return null;

    // Default styles if theme is partially provided
    const textStyle = {
        color: theme.text || (presentation ? '#fff' : '#000'),
        fontSize: presentation ? 'clamp(18px, 4.8vw, 68px)' : `${fontSize}px`,
        lineHeight: presentation ? '1.4' : '1.6'
    };



    const chordStyle = {
        color: theme.chord || (presentation ? '#38BDF8' : '#2563EB'),
        fontSize: presentation ? '0.6em' : '1.1em',
        minHeight: '1.2em',
        textShadow: presentation ? '0 2px 8px rgba(0,0,0,0.8)' : 'none'
    };

    const parseLineToSegments = (line) => {
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
        return segments.length > 0 ? segments : [{ chord: null, text: line }];
    };

    return (
        <div className="chord-lyrics-container w-full" dir="rtl">
            {chordedLyrics.map((section, sIdx) => {
                const isChorus = section.type === 'chorus';
                const lines = section.lines || (section.text ? section.text.split('\n').map(l => ({ segments: parseLineToSegments(l) })) : []);

                return (
                    <div
                        key={section._id || sIdx}
                        className={`mb-10 last:mb-0 relative ${!presentation && isChorus ? 'p-6 sm:p-8 rounded-4xl border border-sky-500/20 bg-sky-500/5 shadow-[inset_0_0_30px_rgba(56,189,248,0.02)]' : 'pt-2'}`}
                    >
                        {section.title && (
                            <div className="flex justify-center mb-6">
                                {isChorus ? (
                                    <div
                                        className={`px-5 py-1.5 rounded-full border text-[11px] font-black uppercase tracking-widest backdrop-blur-sm
                                        ${presentation
                                                ? 'border-white/20 text-white bg-white/10'
                                                : 'border-sky-500/30 text-sky-400 bg-sky-500/10 shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                                            }`}
                                    >
                                        {section.title}
                                    </div>
                                ) : (
                                    <div
                                        className="w-8 h-8 rounded-full border flex items-center justify-center text-[12px] font-bold opacity-60 backdrop-blur-sm"
                                        style={{
                                            borderColor: textStyle.color,
                                            color: textStyle.color
                                        }}
                                    >
                                        {section.title}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col gap-4">
                            {lines.map((line, lIdx) => (
                                <div
                                    key={lIdx}
                                    className={`w-full overflow-x-auto hide-scrollbar pb-2 text-center ${showChords ? 'mt-6' : 'my-1'}`}
                                >
                                    <div className="inline-flex flex-nowrap min-w-max px-4">
                                        {(line.segments || []).map((seg, gIdx) => (
                                            <span
                                                key={gIdx}
                                                className="inline-flex flex-col justify-end items-center relative group shrink-0"
                                            >
                                                {/* Chord Row */}
                                                {showChords && seg.chord && (
                                                    <span
                                                        className="block font-black whitespace-nowrap overflow-visible leading-none select-none mb-2 text-center"
                                                        dir="ltr"
                                                        style={{ ...chordStyle, minWidth: 'max-content' }}
                                                    >
                                                        {seg.chord}
                                                    </span>
                                                )}

                                                {/* Lyrics Row */}
                                                <span
                                                    className={`${section.type === 'chorus' ? 'font-black' : 'font-bold'} whitespace-pre-wrap transition-colors duration-300`}
                                                    style={{
                                                        ...textStyle,
                                                        color: section.type === 'chorus' && presentation ? '#fff' : textStyle.color
                                                    }}
                                                >
                                                    {seg.text || '\u00A0'}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ChordLyrics;
