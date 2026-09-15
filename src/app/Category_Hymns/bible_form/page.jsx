'use client';
import React, { useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Portal from '../../Portal/Portal';
import { UserContext } from '../../context/User_Context';
import { HymnsContext } from '../../context/Hymns_Context';
import { useLanguage } from '../../context/LanguageContext';
import { showToast } from '../../components/ToastContainer';
import { Sparkles, X, Check, Search, FileText, BookOpen, ChevronDown, Loader2, Copy, Lightbulb, FolderPlus, Monitor, PlusCircle, Link2, List, AlignJustify } from 'lucide-react';
import { normalizeBibleBooksFromApi } from '../../utils/bibleBooks';
import { getApiBaseUrl } from '../../utils/apiBase';
import { useRouter } from 'next/navigation';
import { isApp } from '../../utils/platform';
import { initLocalBible, getLocalBibleIndex, searchLocalBible, isTranslationDownloaded, downloadTranslationToLocal, deleteTranslationFromLocal } from '../../utils/bibleSync';
import { queueOfflineAction } from '../../utils/offlineQueue';


const API_ROOT = getApiBaseUrl();
const BIBLE_API = `${API_ROOT}/bible`;
const LOCAL_BIBLE_NOTES_KEY = 'taspe7_local_bible_notes';
const BIBLE_LAST_POS_KEY = 'taspe7_bible_last_position';

function readLocalBibleNotes() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_BIBLE_NOTES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalBibleNote(verseId, note) {
  if (typeof window === 'undefined' || !verseId) return;
  const current = readLocalBibleNotes();
  current[String(verseId)] = String(note || '');
  localStorage.setItem(LOCAL_BIBLE_NOTES_KEY, JSON.stringify(current));
}

const HIGHLIGHT_COLORS = [
  { id: 'cyan', hex: '#7ae7ff' },
  { id: 'pink', hex: '#ffbde6' },
  { id: 'red', hex: '#f87171' },
  { id: 'lavender', hex: '#e2e0ff' },
  { id: 'yellow', hex: '#ffff00' },
  { id: 'green', hex: '#00ff66' },
  { id: 'blue', hex: '#00bfff' },
  { id: 'orange', hex: '#ffaa44' },
];

const LOCAL_BIBLE_HIGHLIGHTS_KEY = 'taspe7_local_bible_highlights';

function readLocalBibleHighlights() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_BIBLE_HIGHLIGHTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalBibleHighlight(verseId, colorId) {
  if (typeof window === 'undefined' || !verseId) return;
  const current = readLocalBibleHighlights();
  if (colorId) {
    current[String(verseId)] = colorId;
  } else {
    delete current[String(verseId)];
  }
  localStorage.setItem(LOCAL_BIBLE_HIGHLIGHTS_KEY, JSON.stringify(current));
}

function getHighlightStyles(colorId, colorsList) {
  if (!colorId) return null;
  const color = colorsList?.find(c => c.id === colorId);
  let hex = color ? (color.hex.startsWith('#') ? color.hex : `#${color.hex}`) : null;
  if (!hex) {
    if (colorId.startsWith('#')) hex = colorId;
    else if (colorId.startsWith('custom-')) {
      const raw = colorId.replace('custom-', '');
      if (/^[0-9a-fA-F]{3,8}$/.test(raw)) hex = '#' + raw;
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
        ? 'bg-white/5 border border-white/10'
        : !highlightStyle
          ? 'hover:bg-white/5 border border-white/0 hover:border-white/10'
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

function getUsersEndpointCandidates(path) {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const withApi = API_ROOT;
  const withoutApi = API_ROOT.replace(/\/api$/i, '');
  const candidates = [
    `${withApi}/users/${normalizedPath}`,
    `${withoutApi}/api/users/${normalizedPath}`,
    `${withoutApi}/users/${normalizedPath}`,
    `${withApi}/api/users/${normalizedPath}`
  ];
  return [...new Set(candidates.map((u) => u.replace(/([^:]\/)\/+/g, '$1')))];
}

async function postUsersWithFallback(path, body, config) {
  let last404Error = null;
  const attempted = [];
  for (const url of getUsersEndpointCandidates(path)) {
    try {
      return await axios.post(url, body, config);
    } catch (err) {
      attempted.push({ url, status: err?.response?.status });
      if (err?.response?.status === 404) {
        last404Error = err;
        continue;
      }
      throw err;
    }
  }
  if (last404Error) {
    last404Error.message = `${last404Error.message} | Attempts: ${attempted.map(a => `${a.status || 'ERR'} ${a.url}`).join(' | ')}`;
  }
  throw last404Error || new Error(`Unable to POST /users/${path}`);
}

async function getUsersWithFallback(path, config) {
  let last404Error = null;
  const attempted = [];
  for (const url of getUsersEndpointCandidates(path)) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      attempted.push({ url, status: err?.response?.status });
      if (err?.response?.status === 404) {
        last404Error = err;
        continue;
      }
      throw err;
    }
  }
  if (last404Error) {
    last404Error.message = `${last404Error.message} | Attempts: ${attempted.map(a => `${a.status || 'ERR'} ${a.url}`).join(' | ')}`;
  }
  throw last404Error || new Error(`Unable to GET /users/${path}`);
}

function bibleTestamentAr(testament) {
  return String(testament || '').toLowerCase() === 'new' ? 'العهد الجديد' : 'العهد القديم';
}

// ─── CompareColumn: isolated component so hooks are valid (not inside .map) ───
const TRANSLATION_LABELS = {
  AVD: 'فان دايك',
  KEH: 'كتاب الحياة',
  ERV_AR: 'الترجمة العربية',
};

const UNIFIED_THEME = {
  accent: 'text-sky-300 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]',
  header: 'from-sky-500/10 via-sky-500/5 to-transparent border-white/[0.08]',
  badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
};

function CompareColumn({ translationCode, verses, isActive = true }) {
  const [copied, setCopied] = useState(false);
  const translationLabel = TRANSLATION_LABELS[translationCode] || translationCode;

  const copyAll = () => {
    const text = verses.map(v => `[${v.verseNumber}] ${v.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 border-b sm:border-b-0 sm:border-r border-white/[0.06] last:border-0 ${isActive ? '' : 'hidden sm:flex'}`}>
      {/* Column Header */}
      <div className={`shrink-0 px-4 py-3 flex items-center justify-between bg-gradient-to-b ${UNIFIED_THEME.header} border-b`}>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold tracking-wider px-2.5 py-0.5 rounded-lg ${UNIFIED_THEME.badge}`}>
            {translationCode}
          </span>
          <span className="text-xs font-medium text-white/70">
            {translationLabel}
          </span>
        </div>
        <button
          onClick={copyAll}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-95"
          title="نسخ النصوص"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Verses scroll area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" dir="rtl" data-lenis-prevent-wheel>
        {verses.map((v, vIdx) => (
          <div key={v._id || vIdx} className={`p-4 rounded-xl border ${UNIFIED_THEME.accent} transition-all duration-200`}>
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-[11px] font-bold">
                {v.verseNumber}
              </span>
              <p className="text-white/90 leading-relaxed text-sm sm:text-base font-arabic">
                {v.text}
              </p>
            </div>
          </div>
        ))}
        {verses.length === 0 && (
          <div className="py-12 text-center text-white/30">
            <p className="text-sm">لا توجد آيات متوفرة لهذه الترجمة</p>
          </div>
        )}
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
    <div className="flex flex-col sm:flex-row gap-4 bg-[#141824]/95 backdrop-blur-2xl text-white rounded-2xl p-4 shadow-[0_15px_50px_rgba(0,0,0,0.7)] border border-white/10 w-full max-w-[500px] select-none" dir="rtl">
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
                RGB({parseInt(currentHex.slice(1,3)||'0',16)}, {parseInt(currentHex.slice(3,5)||'0',16)}, {parseInt(currentHex.slice(5,7)||'0',16)})
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
              className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 shrink-0 shadow-sm ${
                currentHex.toLowerCase() === hex.toLowerCase() ? 'border-white scale-110 shadow-md' : 'border-white/20'
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

export function useBibleForm({ isOpen, presentationActive, onClose, onPresent }) {
  const { isLogin, user_id } = useContext(UserContext);
  const { addToWorkspace } = useContext(HymnsContext);
  const { t, language } = useLanguage();

  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleSearchResults, setBibleSearchResults] = useState([]);
  const [isSearchingBible, setIsSearchingBible] = useState(false);
  const [bibleModalBooks, setBibleModalBooks] = useState([]);
  const [bibleModalBook, setBibleModalBook] = useState(null);
  const [bibleModalChapters, setBibleModalChapters] = useState([]);
  const [bibleModalChapter, setBibleModalChapter] = useState(null);
  const [bibleModalVerses, setBibleModalVerses] = useState([]);
  const [bibleSelectedVerseIds, setBibleSelectedVerseIds] = useState(new Set());
  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState({ loading: false, type: null, text: '', error: null, isLimit: false });
  const [showAiOptions, setShowAiOptions] = useState(false);
  const [bibleVerseFontSize, setBibleVerseFontSize] = useState(() => {
    if (typeof window === 'undefined') return 20;
    const saved = localStorage.getItem('taspe7_bible_verse_font_size');
    return saved ? parseInt(saved, 10) : 20;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_bible_verse_font_size', bibleVerseFontSize.toString());
    }
  }, [bibleVerseFontSize]);

  const [bibleAddedSuccess, setBibleAddedSuccess] = useState(false);

  const [bibleModalBrowseLoading, setBibleModalBrowseLoading] = useState(false);
  const [bibleModalBooksReady, setBibleModalBooksReady] = useState(false);
  const [biblePickerOpen, setBiblePickerOpen] = useState(null);
  const bibleBookPickerRef = useRef(null);
  const bibleChapterPickerRef = useRef(null);
  const [isSavingBible, setIsSavingBible] = useState(false);

  // --- New Spacing, Highlights, and Overlay States ---
  const [bibleVerseSpacing, setBibleVerseSpacing] = useState(() => {
    if (typeof window === 'undefined') return 16;
    const saved = localStorage.getItem('taspe7_bible_verse_spacing');
    return saved ? parseInt(saved, 10) : 16;
  });

  const handleSetBibleVerseSpacing = (val) => {
    setBibleVerseSpacing(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_bible_verse_spacing', val.toString());
    }
  };

  // View mode: 'list' (under each other) vs 'paragraph' (beside each other)
  const [bibleViewMode, setBibleViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list';
    return localStorage.getItem('taspe7_bible_view_mode') || 'list';
  });

  const handleSetBibleViewMode = (mode) => {
    setBibleViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_bible_view_mode', mode);
    }
  };

  const [bibleHighlights, setBibleHighlights] = useState({});
  const [imageCardConfig, setImageCardConfig] = useState(null);
  const [prayModeActive, setPrayModeActive] = useState(false);

  const [highlightColorsList, setHighlightColorsList] = useState(() => {
    if (typeof window === 'undefined') return HIGHLIGHT_COLORS;
    try {
      const saved = localStorage.getItem('taspe7_custom_highlights_list');
      return saved ? JSON.parse(saved) : HIGHLIGHT_COLORS;
    } catch {
      return HIGHLIGHT_COLORS;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('taspe7_custom_highlights_list', JSON.stringify(highlightColorsList));
    }
  }, [highlightColorsList]);

  const [showColorCustomizer, setShowColorCustomizer] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('#7ae7ff');

  const colorInputRef = useRef(null);

  const handleTriggerColorPicker = () => {
    colorInputRef.current?.click();
  };

  const handleColorPickerChange = (e) => {
    const newHex = e.target.value;
    if (newHex) {
      setCustomColorHex(newHex);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setBibleHighlights(readLocalBibleHighlights());
      if (user_id) {
        const token = localStorage.getItem("user_Taspe7_Token");
        if (token) {
          axios.get(`${API_ROOT.replace(/\/api$/, '')}/api/users/profile/${user_id}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).then(res => {
            if (res.data?.user?.bibleHighlights) {
              const serverHighlights = {};
              res.data.user.bibleHighlights.forEach(h => {
                if (h.verseId && h.color) {
                  serverHighlights[String(h.verseId)] = h.color;
                }
              });
              localStorage.setItem(LOCAL_BIBLE_HIGHLIGHTS_KEY, JSON.stringify(serverHighlights));
              setBibleHighlights(serverHighlights);
            }
          }).catch(() => {});
        }
      }
    }
  }, [isOpen, user_id]);

  const handleApplyHighlight = async (colorId) => {
    const selectedIds = Array.from(bibleSelectedVerseIds);
    if (!selectedIds.length) return;

    // Toggle off if all selected verses already have this color
    const isTogglingOff = colorId && selectedIds.every(id => bibleHighlights[id] === colorId);
    const targetColor = isTogglingOff ? null : colorId;

    const newHighlights = { ...bibleHighlights };

    // Optimistic UI update
    selectedIds.forEach(id => {
      if (targetColor) {
        newHighlights[id] = targetColor;
        writeLocalBibleHighlight(id, targetColor);
      } else {
        delete newHighlights[id];
        writeLocalBibleHighlight(id, null);
      }
    });
    setBibleHighlights(newHighlights);

    // Auto close context menu by deselecting
    setBibleSelectedVerseIds(new Set());

    if (!user_id) return;
    const token = localStorage.getItem("user_Taspe7_Token");
    if (!token) return;

    try {
      const promises = selectedIds.map(async (id) => {
        const verse = bibleModalVerses.find(v => v._id === id);
        if (!verse) return;

        if (targetColor) {
          await axios.post(`${API_ROOT.replace(/\/api$/, '')}/api/users/bible-highlight`, {
            userid: user_id,
            verseId: id,
            bookName: verse.bookName || bibleModalBook?.name || '',
            chapter: verse.chapter || bibleModalChapter?.number || 1,
            verseNumber: verse.verseNumber,
            color: targetColor,
            text: verse.text
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } else {
          await axios.delete(`${API_ROOT.replace(/\/api$/, '')}/api/users/bible-highlight/${user_id}`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { verseId: id }
          });
        }
      });
      await Promise.all(promises);
    } catch (err) {
      console.error('Failed to sync bible highlights:', err);
    }
  };

  const handleVerseClick = React.useCallback((verseId) => {
    setBibleSelectedVerseIds(prev => {
      const next = new Set(prev);
      if (next.has(verseId)) {
        next.delete(verseId);
      } else {
        next.add(verseId);
      }
      return next;
    });
  }, []);

  const handleVerseNoteClick = React.useCallback((verse, existingNote) => {
    setViewNoteConfig({ verse, note: existingNote });
  }, []);

  // --- Translation Selector State ---
  const getInitialTranslation = () => {
    if (typeof window === 'undefined') return 'AVD';
    return localStorage.getItem('taspe7_bible_translation') || 'AVD';
  };
  const [bibleTranslation, setBibleTranslationRaw] = useState(getInitialTranslation);
  // Pre-seeded with known translations so all pills appear immediately,
  // even before the /translations endpoint responds.
  const [availableTranslations, setAvailableTranslations] = useState(['AVD', 'ERV_AR', 'KEH']);
  const setBibleTranslation = (t) => {
    setBibleTranslationRaw(t);
    if (typeof window !== 'undefined') localStorage.setItem('taspe7_bible_translation', t);
    // Reset selection and search while keeping active book & chapter position
    setBibleModalVerses([]);
    setBibleSelectedVerseIds(new Set());
    setBibleModalChapters([]);
    setBibleSearchQuery('');
    setBibleSearchResults([]);
  };

  // --- Offline Translation Downloads State ---
  const [downloadedTranslations, setDownloadedTranslations] = useState(new Set());
  const [isDownloadingTranslation, setIsDownloadingTranslation] = useState(null);

  // Initialize the local Bible cache independently from the hymns page.
  useEffect(() => {
    initLocalBible().then((data) => {
      if (data && data.length > 0) {
        setDownloadedTranslations(prev => {
          const next = new Set(prev);
          next.add('AVD');
          return next;
        });
      }
    }).catch(() => { });
  }, []);


  // --- Bible Scroll Header Hide/Show State ---
  const [showBibleNavHeader, setShowBibleNavHeader] = useState(true);
  const lastBibleScrollTopRef = useRef(0);

  const handleBibleScroll = (e) => {
    const st = e.target.scrollTop;
    if (st <= 10) {
      setShowBibleNavHeader(true);
    } else if (st > lastBibleScrollTopRef.current + 4) {
      setShowBibleNavHeader(prev => {
        if (prev) setBiblePickerOpen(null);
        return false;
      });
    } else if (st < lastBibleScrollTopRef.current - 4) {
      setShowBibleNavHeader(true);
    }
    lastBibleScrollTopRef.current = Math.max(0, st);
  };

  // Check which translations are offline when modal opens or available translations change
  useEffect(() => {
    if (!isOpen) return;
    const checkOffline = async () => {
      const active = new Set();
      for (const tr of availableTranslations) {
        const downloaded = await isTranslationDownloaded(tr);
        if (downloaded) {
          active.add(tr);
        }
      }
      setDownloadedTranslations(active);
    };
    checkOffline();
  }, [isOpen, availableTranslations]);

  const toggleDownloadTranslation = async (tr) => {
    if (tr === 'AVD' && isApp) {
      showToast(language === 'ar' ? 'نسخة فانديك مدمجة مع التطبيق ولا يمكن حذفها.' : 'AVD is packaged and cannot be deleted.');
      return;
    }
    const isDownloaded = downloadedTranslations.has(tr);
    if (isDownloaded) {
      if (confirm(language === 'ar' ? `هل أنت متأكد من حذف ترجمة ${tr} من جهازك؟` : `Are you sure you want to delete ${tr} translation from your device?`)) {
        const success = await deleteTranslationFromLocal(tr);
        if (success) {
          setDownloadedTranslations(prev => {
            const next = new Set(prev);
            next.delete(tr);
            return next;
          });
          showToast(language === 'ar' ? 'تم حذف الترجمة بنجاح' : 'Translation deleted successfully');
        }
      }
    } else {
      setIsDownloadingTranslation(tr);
      try {
        const success = await downloadTranslationToLocal(tr, BIBLE_API);
        if (success) {
          setDownloadedTranslations(prev => {
            const next = new Set(prev);
            next.add(tr);
            return next;
          });
          showToast(language === 'ar' ? 'تم تحميل الترجمة بنجاح للتشغيل بدون إنترنت!' : 'Translation downloaded successfully for offline use!');
        }
      } catch (error) {
        if (error?.isNotFound) {
          showToast(
            language === 'ar'
              ? `ترجمة ${tr} غير متوفرة في قاعدة البيانات حالياً.`
              : `Translation ${tr} is not available in the database yet.`
          );
        } else {
          showToast(language === 'ar' ? 'فشل تحميل الترجمة. تأكد من اتصالك بالإنترنت.' : 'Failed to download translation. Check your connection.');
        }
      } finally {
        setIsDownloadingTranslation(null);
      }
    }
  };


  // --- Compare Modal State ---
  const [compareModal, setCompareModal] = useState(false); // open/close
  const [compareData, setCompareData] = useState(null);   // { AVD: [...], KEH: [...] }
  const [isLoadingCompare, setIsLoadingCompare] = useState(false);
  const [compareVerseNums, setCompareVerseNums] = useState([]); // verse numbers to compare

  // Multi-translation selection for compare (persisted in localStorage)
  const COMPARE_STORAGE_KEY = 'taspe7_compare_translations';
  const getInitialCompareTranslations = () => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(COMPARE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  };
  const [compareSelectedTranslations, setCompareSelectedTranslationsRaw] = useState(getInitialCompareTranslations);
  const setCompareSelectedTranslations = (trs) => {
    setCompareSelectedTranslationsRaw(trs);
    if (typeof window !== 'undefined') localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(trs));
  };


  ////////////////////////////////////////////

  // UI state: mobile tab index, desktop page (groups of 3)
  const [compareMobileTab, setCompareMobileTab] = useState(0);
  const [compareDesktopPage, setCompareDesktopPage] = useState(0);

  // Core fetch function — separated so it can be called when user toggles translations
  const fetchCompareData = async (verseNumbers, translations) => {
    if (!bibleModalBook?.bookName || bibleModalChapter == null || !verseNumbers?.length) return;
    setIsLoadingCompare(true);
    setCompareData(null);

    try {
      const targetTranslations = translations && translations.length > 0 ? translations : availableTranslations;
      const finalCompareData = {};
      const onlineTranslations = [];

      // 1. Fetch downloaded translations locally (Fast & Offline)
      for (const t of targetTranslations) {
        const isDownloaded = downloadedTranslations.has(t) || (await isTranslationDownloaded(t));
        if (isDownloaded) {
          try {
            const index = await getLocalBibleIndex(t);
            if (index && index.versesMap) {
              const chapterKey = `${bibleModalBook.bookName}_${parseInt(bibleModalChapter)}`;
              const allVerses = index.versesMap.get(chapterKey) || [];
              const numsSet = new Set(verseNumbers.map(Number));
              const matched = allVerses.filter(v => numsSet.has(Number(v.verseNumber)));
              finalCompareData[t] = matched;
            } else {
              onlineTranslations.push(t);
            }
          } catch (localErr) {
            console.warn(`Local fetch failed for ${t}, falling back to online:`, localErr);
            onlineTranslations.push(t);
          }
        } else {
          onlineTranslations.push(t);
        }
      }

      // 2. Fetch the rest online (only if online and there are pending translations)
      if (onlineTranslations.length > 0 && navigator.onLine) {
        try {
          const trsParam = `&translations=${onlineTranslations.join(',')}`;
          const { data } = await axios.get(
            `${BIBLE_API}/compare?bookName=${encodeURIComponent(bibleModalBook.bookName)}&chapter=${bibleModalChapter}&verseNumbers=${verseNumbers.join(',')}${trsParam}`
          );
          if (data && typeof data === 'object') {
            Object.assign(finalCompareData, data);
          }
        } catch (apiErr) {
          console.error('Online compare fetch error for', onlineTranslations, apiErr);
        }
      }

      setCompareData(finalCompareData);
    } catch (err) {
      console.error('Compare fetch error', err);
      setCompareData({});
    } finally {
      setIsLoadingCompare(false);
    }
  };

  const openCompare = async (verseNumbers) => {
    if (!bibleModalBook?.bookName || bibleModalChapter == null || !verseNumbers?.length) return;
    setCompareModal(true);
    setCompareVerseNums(verseNumbers);
    setCompareMobileTab(0);
    setCompareDesktopPage(0);
    // Restore saved selection, or default to all available translations
    const saved = getInitialCompareTranslations();
    const allTrs = availableTranslations;
    let activeTrs = saved.length > 0 ? saved.filter(t => allTrs.includes(t)) : allTrs;
    // Always ensure the current translation is included
    if (!activeTrs.includes(bibleTranslation)) activeTrs = [bibleTranslation, ...activeTrs];
    setCompareSelectedTranslationsRaw(activeTrs);
    await fetchCompareData(verseNumbers, activeTrs);
  };


  const dataKeys = compareData ? Object.keys(compareData) : [];
  const allColumns = compareSelectedTranslations.length > 0
    ? compareSelectedTranslations.filter(t => dataKeys.includes(t))
    : dataKeys;
  const DESKTOP_PAGE_SIZE = 3;
  const totalPages = Math.ceil(allColumns.length / DESKTOP_PAGE_SIZE);
  const dpSafe = Math.min(compareDesktopPage, Math.max(0, totalPages - 1));
  const desktopColumns = allColumns.slice(dpSafe * DESKTOP_PAGE_SIZE, dpSafe * DESKTOP_PAGE_SIZE + DESKTOP_PAGE_SIZE);
  const mtSafe = Math.min(compareMobileTab, Math.max(0, allColumns.length - 1));
  const mobileActiveCode = allColumns[mtSafe] || null;
  ///////////////////////////////////////////
  // Notes: keyed by verseId for O(1) lookup
  const [verseNotes, setVerseNotes] = useState({}); // { [verseId]: noteText }
  const [noteModalConfig, setNoteModalConfig] = useState(null); // { type, data, existingNote }
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [viewNoteConfig, setViewNoteConfig] = useState(null); // { verse, note }

  useEffect(() => {
    if (!biblePickerOpen) return;
    const onDown = (e) => {
      const bookEl = bibleBookPickerRef.current;
      const chEl = bibleChapterPickerRef.current;
      if (biblePickerOpen === 'book' && bookEl && !bookEl.contains(e.target)) setBiblePickerOpen(null);
      if (biblePickerOpen === 'chapter' && chEl && !chEl.contains(e.target)) setBiblePickerOpen(null);

      // Close presentation Bible picker when clicking outside picker buttons or dropdowns
      const isPickerClick = e.target.closest('.bible-picker-btn') || e.target.closest('.bible-picker-dropdown');
      if (!isPickerClick && (biblePickerOpen === 'book_present' || biblePickerOpen === 'chapter_present')) {
        setBiblePickerOpen(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [biblePickerOpen]);

  // ─── Fetch available translations (runs once on first modal open or presentation mode active) ───
  const translationsFetchedRef = React.useRef(false);
  useEffect(() => {
    if ((!isOpen && !(presentationActive)) || translationsFetchedRef.current) return;
    translationsFetchedRef.current = true;
    axios.get(`${BIBLE_API}/translations`)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableTranslations(data);
        }
      })
      .catch(() => { /* keep the default ['AVD','KEH'] */ });
  }, [isOpen, presentationActive]);

  // ─── Load books when modal opens or presentation Bible mode is active ───
  useEffect(() => {
    if (!isOpen && !(presentationActive)) return;
    setBibleModalBook(null);
    setBibleModalChapter(null);
    setBibleModalChapters([]);
    setBibleSelectedVerseIds(new Set());
    setBibleModalVerses([]);
    setBibleModalBooksReady(false);
    let cancelled = false;
    (async () => {
      try {
        // Books are the same across translations — prefer local index (fast/offline)
        const index = await getLocalBibleIndex();
        if (index && index.books && index.books.length > 0) {
          if (!cancelled) setBibleModalBooks(normalizeBibleBooksFromApi(index.books));
        } else {
          const { data } = await axios.get(`${BIBLE_API}/books?lang=arabic`);
          if (!cancelled) setBibleModalBooks(normalizeBibleBooksFromApi(data));
        }
      } catch {
        if (!cancelled) setBibleModalBooks([]);
      } finally {
        if (!cancelled) setBibleModalBooksReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive]);

  // Restore last book/chapter after books are loaded
  useEffect(() => {
    if (!bibleModalBooksReady || bibleModalBooks.length === 0) return;
    try {
      const saved = localStorage.getItem(BIBLE_LAST_POS_KEY);
      if (!saved) return;
      const { bookName, chapter } = JSON.parse(saved);
      const book = bibleModalBooks.find(b => b.bookName === bookName);
      if (book) {
        setBibleModalBook(book);
        if (chapter != null) setBibleModalChapter(chapter);
      }
    } catch { }
  }, [bibleModalBooksReady]);

  // ─── Load chapters when book or translation changes (synced with presentation) ───
  useEffect(() => {
    if ((!isOpen && !(presentationActive)) || !bibleModalBook?.bookName) {
      setBibleModalChapters([]);
      setBibleSelectedVerseIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setBibleModalBrowseLoading(true);
      try {
        const isDownloaded = downloadedTranslations.has(bibleTranslation);
        if (isDownloaded) {
          // use local index for instant offline-first response
          const index = await getLocalBibleIndex(bibleTranslation);
          if (index) {
            const chapters = index.chaptersMap.get(bibleModalBook.bookName) || [];
            if (!cancelled) {
              setBibleModalChapters(chapters);
              setBibleModalBrowseLoading(false);
            }
            return;
          }
        }
        // Other translations or when local index is absent → hit the API
        const { data } = await axios.get(
          `${BIBLE_API}/chapters/${encodeURIComponent(bibleModalBook.bookName)}?lang=arabic&translation=${bibleTranslation}`
        );
        if (!cancelled) setBibleModalChapters(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setBibleModalChapters([]);
      } finally {
        if (!cancelled) setBibleModalBrowseLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, bibleModalBook, bibleTranslation, downloadedTranslations]);

  // ─── Load verses when chapter or translation changes (synced with presentation) ───
  useEffect(() => {
    if ((!isOpen && !(presentationActive)) || !bibleModalBook?.bookName || bibleModalChapter == null) {
      setBibleModalVerses([]);
      setBibleSelectedVerseIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setBibleModalBrowseLoading(true);
      try {
        const isDownloaded = downloadedTranslations.has(bibleTranslation);
        if (isDownloaded) {
          // use local index for instant offline-first response
          const index = await getLocalBibleIndex(bibleTranslation);
          if (index) {
            const verses = index.versesMap.get(`${bibleModalBook.bookName}_${parseInt(bibleModalChapter)}`) || [];
            if (!cancelled) {
              setBibleModalVerses(verses);
              setBibleModalBrowseLoading(false);
            }
            return;
          }
        }
        // Other translations or when local index is absent → hit the API
        const { data } = await axios.get(
          `${BIBLE_API}/verses/${encodeURIComponent(bibleModalBook.bookName)}/${bibleModalChapter}?lang=arabic&translation=${bibleTranslation}`
        );
        if (!cancelled) setBibleModalVerses(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setBibleModalVerses([]);
      } finally {
        if (!cancelled) setBibleModalBrowseLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, presentationActive, bibleModalBook, bibleModalChapter, bibleTranslation, downloadedTranslations]);


  // Bible Search Debounce Effect
  useEffect(() => {
    let cancelled = false;

    const searchBible = async () => {
      if (!bibleSearchQuery.trim()) {
        setBibleSearchResults([]);
        return;
      }
      setIsSearchingBible(true);
      try {
        let searchedOnline = false;

        // Try Online (MongoDB) First if the device is connected
        if (navigator.onLine) {
          try {
            const { data } = await axios.get(
              `${BIBLE_API}/search?q=${encodeURIComponent(bibleSearchQuery)}&lang=arabic&translation=${bibleTranslation}`
            );
            if (!cancelled) setBibleSearchResults(Array.isArray(data) ? data : []);
            searchedOnline = true;
          } catch (err) {
            console.warn("Online Bible search failed, falling back to offline search", err);
          }
        }

        // Fallback to Offline if Online failed or if device is offline
        if (!searchedOnline) {
          const isDownloaded = downloadedTranslations.has(bibleTranslation);
          if (isDownloaded) {
            const localResults = await searchLocalBible(bibleSearchQuery, bibleTranslation);
            if (!cancelled) setBibleSearchResults(localResults || []);
          } else {
            if (!cancelled) setBibleSearchResults([]);
          }
        }
      } catch (error) {
        console.error("Bible search error:", error);
        if (!cancelled) setBibleSearchResults([]);
      } finally {
        if (!cancelled) setIsSearchingBible(false);
      }
    };

    const handler = setTimeout(() => {
      searchBible();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handler);
    };
  }, [bibleSearchQuery, bibleTranslation, downloadedTranslations]);

  const handleSaveNote = async () => {
    if (!noteText.trim() || !noteModalConfig) return;
    // Use the correct localStorage keys this app actually uses
    const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
    const userid = user_id; // from UserContext, key: user_Taspe7_ID
    if (!token || !userid) {
      console.error('Note save failed: missing token or user ID', { token: !!token, userid });
      alert('You must be logged in to save notes.');
      return;
    }

    setIsSubmittingNote(true);
    try {
      if (noteModalConfig.type === 'bible') {
        const verse = noteModalConfig.data;
        await postUsersWithFallback('bible-note', {
          userid,
          verseId: verse._id,
          bookName: bibleModalBook?.bookName || verse.bookName || 'Unknown',
          chapter: bibleModalChapter || verse.chapter || 1,
          verseNumber: verse.verseNumber,
          text: verse.text,
          note: noteText
        }, { headers: { Authorization: `Bearer ${token}` } });
        // Update local state immediately for instant feedback
        setVerseNotes(prev => ({ ...prev, [verse._id]: noteText }));
      } else if (noteModalConfig.type === 'hymn') {
        const hymn = noteModalConfig.data;
        await postUsersWithFallback('hymn-note', {
          userid,
          hymnId: hymn._id || hymn.hymnId,
          title: hymn.title,
          note: noteText
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setNoteModalConfig(null);
      setNoteText('');
    } catch (err) {
      const isNetworkError = !navigator.onLine || err.message === 'Network Error' || err.code === 'ECONNABORTED';

      if (isNetworkError) {
        if (noteModalConfig?.type === 'bible') {
          const verse = noteModalConfig.data;
          await queueOfflineAction(`${API_ROOT}/users/bible-note`, 'POST', {
            userid,
            verseId: verse._id,
            bookName: bibleModalBook?.bookName || verse.bookName || 'Unknown',
            chapter: bibleModalChapter || verse.chapter || 1,
            verseNumber: verse.verseNumber,
            text: verse.text,
            note: noteText
          }, { Authorization: `Bearer ${token}` });

          writeLocalBibleNote(verse?._id, noteText);
          setVerseNotes(prev => ({ ...prev, [verse?._id]: noteText }));
        } else if (noteModalConfig?.type === 'hymn') {
          const hymn = noteModalConfig.data;
          await queueOfflineAction(`${API_ROOT}/users/hymn-note`, 'POST', {
            userid,
            hymnId: hymn._id || hymn.hymnId,
            title: hymn.title,
            note: noteText
          }, { Authorization: `Bearer ${token}` });
        }

        setNoteModalConfig(null);
        setNoteText('');
        showToast({ message: '📶 You\'re offline — your note is saved and will sync automatically once you\'re back online.', type: 'offline', duration: 6000 });
        return;
      }

      if (err?.response?.status === 404 && noteModalConfig?.type === 'bible') {
        const verse = noteModalConfig.data;
        writeLocalBibleNote(verse?._id, noteText);
        setVerseNotes(prev => ({ ...prev, [verse?._id]: noteText }));
        setNoteModalConfig(null);
        setNoteText('');
        alert('Saved locally on this device. Backend note route is still returning 404.');
        return;
      }
      console.error('Failed to save note:', err?.response?.data || err.message);
      alert('Failed to save note: ' + (err?.response?.data?.message || err.message));
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Load user's existing bible notes on login
  useEffect(() => {
    if (!isLogin || !user_id) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
    if (!token) return;
    // Fetch user's notes and index by verseId for O(1) lookup
    getUsersWithFallback('my-notes', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        const localMap = readLocalBibleNotes();
        if (Array.isArray(data?.bibleNotes)) {
          const map = {};
          data.bibleNotes.forEach(n => { if (n.verseId) map[n.verseId] = n.note; });
          setVerseNotes({ ...map, ...localMap });
        } else {
          setVerseNotes(localMap);
        }
      })
      .catch(() => {
        setVerseNotes(readLocalBibleNotes());
      });
  }, [isLogin, user_id]);

  const closeBibleModal = () => {
    onClose();
    setBibleSearchQuery('');
    setBibleSearchResults([]);
    setBibleModalBooks([]);
    setBibleModalBook(null);
    setBibleModalChapters([]);
    setBibleModalChapter(null);
    setBibleSelectedVerseIds(new Set());
    setBibleModalVerses([]);
    setBibleModalBooksReady(false);
    setBiblePickerOpen(null);
    setCompareModal(false);
    setCompareData(null);
    setCompareVerseNums([]);
    setCompareMobileTab(0);
    setCompareDesktopPage(0);
  };

  const getSelectedVersesRef = () => {
    if (!bibleModalBook?.bookName || bibleModalChapter == null || bibleSelectedVerseIds.size === 0) return '';
    const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
    if (selectedVersesData.length === 0) return '';
    const nums = selectedVersesData.map(v => v.verseNumber).sort((a, b) => a - b);
    if (nums.length === 1) {
      return `${bibleModalBook.bookName} ${bibleModalChapter}:${nums[0]}`;
    } else {
      const isConsecutive = nums.every((num, i) => i === 0 || num === nums[i - 1] + 1);
      if (isConsecutive) {
        return `${bibleModalBook.bookName} ${bibleModalChapter}:${nums[0]}-${nums[nums.length - 1]}`;
      } else {
        return `${bibleModalBook.bookName} ${bibleModalChapter}:${nums.join('، ')}`;
      }
    }
  };

  const handleCopySelectedVerses = async () => {
    const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
    if (!selectedVersesData.length) return;
    const shareText = selectedVersesData.map(v => `[${v.verseNumber}] ${v.text}`).join('\n') + `\n(${getSelectedVersesRef()})`;

    try {
      await navigator.clipboard.writeText(shareText);
      showToast(language === 'ar' ? 'تم نسخ الآيات المختارة بنجاح!' : 'Selected verses copied successfully!');
    } catch (err) {
      console.error('Clipboard write failed', err);
      showToast(language === 'ar' ? 'تعذر نسخ النصوص' : 'Failed to copy text');
    }
  };

  const handleOpenImageCard = () => {
    const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
    const combinedText = selectedVersesData.map(v => v.text).join(' ');
    setImageCardConfig({
      refText: getSelectedVersesRef(),
      text: combinedText
    });
  };

  const handleAiAnalysis = async (analysisType) => {
    setShowAiOptions(false);
    const selectedVersesData = bibleModalVerses.filter(v => bibleSelectedVerseIds.has(v._id));
    if (!selectedVersesData.length) return;
    const textContent = selectedVersesData.map(v => `[${v.verseNumber}] ${v.text}`).join(' ');
    const verseId = Array.from(bibleSelectedVerseIds).sort().join('-');
    setAiAnalysis({ loading: true, type: analysisType, text: '', error: null, isLimit: false });
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Token') : null;
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const { data } = await axios.post(`${API_ROOT}/ai/analyze-verse`, {
        verseId,
        textContent,
        analysisType
      }, { headers });
      setAiAnalysis({ loading: false, type: analysisType, text: data.explanation || '', error: null, isLimit: false });
    } catch (err) {
      const responseMessage = err?.response?.data?.message || 'حدث خطأ، حاول مجدداً.';
      const isLimit = err?.response?.status === 429;
      setAiAnalysis({ loading: false, type: analysisType, text: '', error: responseMessage, isLimit });
    }
  };

  // Save Bible verses to workspace
  const saveBibleToWorkspace = async () => {
    if (!bibleModalBook?.bookName || bibleModalChapter == null || bibleSelectedVerseIds.size === 0) {
      return;
    }

    setIsSavingBible(true);
    try {
      const selectedVersesData = bibleModalVerses.filter(verse => bibleSelectedVerseIds.has(verse._id));

      if (selectedVersesData.length === 0) {
        setIsSavingBible(false);
        return;
      }

      const selectedVerseNumbers = selectedVersesData.map(v => v.verseNumber).sort((a, b) => a - b);
      const verseNumbersString = selectedVerseNumbers.join(', ');

      const title = `${bibleModalBook.bookName} · ${t('chapter')} ${bibleModalChapter}:${verseNumbersString}`;
      const uniqueIdSuffix = selectedVerseNumbers.join('-'); // For unique ID based on selected verses

      const bibleItem = {
        _id: `bible-${bibleModalBook.bookName}-${bibleModalChapter}-${uniqueIdSuffix}`,
        title: title,
        bookName: bibleModalBook.bookName,
        chapter: bibleModalChapter,
        // Store only the selected verses
        verses: selectedVersesData,
        // Lyrics for presentation/display should also be only selected verses
        isBible: true,
        lyrics: selectedVersesData.map(v => ({
          type: 'verse',
          title: `آية ${v.verseNumber}`,
          text: v.text
        }))
      };

      addToWorkspace(bibleItem);

      setBibleAddedSuccess(true);
      setTimeout(() => setBibleAddedSuccess(false), 2000);
    } catch (error) {
      console.error('Error saving Bible to workspace:', error);
    } finally {
      setIsSavingBible(false);
    }
  };

  const presentBibleFromSearchHit = async (hit) => {
    if (!hit?.bookName || hit.chapter == null || hit.verseNumber == null) return;
    try {
      let list = [];
      const translation = hit.translation || bibleTranslation || 'AVD';
      const isDownloaded = downloadedTranslations.has(translation) || (await isTranslationDownloaded(translation));

      if (isDownloaded) {
        const index = await getLocalBibleIndex(translation);
        if (index) {
          list = index.versesMap.get(`${hit.bookName}_${parseInt(hit.chapter)}`) || [];
        }
      }

      if (!list.length) {
        const { data } = await axios.get(
          `${BIBLE_API}/verses/${encodeURIComponent(hit.bookName)}/${hit.chapter}?&lang=arabic`
        );
        list = Array.isArray(data) ? data : [];
      }

      if (!list.length) return;
      const idx = list.findIndex((v) => v.verseNumber === hit.verseNumber);

      // Keep Book & Chapter picker states in sync
      const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
      if (book) {
        setBibleModalBook(book);
        setBibleModalChapter(hit.chapter);
      }

      onPresent({
        bookName: hit.bookName,
        chapter: hit.chapter,
        verses: list,
        startIndex: idx >= 0 ? idx : 0,
      });
    } catch (e) {
      console.error('Bible search present:', e);
      // Fallback: if offline, try loading AVD local index
      try {
        const index = await getLocalBibleIndex('AVD');
        if (index) {
          const list = index.versesMap.get(`${hit.bookName}_${parseInt(hit.chapter)}`) || [];
          if (list.length) {
            const idx = list.findIndex((v) => v.verseNumber === hit.verseNumber);
            const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
            if (book) {
              setBibleModalBook(book);
              setBibleModalChapter(hit.chapter);
            }
            onPresent({
              bookName: hit.bookName,
              chapter: hit.chapter,
              verses: list,
              startIndex: idx >= 0 ? idx : 0,
            });
          }
        }
      } catch (innerErr) {
        console.error('Offline AVD fallback failed:', innerErr);
      }
    }
  };

  const goToChapterFromSearch = (hit) => {
    const book = bibleModalBooks.find(b => b.bookName === hit.bookName);
    if (book) {
      setBibleModalBook(book);
      setBibleModalChapter(hit.chapter);
      setBibleSearchQuery('');
      if (typeof window !== 'undefined') localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: hit.bookName, chapter: hit.chapter }));
    }
  };

  return {
    isOpen,
    bibleSearchQuery, setBibleSearchQuery,
    bibleSearchResults, setBibleSearchResults,
    isSearchingBible,
    bibleModalBooks, setBibleModalBooks,
    bibleModalBook, setBibleModalBook,
    bibleModalChapters, setBibleModalChapters,
    bibleModalChapter, setBibleModalChapter,
    bibleModalVerses, setBibleModalVerses,
    bibleSelectedVerseIds, setBibleSelectedVerseIds,
    aiAnalysis, setAiAnalysis, showAiOptions, setShowAiOptions,
    bibleVerseFontSize, setBibleVerseFontSize,
    bibleAddedSuccess,
    bibleModalBrowseLoading,
    biblePickerOpen, setBiblePickerOpen,
    bibleBookPickerRef, bibleChapterPickerRef,
    isSavingBible,
    bibleVerseSpacing, handleSetBibleVerseSpacing,
    bibleViewMode, handleSetBibleViewMode,
    bibleHighlights,
    imageCardConfig, setImageCardConfig,
    prayModeActive, setPrayModeActive,
    highlightColorsList, setHighlightColorsList,
    showColorCustomizer, setShowColorCustomizer,
    customColorHex, setCustomColorHex,
    colorInputRef, handleTriggerColorPicker, handleColorPickerChange,
    handleApplyHighlight, handleVerseClick, handleVerseNoteClick,
    bibleTranslation, setBibleTranslation,
    availableTranslations,
    downloadedTranslations,
    isDownloadingTranslation,
    showBibleNavHeader,
    handleBibleScroll, toggleDownloadTranslation,
    compareModal, setCompareModal,
    compareData, isLoadingCompare,
    compareVerseNums,
    compareSelectedTranslations, setCompareSelectedTranslations,
    compareMobileTab, setCompareMobileTab,
    compareDesktopPage, setCompareDesktopPage,
    allColumns, totalPages, dpSafe, desktopColumns, mtSafe, mobileActiveCode,
    fetchCompareData, openCompare,
    verseNotes,
    noteModalConfig, setNoteModalConfig,
    noteText, setNoteText,
    isSubmittingNote,
    viewNoteConfig, setViewNoteConfig,
    handleSaveNote,
    closeBibleModal,
    getSelectedVersesRef,
    handleCopySelectedVerses,
    handleOpenImageCard,
    handleAiAnalysis,
    saveBibleToWorkspace,
    openBiblePresentation: onPresent,
    presentBibleFromSearchHit,
    goToChapterFromSearch,
  };
}

export function BibleForm({ controller }) {
  const router = useRouter();
  const { isLogin } = useContext(UserContext);
  const { t, language } = useLanguage();
  const {
    isOpen,
    bibleSearchQuery, setBibleSearchQuery, bibleSearchResults, setBibleSearchResults, isSearchingBible,
    bibleModalBooks, setBibleModalBooks, bibleModalBook, setBibleModalBook,
    bibleModalChapters, setBibleModalChapters, bibleModalChapter, setBibleModalChapter,
    bibleModalVerses, setBibleModalVerses, bibleSelectedVerseIds, setBibleSelectedVerseIds,
    aiAnalysis, setAiAnalysis, showAiOptions, setShowAiOptions, bibleVerseFontSize, setBibleVerseFontSize,
    bibleAddedSuccess, bibleModalBrowseLoading, biblePickerOpen, setBiblePickerOpen,
    bibleBookPickerRef, bibleChapterPickerRef, isSavingBible, bibleVerseSpacing,
    handleSetBibleVerseSpacing, bibleViewMode, handleSetBibleViewMode, bibleHighlights, imageCardConfig, setImageCardConfig,
    prayModeActive, setPrayModeActive, highlightColorsList, setHighlightColorsList,
    showColorCustomizer, setShowColorCustomizer, customColorHex, setCustomColorHex,
    colorInputRef, handleTriggerColorPicker, handleColorPickerChange, handleApplyHighlight,
    handleVerseClick, handleVerseNoteClick, bibleTranslation, setBibleTranslation,
    availableTranslations, downloadedTranslations, isDownloadingTranslation,
    showBibleNavHeader, handleBibleScroll, toggleDownloadTranslation, compareModal,
    setCompareModal, compareData, isLoadingCompare, compareVerseNums,
    compareSelectedTranslations, setCompareSelectedTranslations, compareMobileTab,
    setCompareMobileTab, compareDesktopPage, setCompareDesktopPage, allColumns,
    totalPages, dpSafe, desktopColumns, mtSafe, mobileActiveCode, fetchCompareData,
    openCompare, verseNotes, noteModalConfig, setNoteModalConfig, noteText, setNoteText,
    isSubmittingNote, viewNoteConfig, setViewNoteConfig, handleSaveNote, closeBibleModal,
    getSelectedVersesRef, handleCopySelectedVerses, handleOpenImageCard, handleAiAnalysis,
    saveBibleToWorkspace, openBiblePresentation, presentBibleFromSearchHit,
    goToChapterFromSearch
  } = controller;

  return (
    <>
          {/* This is the Bible search and reader */}
          {isOpen && (
            <Portal>
              {/* Fixed the wrapper by adding overflow-hidden to prevent background interaction */}
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 overflow-hidden">
                {/* Dynamic Background Blur */}
                <div className="absolute inset-0 bg-[#050505]/80 backdrop-blur-xl" onClick={closeBibleModal} />

                <div
                  className="relative w-full h-full sm:h-[85vh] max-w-4xl bg-white/[0.02] border border-white/10 sm:rounded-[2.5rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden backdrop-blur-2xl"
                >
                  {/* ── Top Bar ── */}
                  <div className="Top Bar shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/[0.07] bg-black/50 backdrop-blur-md rounded-t-xl">

                    {/* Offline */}
                    <button
                      onClick={() => isDownloadingTranslation !== bibleTranslation && toggleDownloadTranslation(bibleTranslation)}
                      disabled={isDownloadingTranslation === bibleTranslation}
                      className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-full border transition-all duration-150 active:scale-90
      ${downloadedTranslations.has(bibleTranslation) ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/[0.05] border-white/10"}
      ${isDownloadingTranslation === bibleTranslation ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {isDownloadingTranslation === bibleTranslation ? (
                        <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                      ) : downloadedTranslations.has(bibleTranslation) ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]" />
                      ) : (
                        <svg className="w-3 h-3 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 15V3m0 12-4-4m4 4 4-4" />
                          <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17" />
                        </svg>
                      )}
                    </button>

                    {/* Pill — compact, fits content only */}
                    <div className="relative flex items-center mx-auto bg-white/[0.08] rounded-full border border-white/[0.1] p-[3px]">
                      <div
                        className="absolute top-[3px] bottom-[3px] rounded-full bg-sky-500 shadow-[0_2px_8px_rgba(14,165,233,0.3)]"
                        style={{
                          width: `calc((100% - 6px) / ${availableTranslations.length})`,
                          transform: `translateX(calc(${availableTranslations.indexOf(bibleTranslation)} * 100%))`,
                          transition: "transform 0.18s cubic-bezier(0.4,0,0.2,1)",
                          willChange: "transform",
                        }}
                      />
                      {availableTranslations.map((tr) => (
                        <button
                          key={tr}
                          onClick={() => setBibleTranslation(tr)}
                          className={`relative z-10 px-3 py-1 text-[11px] font-bold tracking-wide rounded-full transition-colors duration-150 cursor-pointer whitespace-nowrap
          ${bibleTranslation === tr ? "text-white" : "text-white/40 hover:text-white/70"}`}
                        >
                          {tr}
                        </button>
                      ))}
                    </div>

                    {/* Close */}
                    <button
                      onClick={closeBibleModal}
                      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-white/[0.05] border border-white/10 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all duration-150 active:scale-90 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                  </div>

                  {/* Smart Navigation Hub - Smooth Chrome-like slide transition */}
                  <div
                    className={`shrink-0 overflow-hidden transition-all duration-200 ease-out ${
                      showBibleNavHeader
                        ? 'max-h-[400px] opacity-100 p-3 sm:p-5'
                        : 'max-h-0 opacity-0 p-0 pointer-events-none'
                    } bg-gradient-to-b from-black/40 to-transparent`}
                    dir="rtl"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        {/* Minimalist Search */}
                        <div className="relative flex-1 group">
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-sky-400 transition-colors" />
                          <input
                            type="text"
                            value={bibleSearchQuery}
                            onChange={(e) => setBibleSearchQuery(e.target.value)}
                            placeholder="ابحث بعمق..."
                            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-2.5 pr-10 pl-4 text-white text-sm focus:outline-none focus:bg-white/[0.06] focus:border-sky-500/30 transition-all placeholder:text-white/10"
                          />
                          {bibleSearchQuery && (
                            <button
                              onClick={() => setBibleSearchQuery('')}
                              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-white/30 transition-all z-20"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Compact Selectors */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setBiblePickerOpen(o => o === 'book' ? null : 'book')}
                            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-white text-xs font-bold transition-all flex items-center gap-2 ${biblePickerOpen === 'book' ? 'bg-sky-500/20 border-sky-500/50' : ''}`}
                          >
                            <span className="opacity-50 tracking-tighter">السفر:</span>
                            <span className="truncate max-w-[80px]">{bibleModalBook?.bookName || '...'}</span>
                          </button>

                          <button
                            onClick={() => setBiblePickerOpen(o => o === 'chapter' ? null : 'chapter')}
                            disabled={!bibleModalBook}
                            className={`px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-white text-xs font-bold transition-all flex items-center gap-2 ${biblePickerOpen === 'chapter' ? 'bg-sky-500/20 border-sky-500/50' : ''}`}
                          >
                            <span className="opacity-50">الأصحاح:</span>
                            <span>{bibleModalChapter || '0'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Smart Floating Pickers Area */}
                      <AnimatePresence>
                        {biblePickerOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.15 }}
                            className="bg-white/[0.02] border border-white/5 rounded-3xl"
                          >
                            <div
                              className="p-4 max-h-[30vh] overflow-y-auto custom-scrollbar"
                              data-lenis-prevent-wheel
                            >
                              {biblePickerOpen === 'book' ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                  {bibleModalBooks.map((book) => (
                                    <button
                                      key={book._id}
                                      className={`px-3 py-2 rounded-xl text-right text-[11px] font-medium transition-all ${bibleModalBook?.bookName === book.bookName ? 'bg-slate-700/80 text-slate-100 border border-slate-500/30 shadow-lg shadow-black/30' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white'}`}
                                      onClick={() => { setBibleModalBook(book); setBibleModalChapter(null); setBiblePickerOpen('chapter'); if (typeof window !== 'undefined') localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: book.bookName, chapter: null })); }}
                                    >
                                      {book.bookName}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                                  {bibleModalChapters.map((ch) => (
                                    <button
                                      key={ch}
                                      className={`h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all ${bibleModalChapter === ch ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'bg-white/5 text-white/40 hover:text-white'}`}
                                      onClick={() => { setBibleModalChapter(ch); setBiblePickerOpen(null); if (typeof window !== 'undefined' && bibleModalBook) localStorage.setItem(BIBLE_LAST_POS_KEY, JSON.stringify({ bookName: bibleModalBook.bookName, chapter: ch })); }}
                                    >
                                      {ch}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* --- MAIN SCROLL AREA - FIXED HEIGHT --- */}
                  {/* Added 'overscroll-contain' to stop the website from scrolling when this reaches the end */}
                  <div
                    onScroll={handleBibleScroll}
                    className="flex-1 overflow-y-auto min-h-0 overscroll-contain custom-scrollbar-thin"
                    dir="rtl"
                    data-lenis-prevent-wheel
                  >
                    <div className="p-4 sm:p-12 max-w-3xl mx-auto">
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
                      ) : bibleModalVerses.length > 0 ? (
                        <div className="space-y-10">
                          {/* Modern Chapter Indicator */}
                          <div className="flex items-end justify-between border-b border-white/5 pb-6">
                            <div>
                              <h1 className="text-3xl sm:text-5xl font-black text-white leading-none">
                                {bibleModalBook.bookName}
                              </h1>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="h-[2px] w-8 bg-sky-500" />
                                <span className="text-xs font-bold text-sky-400 uppercase tracking-tighter">أصحاح {bibleModalChapter}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => openBiblePresentation({ bookName: bibleModalBook.bookName, chapter: bibleModalChapter, verses: bibleModalVerses, startIndex: 0 })}
                              className="p-3 bg-white/5 hover:bg-sky-500 text-white rounded-2xl transition-all active:scale-90 group"
                            >
                              <Monitor className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            </button>
                          </div>

                          {/* The Reading Experience - Optimized for performance */}
                          <div className="space-y-6 pb-20">
                            {/* Global Controls Panel (Block Positioned - Ultra-Compact Mobile UI) */}
                            {bibleModalVerses.length > 0 && (
                              <div className="relative flex flex-col gap-2 p-2 sm:p-3.5 bg-slate-950/60 border border-white/10 rounded-2xl sm:rounded-3xl shadow-xl mb-3 sm:mb-6" dir="rtl">
                                <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-3">
                                  {/* Typography & Spacing controls */}
                                  <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap text-white text-xs">
                                    {/* Font Size Control */}
                                    <div className="flex items-center gap-1 sm:gap-2 bg-white/5 border border-white/[0.07] rounded-xl px-2 sm:px-3 py-1 sm:py-1.5">
                                      <span className="text-white/40 font-bold text-[10px] sm:text-xs">الخط:</span>
                                      <button
                                        onClick={() => setBibleVerseFontSize(prev => Math.max(16, prev - 2))}
                                        className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md sm:rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold text-[11px] sm:text-xs transition-all active:scale-90"
                                        title="Decrease font size"
                                      >
                                        -A
                                      </button>
                                      <span className="font-bold min-w-[16px] text-center text-[11px] sm:text-xs">{bibleVerseFontSize}</span>
                                      <button
                                        onClick={() => setBibleVerseFontSize(prev => Math.min(44, prev + 2))}
                                        className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md sm:rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold text-[11px] sm:text-xs transition-all active:scale-90"
                                        title="Increase font size"
                                      >
                                        +A
                                      </button>
                                    </div>

                                    {/* Spacing Control */}
                                    <div className="flex items-center gap-1 sm:gap-2 bg-white/5 border border-white/[0.07] rounded-xl px-2 sm:px-3 py-1 sm:py-1.5">
                                      <span className="text-white/40 font-bold text-[10px] sm:text-xs">المسافة:</span>
                                      <button
                                        onClick={() => handleSetBibleVerseSpacing(Math.max(2, bibleVerseSpacing - 2))}
                                        className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md sm:rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold text-[11px] sm:text-xs transition-all active:scale-90"
                                        title="Decrease spacing"
                                      >
                                        -
                                      </button>
                                      <span className="font-bold min-w-[20px] text-center text-[11px] sm:text-xs">{bibleVerseSpacing}px</span>
                                      <button
                                        onClick={() => handleSetBibleVerseSpacing(Math.min(36, bibleVerseSpacing + 2))}
                                        className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md sm:rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold text-[11px] sm:text-xs transition-all active:scale-90"
                                        title="Increase spacing"
                                      >
                                        +
                                      </button>
                                    </div>

                                    {/* View Mode Toggle: List (تحت بعض) vs Continuous (بجانب بعض) */}
                                    <div className="flex items-center bg-white/5 border border-white/[0.07] rounded-xl p-0.5">
                                      <button
                                        onClick={() => handleSetBibleViewMode('list')}
                                        className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[10px] sm:text-xs font-bold transition-all ${
                                          bibleViewMode === 'list'
                                            ? 'bg-sky-500 text-white shadow-sm'
                                            : 'text-white/40 hover:text-white'
                                        }`}
                                        title="عرض كل آية في سطر منفصل (تحت بعض)"
                                      >
                                        <List className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">عمودي</span>
                                      </button>
                                      <button
                                        onClick={() => handleSetBibleViewMode('paragraph')}
                                        className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[10px] sm:text-xs font-bold transition-all ${
                                          bibleViewMode === 'paragraph'
                                            ? 'bg-sky-500 text-white shadow-sm'
                                            : 'text-white/40 hover:text-white'
                                        }`}
                                        title="عرض متصل للآيات (بجانب بعض)"
                                      >
                                        <AlignJustify className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">متصل</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Selection quick actions */}
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                    <button
                                      onClick={() => setBibleSelectedVerseIds(new Set(bibleModalVerses.map(v => v._id)))}
                                      className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 border border-white/[0.07] text-slate-200 transition-all active:scale-95"
                                    >
                                      تحديد الكل
                                    </button>
                                    <button
                                      onClick={() => setBibleSelectedVerseIds(new Set())}
                                      className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 border border-white/[0.07] text-slate-300 transition-all active:scale-95"
                                    >
                                      إلغاء التحديد
                                    </button>

                                    {/* Save Selected to Workspace */}
                                    {bibleSelectedVerseIds.size > 0 && (
                                      <button
                                        onClick={saveBibleToWorkspace}
                                        disabled={isSavingBible || bibleAddedSuccess}
                                        className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-[10px] sm:text-xs font-black rounded-xl transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center gap-1
                                          ${bibleAddedSuccess ? 'bg-green-500 text-white' : 'bg-sky-500 hover:bg-sky-400 text-white'}
                                          disabled:opacity-50`}
                                      >
                                        {isSavingBible ? (
                                          <><Loader2 className="w-3 h-3 animate-spin" /> ...</>
                                        ) : bibleAddedSuccess ? (
                                          <><Check className="w-3 h-3" /> تم الحفظ</>
                                        ) : (
                                          <>
                                            <FolderPlus className="w-3 h-3" />
                                            حفظ ({bibleSelectedVerseIds.size})
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Verses Display */}
                            {bibleViewMode === 'paragraph' ? (
                              <div
                                className="font-arabic text-right transition-all"
                                dir="rtl"
                                style={{
                                  fontSize: `${bibleVerseFontSize}px`,
                                  lineHeight: `${1.8 + (bibleVerseSpacing / 30)}`,
                                }}
                              >
                                {bibleModalVerses.map((verse) => {
                                  const isSelectedIndividual = bibleSelectedVerseIds.has(verse._id);
                                  const existingNote = verseNotes[verse._id];
                                  const highlightColor = bibleHighlights[verse._id];
                                  const colorObj = highlightColor ? highlightColorsList?.find(c => c.id === highlightColor) : null;
                                  let hex = colorObj ? (colorObj.hex.startsWith('#') ? colorObj.hex : `#${colorObj.hex}`) : null;
                                  if (!hex && highlightColor) {
                                    if (highlightColor.startsWith('#')) hex = highlightColor;
                                    else if (highlightColor.startsWith('custom-')) {
                                      const raw = highlightColor.replace('custom-', '');
                                      if (/^[0-9a-fA-F]{3,8}$/.test(raw)) hex = '#' + raw;
                                    }
                                  }

                                  let inlineBg = 'transparent';
                                  let inlineBorder = 'transparent';
                                  let textColor = 'text-white/80 hover:text-white';

                                  if (hex) {
                                    inlineBg = `${hex}26`;
                                    inlineBorder = hex;
                                    textColor = 'text-white';
                                  } else if (isSelectedIndividual) {
                                    inlineBg = 'rgba(255, 255, 255, 0.05)';
                                    inlineBorder = 'rgba(255, 255, 255, 0.1)';
                                    textColor = 'text-white';
                                  }

                                  return (
                                    <span
                                      key={verse._id}
                                      onClick={() => handleVerseClick(verse._id)}
                                      style={{
                                        backgroundColor: inlineBg,
                                        border: inlineBorder !== 'transparent' ? `1px solid ${inlineBorder}` : '1px solid transparent',
                                        padding: '4px 6px',
                                        margin: '0',
                                        borderRadius: '5px',
                                        boxDecorationBreak: 'clone',
                                        WebkitBoxDecorationBreak: 'clone',
                                      }}
                                      className={`inline cursor-pointer transition-all duration-150 ${!hex && !isSelectedIndividual ? 'hover:bg-white/5' : ''} ${textColor}`}
                                    >
                                      <span
                                        className={`inline-flex items-center justify-center text-[10px] sm:text-xs font-black px-1.5 py-0.5 rounded-md ml-1 mr-0 select-none border transition-colors leading-none ${
                                          isSelectedIndividual
                                            ? 'text-sky-500/70 bg-white/5 border-white/10'
                                            : 'text-white/30 bg-white/5 border-white/10'
                                        }`}
                                        style={{ verticalAlign: 'middle', transform: 'translateY(-1px)' }}
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
                                      <span>{verse.text?.trim()}</span>
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
                                    onClick={handleVerseClick}
                                    onNoteClick={handleVerseNoteClick}
                                  />
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-10 py-40">
                          <BookOpen className="w-20 h-20 mb-4" />
                          <span className="text-sm font-bold uppercase tracking-[0.4em]">Select Wisdom</span>
                        </div>
                      )}
                    </div>
                  </div>

<AnimatePresence>
  {bibleSelectedVerseIds.size > 0 && (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      onDragEnd={(event, info) => {
        if (info.offset.y > 100 || info.velocity.y > 300) {
          setBibleSelectedVerseIds(new Set());
          setShowAiOptions(false);
          setAiAnalysis({ loading: false, type: null, text: '', error: null });
          setShowColorCustomizer(false);
        }
      }}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      className="absolute bottom-0 left-0 right-0 z-50 bg-[#0d0e15]/95 border-t border-white/10 backdrop-blur-2xl rounded-t-[1.5rem] shadow-[0_-15px_35px_rgba(0,0,0,0.6)] flex flex-col text-white overflow-hidden"
      dir="rtl"
    >
      {/* Pull bar */}
      <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1 shrink-0 cursor-grab active:cursor-grabbing" />

      <div className="flex flex-col gap-3 px-4 pb-4 pt-1">

        {/* Row: ref + close */}
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">تعديل الآية المحددة</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-sky-400" dir="ltr">{getSelectedVersesRef()}</span>
            <button
              onClick={() => {
                setBibleSelectedVerseIds(new Set());
                setShowAiOptions(false);
                setAiAnalysis({ loading: false, type: null, text: '', error: null });
                setShowColorCustomizer(false);
              }}
              className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all active:scale-95 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-1.5 hide-scrollbar" dir="ltr">
          <button
            onClick={handleCopySelectedVerses}
            className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Copy className="w-3.5 h-3.5 text-sky-400" /> {t('copy')}
          </button>

          {availableTranslations.length > 1 && (
            <button
              onClick={() => {
                const nums = bibleModalVerses
                  .filter(v => bibleSelectedVerseIds.has(v._id))
                  .map(v => v.verseNumber);
                openCompare(nums);
              }}
              className="flex-1 min-w-[90px] py-2.5 px-4 rounded-full bg-[#0a0f1d]/80 hover:bg-[#0f172a] border border-sky-500/40 text-sky-300 text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-[inset_0_0_20px_rgba(14,165,233,0.1),0_0_15px_rgba(14,165,233,0.2)] backdrop-blur-md relative overflow-hidden group/compare"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-sky-500/0 via-sky-400/10 to-sky-500/0 -translate-x-full group-hover/compare:translate-x-full transition-transform duration-1000" />
              <BookOpen className="w-3.5 h-3.5 text-sky-400" /> {t('compare')}
            </button>
          )}

          <button
            onClick={() => {
              const firstVerse = bibleModalVerses.find(v => bibleSelectedVerseIds.has(v._id));
              if (!firstVerse) return;
              setNoteText(verseNotes[firstVerse._id] || '');
              setNoteModalConfig({ type: 'bible', data: firstVerse, existingNote: verseNotes[firstVerse._id] });
            }}
            className="flex-1 min-w-[78px] py-2.5 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" /> {t('Note')}
          </button>

          <button
            onClick={() => {
              setShowAiOptions(p => !p);
              setAiAnalysis({ loading: false, type: null, text: '', error: null });
            }}
            className={`flex-1 min-w-[78px] py-2.5 px-3 rounded-full border text-[11px] font-black tracking-wider transition-all flex items-center justify-center gap-1 active:scale-95 relative overflow-hidden
              ${showAiOptions
                ? 'bg-violet-500/20 border-violet-400/50 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                : 'bg-white/5 hover:bg-violet-500/10 border-white/10 hover:border-violet-400/30 text-white hover:text-violet-300'
              }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> {t('Ai')}
          </button>
        </div>
 
        {/* AI Options */}
        {showAiOptions && (
          <div className="flex gap-2 shrink-0 animate-in fade-in slide-in-from-bottom-1 duration-150" dir="rtl">
            {[
              { type: 'explain',         label: 'تفسير', icon: BookOpen,  color: 'text-violet-400', border: 'border-violet-500/20 hover:border-violet-400/50 hover:bg-violet-500/5', glow: 'shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_22px_rgba(139,92,246,0.25)]' },
              { type: 'cross_reference', label: 'مراجع', icon: Link2,     color: 'text-sky-400',    border: 'border-sky-500/20 hover:border-sky-400/50 hover:bg-sky-500/5',           glow: 'shadow-[0_0_15px_rgba(14,165,233,0.15)] hover:shadow-[0_0_22px_rgba(14,165,233,0.25)]' },
              { type: 'practical',       label: 'تطبيق', icon: Lightbulb, color: 'text-amber-400',  border: 'border-amber-500/20 hover:border-amber-400/50 hover:bg-amber-500/5',     glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_22px_rgba(245,158,11,0.25)]' },
            ].map(({ type, label, icon: IconComponent, color, border, glow }) => (
              <button
                key={type}
                onClick={() => handleAiAnalysis(type)}
                disabled={aiAnalysis.loading}
                className={`flex-1 py-3 px-4 rounded-2xl bg-[#111322]/50 border ${border} ${glow} transition-all duration-300 flex flex-col items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 group`}
              >
                <IconComponent className={`w-5 h-5 ${color} group-hover:scale-110 group-active:scale-95 transition-transform duration-300`} />
                <span className="text-[11px] font-black text-slate-300 group-hover:text-white transition-colors duration-300">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* AI Response — no header bar, floating dismiss pill */}
        {(aiAnalysis.loading || aiAnalysis.text || aiAnalysis.error) && (
          <div className="relative rounded-2xl overflow-hidden border border-violet-500/20 bg-[#0c0f1e]/80 backdrop-blur-md shadow-[0_4px_24px_rgba(139,92,246,0.12)]">

            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span className="text-[10px] font-black text-violet-300 tracking-widest uppercase">
                  {aiAnalysis.type === 'explain' ? 'تفسير روحي' : aiAnalysis.type === 'cross_reference' ? 'مراجع كتابية' : 'تطبيق عملي'}
                </span>
              </div>
              <button
                onClick={() => setAiAnalysis({ loading: false, type: null, text: '', error: null })}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-red-500/15 text-white/25 hover:text-red-400 border border-white/8 hover:border-red-500/20 transition-all duration-150 text-[10px] font-bold"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>

            <div className="px-4 pb-4 max-h-52 overflow-y-auto custom-scrollbar-thin" dir="rtl">
              {aiAnalysis.loading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <div className="relative w-7 h-7">
                    <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-3 h-3 text-violet-400 animate-pulse" />
                  </div>
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
                </>
              ) : (
                <p className="text-[13px] leading-loose text-slate-200/90 font-arabic whitespace-pre-line">
                  {aiAnalysis.text}
                </p>
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
    </motion.div>
  )}
</AnimatePresence>


                  {/* Smart Progress Indicator */}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-sky-500/50 to-transparent" />
                </div>
              </div>

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
                        className="absolute inset-0 bg-[#020205]/80 backdrop-blur-sm transition-opacity"
                        onClick={() => setCompareModal(false)}
                      />

                      <motion.div
                        initial={{ y: 50, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 30, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        style={{ willChange: 'transform, opacity' }}
                        className="relative w-full sm:max-w-6xl h-[92vh] sm:h-[85vh] rounded-t-[2rem] sm:rounded-[2rem] bg-[#0A0A14]/95 backdrop-blur-2xl border-t sm:border border-white/[0.08] shadow-2xl sm:shadow-[0_0_60px_-15px_rgba(14,165,233,0.15)] flex flex-col overflow-hidden ring-1 ring-white/5"
                      >
                        {/* ── Compare Modal Header ── */}
                        <div className="shrink-0 px-5 sm:px-8 py-5 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-white/10 flex items-center justify-center shadow-[inset_0_0_12px_rgba(56,189,248,0.2)]">
                                <span className="text-lg drop-shadow-md">⚖️</span>
                              </div>
                              <div>

                                <p className="text-sm sm:text-base font-bold text-white/95 tracking-wide" dir="rtl">
                                  {bibleModalBook?.bookName} {bibleModalChapter}
                                  {compareVerseNums.length > 0 && (
                                    <span className="text-white/40 font-medium ml-1">
                                      — {compareVerseNums.length > 1 ? `آيات ${compareVerseNums.join('، ')}` : `آية ${compareVerseNums[0]}`}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => setCompareModal(false)}
                              className="group p-2.5 rounded-full bg-white/5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-300"
                            >
                              <X className="w-4 h-4 text-white/50 group-hover:text-red-400 group-active:scale-90 transition-transform" />
                            </button>
                          </div>

                          {/* Modern Translation Multi-selector Pills */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold text-white/30 mr-1 shrink-0 flex items-center gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-white/30" />
                              الترجمات المعروضة:
                            </span>
                            {availableTranslations.map(tr => {
                              const isSelected = compareSelectedTranslations.includes(tr);
                              return (
                                <button
                                  key={tr}
                                  onClick={async () => {
                                    if (isSelected && compareSelectedTranslations.length === 1) return;
                                    const next = isSelected
                                      ? compareSelectedTranslations.filter(t => t !== tr)
                                      : [...compareSelectedTranslations, tr];
                                    setCompareSelectedTranslations(next);
                                    setCompareMobileTab(0);
                                    setCompareDesktopPage(0);
                                    await fetchCompareData(compareVerseNums, next);
                                  }}
                                  className={`px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-wider transition-all duration-300 active:scale-95 border ${isSelected
                                    ? 'bg-white text-black border-white shadow-[0_0_15px_-3px_rgba(255,255,255,0.3)]'
                                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                >
                                  {tr}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── Mobile Tab Bar ── */}
                        {!isLoadingCompare && allColumns.length > 1 && (
                          <div className="sm:hidden shrink-0 flex border-b border-white/[0.06] bg-black/20 overflow-x-auto hide-scrollbar px-2">
                            {allColumns.map((tr, idx) => (
                              <button
                                key={tr}
                                onClick={() => setCompareMobileTab(idx)}
                                className={`relative flex-1 min-w-[90px] px-4 py-4 text-[13px] font-bold tracking-wide transition-colors whitespace-nowrap ${idx === mtSafe ? 'text-sky-400' : 'text-white/40 hover:text-white/70'
                                  }`}
                              >
                                {tr}
                                {idx === mtSafe && (
                                  <motion.div
                                    layoutId="activeTabMobile"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 rounded-t-full shadow-[0_-2px_8px_rgba(56,189,248,0.5)]"
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* ── Compare Body ── */}
                        <div className="flex-1 overflow-hidden flex min-h-0 bg-[#0A0A14]/50">
                          {isLoadingCompare ? (
                            <div className="flex-1 flex flex-col sm:flex-row gap-0 min-h-0">
                              {[...Array(Math.min(3, compareSelectedTranslations.length || 2))].map((_, i) => (
                                <div key={i} className="flex-1 p-6 sm:p-8 border-b sm:border-b-0 sm:border-r border-white/[0.04] last:border-0 space-y-6">
                                  <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse" />
                                  {[...Array(compareVerseNums.length || 2)].map((_, j) => (
                                    <div key={j} className="space-y-3">
                                      <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />
                                      <div className="h-4 bg-white/5 rounded w-full animate-pulse delay-75" />
                                      <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse delay-100" />
                                      <div className="h-4 bg-white/5 rounded w-4/6 animate-pulse delay-150" />
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : allColumns.length > 0 ? (
                            <>
                              {/* DESKTOP */}
                              <div className="hidden sm:flex flex-1 min-h-0 relative overflow-hidden">
                                {desktopColumns.map((tr) => (
                                  <div key={tr} className="flex-1 border-r border-white/[0.04] last:border-0 overflow-y-auto custom-scrollbar">
                                    <CompareColumn
                                      translationCode={tr}
                                      verses={compareData?.[tr] || []}
                                      isActive={true}
                                    />
                                  </div>
                                ))}

                                {totalPages > 1 && (
                                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#12121A]/80 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] z-10 ring-1 ring-white/5">
                                    <button
                                      onClick={() => setCompareDesktopPage(p => Math.max(0, p - 1))}
                                      disabled={dpSafe === 0}
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                                    >
                                      <ChevronDown className="w-4 h-4 rotate-90" />
                                    </button>

                                    <div className="flex gap-2 items-center px-2">
                                      {Array.from({ length: totalPages }).map((_, pi) => (
                                        <button
                                          key={pi}
                                          onClick={() => setCompareDesktopPage(pi)}
                                          className={`h-1.5 rounded-full transition-all duration-500 ease-out ${pi === dpSafe
                                            ? 'bg-sky-400 w-6 shadow-[0_0_10px_rgba(56,189,248,0.5)]'
                                            : 'bg-white/20 w-1.5 hover:bg-white/40 hover:w-3'
                                            }`}
                                        />
                                      ))}
                                    </div>

                                    <button
                                      onClick={() => setCompareDesktopPage(p => Math.min(totalPages - 1, p + 1))}
                                      disabled={dpSafe >= totalPages - 1}
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                                    >
                                      <ChevronDown className="w-4 h-4 -rotate-90" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* ── MOBILE (With Native Touch Swipe - طلقة) ── */}
                              <div
                                className="sm:hidden flex-1 flex flex-col min-h-0 overflow-hidden relative w-full"
                                onTouchStart={(e) => {
                                  e.currentTarget.dataset.startX = e.targetTouches[0].clientX;
                                }}
                                onTouchMove={(e) => {
                                  e.currentTarget.dataset.endX = e.targetTouches[0].clientX;
                                }}
                                onTouchEnd={(e) => {
                                  const start = parseFloat(e.currentTarget.dataset.startX);
                                  const end = parseFloat(e.currentTarget.dataset.endX);

                                  // لو مفيش سحب حقيقي أو لمسة عادية نوقف
                                  if (!start || !end) return;

                                  const distance = start - end;
                                  const swipeThreshold = 50; // حساسية السحب (تقدر تقللها لو عايزه يقلب أسرع)

                                  if (distance > swipeThreshold && mtSafe < allColumns.length - 1) {
                                    // سحب لليسار -> الترجمة التالية
                                    setCompareMobileTab(prev => prev + 1);
                                  } else if (distance < -swipeThreshold && mtSafe > 0) {
                                    // سحب لليمين -> الترجمة السابقة
                                    setCompareMobileTab(prev => prev - 1);
                                  }

                                  // تصفير القيم بعد السحب
                                  e.currentTarget.dataset.startX = '';
                                  e.currentTarget.dataset.endX = '';
                                }}
                              >
                                {mobileActiveCode && compareData?.[mobileActiveCode] ? (
                                  <motion.div
                                    key={mobileActiveCode}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="flex-1 overflow-y-auto custom-scrollbar w-full h-full pb-6"
                                  >
                                    <CompareColumn
                                      translationCode={mobileActiveCode}
                                      verses={compareData[mobileActiveCode]}
                                      isActive={true}
                                    />
                                  </motion.div>
                                ) : (
                                  <div className="flex-1 flex items-center justify-center">
                                    <p className="text-white/30 text-sm font-medium">لا توجد بيانات</p>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex-1 flex items-center justify-center">
                              <div className="text-center opacity-40">
                                <div className="text-5xl mb-4 drop-shadow-xl">⚖️</div>
                                <p className="text-base font-bold text-white tracking-wide">لا توجد بيانات للمقارنة</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-sky-500/40 to-transparent blur-[0.5px]" />
                      </motion.div>
                    </motion.div>
                  </Portal>
                )}
              </AnimatePresence>
            </Portal>
          )}
      {/* This is the Add/Edit Note form */}
      {noteModalConfig && (
        <Portal>
          <div
            className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-6"
            style={{ isolation: 'isolate' }}
          >
            {/* Backdrop - stopPropagation prevents bible modal from reacting */}
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); setNoteModalConfig(null); setNoteText(''); }}
            />
            <div
              className="relative w-full sm:max-w-lg bg-gradient-to-b from-[#0d1a2d] to-[#080f1c] border border-indigo-500/20 rounded-t-3xl sm:rounded-3xl shadow-[0_0_60px_-10px_rgba(99,102,241,0.3)] overflow-hidden flex flex-col"
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
                      {noteModalConfig.type === 'bible' ? `Verse ${noteModalConfig.data.verseNumber}` : 'Hymn'}
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
              <div className="mx-6 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-sm text-white/50 leading-relaxed line-clamp-3" dir="rtl">
                  {noteModalConfig.type === 'bible' ? noteModalConfig.data.text : noteModalConfig.data.title}
                </p>
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
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            <div
              className="relative w-full max-w-md bg-gradient-to-b from-[#0d1a2d] to-[#080f1c] border border-indigo-500/30 rounded-3xl shadow-[0_0_80px_-10px_rgba(99,102,241,0.4)] overflow-hidden"
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

export default function BibleFormPage() {
  const router = useRouter();
  const controller = useBibleForm({
    isOpen: true,
    presentationActive: false,
    onClose: () => router.back(),
    onPresent: () => { },
  });

  return <BibleForm controller={controller} />;
}
