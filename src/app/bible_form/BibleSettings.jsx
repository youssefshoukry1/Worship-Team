'use client';

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignJustify, Check, Download, List, Loader2, SlidersHorizontal, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { showToast } from '../components/ToastContainer';
import styles from './BibleSettings.module.css';
import { useTabPageActive } from '../components/TabPageActivity';
import { waitForNavigationIdle } from '../utils/navigationWork';

// Opening this surface owns only its own state, never the chapter's render.
export default function BibleSettings({ ref, controller, containerRef, onDeselectAll }) {
  const { t, language } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

  const close = useCallback(() => {
    openIntentRef.current = false;
    pendingOpenRef.current = false;
    justClosedSettingsRef.current = Date.now();
    setIsSettingsOpen(false);
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
                          className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition-colors cursor-pointer ${isSelected
                            ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm'
                            : 'bg-black/20 border-white/10 text-gray-200 hover:bg-black/40 hover:text-white'
                            }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`w-2.5 h-2.5 rounded-full border shrink-0 flex items-center justify-center ${isSelected ? 'border-sky-400 bg-sky-400' : 'border-white/30'}`}>
                              {isSelected && <div className="w-1 h-1 rounded-full bg-app-panel" />}
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
                              className="p-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition-colors active:scale-95 shrink-0"
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
                          disabled={bibleVerseGap <= -8}
                          className="h-5 px-2 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] transition-colors active:bg-white/20 disabled:opacity-30"
                          aria-label={language === 'ar' ? 'تقليل المسافة بين الآيات' : 'Decrease verse gap'}
                        >
                          -
                        </button>
                        <output className="font-bold min-w-[22px] px-1 text-center text-[11px] text-sky-400" aria-live="polite">{bibleVerseGap + 6}px</output>
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
