'use client';

import LocalFullscreenButton from '../presentation/local/LocalFullscreenButton';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { PlusCircle, X, Search, Eye, EyeOff, Tv2, Mic, MicOff, ChevronDown, Loader2, Moon, RotateCcw, ZoomOut, ZoomIn } from 'lucide-react';
import { buildHymnPresentationSlides } from '../utils/hymnSlides';

export default function HymnPresentation({ view }) {
  const {
    bibleModalBook,
    bibleModalBooks,
    bibleModalChapter,
    bibleModalChapters,
    biblePickerOpen,
    bibleSearchQuery,
    bibleSearchResults,
    broadcastLocalSlide,
    clearDisplay,
    dataShowActiveBg,
    dataShowBackgrounds,
    dataShowBlackout,
    dataShowFontScale,
    dataShowId,
    dataShowIdInput,
    dataShowIndex,
    dataShowSlides,
    decreaseFontSize,
    desktopSearchType,
    handleCreateSession,
    handleDeleteBackground,
    handleJoinSession,
    handleReset,
    handleSelectBackground,
    handleSetDesktopSearchType,
    handleUploadBackground,
    increaseFontSize,
    isAudioActive,
    isConnected,
    isCreatingSession,
    isJoiningSession,
    isSearchingPreset,
    localDisplayRef,
    presentBibleFromSearchHit,
    presentationViewport,
    presetSearchQuery,
    presetSearchResults,
    selectedLyricsHymn,
    setBibleModalBook,
    setBibleModalChapter,
    setBiblePickTick,
    setBiblePickerOpen,
    setBibleSearchQuery,
    setBibleSearchResults,
    setDataShowId,
    setDataShowIdInput,
    setDataShowIndex,
    setPresetSearchQuery,
    setPresetSearchResults,
    setSelectedLyricsHymn,
    setSessionExpiresAt,
    setShowBgSelector,
    setShowDataShow,
    setShowQuickSettings,
    showBgSelector,
    showChords,
    showQuickSettings,
    thumbContainerRef,
    toggleAudio,
    toggleBlackout
  } = view;
  // Opened by a client action, so render into the document on the first commit.
  if (typeof document === 'undefined') return null;
  return createPortal(
      <div id="showDataContainer" data-feature="hymn-presentation" className="fixed inset-0 z-10000 bg-[#020617] flex flex-col" data-lenis-prevent>
        {/* ── Shared Header ── */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0f172a] border-b border-white/10 shrink-0 z-20">
          <div className="flex flex-col min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">{selectedLyricsHymn.title}</h2>
            <p className="text-[10px] sm:text-xs text-sky-400 font-medium">
              {selectedLyricsHymn?.isBible ? (
                <>
                  <span className="sm:hidden">اسحب أو اختر آية من الشريط · مثل عرض الترانيم</span>
                  <span className="hidden sm:inline">عرض الكتاب المقدس · آية بآية مثل مقاطع الترانيم</span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">Swipe or tap a part below</span>
                  <span className="hidden sm:inline">Presenter View • Click a cut to broadcast</span>
                </>
              )}
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
            <AnimatePresence mode="wait" initial={false}>
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
                              {segs.map((seg, j) => (
                                <span key={j} className="inline-flex flex-col items-center min-w-[0.2em] max-w-full">
                                  {showChords && (
                                    <span className="block font-black whitespace-nowrap leading-none select-none mb-1" dir="ltr"
                                      style={{ color: '#38BDF8', fontSize: 'clamp(9px, 2vw, 14px)', visibility: seg.chord ? 'visible' : 'hidden' }}>
                                      {seg.chord || '\u00A0'}
                                    </span>
                                  )}
                                  <span
                                    className={`font-bold whitespace-pre-wrap break-words text-center leading-snug select-none drop-shadow-lg tracking-tight ${isChorus ? 'text-yellow-300' : 'text-white'}`}
                                    style={{
                                      fontSize: selectedLyricsHymn?.isBible
                                        ? 'clamp(26px, 7.2vw, 56px)'
                                        : 'clamp(24px, 6.5vw, 52px)',
                                      lineHeight: selectedLyricsHymn?.isBible ? 1.72 : undefined,
                                    }}
                                  >
                                    {seg.text || '\u00A0'}
                                  </span>
                                </span>
                              ))}
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
    
    
    
        {/* ══ DESKTOP VIEW: Professional Grid, Preview + Quick Settings ══ */}
        <div className="hidden sm:flex flex-1 flex-col min-h-0 bg-[#0a0f1c] text-white">
    
          {/* Top Header Section */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 shrink-0 gap-6" dir="rtl">
            <div className="flex items-center gap-4 min-w-0 shrink-0">
              <h1 className="text-2xl font-bold tracking-wide drop-shadow-md text-gray-50 truncate max-w-[200px] xl:max-w-[300px]">
                {selectedLyricsHymn?.title || 'ليسوع كل القدرة'}
              </h1>
              {dataShowId && (
                <span className="flex items-center gap-1.5 bg-red-500/10 text-red-500 border border-red-500/20 px-2.5 py-1 rounded-md text-xs font-bold tracking-widest uppercase">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE
                </span>
              )}
            </div>
    
            {/* Middle: Compact Search Bar Widget with Hymns/Bible Toggle */}
            <div className="flex-1 max-w-lg relative z-30" dir="rtl">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-2 py-1.5">
    
                {/* Segmented Control - inline pill */}
                <div className="flex items-center gap-0.5 bg-black/30 rounded-full p-0.5 shrink-0">
                  <button
                    onClick={() => handleSetDesktopSearchType('hymns')}
                    className={`py-1 px-3 text-xs font-bold rounded-full transition-all duration-200 whitespace-nowrap ${desktopSearchType === 'hymns'
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    ترانيم
                  </button>
                  <button
                    onClick={() => handleSetDesktopSearchType('bible')}
                    className={`py-1 px-3 text-xs font-bold rounded-full transition-all duration-200 whitespace-nowrap ${desktopSearchType === 'bible'
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    الكتاب
                  </button>
                </div>
    
                {/* Divider */}
                <div className="w-px h-4 bg-white/10 shrink-0" />
    
                {/* Hymns Search Input */}
                {desktopSearchType === 'hymns' && (
                  <div className="relative flex-1 flex items-center">
                    <input
                      type="text"
                      value={presetSearchQuery}
                      onChange={(e) => setPresetSearchQuery(e.target.value)}
                      placeholder="ابحث عن ترنيمة..."
                      className="w-full bg-transparent py-0.5 px-2 text-sm text-white placeholder-white/30 focus:outline-none text-right"
                    />
                    {isSearchingPreset ? (
                      <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
                    ) : presetSearchQuery ? (
                      <button
                        onClick={() => { setPresetSearchQuery(''); setPresetSearchResults([]); }}
                        className="text-white/30 hover:text-white/80 shrink-0 p-0.5 rounded-full hover:bg-white/5 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <Search className="w-4 h-4 text-white/20 shrink-0 pointer-events-none" />
                    )}
                  </div>
                )}
    
                {/* Bible Search & Picker Controls - inline */}
                {desktopSearchType === 'bible' && (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="relative flex-1 flex items-center">
                      <input
                        type="text"
                        value={bibleSearchQuery}
                        onChange={(e) => setBibleSearchQuery(e.target.value)}
                        placeholder="ابحث في الآيات..."
                        className="w-full bg-transparent py-0.5 px-2 text-sm text-white placeholder-white/30 focus:outline-none text-right"
                      />
                      {bibleSearchQuery ? (
                        <button
                          onClick={() => setBibleSearchQuery('')}
                          className="text-white/30 hover:text-white/80 shrink-0 p-0.5 rounded-full hover:bg-white/5 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      ) : (
                        <Search className="w-4 h-4 text-white/20 shrink-0 pointer-events-none" />
                      )}
                    </div>
                    <div className="w-px h-4 bg-white/10 shrink-0" />
                    <button
                      onClick={() => setBiblePickerOpen(o => o === 'book_present' ? null : 'book_present')}
                      className="bible-picker-btn flex items-center gap-1 text-[11px] font-bold text-gray-300 hover:text-white transition-colors shrink-0 whitespace-nowrap"
                    >
                      <span className="opacity-50 text-[10px]">السفر:</span>
                      <span className="max-w-[55px] truncate">{bibleModalBook?.bookName || '...'}</span>
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </button>
                    <button
                      onClick={() => setBiblePickerOpen(o => o === 'chapter_present' ? null : 'chapter_present')}
                      disabled={!bibleModalBook}
                      className="bible-picker-btn flex items-center gap-1 text-[11px] font-bold text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
                    >
                      <span className="opacity-50 text-[10px]">الأصحاح:</span>
                      <span>{bibleModalChapter || '0'}</span>
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </button>
                  </div>
                )}
              </div>
    
              {/* Dropdown Recommendations Box for Hymns */}
              {desktopSearchType === 'hymns' && presetSearchResults.length > 0 && (
                <div className="absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-2 custom-scrollbar flex flex-col gap-1.5 z-[100]">
                  {presetSearchResults.map((hymn) => (
                    <button
                      key={hymn._id}
                      onClick={() => {
                        setSelectedLyricsHymn(hymn);
                        setDataShowIndex(0);
                        handleSetDesktopSearchType('hymns');
                        setPresetSearchQuery('');
                        setPresetSearchResults([]);
    
                        const slides = buildHymnPresentationSlides(hymn.lyrics, {
                          showChords,
                          viewportHeight: presentationViewport.height,
                          viewportWidth: presentationViewport.width,
                        });
                        broadcastLocalSlide(slides, 0, hymn.title);
                      }}
                      className="w-full text-right px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-sky-500/25 border border-white/5 hover:border-sky-500/30 transition-all flex items-center justify-between gap-3 active:scale-[0.98]"
                    >
                      <span className="truncate">{hymn.title}</span>
                      {hymn.party && (
                        <span className="text-[9px] font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full shrink-0">
                          {Array.isArray(hymn.party) ? hymn.party[0] : hymn.party}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
    
              {/* Dropdown Recommendations Box for Bible Search Hits */}
              {desktopSearchType === 'bible' && bibleSearchQuery.trim() && bibleSearchResults.length > 0 && (
                <div className="absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-2 custom-scrollbar flex flex-col gap-1.5 z-[100]">
                  {bibleSearchResults.map((hit, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        presentBibleFromSearchHit(hit);
                        setBibleSearchQuery('');
                        setBibleSearchResults([]);
                      }}
                      className="w-full text-right px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-sky-300 bg-white/5 hover:bg-sky-500/25 border border-white/5 hover:border-sky-500/30 transition-all flex flex-col gap-1 active:scale-[0.98]"
                    >
                      <span className="text-sky-400 font-bold text-[10px]">{hit.bookName} {hit.chapter}:{hit.verseNumber}</span>
                      <span className="truncate text-gray-300 font-medium text-[11px] text-right" dangerouslySetInnerHTML={{ __html: hit.text.replace(/<b[^>]*>(.*?)<\/b>/g, '$1') }} />
                    </button>
                  ))}
                </div>
              )}
    
              {/* Dropdown Book Selection Grid */}
              {desktopSearchType === 'bible' && biblePickerOpen === 'book_present' && (
                <div className="bible-picker-dropdown absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-3 custom-scrollbar z-[100]">
                  <div className="grid grid-cols-3 gap-1.5">
                    {bibleModalBooks.map((book) => (
                      <button
                        key={book._id}
                        className={`px-2 py-1.5 rounded-xl text-center text-[10px] font-bold transition-all truncate border ${bibleModalBook?.bookName === book.bookName
                          ? 'bg-sky-500 text-white border-sky-400'
                          : 'bg-white/5 text-gray-300 border-white/5 hover:bg-sky-500/25 hover:border-sky-500/30'
                          }`}
                        onClick={() => {
                          setBibleModalBook(book);
                          setBibleModalChapter(null);
                          setBiblePickerOpen('chapter_present');
                        }}
                      >
                        {book.bookName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
    
              {/* Dropdown Chapter Selection Grid */}
              {desktopSearchType === 'bible' && biblePickerOpen === 'chapter_present' && (
                <div className="bible-picker-dropdown absolute top-full mt-2 left-0 right-0 max-h-60 overflow-y-auto bg-[#0d1321]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] p-3 custom-scrollbar z-[100]">
                  <div className="grid grid-cols-6 gap-1.5">
                    {bibleModalChapters.map((ch) => (
                      <button
                        key={ch}
                        className={`h-8 rounded-xl flex items-center justify-center text-[11px] font-bold transition-all border ${bibleModalChapter === ch
                          ? 'bg-sky-500 text-white border-sky-400'
                          : 'bg-white/5 text-gray-300 border-white/5 hover:bg-sky-500/25 hover:border-sky-500/30'
                          }`}
                        onClick={() => {
                          setBibleModalChapter(ch);
                          setBiblePickTick(n => n + 1);
                          setBiblePickerOpen(null);
                        }}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
    
            <div className="flex items-center gap-3">
              {dataShowId ? (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-1.5 rounded-full text-sm font-medium shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" /> متصل
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 text-gray-400 px-4 py-1.5 rounded-full text-sm font-medium">
                  <div className="w-2 h-2 rounded-full bg-gray-500" /> غير متصل
                </div>
              )}
            </div>
          </div>
    
          {/* Main Content: Grid & Preview */}
          <div className="flex-1 flex gap-8 p-8 min-h-0 overflow-hidden" dir="rtl">
    
            {/* Preview Panel (Right Side) */}
            <div className="hidden lg:flex flex-col w-80 xl:w-[450px] shrink-0 h-full">
              <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-sm font-semibold text-gray-400">معاينة</span>
                <span className="text-lg font-bold text-gray-100 tracking-wide">ملخص الشاشة الثانية</span>
              </div>
              <div
                className="flex-1 border border-white/10 rounded-3xl p-8 flex flex-col justify-center items-center text-center relative shadow-[inset_0_0_40px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300"
                style={{
                  background: dataShowActiveBg === 'default'
                    ? 'radial-gradient(ellipse 80% 60% at 50% 40%, #0d1527 0%, #070a14 100%)'
                    : `url(${dataShowActiveBg}) center/cover no-repeat`
                }}
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-gray-500/20 to-transparent" />
                <div className="text-2xl sm:text-4xl font-extrabold text-white leading-relaxed wrap-break-word whitespace-pre-line drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)]">
                  {dataShowSlides[dataShowIndex] ? dataShowSlides[dataShowIndex].text.replace(/\[.*?\]/g, '') : 'لا يوجد نص'}
                </div>
                {dataShowBlackout && (
                  <div className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col justify-center items-center gap-3 transition-all duration-300 z-20">
                    <EyeOff className="w-10 h-10 text-amber-500/80 animate-pulse" />
                    <span className="text-sm font-bold text-amber-500/80">الشاشة الحية مخفية (Blackout)</span>
                  </div>
                )}
                <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md border border-white/5 px-3 py-1 rounded-lg text-xs font-medium text-gray-400">
                  معاينة
                </div>
              </div>
            </div>
    
            {/* Slides Grid (Left Side) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pl-2">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 pb-4">
                {dataShowSlides.map((slide, i) => {
                  const isActive = dataShowIndex === i;
                  const isChorus = slide.type === 'chorus';
                  return (
                    <button
                      key={i}
                      onClick={() => { setDataShowIndex(i); broadcastLocalSlide(dataShowSlides, i, selectedLyricsHymn?.title); }}
                      className={`relative flex flex-col h-44 p-5 rounded-2xl border text-right transition-all duration-300 overflow-hidden group outline-none
                        ${isActive
                          ? 'bg-sky-900/40 border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.15)] ring-1 ring-sky-400/50 z-10 scale-[1.02]'
                          : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] shadow-lg shadow-black/20'}`}
                    >
                      {isActive && <div className="absolute inset-0 bg-linear-to-br from-sky-500/10 to-transparent pointer-events-none" />}
                      <div className="flex items-center justify-between w-full mb-4 relative z-10" dir="ltr">
                        <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${isActive ? 'bg-sky-500/20 text-sky-300' : 'bg-black/30 text-gray-400'}`}>
                          {i + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-red-500 text-white px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                              <span className="w-1.5 h-1.5 rounded-full bg-white opacity-90 animate-pulse" /> Live
                            </span>
                          )}
                          {slide.title && (
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full backdrop-blur-sm
                              ${isChorus ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-white/5 text-gray-300 border border-white/10'}`}>
                              {slide.title}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 w-full text-[15px] font-bold leading-relaxed text-gray-100 line-clamp-4 relative z-10 wrap-break-word whitespace-pre-line text-right">
                        {slide.text.replace(/\[.*?\]/g, '')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
    
          {/* Quick Settings Footer (Bottom Bar) */}
          <div className="shrink-0 bg-[#0d1321] border-t border-white/5 z-20" dir="rtl">
    
            {/* Toggle Header Bar */}
            <button
              onClick={() => setShowQuickSettings(v => !v)}
              className="w-full flex items-center justify-between px-8 py-3 hover:bg-white/[0.03] transition-colors group"
            >
              <span className="text-xs font-bold text-gray-500 tracking-widest uppercase group-hover:text-gray-400 transition-colors">Quick Settings</span>
              <div className="flex items-center gap-2 text-gray-600 group-hover:text-gray-400 transition-colors">
                <span className="text-[10px] font-medium">{showQuickSettings ? 'إخفاء' : 'إظهار'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showQuickSettings ? 'rotate-180' : ''}`} />
              </div>
            </button>
    
            {/* Collapsible Content */}
            {showQuickSettings && (
              <div className="px-8 pb-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-gray-300 tracking-wide"></span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 font-medium">LiveAudioBadge</span>
                    <button onClick={toggleAudio} className={`p-2 rounded-full transition-all active:scale-95 ${isAudioActive ? 'bg-sky-500/20 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                      {isAudioActive ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
    
                {/* Background Images Selection Grid (Collapsible) */}
                {showBgSelector && (
                  <div className="mb-4 p-4 bg-black/40 border border-white/5 rounded-2xl flex flex-col gap-3 transition-all duration-300" dir="rtl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-400">خلفية الشاشة الحية (أقصى حد: 5 صور)</span>
                      <span className="text-[11px] text-gray-500 font-medium">تم رفع {dataShowBackgrounds.length} من أصل 5 صور</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 py-1">
                      {/* Default Option */}
                      <button
                        onClick={() => handleSelectBackground('default')}
                        className={`relative w-16 h-12 rounded-xl overflow-hidden border flex-none flex items-center justify-center text-[10px] font-bold text-white transition-all active:scale-95
                          ${dataShowActiveBg === 'default'
                            ? 'border-sky-400 ring-2 ring-sky-400/30'
                            : 'border-white/10 opacity-70 hover:opacity-100 shadow-md'}`}
                        style={{
                          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, #0d1527 0%, #070a14 100%)'
                        }}
                      >
                        الافتراضي
                      </button>
    
                      {/* Uploaded Backgrounds */}
                      {dataShowBackgrounds.map((bg, idx) => {
                        const isActive = dataShowActiveBg === bg;
                        return (
                          <div key={idx} className="relative w-16 h-12 rounded-xl flex-none group">
                            <button
                              onClick={() => handleSelectBackground(bg)}
                              className={`w-full h-full rounded-xl overflow-hidden border transition-all active:scale-95
                                ${isActive
                                  ? 'border-sky-400 ring-2 ring-sky-400/30'
                                  : 'border-white/10 opacity-70 hover:opacity-100 shadow-md'}`}
                            >
                              <img src={bg} alt="custom bg" className="w-full h-full object-cover" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteBackground(bg, e)}
                              className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-500/90 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-90"
                              title="حذف"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
    
                      {/* Upload Slot */}
                      {dataShowBackgrounds.length < 5 && (
                        <label className="w-16 h-12 rounded-xl border border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all active:scale-95 flex-none shadow-md">
                          <PlusCircle className="w-5 h-5 text-gray-400 hover:text-white" />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleUploadBackground}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
    
                {/* Controls & Connection Row */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Left side in RTL (UI Actions) */}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={toggleBlackout}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all hover:scale-105 active:scale-95
                        ${dataShowBlackout
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-pulse'
                          : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'}`}
                    >
                      {dataShowBlackout ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      {dataShowBlackout ? 'إظهار الشاشة' : 'إخفاء الشاشة'}
                    </button>
                    <LocalFullscreenButton displayRef={localDisplayRef} />
                    <button
                      onClick={() => setShowBgSelector(!showBgSelector)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all hover:scale-105 active:scale-95
                        ${showBgSelector
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-[0_0_15px_rgba(56,189,248,0.15)]'
                          : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'}`}
                    >
                      <Moon className="w-4 h-4" /> المظهر
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
                    >
                      <RotateCcw className="w-4 h-4" /> إعادة تعيين
                    </button>
    
                    <div className="h-6 w-px bg-white/10 mx-1"></div>
    
                    {/* Font Scale Control Widget */}
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                      <button
                        onClick={decreaseFontSize}
                        disabled={dataShowFontScale <= 0.5}
                        className="p-1.5 hover:bg-white/10 rounded-full text-gray-300 disabled:opacity-20 transition-all active:scale-90"
                        title="تصغير الخط"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-mono text-gray-300 min-w-[40px] text-center select-none">
                        {Math.round(dataShowFontScale * 100)}%
                      </span>
                      <button
                        onClick={increaseFontSize}
                        disabled={dataShowFontScale >= 2.0}
                        className="p-1.5 hover:bg-white/10 rounded-full text-gray-300 disabled:opacity-20 transition-all active:scale-90"
                        title="تكبير الخط"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
    
                  {/* Right side in RTL (Session Management) */}
                  <div className="flex items-center gap-3 bg-black/30 p-1.5 rounded-2xl border border-white/5" dir="ltr">
                    {!dataShowId ? (
                      <>
                        <input type="text" value={dataShowIdInput} onChange={e => setDataShowIdInput(e.target.value)}
                          placeholder="Room ID..."
                          className="bg-transparent px-3 py-1.5 text-sm text-white focus:outline-none w-32 placeholder:text-gray-600"
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateSession(); }}
                        />
                        <button onClick={handleCreateSession} disabled={isCreatingSession} className="px-4 py-1.5 bg-sky-500/80 hover:bg-sky-500 active:scale-95 rounded-xl text-sm font-bold text-white transition-all">
                          {isCreatingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                        </button>
                        <button onClick={handleJoinSession} disabled={isJoiningSession} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-sm font-bold text-white transition-all">
                          Join
                        </button>
                      </>
                    ) : (
                      <>
                        <a href={`/presentation/display?dataShowId=${encodeURIComponent(dataShowId)}`} target="_blank" rel="noopener noreferrer"
                          className="px-4 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 text-xs font-bold hover:bg-indigo-500/30 active:scale-95 transition-all flex items-center gap-1.5">
                          <Tv2 className="w-3.5 h-3.5" /> Display
                        </a>
                        <button onClick={() => { if (isAudioActive) toggleAudio(); clearDisplay(); setDataShowId(''); setSessionExpiresAt(null); localStorage.removeItem('myLivePresentationId'); }}
                          className="px-4 py-1.5 rounded-xl bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-5~00/30 active:scale-95 transition-all flex items-center gap-1.5">
                          <X className="w-3.5 h-3.5" /> End
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
    
        </div>
    
      </div>,
    document.body
  );
}
