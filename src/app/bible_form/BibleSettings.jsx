'use client';

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignJustify, Check, Download, List, Loader2, SlidersHorizontal, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import styles from './BibleSettings.module.css';
import { ARABIC_TRANSLATIONS, ENGLISH_TRANSLATIONS } from './translationLanguages';
import { useTabPageActive } from '../components/TabPageActivity';
import { waitForNavigationIdle } from '../utils/navigationWork';

function SettingsScrollArea({ open, className, children }) {
  const viewport = useRef(null);
  const thumb = useRef(null);
  useEffect(() => {
    if (!open) return;
    const area = viewport.current;
    const bar = thumb.current;
    const measure = () => {
      const height = area.clientHeight;
      const total = area.scrollHeight;
      bar.hidden = total <= height;
      if (bar.hidden) return;
      bar.style.height = `${height * height / total}px`;
      bar.style.top = `${area.scrollTop * height / total}px`;
    };
    bar.style.opacity = '1';
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    for (const child of area.children) observer.observe(child);
    const contentObserver = new MutationObserver(measure);
    contentObserver.observe(area, { childList: true, subtree: true });
    let hideTimer;
    const onScroll = () => {
      measure();
      bar.style.opacity = '1';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { bar.style.opacity = '0'; }, 180);
    };
    area.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      clearTimeout(hideTimer);
      area.removeEventListener('scroll', onScroll);
    };
  }, [open]);
  return (
    <div className="relative min-h-0">
      <div ref={viewport} className={`hide-scrollbar ${className}`}>{children}</div>
      <span ref={thumb} hidden aria-hidden="true" className="pointer-events-none absolute end-0.5 z-10 w-[3px] rounded-full bg-slate-400/70 transition-opacity duration-150 motion-reduce:transition-none" />
    </div>
  );
}

