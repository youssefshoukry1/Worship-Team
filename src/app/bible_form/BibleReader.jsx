'use client';

import React, { useState, useContext, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '../Portal/Portal';
import { UserContext } from '../context/User_Context';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { showToast } from '../components/ToastContainer';
import { X, Check, Search, FileText, BookOpen, ChevronLeft, ChevronRight, Loader2, Copy, Lightbulb, FolderPlus, Monitor, PlusCircle, Link2, List, AlignJustify, Download, SlidersHorizontal, CircleHelp, Plus, Trash2 } from 'lucide-react';
import WaslaWaveLogo from '../components/WaslaWaveLogo';
import { useRouter, usePathname } from 'next/navigation';
import { HIGHLIGHT_COLORS, BIBLE_LAST_POS_KEY } from './bibleShared';

function AiResponseText({ text }) {
  const scrollRef = useRef(null);
  const [thumb, setThumb] = useState({ height: 0, top: 0 });
  const [scrollbarVisible, setScrollbarVisible] = useState(true);

  useEffect(() => {
    const scroller = scrollRef.current;
    let hideTimer;

    const updateThumb = () => {
      const { clientHeight, scrollHeight, scrollTop } = scroller;
      const height = scrollHeight > clientHeight ? Math.max(12, clientHeight * clientHeight / scrollHeight * 0.65) : 0;
      const progress = scrollHeight > clientHeight ? Math.min(1, Math.max(0, scrollTop / (scrollHeight - clientHeight))) : 0;
      setThumb({ height, top: (clientHeight - height) * progress });
    };

    const handleScroll = () => {
      updateThumb();
      setScrollbarVisible(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setScrollbarVisible(false), 800);
    };

    const observer = new ResizeObserver(updateThumb);
    observer.observe(scroller);
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', handleScroll);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div className="relative mx-auto max-w-[65ch] font-arabic text-[13px] font-normal leading-[2] tracking-normal text-right text-slate-100 whitespace-pre-line break-words antialiased">
      <p
        ref={scrollRef}
        lang="ar"
        dir="rtl"
        data-ai-response-scroll
        data-lenis-prevent-wheel
        className="max-h-[10em] overflow-y-auto overscroll-y-contain touch-pan-y hide-scrollbar"
      >
        {text}
      </p>
      {thumb.height > 0 && (
        <span
          aria-hidden="true"
          data-ai-response-scrollbar
          className="pointer-events-none absolute left-0 top-0 w-[2px] rounded-full bg-white/30 transition-opacity duration-300"
          style={{ height: thumb.height, transform: `translateY(${thumb.top}px)`, opacity: scrollbarVisible ? 1 : 0 }}
        />
      )}
    </div>
  );
}

const LEGACY_COLOR_MAP = {
  cyan: '#2fc4c9',
  lavender: '#DAB6FC',
  yellow: '#EDEDED',
  green: '#8BB388',
  red: '#FF2158',
  orange: '#F85E3B',
  blue: '#2fc4c9',
  pink: '#DAB6FC',
};

function getHighlightStyles(colorId, colorsList) {
  if (!colorId) return null;
  const color = colorsList?.find(c => c.id === colorId);
  let hex = color ? (color.hex.startsWith('#') ? color.hex : `#${color.hex}`) : null;
  if (!hex) {
    if (colorId.startsWith('#')) hex = colorId;
    else if (colorId.startsWith('custom-')) {
      const raw = colorId.replace('custom-', '');
      if (/^[0-9a-fA-F]{3,8}$/.test(raw)) hex = '#' + raw;
    } else if (LEGACY_COLOR_MAP[colorId]) {
      hex = LEGACY_COLOR_MAP[colorId];
    }
  }
  if (!hex) return null;
  return {
    backgroundColor: `${hex}1a`,
    borderRightColor: hex,
    borderRightWidth: '4px',
    borderRightStyle: 'solid'
  };
}

const VerseItem = React.memo(({
  verse,
  isSelected,
  fontSize,
  spacing,
  highlightColor,
  highlightColorsList,
  hasNote,
  isDark = true,
  onClick,
  onNoteClick
}) => {
  const highlightStyle = getHighlightStyles(highlightColor, highlightColorsList);
  return (
    <div
      onClick={() => onClick(verse._id)}
      style={{
        marginBottom: `${spacing}px`,
        ...highlightStyle
      }}
      className={`group relative cursor-pointer p-4 rounded-xl transition-all duration-200 ${!highlightStyle && isSelected
        ? isDark
          ? 'bg-white/5 border border-white/10'
          : 'bg-sky-500/15 border border-sky-400/30'
        : !highlightStyle
          ? isDark
            ? 'hover:bg-white/5 border border-white/0 hover:border-white/10'
            : 'hover:bg-sky-500/10 border border-transparent hover:border-sky-400/20'
          : ''
        }`}
    >
      <div className="flex items-start gap-4 sm:gap-8">
        <div className="shrink-0 flex flex-col items-center gap-1 min-w-[25px] sm:min-w-[30px] mt-1">
          <span className={`text-xs sm:text-sm font-black transition-colors text-center ${isSelected ? 'text-sky-500/70' : 'text-white/30 group-hover:text-sky-500/70'}`}>
            {verse.verseNumber}
          </span>
          {hasNote && (
            <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1] animate-pulse" title="Has note" />
          )}
        </div>
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <p
            className={`leading-relaxed sm:leading-normal font-arabic transition-all break-words ${isSelected || highlightStyle ? 'text-white' : 'text-white/80 group-hover:text-white'}`}
            style={{ fontSize: `${fontSize}px` }}
          >
            {verse.text}
          </p>

          {/* Inline Note Preview */}
          {hasNote && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNoteClick(verse, hasNote);
              }}
              className="flex items-start gap-2 mt-1 text-left w-full group/note"
            >
              <div className="w-0.5 bg-[#6366f1]/50 self-stretch rounded-full shrink-0 group-hover/note:bg-[#6366f1] transition-colors" />
              <p className="text-[11px] text-indigo-300/70 group-hover/note:text-indigo-300 transition-colors line-clamp-2 leading-relaxed" dir="rtl">
                {hasNote}
              </p>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

VerseItem.displayName = 'VerseItem';

// ─── Compare Version Card ───
const TRANSLATION_LABELS = {
  AVD: 'الكتاب المقدس',
  KEH: 'كتاب الحياة',
  ERV_AR: 'الكتاب المقدس: الترجمة العربية المبسطة',
  'ERV-AR': 'الكتاب المقدس: الترجمة العربية المبسطة',
};

function CompareVersionCard({
  translationCode,
  verses = [],
  bookName,
  chapter,
  verseNumbers = [],
  onDelete,
  canDelete = true,
}) {
  const [copied, setCopied] = useState(false);
  const translationLabel = TRANSLATION_LABELS[translationCode] || translationCode;

  const copyAll = () => {
    if (!verses || verses.length === 0) return;
    const text = verses.map(v => `[${v.verseNumber}] ${v.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const formattedRef = `${bookName || ''} ${chapter ? `${chapter}:` : ''}${
    verseNumbers.length > 1
      ? `${Math.min(...verseNumbers)}–${Math.max(...verseNumbers)}`
      : (verseNumbers[0] || '')
  }`;

  return (
    <div className="w-full py-5 border-b border-white/[0.08] last:border-b-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-base sm:text-lg font-bold text-white tracking-wider font-mono">
          {translationCode}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-medium text-white/70 font-arabic" dir="rtl">
            {translationLabel}
          </span>
          <div className="flex items-center gap-1 mr-1">
            <button
              onClick={copyAll}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors active:scale-95"
              title="نسخ الآيات"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {canDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors active:scale-95"
                title="حذف من المقارنة"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="border-l-2 sm:border-l-[3px] border-white/80 pl-4 py-1 space-y-2">
        {verses.length > 0 ? (
          <div className="text-white/95 text-base sm:text-lg leading-relaxed font-arabic" dir="rtl">
            {verses.map((v, idx) => (
              <span key={v._id || v.verseNumber || idx} className="inline">
                <sup className="text-xs text-sky-300 font-bold ml-1.5 select-none opacity-85">
                  {v.verseNumber}
                </sup>
                <span>{v.text} </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-white/30 italic font-arabic" dir="rtl">
            لا توجد آيات متوفرة لهذه الترجمة
          </p>
        )}

        <div className="pt-2 text-right" dir="rtl">
          <span className="text-xs sm:text-sm font-medium text-white/45 font-arabic">
            {formattedRef}
          </span>
        </div>
      </div>
    </div>
  );
}

function hsvToHex(h, s, v) {
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const vNorm = Math.max(0, Math.min(100, v)) / 100;
  const f = (n, k = (n + h / 60) % 6) => vNorm - vNorm * sNorm * Math.max(0, Math.min(k, 4 - k, 1));
  const r = Math.round(f(5) * 255);
  const g = Math.round(f(3) * 255);
  const b = Math.round(f(1) * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToHsv(hex) {
  if (!hex) return { h: 195, s: 52, v: 100 };
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return { h: 195, s: 52, v: 100 };
  const num = parseInt(c, 16);
  if (isNaN(num)) return { h: 195, s: 52, v: 100 };
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}

function ColorCustomizer({
  initialHex,
  onSave,
  onClose,
  t
}) {
  const { isDark } = useTheme();
  const [hsv, setHsv] = useState(() => hexToHsv(initialHex));
  const [hexInput, setHexInput] = useState(() => initialHex.toUpperCase());
  const satValRef = useRef(null);
  const hueBarRef = useRef(null);

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  const updateSatVal = (e) => {
    const rect = satValRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const s = Math.round(x * 100);
    const v = Math.round((1 - y) * 100);
    setHsv(prev => {
      const next = { ...prev, s, v };
      const newHex = hsvToHex(next.h, next.s, next.v);
      setHexInput(newHex.toUpperCase());
      return next;
    });
  };

  const updateHue = (e) => {
    const rect = hueBarRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const h = Math.round(x * 360) % 360;
    setHsv(prev => {
      const next = { ...prev, h };
      const newHex = hsvToHex(next.h, next.s, next.v);
      setHexInput(newHex.toUpperCase());
      return next;
    });
  };

  const applyPreset = (presetHex) => {
    const newHsv = hexToHsv(presetHex);
    setHsv(newHsv);
    setHexInput(presetHex.toUpperCase());
  };

  const handleHexInputChange = (e) => {
    const val = e.target.value;
    setHexInput(val);
    if (/^#?[0-9a-fA-F]{6}$/.test(val)) {
      const formatted = val.startsWith('#') ? val : `#${val}`;
      setHsv(hexToHsv(formatted));
    }
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`flex flex-col sm:flex-row gap-4 backdrop-blur-2xl text-white rounded-2xl p-4 border w-full max-w-[500px] select-none transition-colors ${isDark
        ? 'bg-[#141824]/95 border-white/10 shadow-[0_15px_50px_rgba(0,0,0,0.7)]'
        : 'bg-[#002238]/95 border-sky-400/25 shadow-[0_15px_50px_rgba(0,20,35,0.7)]'
        }`}
      dir="rtl"
    >
      {/* 2D Saturation / Value Box & Hue Slider */}
      <div className="flex flex-col gap-3 shrink-0" dir="ltr">
        {/* Sat/Val 2D Box */}
        <div
          ref={satValRef}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            updateSatVal(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) updateSatVal(e);
          }}
          className="relative w-full sm:w-[230px] h-32 sm:h-[145px] rounded-xl overflow-hidden cursor-crosshair border border-white/15 touch-none shadow-inner"
          style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        >
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #fff, transparent)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000, transparent)' }} />

          {/* Draggable Circle Cursor Thumb */}
          <div
            className="absolute w-5 h-5 rounded-full border-2 border-white shadow-[0_0_6px_rgba(0,0,0,0.8)] -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
            style={{
              left: `${hsv.s}%`,
              top: `${100 - hsv.v}%`,
              backgroundColor: currentHex,
            }}
          />
        </div>

        {/* Hue Bar Slider */}
        <div
          ref={hueBarRef}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            updateHue(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) updateHue(e);
          }}
          className="relative w-full sm:w-[230px] h-5 rounded-full cursor-pointer border border-white/15 touch-none shadow-inner"
          style={{
            background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          }}
        >
          {/* Hue Slider Thumb */}
          <div
            className="absolute top-1/2 w-5 h-5 rounded-full bg-white border-2 border-slate-900 shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
      </div>

      {/* Right Column: Preview, Hex info, Presets & Actions */}
      <div className="flex flex-col flex-1 gap-3 justify-between">
        {/* Color preview swatch + Hex Input */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-11 h-11 rounded-xl shadow-inner border border-white/20 shrink-0 transition-colors"
            style={{ backgroundColor: currentHex }}
          />
          <div className="flex-1 flex flex-col gap-1 bg-black/30 rounded-xl px-2.5 py-1.5 border border-white/5 shadow-inner">
            <div className="flex justify-between items-center text-[10px] text-white/50 font-bold">
              <span>HEX</span>
              <span className="font-mono text-white/80">
                RGB({parseInt(currentHex.slice(1, 3) || '0', 16)}, {parseInt(currentHex.slice(3, 5) || '0', 16)}, {parseInt(currentHex.slice(5, 7) || '0', 16)})
              </span>
            </div>
            <input
              type="text"
              value={hexInput}
              onChange={handleHexInputChange}
              maxLength={7}
              className="w-full bg-transparent font-mono text-xs text-white font-bold tracking-wider outline-none uppercase"
            />
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-1.5 py-0.5">
          {['#f43f5e', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b'].map(hex => (
            <button
              key={hex}
              onClick={(e) => { e.preventDefault(); applyPreset(hex); }}
              className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 shrink-0 shadow-sm ${currentHex.toLowerCase() === hex.toLowerCase() ? 'border-white scale-110 shadow-md' : 'border-white/20'
                }`}
              style={{ backgroundColor: hex }}
              title={hex}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-bold transition-all active:scale-95"
          >
            {t("close")}
          </button>
          <button
            onClick={() => onSave(currentHex)}
            className="flex-[1.4] py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-black transition-all active:scale-95 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
          >
            {t('setthecolor')}
          </button>
        </div>
      </div>
    </div>
  );
}

function BibleReaderWrapper({ isPage, isDark, onClose, children }) {
  if (isPage) {
    return (
      <div data-feature="bible-reader" className="w-full flex items-center justify-center p-0 sm:p-6 h-[calc(100dvh-5rem)] overflow-hidden">
        {children}
      </div>
    );
  }
  return (
    <Portal>
      <div data-feature="bible-reader" className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 overflow-hidden app-page-transition">
        <div data-feature="bible-reader"
          className={`absolute inset-0 backdrop-blur-xl transition-colors duration-200 ${isDark ? 'bg-[#050505]/80' : 'bg-[#001424]/80'
            }`}
          onClick={onClose}
        />
        {children}
      </div>
    </Portal>
  );
}

export function BibleForm({ controller, isPage = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const isStandalonePage = isPage || pathname?.startsWith('/bible_form');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [addVersionMenuOpen, setAddVersionMenuOpen] = useState(false);
  const settingsPanelRef = useRef(null);
  const settingsBtnRef = useRef(null);

  const compareModalCardRef = useRef(null);
  const compareScrollRef = useRef(null);
  const compareTouchStartY = useRef(0);
  const comparePullDistance = useRef(0);
  const compareStartedAtTop = useRef(false);

  const handleCompareTouchStart = (e) => {
    compareTouchStartY.current = e.touches[0].clientY;
    comparePullDistance.current = 0;
    compareStartedAtTop.current = (compareScrollRef.current?.scrollTop ?? 0) <= 0;
    if (compareModalCardRef.current) {
      compareModalCardRef.current.style.transition = 'none';
    }
  };

  const handleCompareTouchMove = (e) => {
    const currentY = e.touches[0].clientY;
    const currentScrollTop = compareScrollRef.current?.scrollTop ?? 0;
    if (currentScrollTop <= 0) {
      if (!compareStartedAtTop.current) {
        compareStartedAtTop.current = true;
        compareTouchStartY.current = currentY;
      }
      const deltaY = currentY - compareTouchStartY.current;
      if (deltaY > 0) {
        comparePullDistance.current = deltaY;
        if (compareModalCardRef.current) {
          compareModalCardRef.current.style.transform = `translate3d(0, ${deltaY}px, 0)`;
        }
      }
    } else {
      comparePullDistance.current = 0;
      compareStartedAtTop.current = false;
      if (compareModalCardRef.current) {
        compareModalCardRef.current.style.transform = '';
      }
    }
  };

  const handleCompareTouchEnd = () => {
    if (compareModalCardRef.current) {
      compareModalCardRef.current.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
      if (compareStartedAtTop.current && comparePullDistance.current > 80) {
        compareModalCardRef.current.style.transform = 'translate3d(0, 100%, 0)';
        setTimeout(() => {
          setCompareModal(false);
          if (compareModalCardRef.current) {
            compareModalCardRef.current.style.transform = '';
          }
        }, 220);
      } else {
        compareModalCardRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    } else if (compareStartedAtTop.current && comparePullDistance.current > 80) {
      setCompareModal(false);
    }
    comparePullDistance.current = 0;
    compareStartedAtTop.current = false;
  };

  const justClosedSettingsRef = useRef(0);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const handleOutsideClick = (e) => {
      if (settingsBtnRef.current && settingsBtnRef.current.contains(e.target)) return;
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(e.target)) {
        setIsSettingsOpen(false);
        justClosedSettingsRef.current = Date.now();
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isSettingsOpen]);
  const { isDark } = useTheme();
  const { isLogin } = useContext(UserContext);
  const { t, language } = useLanguage();
  const {
    isOpen,
    bibleSearchQuery, setBibleSearchQuery, bibleSearchResults, setBibleSearchResults, isSearchingBible,
    showBibleSearchBar, setShowBibleSearchBar,
    bibleModalBooks, setBibleModalBooks, bibleModalBook, setBibleModalBook,
    bibleModalChapters, setBibleModalChapters, bibleModalChapter, setBibleModalChapter,
    bibleModalVerses, setBibleModalVerses, bibleSelectedVerseIds, setBibleSelectedVerseIds,
    aiAnalysis, setAiAnalysis, showAiOptions, setShowAiOptions, bibleVerseFontSize, setBibleVerseFontSize,
    bibleAddedSuccess, bibleModalBrowseLoading, biblePickerOpen, setBiblePickerOpen,
    bibleBookPickerRef, bibleChapterPickerRef, isSavingBible, bibleVerseSpacing,
    handleSetBibleVerseSpacing, bibleViewMode, handleSetBibleViewMode, bibleHighlights, imageCardConfig, setImageCardConfig,
    bibleVerseGap, handleSetBibleVerseGap,
    prayModeActive, setPrayModeActive, highlightColorsList, setHighlightColorsList,
    showColorCustomizer, setShowColorCustomizer, customColorHex, setCustomColorHex,
    colorInputRef, handleTriggerColorPicker, handleColorPickerChange, handleApplyHighlight,
    handleVerseClick, handleVerseNoteClick, bibleTranslation, setBibleTranslation,
    availableTranslations, downloadedTranslations, isDownloadingTranslation, isCheckingOffline,
    toggleDownloadTranslation, compareModal, setCompareModal, compareData, isLoadingCompare, compareVerseNums,
    compareSelectedTranslations, setCompareSelectedTranslations, compareMobileTab,
    setCompareMobileTab, compareDesktopPage, setCompareDesktopPage, allColumns,
    totalPages, dpSafe, desktopColumns, mtSafe, mobileActiveCode, fetchCompareData,
    openCompare, verseNotes, noteModalConfig, setNoteModalConfig, noteText, setNoteText,
    isSubmittingNote, viewNoteConfig, setViewNoteConfig, handleSaveNote, closeBibleModal,
    getSelectedVersesRef, handleCopySelectedVerses, handleOpenImageCard, handleAiAnalysis,
    saveBibleToWorkspace, openBiblePresentation, presentBibleFromSearchHit,
    goToChapterFromSearch, goToNextChapter, goToPrevChapter, hasNextChapter, hasPrevChapter,
    bibleScrollContainerRef
  } = controller;

  const actionCardRef = useRef(null);
  const actionTouchStartY = useRef(0);
  const actionLastY = useRef(0);
  const actionLastTime = useRef(0);
  const actionVelocity = useRef(0);
  const actionPullDistance = useRef(0);
  const actionDragEnabled = useRef(false);
  const actionResponseScroller = useRef(null);

  const isClosingActionPanel = useRef(false);

  const closeSelectionPanel = () => {
    if (isClosingActionPanel.current) return;
    if (actionCardRef.current) {
      isClosingActionPanel.current = true;
      actionCardRef.current.style.animation = 'none';
      actionCardRef.current.style.transition = 'transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1)';
      actionCardRef.current.style.transform = 'translate3d(0, 100%, 0)';
      setTimeout(() => {
        setBibleSelectedVerseIds(new Set());
        setShowAiOptions(false);
        setAiAnalysis({ loading: false, type: null, text: '', error: null });
        setShowColorCustomizer(false);
        isClosingActionPanel.current = false;
      }, 180);
    } else {
      setBibleSelectedVerseIds(new Set());
      setShowAiOptions(false);
      setAiAnalysis({ loading: false, type: null, text: '', error: null });
      setShowColorCustomizer(false);
    }
  };

  const handleActionTouchStart = (e) => {
    const response = e.target.closest('[data-ai-response]');
    const scroller = response?.querySelector('[data-ai-response-scroll]') || null;
    actionResponseScroller.current = scroller;
    // A response gesture may dismiss only if it starts at the top.
    actionDragEnabled.current = !showColorCustomizer && (!scroller || scroller.scrollTop <= 0);
    actionVelocity.current = 0;
    actionPullDistance.current = 0;
    if (!actionDragEnabled.current) return;
    const y = e.touches[0].clientY;
    actionTouchStartY.current = y;
    actionLastY.current = y;
    actionLastTime.current = Date.now();
    actionVelocity.current = 0;
    actionPullDistance.current = 0;
    if (actionCardRef.current) {
      actionCardRef.current.style.animation = 'none';
      actionCardRef.current.style.transition = 'none';
    }
  };

  const handleActionTouchMove = (e) => {
    if (showColorCustomizer || !actionDragEnabled.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - actionTouchStartY.current;
    const scroller = actionResponseScroller.current;
    if (scroller && (scroller.scrollTop > 0 || deltaY < -5)) {
      // Once the user scrolls, reaching the top cannot turn this gesture into a drag.
      actionDragEnabled.current = false;
      actionPullDistance.current = 0;
      actionVelocity.current = 0;
      if (actionCardRef.current) {
        actionCardRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      return;
    }
    const now = Date.now();
    const dt = now - actionLastTime.current || 1;
    actionVelocity.current = (currentY - actionLastY.current) / dt;
    actionLastY.current = currentY;
    actionLastTime.current = now;

    if (deltaY > 0) {
      actionPullDistance.current = deltaY;
      if (actionCardRef.current) {
        actionCardRef.current.style.transform = `translate3d(0, ${deltaY}px, 0)`;
      }
    } else {
      actionPullDistance.current = 0;
      if (actionCardRef.current) {
        actionCardRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    }
  };

  const handleActionTouchEnd = (e) => {
    if (showColorCustomizer) return;
    const pullDist = actionPullDistance.current;
    const vel = actionVelocity.current;

    // Require a deliberate pull on the response; a short flick must not dismiss it.
    const shouldDismiss = actionDragEnabled.current && e.type !== 'touchcancel' && (
      actionResponseScroller.current
        ? pullDist > 80
        : pullDist > 25 || vel > 0.18 || (pullDist > 12 && vel > 0.1)
    );
    actionDragEnabled.current = false;
    actionResponseScroller.current = null;

    if (shouldDismiss) {
      closeSelectionPanel();
    } else if (actionCardRef.current) {
      actionCardRef.current.style.transition = 'transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1)';
      actionCardRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
    actionPullDistance.current = 0;
    actionVelocity.current = 0;
  };

  const onVerseClick = (verseId) => {
    if (isSettingsOpen || Date.now() - justClosedSettingsRef.current < 400) {
      setIsSettingsOpen(false);
      return;
    }
    if (bibleSelectedVerseIds.has(verseId) && bibleSelectedVerseIds.size === 1) {
      closeSelectionPanel();
    } else {
      handleVerseClick(verseId);
    }
  };

  return (
    <>
      {/* This is the Bible search and reader */}
      {isOpen && (
        <BibleReaderWrapper isPage={isStandalonePage} isDark={isDark} onClose={closeBibleModal}>
          <div
            className={`relative w-full h-full sm:h-[85vh] max-w-4xl border sm:rounded-[2.5rem] flex flex-col overflow-hidden backdrop-blur-2xl transition-colors duration-200 ${isDark
              ? 'bg-[#060b13]/90 sm:bg-[#060b13]/85 border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)]'
              : 'bg-[#001f33]/95 sm:bg-[#002238]/90 border-sky-400/25 shadow-[0_0_60px_-12px_rgba(14,165,233,0.25)]'
              }`}
          >
            {/* Background Glows matching project light/dark theme */}
            <div
              className={`absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,${isDark ? '0.06' : '0.14'
                }),transparent_70%)] pointer-events-none`}
            />
            <div
              className={`absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(37,99,235,${isDark ? '0.04' : '0.10'
                }),transparent_70%)] pointer-events-none`}
            />

            {/* --- MAIN SCROLL AREA - FIXED HEIGHT --- */}
            {/* Added 'overscroll-contain' to stop the website from scrolling when this reaches the end */}
            <div
              ref={bibleScrollContainerRef}
              className="flex-1 overflow-y-auto min-h-0 overscroll-contain custom-scrollbar-thin"
              dir="rtl"
              data-lenis-prevent-wheel
              onScroll={(e) => {
                window.dispatchEvent(new CustomEvent('internalScroll', { detail: { scrollY: e.currentTarget.scrollTop } }));
              }}
            >


              <div className="p-4 sm:p-12 max-w-3xl mx-auto space-y-6 pb-20 sm:pb-6">
                {/* Smart Navigation Hub */}
                <div className="space-y-3 pb-2" dir="rtl">
                  <div className="flex items-center justify-between gap-2 sm:gap-3 w-full">
                    {/* Search Toggle & Input */}
                    <div className="flex items-center gap-2 sm:gap-3 relative z-20 h-10 flex-1 min-w-0">
                      {/* Search Toggle (Icon Only) */}
                      <button
                        onClick={() => {
                          setShowBibleSearchBar(!showBibleSearchBar);
                          if (showBibleSearchBar) {
                            setBibleSearchQuery('');
                          }
                        }}
                        className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all duration-300 border backdrop-blur-xl relative overflow-hidden group shadow-lg z-30
                           ${showBibleSearchBar
                            ? 'bg-red-500/10 border-red-500/20 text-red-400 rotate-90 scale-90'
                            : 'bg-white/5 border-white/20 text-sky-200 hover:bg-white/10 hover:text-white hover:border-sky-400/30 hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                          }`}
                        title={showBibleSearchBar ? (language === 'ar' ? "إغلاق البحث" : "Close Search") : (language === 'ar' ? "البحث في الكتاب المقدس" : "Search Bible")}
                      >
                        {showBibleSearchBar ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                      </button>

                      {/* Search Input Bar */}
                      {showBibleSearchBar && (
                        <div className="relative h-10 flex-1 min-w-0 max-w-[260px] flex items-center search-fade-in">
                          <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-full backdrop-blur-md shadow-inner" />

                          <input
                            autoFocus
                            type="text"
                            value={bibleSearchQuery}
                            onChange={(e) => setBibleSearchQuery(e.target.value)}
                            placeholder="ابحث بعمق..."
                            className="w-full h-full pl-4 pr-8 py-2 bg-transparent text-sm text-white placeholder-gray-400/70 
                                 outline-none relative z-10 font-light tracking-wide"
                          />
                          {bibleSearchQuery && (
                            <button
                              onClick={() => setBibleSearchQuery('')}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/20 text-gray-400 hover:text-white transition-all z-20"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Compact Selectors */}
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setBiblePickerOpen(o => o === 'book' ? null : 'book')}
                        className={`flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-white text-xs font-bold transition-all flex items-center gap-2 ${biblePickerOpen === 'book' ? 'bg-sky-500/20 border-sky-500/50' : ''}`}
                      >
                        <span className="opacity-50 tracking-tighter">{t("book")}:</span>
                        <span className="truncate max-w-[80px]">{bibleModalBook?.bookName || '...'}</span>
                      </button>

                      <button
                        onClick={() => setBiblePickerOpen(o => o === 'chapter' ? null : 'chapter')}
                        disabled={!bibleModalBook}
                        className={`px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-white text-xs font-bold transition-all flex items-center gap-2 ${biblePickerOpen === 'chapter' ? 'bg-sky-500/20 border-sky-500/50' : ''}`}
                      >
                        <span className="opacity-50">{t("chapter")}:</span>
                        <span>{bibleModalChapter || '0'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Smart Floating Pickers Area - Facebook-style CSS Accordion & Sliding Navigation */}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out overflow-hidden ${biblePickerOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                      }`}
                  >
                    <div
                      className={`min-h-0 rounded-3xl overflow-hidden shadow-2xl relative border transition-colors ${isDark
                        ? 'bg-white/[0.02] border-white/5'
                        : 'bg-[#001829]/90 border-sky-400/20 shadow-[0_15px_40px_rgba(0,18,34,0.6)]'
                        }`}
                    >
                      <div
                        className="flex transition-transform duration-300 ease-out w-[200%]"
                        style={{
                          transform: biblePickerOpen === 'chapter' ? 'translateX(50%)' : 'translateX(0%)',
                        }}
                      >
                        {/* Books Pane */}
                        <div
                          className="w-1/2 p-4 max-h-[30vh] overflow-y-auto custom-scrollbar"
                          data-lenis-prevent-wheel
                        >
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {bibleModalBooks.map((book) => (
                              <button
                                key={book._id}
                                className={`px-3 py-2 rounded-xl text-right text-[11px] font-medium transition-colors ${bibleModalBook?.bookName === book.bookName ? 'bg-slate-700/80 text-slate-100 border border-slate-500/30 shadow-lg shadow-black/30' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white'}`}
                                onClick={() => { setBibleModalBook(book); setBibleModalChapter(null); setBiblePickerOpen('chapter'); if (typeof window !== 'undefined') localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: book.bookName, chapter: null })); }}
                              >
                                {book.bookName}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Chapters Pane */}
                        <div
                          className="w-1/2 p-4 max-h-[30vh] overflow-y-auto custom-scrollbar"
                          data-lenis-prevent-wheel
                        >
                          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                            {bibleModalChapters.map((ch) => (
                              <button
                                key={ch}
                                className={`h-10 rounded-xl flex items-center justify-center text-xs font-black transition-colors ${bibleModalChapter === ch ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'bg-white/5 text-white/40 hover:text-white'}`}
                                onClick={() => { setBibleModalChapter(ch); setBiblePickerOpen(null); if (typeof window !== 'undefined' && bibleModalBook) localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: bibleModalBook.bookName, chapter: ch })); }}
                              >
                                {ch}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {isSearchingBible ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-40 animate-pulse">
                    <div className="w-12 h-12 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin mb-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Neural Search...</span>
                  </div>
                ) : bibleSearchQuery.trim() ? (
                  <div className="space-y-6 pb-20">
                    {bibleSearchResults.length > 0 ? (
                      <>
                        <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-6">
                          <div className="w-1 h-6 bg-sky-500 rounded-full" />
                          <h2 className="text-xl font-bold text-white">نتائج البحث ({bibleSearchResults.length})</h2>
                        </div>
                        <div className="grid gap-4">
                          {bibleSearchResults.map((hit, idx) => (
                            <button
                              key={idx}
                              onClick={() => goToChapterFromSearch(hit)}
                              className="group p-4 rounded-2xl bg-white/[0.03] border border-white/0 hover:border-sky-500/30 hover:bg-sky-500/5 transition-all cursor-pointer"
                            >
                              <div className="flex justify-between items-start gap-4 mb-2">
                                <span className="text-sky-400 font-bold text-sm">
                                  {hit.bookName} {hit.chapter}:{hit.verseNumber}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    presentBibleFromSearchHit(hit);
                                  }}
                                  className="p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-all active:scale-90"
                                  title="Data Show"
                                >
                                  <Monitor className="w-4 h-4" />
                                </button>
                              </div>
                              <p
                                className="text-white/80 group-hover:text-white text-base leading-relaxed font-arabic transition-all [&_b]:text-sky-400 [&_b]:font-black"
                                dangerouslySetInnerHTML={{ __html: hit.text }}
                              />
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="py-20 text-center opacity-30">
                        <Search className="w-12 h-12 mx-auto mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">
                          {language === 'arabic' ? 'لم يتم العثور على نتائج' : 'No results found'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (bibleModalVerses.length > 0 || bibleModalBook) ? (
                  <div className="space-y-10">
                    {/* Modern Chapter Indicator */}
                    <div className="flex items-end justify-between border-b border-white/5 pb-6">
                      <div>
                        <h1 className="text-3xl sm:text-5xl font-black text-white leading-none">
                          {bibleModalBook.bookName}
                        </h1>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="h-[2px] w-8 bg-sky-500" />
                          <span className="text-xs font-bold text-sky-400 uppercase tracking-tighter">{t("chapter")} {bibleModalChapter}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          ref={settingsBtnRef}
                          onClick={() => setIsSettingsOpen(prev => !prev)}
                          className="p-3 hover:bg-sky-500/20 text-white rounded-2xl transition-all active:scale-90 group"
                          title={language === 'ar' ? 'الإعدادات' : 'Settings'}
                        >
                          <SlidersHorizontal className="w-5 h-5 group-hover:scale-110 transition-transform text-sky-400" />
                        </button>
                        <button
                          onClick={() => openBiblePresentation({ bookName: bibleModalBook.bookName, chapter: bibleModalChapter, verses: bibleModalVerses, startIndex: 0 })}
                          className="p-3 bg-white/5 hover:bg-sky-500 text-white rounded-2xl transition-all active:scale-90 group"
                          title="Data Show"
                        >
                          <Monitor className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                      </div>
                    </div>

                    {/* The Reading Experience - Optimized for performance */}
                    <div className="space-y-6 pb-20">
                      {/* Verses Display */}
                      {isCheckingOffline && bibleModalVerses.length === 0 ? (
                        <div className="flex items-center justify-center py-24">
                          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                        </div>
                      ) : !downloadedTranslations.has(bibleTranslation) && bibleModalVerses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(14,165,233,0.15)]">
                            {isDownloadingTranslation === bibleTranslation ? (
                              <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
                            ) : (
                              <Download className="w-7 h-7 text-sky-400" />
                            )}
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-white mb-2 font-arabic" dir="rtl">
                            {isDownloadingTranslation === bibleTranslation
                              ? (language === 'ar' ? `جاري تحميل ترجمة ${bibleTranslation}...` : `Downloading ${bibleTranslation}...`)
                              : (language === 'ar' ? `ترجمة ${bibleTranslation} غير محملة` : `${bibleTranslation} translation is not downloaded`)}
                          </h3>
                          <p className="text-xs sm:text-sm text-white/50 max-w-sm mb-5 leading-relaxed font-arabic" dir="rtl">
                            {isDownloadingTranslation === bibleTranslation
                              ? (language === 'ar' ? 'يرجى الانتظار حتى يكتمل التحميل للتشغيل بدون إنترنت.' : 'Please wait while the translation is being downloaded for offline use.')
                              : (language === 'ar' ? 'يجب تحميل هذه الترجمة أولاً للتمكن من قراءتها بدون إنترنت.' : 'You must download this translation to read it offline.')}
                          </p>
                          {isDownloadingTranslation !== bibleTranslation && (
                            <button
                              type="button"
                              onClick={() => {
                                showToast(
                                  language === 'ar'
                                    ? `جاري تحميل ترجمة ${bibleTranslation}...`
                                    : `Downloading ${bibleTranslation} translation...`
                                );
                                toggleDownloadTranslation(bibleTranslation, true);
                              }}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all shadow-[0_0_20px_rgba(14,165,233,0.3)] active:scale-95 cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                              <span>{language === 'ar' ? 'تحميل الترجمة الآن' : 'Download Translation Now'}</span>
                            </button>
                          )}
                        </div>
                      ) : bibleModalVerses.length === 0 && bibleModalBrowseLoading ? (
                        <div className="flex items-center justify-center py-24">
                          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                        </div>
                      ) : bibleViewMode === 'paragraph' ? (
                        <div
                          className="font-arabic text-right transition-all"
                          dir="rtl"
                          style={{
                            fontSize: `${bibleVerseFontSize}px`,
                            lineHeight: `${1.8 + (bibleVerseSpacing / 30)}`,
                          }}
                        >
                          {bibleModalVerses.map((verse, idx) => {
                            const getVerseInlineState = (v) => {
                              if (!v) return { bg: 'transparent', hex: null, isSelected: false };
                              const isSel = bibleSelectedVerseIds.has(v._id);
                              const hl = bibleHighlights[v._id];
                              let h = null;
                              if (hl) {
                                const colorObj = highlightColorsList?.find(c => c.id === hl);
                                h = colorObj ? (colorObj.hex.startsWith('#') ? colorObj.hex : `#${colorObj.hex}`) : null;
                                if (!h) {
                                  if (hl.startsWith('#')) h = hl;
                                  else if (hl.startsWith('custom-')) {
                                    const raw = hl.replace('custom-', '');
                                    if (/^[0-9a-fA-F]{3,8}$/.test(raw)) h = '#' + raw;
                                  } else if (LEGACY_COLOR_MAP[hl]) {
                                    h = LEGACY_COLOR_MAP[hl];
                                  }
                                }
                              }
                              let b = 'transparent';
                              if (h) {
                                b = `${h}26`;
                              } else if (isSel) {
                                b = 'rgba(255, 255, 255, 0.05)';
                              }
                              return { bg: b, hex: h, isSelected: isSel };
                            };

                            const curr = getVerseInlineState(verse);
                            const prev = idx > 0 ? getVerseInlineState(bibleModalVerses[idx - 1]) : null;
                            const next = idx < bibleModalVerses.length - 1 ? getVerseInlineState(bibleModalVerses[idx + 1]) : null;

                            const isConnectedRight = prev && prev.bg !== 'transparent' && prev.bg === curr.bg;
                            const isConnectedLeft = next && next.bg !== 'transparent' && next.bg === curr.bg;
                            // Keep verse numbers inside painted backgrounds and clear of the previous verse.
                            const touchesBackground = curr.bg !== 'transparent' || (prev && prev.bg !== 'transparent');
                            const verseNumberGap = idx === 0 ? 0 : touchesBackground
                              ? Math.max(bibleVerseGap, isConnectedRight ? bibleVerseFontSize / 5 : 0)
                              : bibleVerseGap;

                            let borderRadius = '5px';
                            let padding = '2px 5px';

                            if (curr.bg !== 'transparent') {
                              if (isConnectedRight && isConnectedLeft) {
                                borderRadius = '0px';
                                padding = '2px 0px';
                              } else if (isConnectedRight && !isConnectedLeft) {
                                borderRadius = '5px 0 0 5px';
                                padding = '2px 0px 2px 5px';
                              } else if (!isConnectedRight && isConnectedLeft) {
                                borderRadius = '0 5px 5px 0';
                                padding = '2px 5px 2px 0px';
                              }
                            }

                            const existingNote = verseNotes[verse._id];

                            return (
                              <span
                                key={verse._id}
                                onClick={() => onVerseClick(verse._id)}
                                style={{
                                  backgroundColor: curr.bg,
                                  border: 'none',
                                  padding,
                                  margin: '0',
                                  borderRadius,
                                  boxDecorationBreak: 'clone',
                                  WebkitBoxDecorationBreak: 'clone',
                                }}
                                className={`inline cursor-pointer transition-all duration-200 ${!curr.hex && !curr.isSelected ? 'hover:bg-white/5' : ''} ${curr.bg !== 'transparent' ? 'text-white' : 'text-white/80 hover:text-white'}`}
                              >
                                <span
                                  className={`inline-flex items-center justify-center text-[10px] sm:text-xs font-black px-1.5 py-0.5 rounded-md ml-1 mr-0 select-none border transition-colors leading-none ${curr.isSelected
                                    ? isDark ? 'text-sky-500/70 bg-white/5 border-white/10' : 'text-sky-400 bg-sky-500/20 border-sky-400/30'
                                    : isDark ? 'text-white/30 bg-white/5 border-white/10' : 'text-sky-300/60 bg-sky-500/10 border-sky-400/15'
                                    }`}
                                  style={{ verticalAlign: 'middle', transform: 'translateY(-1px)', marginInlineStart: `${verseNumberGap}px` }}
                                >
                                  {verse.verseNumber}
                                  {existingNote && (
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleVerseNoteClick(verse, existingNote);
                                      }}
                                      className="inline-block w-1.5 h-1.5 rounded-full bg-[#6366f1] mr-1 animate-pulse"
                                      title="Has note"
                                    />
                                  )}
                                </span>
                                <span>{verse.text?.trim()} </span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        bibleModalVerses.map((verse) => {
                          const isSelectedIndividual = bibleSelectedVerseIds.has(verse._id);
                          const existingNote = verseNotes[verse._id];
                          const highlightColor = bibleHighlights[verse._id];
                          return (
                            <VerseItem
                              key={verse._id}
                              verse={verse}
                              isSelected={isSelectedIndividual}
                              fontSize={bibleVerseFontSize}
                              spacing={bibleVerseSpacing}
                              highlightColor={highlightColor}
                              highlightColorsList={highlightColorsList}
                              hasNote={existingNote}
                              isDark={isDark}
                              onClick={onVerseClick}
                              onNoteClick={handleVerseNoteClick}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Chapter Navigation Buttons */}
            {bibleSelectedVerseIds.size === 0 && !bibleSearchQuery.trim() && bibleModalVerses.length > 0 && (
              <div className="absolute bottom-4 inset-x-4 sm:inset-x-6 flex items-center justify-between pointer-events-none z-30" dir="ltr">
                <button
                  onClick={goToPrevChapter}
                  disabled={!hasPrevChapter}
                  className={`pointer-events-auto w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center text-white shadow-lg transition-all duration-150 active:scale-90 ${isDark
                    ? 'bg-black/90 hover:bg-black/80 border-white/10'
                    : 'bg-[#002238]/95 hover:bg-[#002d4a] border-sky-400/30 text-sky-100 shadow-[0_4px_20px_rgba(0,34,56,0.6)]'
                    } ${!hasPrevChapter ? 'opacity-20 pointer-events-none' : 'cursor-pointer'}`}
                  title="الأصحاح السابق"
                >
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={goToNextChapter}
                  disabled={!hasNextChapter}
                  className={`pointer-events-auto w-9 h-9 rounded-full backdrop-blur-md border flex items-center justify-center text-white shadow-lg transition-all duration-150 active:scale-90 ${isDark
                    ? 'bg-black/90 hover:bg-black/80 border-white/10'
                    : 'bg-[#002238]/95 hover:bg-[#002d4a] border-sky-400/30 text-sky-100 shadow-[0_4px_20px_rgba(0,34,56,0.6)]'
                    } ${!hasNextChapter ? 'opacity-20 pointer-events-none' : 'cursor-pointer'}`}
                  title="الأصحاح التالي"
                >
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
              </div>
            )}

            {bibleSelectedVerseIds.size > 0 && (
              <div
                ref={actionCardRef}
                onTouchStart={handleActionTouchStart}
                onTouchMove={handleActionTouchMove}
                onTouchEnd={handleActionTouchEnd}
                onTouchCancel={handleActionTouchEnd}
                onAnimationEnd={() => {
                  if (actionCardRef.current) {
                    actionCardRef.current.style.animation = 'none';
                  }
                }}
                style={{ willChange: 'transform' }}
                className={`animate-sheet-slide-up absolute bottom-0 left-0 right-0 z-50 border-t rounded-t-[1.5rem] flex flex-col text-white overflow-hidden transition-colors ${isDark
                  ? 'bg-[#0d0e15] border-white/10 shadow-[0_-15px_35px_rgba(0,0,0,0.6)]'
                  : 'bg-[#001e33] border-sky-400/25 shadow-[0_-15px_35px_rgba(0,20,35,0.7)]'
                  }`}
                dir="rtl"
              >
                {/* Pull bar */}
                <div
                  onClick={closeSelectionPanel}
                  className={`w-10 h-1 bg-white/20 hover:bg-white/40 rounded-full mx-auto mt-3 mb-1 shrink-0 transition-colors cursor-pointer ${showColorCustomizer ? 'hidden' : ''}`}
                />

                <div className="flex flex-col gap-3 px-4 pb-4 pt-1">

                  {/* Row: ref + close */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-sky-400" dir="ltr">{getSelectedVersesRef()}</span>
                    </div>

                    <button
                      onClick={closeSelectionPanel}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all active:scale-90"
                      title="Close"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-1.5 hide-scrollbar" dir="ltr">
                    <button
                      onClick={handleCopySelectedVerses}
                      className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center active:scale-95"
                    >
                      {t('copy')}
                    </button>

                    {availableTranslations.length > 1 && (
                      <button
                        onClick={() => {
                          const nums = bibleModalVerses
                            .filter(v => bibleSelectedVerseIds.has(v._id))
                            .map(v => v.verseNumber);
                          openCompare(nums);
                        }}
                        className="flex-1 min-w-[90px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center active:scale-95"
                      >
                        {t('compare')}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const selectedVerses = bibleModalVerses
                          .filter(v => bibleSelectedVerseIds.has(v._id))
                          .sort((a, b) => a.verseNumber - b.verseNumber);
                        if (selectedVerses.length === 0) return;
                        const existing = selectedVerses.map(v => verseNotes[v._id]).find(Boolean) || '';
                        setNoteText(existing);
                        setNoteModalConfig({ type: 'bible', data: selectedVerses, existingNote: existing });
                      }}
                      className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center active:scale-95"
                    >
                      {t('Note')}
                    </button>

                    <button
                      onClick={() => {
                        setShowAiOptions(p => !p);
                        setAiAnalysis({ loading: false, type: null, text: '', error: null });
                      }}
                      className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full border text-[11px] font-black tracking-wider transition-all flex items-center justify-center active:scale-95 bg-white/5 hover:bg-white/10 border-white/10 text-white"
                    >
                      {t('Ai')}
                    </button>
                  </div>

                  {/* AI Options */}
                  {showAiOptions && (
                    <div className="flex gap-2 shrink-0 animate-in fade-in slide-in-from-bottom-1 duration-150" dir="rtl">
                      {[
                        { type: 'explain', label: 'تفسير', icon: CircleHelp, color: 'text-sky-400' },
                        { type: 'cross_reference', label: 'مراجع', icon: Link2, color: 'text-sky-400' },
                        { type: 'practical', label: 'تطبيق', icon: Lightbulb, color: 'text-sky-400' },
                      ].map(({ type, label, icon: IconComponent, color }) => (
                        <button
                          key={type}
                          onClick={() => handleAiAnalysis(type)}
                          disabled={aiAnalysis.loading}
                          className={`flex-1 py-3 px-4 rounded-2xl bg-[#0b1b2a]/50 hover:bg-black/20 transition-all duration-300 flex flex-col items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 group`}
                        >
                          <IconComponent className={`w-5 h-5 ${color} group-hover:scale-110 group-active:scale-95 transition-transform duration-300`} />
                          <span className="text-[11px] font-black text-slate-300 group-hover:text-white transition-colors duration-300">{label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* AI Response — no header bar, floating dismiss pill */}
                  {(aiAnalysis.loading || aiAnalysis.text || aiAnalysis.error) && (
                    <div
                      className={`relative rounded-2xl overflow-hidden ${isDark ? 'bg-[#060b13]' : 'bg-[#001829]'}`}
                      data-ai-response
                    >

                      <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <div className="flex items-center gap-1.5">
                          {!aiAnalysis.loading && (
                            <>
                              <WaslaWaveLogo className="w-10 h-auto shrink-0 animate-in fade-in duration-200" />
                              {aiAnalysis.type === 'explain' ? (
                                <CircleHelp className="w-4 h-4 text-sky-400 shrink-0" title="تفسير روحي" />
                              ) : aiAnalysis.type === 'cross_reference' ? (
                                <Link2 className="w-4 h-4 text-sky-400 shrink-0" title="مراجع كتابية" />
                              ) : aiAnalysis.type === 'practical' ? (
                                <Lightbulb className="w-4 h-4 text-sky-400 shrink-0" title="تطبيق عملي" />
                              ) : null}
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => setAiAnalysis({ loading: false, type: null, text: '', error: null })}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-red-500/15 text-white/25 hover:text-red-400 border border-white/8 hover:border-red-500/20 transition-all duration-150 text-[10px] font-bold"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      <div className="px-4 pb-4" dir="rtl">
                        {aiAnalysis.loading ? (
                          <div className="flex items-center justify-center py-6">
                            <WaslaWaveLogo className="w-14 h-auto" fast={true} />
                          </div>
                        ) : aiAnalysis.error ? (
                          <>
                            <p className="text-xs text-red-400 text-center py-3">{aiAnalysis.error}</p>
                            {aiAnalysis.isLimit && !isLogin && (
                              <div className="mt-2 flex justify-center">
                                <button
                                  onClick={() => router.push('/regester')}
                                  className="inline-flex items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-xs font-black text-white transition hover:bg-sky-400"
                                >
                                  {t('register')}
                                </button>
                              </div>
                            )}
                            {aiAnalysis.isLimit && isLogin && <div className="mt-2 flex justify-center"><button type="button" onClick={() => router.push('/plans')} className="inline-flex min-h-11 items-center justify-center rounded-full bg-sky-500 px-5 py-2 text-xs font-bold text-white hover:bg-sky-400">{language === 'ar' ? 'عرض الخطط' : 'View plans'}</button></div>}
                          </>
                        ) : (
                          <AiResponseText key={aiAnalysis.text} text={aiAnalysis.text} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Highlights */}
                  <div className="flex items-center gap-2.5 overflow-x-auto py-1 hide-scrollbar">
                    {highlightColorsList.map(c => {
                      const isColorActive = Array.from(bibleSelectedVerseIds).every(id => bibleHighlights[id] === c.id);
                      const isCustom = c.id.startsWith('custom-') || !HIGHLIGHT_COLORS.some(h => h.id === c.id);
                      return (
                        <div key={c.id} className="relative group shrink-0">
                          <button
                            onClick={() => handleApplyHighlight(c.id)}
                            className={`w-7 h-7 rounded-full transition-all active:scale-90 flex items-center justify-center border-2
                    ${isColorActive ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: c.hex }}
                          >
                            {isColorActive && <Check className="w-4 h-4 text-slate-900 stroke-[3]" />}
                          </button>

                          {isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHighlightColorsList(prev => prev.filter(item => item.id !== c.id));
                              }}
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-900 border border-white/20 text-white/70 hover:text-red-400 hover:bg-red-500/20 hover:border-red-400/50 flex items-center justify-center transition-all shadow-sm z-10"
                              title="حذف اللون"
                            >
                              <X className="w-2.5 h-2.5 stroke-[3]" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    <button
                      onClick={() => setShowColorCustomizer(prev => !prev)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 border border-white/20 shrink-0
              ${showColorCustomizer ? 'bg-sky-500/20 text-sky-400 border-sky-500/50' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}`}
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Color Customizer */}
                  {showColorCustomizer && (
                    <ColorCustomizer
                      initialHex={customColorHex}
                      t={t}
                      onClose={() => setShowColorCustomizer(false)}
                      onSave={(selectedHex) => {
                        const cleanHex = selectedHex.replace('#', '').toLowerCase();
                        const newId = `custom-${cleanHex}`;
                        const existing = highlightColorsList?.find(c => c.hex.toLowerCase() === selectedHex.toLowerCase());
                        const idToApply = existing ? existing.id : newId;
                        if (!existing) {
                          setHighlightColorsList(prev => [...prev, { id: newId, hex: selectedHex }]);
                        }
                        setCustomColorHex(selectedHex);
                        handleApplyHighlight(idToApply);
                        setShowColorCustomizer(false);
                      }}
                    />
                  )}

                </div>
              </div>
            )}


            {/* Smart Progress Indicator */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-sky-500/50 to-transparent" />

            {/* Compact Floating Settings Panel (Left side floating - verses stay visible for live preview) */}
            <AnimatePresence>
              {isSettingsOpen && (
                <div
                  key="settings-backdrop"
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSettingsOpen(false);
                    justClosedSettingsRef.current = Date.now();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setIsSettingsOpen(false);
                    justClosedSettingsRef.current = Date.now();
                  }}
                />
              )}
              {isSettingsOpen && (
                <motion.div
                  key="settings-panel"
                  ref={settingsPanelRef}
                  initial={{ opacity: 0, x: -16, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -16, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className={`absolute top-16 sm:top-20 left-2 sm:left-4 z-50 w-[215px] sm:w-[245px] max-w-[62vw] max-h-[min(72vh,520px)] rounded-2xl sm:rounded-3xl border shadow-[0_12px_40px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden ${isDark ? 'bg-[#080d18]/95 border-white/10' : 'bg-[#001726]/95 border-sky-400/25'
                    }`}
                  dir={language === 'ar' ? 'rtl' : 'ltr'}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
                    <span className="text-xs font-bold text-white tracking-wide">
                      {language === 'ar' ? 'الإعدادات' : 'Settings'}
                    </span>
                    <button
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all active:scale-90"
                      title="Close"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Scrollable Settings Content */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar-thin">
                    {/* Section 1: Translations */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-400/90 uppercase tracking-widest px-1">
                        {language === 'ar' ? 'الترجمة' : 'Translation'}
                      </span>
                      <div className="p-1.5 rounded-xl border bg-black/30 border-white/10 space-y-1">
                        <div className="flex flex-col gap-1">
                          {availableTranslations.map((tr) => {
                            const isDownloaded = downloadedTranslations.has(tr);
                            const isDownloading = isDownloadingTranslation === tr;
                            const isSelected = bibleTranslation === tr;
                            return (
                              <div
                                key={tr}
                                onClick={() => {
                                  if (isDownloaded) {
                                    setBibleTranslation(tr);
                                  } else {
                                    setBibleTranslation(tr);
                                    if (!isDownloading) {
                                      showToast(
                                        language === 'ar'
                                          ? `جاري تحميل ترجمة ${tr}...`
                                          : `Downloading ${tr} translation...`
                                      );
                                      toggleDownloadTranslation(tr, true);
                                    }
                                  }
                                }}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition-all cursor-pointer ${isSelected
                                  ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm'
                                  : 'bg-black/20 border-white/10 text-gray-200 hover:bg-black/40 hover:text-white'
                                  }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div className={`w-2.5 h-2.5 rounded-full border shrink-0 flex items-center justify-center ${isSelected ? 'border-sky-400 bg-sky-400' : 'border-white/30'}`}>
                                    {isSelected && <div className="w-1 h-1 rounded-full bg-slate-900" />}
                                  </div>
                                  <span className="text-[11px] font-bold tracking-wide truncate">{tr}</span>
                                </div>

                                {isDownloading ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-sky-400 shrink-0" />
                                ) : !isDownloaded ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isDownloading) {
                                        showToast(
                                          language === 'ar'
                                            ? `جاري تحميل ترجمة ${tr}...`
                                            : `Downloading ${tr} translation...`
                                        );
                                        toggleDownloadTranslation(tr, true);
                                      }
                                    }}
                                    className="p-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-all active:scale-95 shrink-0"
                                    title={language === 'ar' ? `تحميل ترجمة ${tr}` : `Download ${tr}`}
                                  >
                                    <Download className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Verse Controls */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-gray-400/90 uppercase tracking-widest px-1">
                        {language === 'ar' ? 'التحكم في الآيات' : 'Verse Controls'}
                      </span>
                      <div className="p-2 rounded-xl border bg-black/30 border-white/10 space-y-2">

                        {/* View Mode */}
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-gray-300 shrink-0">
                            {language === 'ar' ? 'العرض' : 'Mode'}
                          </span>
                          <div className="flex items-center bg-black/20 border border-white/10 rounded-lg p-0.5 gap-0.5 min-w-0">
                            <button
                              onClick={() => handleSetBibleViewMode('list')}
                              className={`px-1 sm:px-1.5 py-0.5 rounded flex items-center justify-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-bold transition-all shrink-0 ${bibleViewMode === 'list'
                                ? 'bg-sky-500 text-white shadow-sm'
                                : 'text-white/50 hover:text-white'
                                }`}
                              title={t("listViewTitle")}
                            >
                              <List className="w-2.5 h-2.5 shrink-0" />
                              <span>{t("vertical")}</span>
                            </button>
                            <button
                              onClick={() => handleSetBibleViewMode('paragraph')}
                              className={`px-1 sm:px-1.5 py-0.5 rounded flex items-center justify-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-bold transition-all min-w-0 ${bibleViewMode === 'paragraph'
                                ? 'bg-sky-500 text-white shadow-sm'
                                : 'text-white/50 hover:text-white'
                                }`}
                              title={t("continuousViewTitle")}
                            >
                              <AlignJustify className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{t("continuous")}</span>
                            </button>
                          </div>
                        </div>

                        {/* Font Size */}
                        <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-white/5">
                          <span className="text-[11px] font-bold text-gray-300">{t("font")}</span>
                          <div className="flex items-center border border-white/10 rounded-lg overflow-hidden bg-black/20">
                            <button
                              onClick={() => setBibleVerseFontSize(prev => Math.max(16, prev - 2))}
                              className="h-5 px-1.5 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-all active:bg-white/20"
                              title="Decrease font size"
                            >
                              -A
                            </button>
                            <span className="font-bold min-w-[20px] px-1 text-center text-[11px] text-sky-400">{bibleVerseFontSize}</span>
                            <button
                              onClick={() => setBibleVerseFontSize(prev => Math.min(44, prev + 2))}
                              className="h-5 px-1.5 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-all active:bg-white/20"
                              title="Increase font size"
                            >
                              +A
                            </button>
                          </div>
                        </div>

                        {/* Verse Spacing */}
                        <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-white/5">
                          <span className="text-[11px] font-bold text-gray-300">{t("spacing")}</span>
                          <div className="flex items-center border border-white/10 rounded-lg overflow-hidden bg-black/20">
                            <button
                              onClick={() => handleSetBibleVerseSpacing(Math.max(2, bibleVerseSpacing - 2))}
                              className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-all active:bg-white/20"
                              title="Decrease spacing"
                            >
                              -
                            </button>
                            <span className="font-bold min-w-[22px] px-1 text-center text-[11px] text-sky-400">{bibleVerseSpacing}px</span>
                            <button
                              onClick={() => handleSetBibleVerseSpacing(Math.min(36, bibleVerseSpacing + 2))}
                              className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-all active:bg-white/20"
                              title="Increase spacing"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {bibleViewMode === 'paragraph' && (
                          <div
                            role="group"
                            aria-label={language === 'ar' ? 'المسافة بين الآيات' : 'Verse gap'}
                            className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-white/5"
                          >
                            <span className="text-[11px] font-bold text-gray-300">
                              {language === 'ar' ? 'المسافة بين الآيات' : 'Verse gap'}
                            </span>
                            <div className="flex items-center border border-white/10 rounded-lg overflow-hidden bg-black/20 shrink-0">
                              <button
                                onClick={() => handleSetBibleVerseGap(bibleVerseGap - 2)}
                                disabled={bibleVerseGap <= -8}
                                className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-all active:bg-white/20 disabled:opacity-30"
                                aria-label={language === 'ar' ? 'تقليل المسافة بين الآيات' : 'Decrease verse gap'}
                              >
                                -
                              </button>
                              <output className="font-bold min-w-[22px] px-1 text-center text-[11px] text-sky-400" aria-live="polite">{bibleVerseGap + 6}px</output>
                              <button
                                onClick={() => handleSetBibleVerseGap(bibleVerseGap + 2)}
                                disabled={bibleVerseGap >= 32}
                                className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-all active:bg-white/20 disabled:opacity-30"
                                aria-label={language === 'ar' ? 'زيادة المسافة بين الآيات' : 'Increase verse gap'}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Selection Actions */}
                        <div className="flex items-center gap-1 pt-1.5 border-t border-white/5">
                          <button
                            onClick={() => setBibleSelectedVerseIds(new Set(bibleModalVerses.map(v => v._id)))}
                            className="flex-1 py-1.5 text-[10px] font-bold rounded-md bg-black/20 hover:bg-black/40 border border-white/10 text-slate-200 transition-all active:scale-95 text-center"
                          >
                            {t("selectAll")}
                          </button>
                          <button
                            onClick={closeSelectionPanel}
                            className="flex-1 py-1.5 text-[10px] font-bold rounded-md bg-black/20 hover:bg-black/40 border border-white/10 text-slate-300 transition-all active:scale-95 text-center"
                          >
                            {t("deselectAll")}
                          </button>
                        </div>

                        {/* Save Selected to Workspace */}
                        {bibleSelectedVerseIds.size > 0 && (
                          <button
                            onClick={saveBibleToWorkspace}
                            disabled={isSavingBible || bibleAddedSuccess}
                            className={`w-full py-1.5 px-2 text-[10px] font-black rounded-md transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center justify-center gap-1
                                ${bibleAddedSuccess ? 'bg-green-500 text-white' : 'bg-sky-500 hover:bg-sky-400 text-white'}
                                disabled:opacity-50`}
                          >
                            {isSavingBible ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> ...</>
                            ) : bibleAddedSuccess ? (
                              <><Check className="w-3 h-3" /> {t("saved")}</>
                            ) : (
                              <>
                                <FolderPlus className="w-3 h-3" />
                                {t("save")} ({bibleSelectedVerseIds.size})
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </BibleReaderWrapper>
      )}

      {/* ══════════════════════════════════════════════
                  COMPARE MODAL — slides in over the Bible modal
                  ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {compareModal && (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6"
            >
              {/* ── Modern Backdrop with Blur ── */}
              <div
                className={`absolute inset-0 backdrop-blur-sm transition-opacity ${isDark ? 'bg-[#020205]/80' : 'bg-[#001424]/80'
                  }`}
                onClick={() => setCompareModal(false)}
              />

              <motion.div
                ref={compareModalCardRef}
                onTouchStart={handleCompareTouchStart}
                onTouchMove={handleCompareTouchMove}
                onTouchEnd={handleCompareTouchEnd}
                initial={{ y: 50, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 30, opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                style={{ willChange: 'transform, opacity' }}
                className={`relative w-full sm:max-w-2xl h-[90vh] sm:h-[85vh] rounded-t-[2rem] sm:rounded-[2rem] backdrop-blur-2xl border-t sm:border shadow-2xl flex flex-col overflow-hidden ring-1 transition-colors ${isDark
                  ? 'bg-[#0A0A14]/95 border-white/[0.08] ring-white/5 sm:shadow-[0_0_60px_-15px_rgba(14,165,233,0.15)]'
                  : 'bg-[#002238]/95 border-sky-400/20 ring-sky-400/10 shadow-[0_0_60px_-15px_rgba(14,165,233,0.25)]'
                  }`}
              >
                {/* ── Compare Modal Header (Hymns Lyrics Style with Drag Bar) ── */}
                <div className="shrink-0 pt-3 pb-3 px-6 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent flex flex-col items-center">
                  <div className="w-12 bg-white/20 hover:bg-white/30 rounded-full shrink-0 h-1.5 mb-2.5 transition-colors cursor-grab active:cursor-grabbing" />
                  <p className="text-base sm:text-lg font-bold text-white/95 tracking-wide text-center" dir="rtl">
                    {bibleModalBook?.bookName} {bibleModalChapter}
                  </p>
                </div>

                {/* ── Compare Body: Vertical Stacked Translations ── */}
                <div
                  ref={compareScrollRef}
                  className={`flex-1 overflow-y-auto px-5 sm:px-7 py-3 custom-scrollbar ${isDark ? 'bg-[#0A0A14]/50' : 'bg-[#001829]/60'}`}
                >
                  {isLoadingCompare ? (
                    <div className="py-6 space-y-6">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="space-y-3 pb-6 border-b border-white/[0.04]">
                          <div className="flex justify-between">
                            <div className="h-5 w-16 bg-white/5 rounded animate-pulse" />
                            <div className="h-5 w-24 bg-white/5 rounded animate-pulse" />
                          </div>
                          <div className="border-l-2 border-white/10 pl-4 space-y-2">
                            <div className="h-4 bg-white/5 rounded w-full animate-pulse" />
                            <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse" />
                            <div className="h-4 bg-white/5 rounded w-2/3 animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (compareSelectedTranslations.length > 0 ? compareSelectedTranslations : availableTranslations).length > 0 ? (
                    <div className="flex flex-col">
                      {(compareSelectedTranslations.length > 0 ? compareSelectedTranslations : availableTranslations).map((tr) => (
                        <CompareVersionCard
                          key={tr}
                          translationCode={tr}
                          verses={compareData?.[tr] || []}
                          bookName={bibleModalBook?.bookName}
                          chapter={bibleModalChapter}
                          verseNumbers={compareVerseNums}
                          canDelete={(compareSelectedTranslations.length > 0 ? compareSelectedTranslations : availableTranslations).length > 1}
                          onDelete={async () => {
                            const currentList = compareSelectedTranslations.length > 0 ? compareSelectedTranslations : availableTranslations;
                            const next = currentList.filter(t => t !== tr);
                            setCompareSelectedTranslations(next);
                            await fetchCompareData(compareVerseNums, next);
                          }}
                        />
                      ))}

                      {/* ── Add Version Button ── */}
                      <div className="pt-6 pb-8 flex flex-col items-center">
                        <div className="w-full h-px bg-white/[0.08] mb-6" />

                        {availableTranslations.filter(t => !(compareSelectedTranslations.length > 0 ? compareSelectedTranslations : availableTranslations).includes(t)).length > 0 ? (
                          <div className="relative">
                            <button
                              onClick={() => setAddVersionMenuOpen(prev => !prev)}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white text-xs sm:text-sm font-bold tracking-wider uppercase transition-colors active:scale-95"
                            >
                              <Plus className="w-4 h-4 text-sky-400" />
                              <span>{language === 'ar' ? 'إضافة ترجمة' : 'ADD VERSION'}</span>
                            </button>

                            {addVersionMenuOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setAddVersionMenuOpen(false)}
                                />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 rounded-2xl bg-[#0c1424] border border-white/10 shadow-2xl z-20 space-y-1">
                                  <div className="px-3 py-1.5 text-[11px] font-bold text-white/40 border-b border-white/[0.06]" dir="rtl">
                                    اختر ترجمة لإضافتها:
                                  </div>
                                  {availableTranslations
                                    .filter(t => !(compareSelectedTranslations.length > 0 ? compareSelectedTranslations : availableTranslations).includes(t))
                                    .map(tr => (
                                      <button
                                        key={tr}
                                        onClick={async () => {
                                          setAddVersionMenuOpen(false);
                                          const currentList = compareSelectedTranslations.length > 0 ? compareSelectedTranslations : availableTranslations;
                                          const next = [...currentList, tr];
                                          setCompareSelectedTranslations(next);
                                          await fetchCompareData(compareVerseNums, next);
                                        }}
                                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-white/10 transition-colors text-white/90"
                                      >
                                        <span className="font-mono font-bold text-sky-400">{tr}</span>
                                        <span className="font-arabic text-white/70" dir="rtl">{TRANSLATION_LABELS[tr] || tr}</span>
                                      </button>
                                    ))}
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-white/30 font-medium">
                            {language === 'ar' ? 'جميع الترجمات المتوفرة معروضة' : 'All available versions are displayed'}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 py-16 flex flex-col items-center justify-center text-center">
                      <div className="text-4xl mb-3 opacity-40">⚖️</div>
                      <p className="text-sm font-bold text-white/60 mb-4">لا توجد ترجمات محددة للمقارنة</p>
                      {availableTranslations.length > 0 && (
                        <button
                          onClick={async () => {
                            setCompareSelectedTranslations(availableTranslations);
                            await fetchCompareData(compareVerseNums, availableTranslations);
                          }}
                          className="px-4 py-2 rounded-full bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold transition-colors"
                        >
                          عرض كل الترجمات
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-sky-500/40 to-transparent blur-[0.5px]" />
              </motion.div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
      {/* This is the Add/Edit Note form */}
      {noteModalConfig && (
        <Portal>
          <div
            className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-6"
            style={{ isolation: 'isolate' }}
          >
            {/* Backdrop - stopPropagation prevents bible modal from reacting */}
            <div
              className={`absolute inset-0 backdrop-blur-md ${isDark ? 'bg-black/70' : 'bg-[#001424]/75'}`}
              onClick={(e) => { e.stopPropagation(); setNoteModalConfig(null); setNoteText(''); }}
            />
            <div
              className={`relative w-full sm:max-w-lg border rounded-t-3xl sm:rounded-3xl shadow-[0_0_60px_-10px_rgba(99,102,241,0.3)] overflow-hidden flex flex-col ${isDark
                ? 'bg-gradient-to-b from-[#0d1a2d] to-[#080f1c] border-indigo-500/20'
                : 'bg-gradient-to-b from-[#002238] to-[#001726] border-sky-400/30'
                }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative top bar mobile */}
              <div className="sm:hidden w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1" />

              {/* Glowing header strip */}
              <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

              <div className="px-6 py-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {noteModalConfig.existingNote ? (language === 'ar' ? 'تعديل الملاحظة' : 'Edit Note') : (language === 'ar' ? 'إضافة ملاحظة' : 'Add Note')}
                    </h3>
                    <p className="text-[10px] text-indigo-400/60 font-mono uppercase tracking-widest mt-0.5">
                      {noteModalConfig.type === 'bible'
                        ? Array.isArray(noteModalConfig.data)
                          ? noteModalConfig.data.length > 1
                            ? `Verses ${noteModalConfig.data.map(v => v.verseNumber).join(', ')}`
                            : `Verse ${noteModalConfig.data[0]?.verseNumber}`
                          : `Verse ${noteModalConfig.data?.verseNumber}`
                        : 'Hymn'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setNoteModalConfig(null); setNoteText(''); }}
                  className="p-1.5 text-white/30 hover:text-white/80 rounded-lg hover:bg-white/10 transition-all shrink-0 mt-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Verse preview */}
              <div className="mx-6 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] max-h-36 overflow-y-auto">
                {noteModalConfig.type === 'bible' ? (
                  Array.isArray(noteModalConfig.data) ? (
                    <div className="space-y-1.5" dir="rtl">
                      {noteModalConfig.data.map((v) => (
                        <p key={v._id || v.verseNumber} className="text-sm text-white/50 leading-relaxed">
                          <span className="text-indigo-400 font-bold ml-1">[{v.verseNumber}]</span>
                          {v.text}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white/50 leading-relaxed line-clamp-3" dir="rtl">
                      {noteModalConfig.data.text}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-white/50 leading-relaxed line-clamp-3" dir="rtl">
                    {noteModalConfig.data?.title}
                  </p>
                )}
              </div>

              <div className="px-6 pb-2">
                <textarea
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={language === 'ar' ? 'اكتب ملاحظتك هنا...' : 'Write your note here...'}
                  rows={4}
                  className="w-full bg-white/[0.04] border border-white/10 focus:border-indigo-500/50 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 resize-none text-sm leading-relaxed transition-all"
                  dir="rtl"
                />
              </div>

              <div className="flex items-center gap-3 px-6 py-5">
                <button
                  onClick={() => { setNoteModalConfig(null); setNoteText(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all border border-white/10"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={isSubmittingNote || !noteText.trim()}
                  className="flex-[2] py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  {isSubmittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {language === 'ar' ? 'حفظ الملاحظة' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* This is the View Note overlay */}
      {viewNoteConfig && (
        <Portal>
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-8"
            style={{ isolation: 'isolate' }}
            onClick={(e) => { e.stopPropagation(); setViewNoteConfig(null); }}
          >
            <div className={`absolute inset-0 backdrop-blur-xl ${isDark ? 'bg-black/80' : 'bg-[#001424]/80'}`} />
            <div
              className={`relative w-full max-w-md border rounded-3xl shadow-[0_0_80px_-10px_rgba(99,102,241,0.4)] overflow-hidden ${isDark
                ? 'bg-gradient-to-b from-[#0d1a2d] to-[#080f1c] border-indigo-500/30'
                : 'bg-gradient-to-b from-[#002238] to-[#001726] border-sky-400/35'
                }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Ambient glow */}
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />

              <div className="p-6">
                {/* Reference tag */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/25">
                    <BookOpen className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
                      Verse {viewNoteConfig.verse.verseNumber}
                    </span>
                  </div>
                </div>

                {/* The verse text */}
                <div className="mb-5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-white/60 text-sm leading-relaxed" dir="rtl">
                    {viewNoteConfig.verse.text}
                  </p>
                </div>

                {/* Divider with label */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-indigo-500/20" />
                  <span className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-widest">Your Note</span>
                  <div className="flex-1 h-px bg-indigo-500/20" />
                </div>

                {/* The note */}
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-500 to-indigo-500/0 rounded-full" />
                  <p className="pl-4 text-indigo-100 text-sm leading-relaxed" dir="rtl">
                    {viewNoteConfig.note}
                  </p>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setViewNoteConfig(null);
                      setNoteText(viewNoteConfig.note);
                      setNoteModalConfig({ type: 'bible', data: viewNoteConfig.verse, existingNote: viewNoteConfig.note });
                    }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 transition-all"
                  >
                    Edit Note
                  </button>
                  <button
                    onClick={() => setViewNoteConfig(null)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-indigo-600/80 hover:bg-indigo-500 text-white transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

export default BibleForm;
