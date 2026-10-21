'use client';

import Portal from '../Portal/Portal';
import { X, Monitor, Guitar, EyeOff, Mic, Copy, Share2, ClipboardCheck } from 'lucide-react';

export default function HymnLyrics({ view }) {
  const {
    closeLyricsModal,
    copiedLyrics,
    fontSize,
    handleCopyLyrics,
    handleLyricsTouchEnd,
    handleLyricsTouchMove,
    handleLyricsTouchStart,
    handleLyricsWheel,
    handleShareLyrics,
    lyricsModalCardRef,
    lyricsScrollRef,
    lyricsTheme,
    lyricsThemes,
    openPresentation,
    renderLyricsWithChords,
    selectedLyricsHymn,
    setFontSize,
    setLyricsTheme,
    setShowChords,
    showChords,
    vocalsMode
  } = view;
  return (
    <Portal>
      <div data-feature="hymn-lyrics"
        className="fixed inset-0 z-9999 flex justify-center items-end sm:items-center bg-black/70"
      >
        <div
          ref={lyricsModalCardRef}
          onTouchStart={handleLyricsTouchStart}
          onTouchMove={handleLyricsTouchMove}
          onTouchEnd={handleLyricsTouchEnd}
          onWheel={handleLyricsWheel}
          style={{
            backgroundColor: lyricsThemes[lyricsTheme].bg,
            boxShadow: lyricsTheme === 'warm' ? '0 10px 40px rgba(139, 94, 60, 0.15)' : '0 10px 40px rgba(0, 0, 0, 0.5)',
            willChange: 'transform, opacity'
          }}
          className={`w-full sm:max-w-3xl h-[90vh] sm:h-auto sm:max-h-[85vh] sm:rounded-3xl rounded-t-[2.5rem] flex flex-col relative overflow-hidden`}
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
                className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar relative flex flex-col"
                style={{ WebkitOverflowScrolling: 'touch' }}
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
                          openPresentation(selectedLyricsHymn, selectedLyricsHymn?.transposeStep || 0);
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
    
    
                  {/* Right side: Theme Selector + Share/Copy buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Theme Selector */}
                    <div className={`flex p-1 rounded-xl border transition-colors duration-300 ${lyricsTheme === 'warm' ? 'bg-amber-900/5 border-amber-900/10' : 'bg-white/5 border-white/10'}`}>
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
                            color: lyricsTheme === key ? theme.text : (lyricsTheme === 'warm' ? '#2D2926' : '#fff'),
                            border: lyricsTheme === key ? `1px solid ${theme.border || 'transparent'}` : 'none'
                          }}
                        >
                          {theme.label}
                          {lyricsTheme === key && (
                            <div className="absolute inset-0 rounded-lg border-2 border-sky-400/20" />
                          )}
                        </button>
                      ))}
                    </div>
    
                    {/* ── Copy Button ── */}
                    <button
                      onClick={handleCopyLyrics}
                      title="Copy lyrics"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border
                        ${copiedLyrics
                          ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/30'
                          : (lyricsTheme === 'warm'
                            ? 'bg-black/5 text-black/60 border-black/10 hover:bg-black/10 hover:text-black'
                            : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white')}`}
                    >
                      {copiedLyrics ? (
                        <><ClipboardCheck className="w-3.5 h-3.5" /><span className="hidden sm:inline">Copied!</span></>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" /><span className="hidden sm:inline">Copy</span></>
                      )}
                    </button>
    
                    {/* ── Share Button ── */}
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
        </div>
      </div>
    </Portal>
  );
}