// Opening this surface owns only its own state, never the chapter's render.
export default function BibleSettings({ ref, controller, containerRef, onDeselectAll, children }) {
  const { t, language } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filter, setFilter] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [host, setHost] = useState(null);
  const settingsPanelRef = useRef(null);
  const settingsBtnRef = useRef(null);
  const justClosedSettingsRef = useRef(0);
  const openIntentRef = useRef(false);
  const pendingOpenRef = useRef(false);
  const panelId = useId();
  const pageActive = useTabPageActive();
  const {
    availableTranslations, downloadedTranslations, isDownloadingTranslation,
    bibleTranslation, setBibleTranslation, toggleDownloadTranslation,
    bibleViewMode, handleSetBibleViewMode, bibleVerseFontSize, setBibleVerseFontSize,
    bibleVerseSpacing, handleSetBibleVerseSpacing, bibleVerseGap, handleSetBibleVerseGap,
    setBibleSelectedVerseIds, bibleModalVerses,
  } = controller;
  const visibleTranslations = availableTranslations.filter(code =>
    filter === 'All' || (filter === 'AR' ? ARABIC_TRANSLATIONS : ENGLISH_TRANSLATIONS).has(code)
  );
  useEffect(() => {
    if (!filterOpen) return;
    const dismiss = event => {
      if (!filterRef.current?.contains(event.target)) setFilterOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [filterOpen]);

  const close = useCallback(() => {
    openIntentRef.current = false;
    pendingOpenRef.current = false;
    justClosedSettingsRef.current = Date.now();
    setIsSettingsOpen(false);
    setFilterOpen(false);
  }, []);
  const toggle = () => {
    if (openIntentRef.current) close();
    else {
      const target = host || containerRef.current;
      if (!target) return;
      openIntentRef.current = true;
      if (host) setIsSettingsOpen(true);
      else {
        // For a tap before idle preparation, commit the invisible surface first.
        // Its closed styles must exist before starting the native transition.
        pendingOpenRef.current = true;
        setHost(target);
      }
    }
  };
  useEffect(() => {
    if (!pageActive) return;
    let cancelled = false, idle, timer;
    const prepare = async () => {
      await waitForNavigationIdle();
      if (!cancelled) setHost(containerRef.current);
    };
    if (window.requestIdleCallback) idle = window.requestIdleCallback(prepare, { timeout: 1500 });
    else timer = setTimeout(prepare, 200);
    return () => {
      cancelled = true; clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, [containerRef, pageActive]);

  useEffect(() => {
    if (!host || !pendingOpenRef.current) return;
    let second;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (!pendingOpenRef.current) return;
        pendingOpenRef.current = false;
        setIsSettingsOpen(true);
      });
    });
    return () => { cancelAnimationFrame(first); if (second !== undefined) cancelAnimationFrame(second); };
  }, [host]);
  useImperativeHandle(ref, () => ({
    dismissForVerseTap() {
      if (openIntentRef.current) { close(); return true; }
      return Date.now() - justClosedSettingsRef.current < 400;
    },
  }), [close]);

  useEffect(() => {
    if (!pageActive || !isSettingsOpen) return;
    const outside = event => {
      if (settingsBtnRef.current?.contains(event.target)) return;
      if (!settingsPanelRef.current?.contains(event.target)) close();
    };
    const escape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation();
      close(); settingsBtnRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [isSettingsOpen, close, pageActive]);

  return <>
    <button
      ref={settingsBtnRef}
      onClick={toggle}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={isSettingsOpen}
      aria-controls={panelId}
      className="p-3 hover:bg-sky-500/20 text-white rounded-2xl transition-colors active:scale-90 group"
      title={language === 'ar' ? 'الإعدادات' : 'Settings'}
    >
      <SlidersHorizontal className="w-5 h-5 group-hover:scale-110 transition-transform text-sky-400" />
    </button>
    {host && createPortal(
      <>
        {isSettingsOpen && (
          <div
            key="settings-backdrop"
            className="fixed inset-0 z-40 bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              close();
            }}
          />
        )}
          <div
            ref={settingsPanelRef}
            data-state={isSettingsOpen ? 'open' : 'closed'}
            style={{ opacity: isSettingsOpen ? 1 : 0 }}
            id={panelId}
            role="dialog"
            aria-labelledby={`${panelId}-title`}
            aria-hidden={!isSettingsOpen || undefined}
            inert={!isSettingsOpen ? true : undefined}
            data-bible-settings
            className={`${styles.panel} absolute top-16 sm:top-20 left-2 sm:left-4 z-50 w-[215px] sm:w-[245px] max-w-[62vw] max-h-[min(72vh,520px)] rounded-2xl sm:rounded-3xl border flex flex-col overflow-hidden border-white/10`}
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
              <span id={`${panelId}-title`} className="text-xs font-bold text-white tracking-wide">
                {language === 'ar' ? 'الإعدادات' : 'Settings'}
              </span>
              <button
                onClick={close}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors active:scale-90"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Scrollable Settings Content */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar-thin">
              {children}
              {/* Section 1: Translations */}
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-gray-400/90 uppercase tracking-widest px-1">
                  {language === 'ar' ? 'الترجمة' : 'Translation'}
                </span>
                <div ref={filterRef} className="relative" onBlur={e => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setFilterOpen(false);
                }} onKeyDown={e => {
                  if (e.key === 'Escape' && filterOpen) {
                    e.stopPropagation();
                    setFilterOpen(false);
                    filterRef.current.firstElementChild.focus();
                  }
                }}>
                  <button type="button" aria-expanded={filterOpen}
                    aria-label={`${language === 'ar' ? 'لغة الترجمات' : 'Translation language'}: ${filter}`}
                    onClick={() => setFilterOpen(open => !open)}
                    className="block h-6 min-w-9 rounded-lg bg-white/5 text-[10px] font-bold text-sky-400">
                    {filter}
                  </button>
                  {['All', 'AR', 'EN'].filter(option => option !== filter).map((option, index) => (
                    <button key={option} type="button" disabled={!filterOpen} aria-hidden={!filterOpen}
                      className={`absolute start-full ms-1 z-20 h-6 min-w-9 rounded-lg border border-white/10 bg-app-panel text-[10px] font-bold text-white shadow-lg transition-[opacity,translate] duration-100 ease-out motion-reduce:transition-none ${index === 0 ? 'bottom-1/2 mb-0.5' : 'top-1/2 mt-0.5'} ${filterOpen ? 'opacity-100 translate-y-0' : `pointer-events-none opacity-0 ${index === 0 ? 'translate-y-1' : '-translate-y-1'}`}`}
                      onClick={() => {
                        setFilter(option);
                        setFilterOpen(false);
                        filterRef.current.firstElementChild.focus();
                      }}>
                      {option}
                    </button>
                  ))}
                </div>
                </div>
                <div className="p-1.5 rounded-xl border border-transparent bg-black/30 space-y-1">
                  <SettingsScrollArea open={isSettingsOpen} className="grid auto-rows-[2rem] max-h-[11rem] gap-1 overflow-y-auto overscroll-y-contain">
                    {visibleTranslations.map((tr) => {
                      const label = { ONAV: 'KEHM', ARBWBTC: 'ERV-AR' }[tr] ?? tr;
                      const isDownloaded = downloadedTranslations.has(tr);
                      const isDownloading = isDownloadingTranslation === tr;
                      const isSelected = bibleTranslation === tr;
                      return (
                        <div
                          key={tr}
                          onClick={() => {
                            if (isDownloaded) {
                              setBibleTranslation(tr);
                            } else if (!isDownloading) {
                              toggleDownloadTranslation(tr, true);
                            }
                          }}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-lg border border-transparent transition-colors cursor-pointer ${isSelected
                            ? 'bg-sky-500/20 text-white'
                            : 'bg-black/20 text-gray-200 hover:bg-black/40 hover:text-white'
                            }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`w-2.5 h-2.5 rounded-full border shrink-0 flex items-center justify-center ${isSelected ? 'border-sky-400 bg-sky-400' : 'border-white/30'}`}>
                              {isSelected && <div className="w-1 h-1 rounded-full bg-app-panel" />}
                            </div>
                            <span className="text-[11px] font-bold tracking-wide truncate">{label}</span>
                          </div>

                          {isDownloading ? (
                            <Loader2 className="w-3 h-3 animate-spin text-sky-400 shrink-0" />
                          ) : !isDownloaded ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isDownloading) {
                                  toggleDownloadTranslation(tr, true);
                                }
                              }}
                              className="p-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-colors active:scale-95 shrink-0"
                              title={language === 'ar' ? `تحميل ترجمة ${label}` : `Download ${label}`}
                            >
                              <Download className="w-3 h-3" />
                            </button>
                          ) : (
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </SettingsScrollArea>
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
                        className={`px-1 sm:px-1.5 py-0.5 rounded flex items-center justify-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-bold transition-colors shrink-0 ${bibleViewMode === 'list'
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
                        className={`px-1 sm:px-1.5 py-0.5 rounded flex items-center justify-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-bold transition-colors min-w-0 ${bibleViewMode === 'paragraph'
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
                        className="h-5 px-1.5 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-colors active:bg-white/20"
                        title="Decrease font size"
                      >
                        -A
                      </button>
                      <span className="font-bold min-w-[20px] px-1 text-center text-[11px] text-sky-400">{bibleVerseFontSize}</span>
                      <button
                        onClick={() => setBibleVerseFontSize(prev => Math.min(44, prev + 2))}
                        className="h-5 px-1.5 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-colors active:bg-white/20"
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
                        className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-colors active:bg-white/20"
                        title="Decrease spacing"
                      >
                        -
                      </button>
                      <span className="font-bold min-w-[22px] px-1 text-center text-[11px] text-sky-400">{bibleVerseSpacing}px</span>
                      <button
                        onClick={() => handleSetBibleVerseSpacing(Math.min(36, bibleVerseSpacing + 2))}
                        className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-colors active:bg-white/20"
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
                          disabled={bibleVerseGap <= -10}
                          className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-colors active:bg-white/20 disabled:opacity-30"
                          aria-label={language === 'ar' ? 'تقليل المسافة بين الآيات' : 'Decrease verse gap'}
                        >
                          -
                        </button>
                        <output className="font-bold min-w-[22px] px-1 text-center text-[11px] text-sky-400" aria-live="polite">{bibleVerseGap + 10}px</output>
                        <button
                          onClick={() => handleSetBibleVerseGap(bibleVerseGap + 2)}
                          disabled={bibleVerseGap >= 32}
                          className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-colors active:bg-white/20 disabled:opacity-30"
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
                      className="flex-1 py-1.5 text-[10px] font-bold rounded-md bg-black/20 hover:bg-black/40 border border-white/10 text-slate-200 transition-colors active:scale-95 text-center"
                    >
                      {t("selectAll")}
                    </button>
                    <button
                      onClick={onDeselectAll}
                      className="flex-1 py-1.5 text-[10px] font-bold rounded-md bg-black/20 hover:bg-black/40 border border-white/10 text-slate-300 transition-colors active:scale-95 text-center"
                    >
                      {t("deselectAll")}
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
      </>
    , host)}
  </>;
}
