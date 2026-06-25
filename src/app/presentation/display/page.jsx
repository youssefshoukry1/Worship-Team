'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresentation } from '../../hooks/usePresentation';
import { useSearchParams } from 'next/navigation';
import { Wifi, WifiOff, Mic, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Suspense } from 'react';
import ChordLyrics from '../../components/ChordLyrics';

/* ─── Simplified Style for Max Performance ─── */
const grainStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@400;600&family=IM+Fell+English+SC&display=swap');

  /* Hide layout navbar/header on display page */
  body > nav,
  body > header,
  #__next > nav,
  #__next > header,
  nav:not(.display-ignore),
  header:not(.display-ignore) {
    display: none !important;
  }

  /* Hide verse/section numbers rendered inside ChordLyrics in presentation mode */
  .presentation-wrapper .verse-number,
  .presentation-wrapper [class*="verse-num"],
  .presentation-wrapper [class*="section-num"],
  .presentation-wrapper [class*="sectionNumber"],
  .presentation-wrapper [class*="verseNumber"] {
    display: none !important;
  }

  @keyframes chord-appear {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes badge-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .slide-text {
    font-family: 'Amiri', Georgia, serif;
    line-height: 1.85;
    letter-spacing: 0.01em;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8);
  }

  .chord-pill {
    animation: chord-appear 0.4s ease both;
  }

  .status-badge {
    animation: badge-in 0.5s ease both;
  }
`;

/* ─── Module-level style constants ──────────────────────────────────────────
   Defined outside components so the same object reference is reused every
   render, letting React's shallow-equality reconciliation bail out early
   instead of allocating fresh objects on every re-render.
   Only truly static styles live here; anything that depends on runtime
   props or state remains inline where it appears.
────────────────────────────────────────────────────────────────────────────*/
const S = {
    grainBg: {
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, #1a1008 0%, #0a0806 40%, #000000 100%)'
    },
    badgeConnected: {
        background: 'rgba(20,40,20,0.55)',
        border: '1px solid rgba(74,222,128,0.2)',
        boxShadow: '0 0 12px rgba(74,222,128,0.08)',
    },
    badgeDisconnected: {
        background: 'rgba(40,10,10,0.55)',
        border: '1px solid rgba(248,113,113,0.2)',
    },
    closeBtn: {
        width: 38,
        height: 38,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    hymnLabel: {
        fontFamily: "'IM Fell English SC', serif",
        fontSize: '13px',
        letterSpacing: '0.12em',
        color: 'rgba(210,160,80,0.35)',
    },
    crossWrapper: { position: 'relative', width: 64, height: 64 },
    crossGlow: {
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle, rgba(210,160,80,0.08) 0%, transparent 70%)',
        filter: 'blur(8px)',
    },
    waitingLabel: {
        fontFamily: "'IM Fell English SC', serif",
        fontSize: '13px',
        letterSpacing: '0.35em',
        color: 'rgba(255,255,255,0.18)',
        textTransform: 'uppercase',
        marginBottom: '8px',
    },
    waitingRoom: {
        fontFamily: 'monospace',
        fontSize: '11px',
        letterSpacing: '0.2em',
        color: 'rgba(210,160,80,0.18)',
    },
    connectingSpinner: { animation: 'spin 1.2s linear infinite', transformOrigin: 'center' },
    connectingLabel: {
        fontFamily: "'IM Fell English SC', serif",
        fontSize: '12px',
        letterSpacing: '0.35em',
        color: 'rgba(255,255,255,0.2)',
        textTransform: 'uppercase',
    },
    slideTitle: {
        fontFamily: "'Amiri', serif",
        fontSize: 'clamp(14px, 1.8vw, 20px)',
        letterSpacing: '0.25em',
        color: 'rgba(210,160,80,0.55)',
        padding: '6px 24px',
        borderRadius: '999px',
        border: '1px solid rgba(210,160,80,0.12)',
        background: 'rgba(210,160,80,0.04)',
        backdropFilter: 'blur(8px)',
        whiteSpace: 'nowrap',
    },
    chordPillText: {
        fontFamily: "'Cinzel', serif",
        fontSize: 'clamp(14px, 1.6vw, 20px)',
        fontWeight: 600,
        color: 'rgba(140,220,255,0.9)',
        letterSpacing: '0.05em',
    },
    liveAudioBadge: {
        background: 'rgba(5,40,25,0.6)',
        border: '1px solid rgba(52,211,153,0.25)',
        backdropFilter: 'blur(10px)',
    },
    liveAudioText: { fontSize: 11, letterSpacing: '0.15em', color: 'rgba(52,211,153,0.8)', fontFamily: 'monospace' },
    rootFont: { fontFamily: "'Amiri', serif" },
};

function GrainBackground() {
    return (
        <>
            <style>{grainStyle}</style>
            {/* Deep atmospheric base (Static for performance) */}
            <div
                className="fixed inset-0 z-0 pointer-events-none"
                style={S.grainBg}
            />
        </>
    );
}

function ConnectionBadge({ isConnected, dataShowId }) {
    return (
        <div className="absolute top-5 right-5 z-50 status-badge">
            {isConnected ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full backdrop-blur-md"
                    style={S.badgeConnected}
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                    </span>
                    <span className="text-xs font-mono tracking-widest text-green-300/80">
                        {dataShowId}
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full backdrop-blur-md"
                    style={S.badgeDisconnected}
                >
                    <WifiOff size={11} className="text-red-400" />
                    <span className="text-xs font-mono tracking-widest text-red-400/70">Connecting…</span>
                </div>
            )}
        </div>
    );
}

function SlideCounter({ current, total }) {
    // Dots indicator — subtle, bottom center
    if (!total || total <= 1) return null;
    return (
        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {Array.from({ length: total }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        width: i === current ? '20px' : '5px',
                        height: '3px',
                        borderRadius: '2px',
                        background: i === current
                            ? 'rgba(210,160,80,0.5)'
                            : 'rgba(255,255,255,0.1)',
                        transition: 'all 0.4s ease',
                    }}
                />
            ))}
        </div>
    );
}

function CloseButton() {
    const handleClose = () => {
        // Try to close the window (works if opened via window.open)
        if (window.opener) {
            window.close();
        } else {
            window.history.back();
        }
    };

    return (
        <button
            onClick={handleClose}
            className="absolute bottom-6 right-6 z-50 group"
            title="Close display"
            style={S.closeBtn}
            onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255,80,80,0.4)';
                e.currentTarget.style.background = 'rgba(255,50,50,0.08)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            }}
        >
            {/* X icon */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="1" y1="1" x2="13" y2="13" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="1" x2="1" y2="13" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        </button>
    );
}

function HymnLabel({ title }) {
    if (!title) return null;
    return (
        <div
            className="absolute top-5 left-5 z-10"
            style={S.hymnLabel}
        >
            {title}
        </div>
    );
}

function WaitingState({ dataShowId }) {
    return (
        <motion.div
            key="waiting"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center flex flex-col items-center gap-6"
        >
            {/* Decorative cross with golden tint */}
            <div style={S.crossWrapper}>
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                    <rect x="28" y="4" width="8" height="56" rx="4" fill="rgba(210,160,80,0.12)" />
                    <rect x="4" y="22" width="56" height="8" rx="4" fill="rgba(210,160,80,0.12)" />
                </svg>
                {/* Glow behind cross */}
                <div style={S.crossGlow} />
            </div>

            <div>
                <p style={S.waitingLabel}>
                    Waiting for presenter
                </p>
                {dataShowId && (
                    <p style={S.waitingRoom}>
                        Room · {dataShowId}
                    </p>
                )}
            </div>
        </motion.div>
    );
}

function ConnectingState() {
    return (
        <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-5"
        >
            {/* Elegant spinner */}
            <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(210,160,80,0.5)" strokeWidth="2"
                    strokeDasharray="25 76"
                    strokeLinecap="round"
                    style={S.connectingSpinner}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </svg>
            <p style={S.connectingLabel}>
                Connecting
            </p>
        </motion.div>
    );
}

function SlideTitle({ title }) {
    if (!title) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="absolute top-10 left-1/2 -translate-x-1/2"
            style={S.slideTitle}
            dir="rtl"
        >
            {title}
        </motion.div>
    );
}

function ChordRow({ slideData }) {
    if (!Array.isArray(slideData) || !slideData[0]?.lines?.[0]) return null;
    const chords = slideData[0].lines[0].segments.filter(s => s.chord);
    if (!chords.length) return null;

    return (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 flex gap-3 items-center justify-center flex-wrap max-w-2xl px-6">
            {chords.map((seg, idx) => (
                <div
                    key={idx}
                    className="chord-pill"
                    style={{
                        // animationDelay is dynamic — must stay inline
                        animationDelay: `${idx * 60}ms`,
                        padding: '5px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(100,200,255,0.25)',
                        background: 'rgba(100,200,255,0.06)',
                        backdropFilter: 'blur(6px)',
                    }}
                >
                    <span
                        dir="ltr"
                        style={S.chordPillText}
                    >
                        {seg.chord}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── Main Display Content ───────────────────────────────────────────────────

function DisplayContent() {
    const searchParams = useSearchParams();
    const dataShowId = searchParams.get('dataShowId') || '';
    const { isConnected, displayState, remoteAudioStream } = usePresentation(dataShowId, 'display');
    const audioRef = useRef(null);

    // ── Font Scale ─────────────────────────────────────────────────────
    const SCALE_KEY = 'presentation_font_scale';
    const SCALE_MIN = 0.5;
    const SCALE_MAX = 2.0;
    const SCALE_STEP = 0.1;
    const [fontScale, setFontScale] = useState(() => {
        if (typeof window === 'undefined') return 1;
        const saved = parseFloat(localStorage.getItem(SCALE_KEY));
        return isNaN(saved) ? 1 : Math.min(Math.max(saved, SCALE_MIN), SCALE_MAX);
    });
    const [controlsOpen, setControlsOpen] = useState(false);

    const changeScale = useCallback((delta) => {
        setFontScale(prev => {
            const next = Math.min(Math.max(parseFloat((prev + delta).toFixed(1)), SCALE_MIN), SCALE_MAX);
            localStorage.setItem(SCALE_KEY, String(next));
            return next;
        });
    }, []);

    const resetScale = useCallback(() => {
        setFontScale(1);
        localStorage.removeItem(SCALE_KEY);
    }, []);

    // Hide layout navbar on mount, restore on unmount
    useEffect(() => {
        const selectors = ['nav', 'header', '[class*="navbar"]', '[class*="Navbar"]', '[class*="header"]', '[class*="Header"]'];
        const hidden = [];
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                // Only hide elements outside our display container
                if (!el.closest('.display-root')) {
                    el.dataset.displayHidden = 'true';
                    el.style.setProperty('display', 'none', 'important');
                    hidden.push(el);
                }
            });
        });
        // Also make body overflow hidden
        document.body.style.overflow = 'hidden';
        return () => {
            hidden.forEach(el => {
                el.style.removeProperty('display');
                delete el.dataset.displayHidden;
            });
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        if (audioRef.current && remoteAudioStream) {
            audioRef.current.srcObject = remoteAudioStream;
            audioRef.current.play().catch(e => console.log('Autoplay blocked:', e));
        }
    }, [remoteAudioStream]);

    const slideData    = displayState?.slides?.[displayState?.currentSlide] ?? null;
    const slideTitle   = typeof slideData === 'string' ? null : slideData?.title;
    const hymnTitle    = displayState?.currentHymnTitle ?? null;
    const currentSlide = displayState?.currentSlide ?? 0;
    const totalSlides  = displayState?.slides?.length ?? 0;
    const isCleared    = displayState?.type === 'clear' || (!displayState?.currentHymnId && displayState?.type !== 'sync');

    return (
        <div className="display-root grain-layer fixed inset-0 select-none overflow-hidden" style={S.rootFont}>
            <GrainBackground />

            {/* ── Chrome ── */}
            <ConnectionBadge isConnected={isConnected} dataShowId={dataShowId} />
            <HymnLabel title={hymnTitle} />
            <SlideCounter current={currentSlide} total={totalSlides} />
            <CloseButton />

            {/* ── Font Size Controls ── */}
            {/* Always-visible toggle icon + expandable panel, bottom-left */}
            <div className="absolute bottom-6 left-6 z-50">
                <AnimatePresence mode="wait">
                    {controlsOpen ? (
                        /* ── Expanded panel ── */
                        <motion.div
                            key="panel"
                            initial={{ opacity: 0, scale: 0.9, y: 6 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 6 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="flex items-center gap-1"
                            style={{
                                background: 'rgba(10,15,30,0.82)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                backdropFilter: 'blur(14px)',
                                borderRadius: '999px',
                                padding: '5px 8px',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                            }}
                        >
                            {/* Decrease */}
                            <button
                                onClick={() => changeScale(-SCALE_STEP)}
                                disabled={fontScale <= SCALE_MIN}
                                title="Decrease font size"
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: fontScale <= SCALE_MIN ? 'not-allowed' : 'pointer',
                                    opacity: fontScale <= SCALE_MIN ? 0.3 : 1,
                                    transition: 'opacity 0.2s, background 0.2s',
                                }}
                            >
                                <ZoomOut size={14} style={{ color: 'rgba(255,255,255,0.65)' }} />
                            </button>

                            {/* Percentage label */}
                            <span style={{
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                color: fontScale !== 1 ? 'rgba(210,160,80,0.85)' : 'rgba(255,255,255,0.35)',
                                letterSpacing: '0.05em',
                                minWidth: '34px',
                                textAlign: 'center',
                                transition: 'color 0.3s',
                            }}>
                                {Math.round(fontScale * 100)}%
                            </span>

                            {/* Increase */}
                            <button
                                onClick={() => changeScale(SCALE_STEP)}
                                disabled={fontScale >= SCALE_MAX}
                                title="Increase font size"
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: fontScale >= SCALE_MAX ? 'not-allowed' : 'pointer',
                                    opacity: fontScale >= SCALE_MAX ? 0.3 : 1,
                                    transition: 'opacity 0.2s, background 0.2s',
                                }}
                            >
                                <ZoomIn size={14} style={{ color: 'rgba(255,255,255,0.65)' }} />
                            </button>

                            {/* Reset — only shows when not at 100% */}
                            {fontScale !== 1 && (
                                <button
                                    onClick={resetScale}
                                    title="Reset to 100%"
                                    style={{
                                        width: 32, height: 32, borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <RotateCcw size={12} style={{ color: 'rgba(255,255,255,0.45)' }} />
                                </button>
                            )}

                            {/* Close / collapse */}
                            <button
                                onClick={() => setControlsOpen(false)}
                                title="Close"
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', marginLeft: 2,
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <line x1="1" y1="1" x2="9" y2="9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" />
                                    <line x1="9" y1="1" x2="1" y2="9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                            </button>
                        </motion.div>
                    ) : (
                        /* ── Collapsed icon button ── */
                        <motion.button
                            key="icon"
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            transition={{ duration: 0.18 }}
                            onClick={() => setControlsOpen(true)}
                            title="Font size"
                            style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: 'rgba(10,15,30,0.65)',
                                border: `1px solid ${fontScale !== 1 ? 'rgba(210,160,80,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                backdropFilter: 'blur(10px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: fontScale !== 1 ? '0 0 10px rgba(210,160,80,0.15)' : 'none',
                                transition: 'border-color 0.3s, box-shadow 0.3s',
                            }}
                        >
                            <ZoomIn size={15} style={{ color: fontScale !== 1 ? 'rgba(210,160,80,0.8)' : 'rgba(255,255,255,0.4)' }} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Live audio indicator ── */}
            {remoteAudioStream && (
                <div
                    className="absolute top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full status-badge"
                    style={S.liveAudioBadge}
                >
                    <Mic size={11} className="text-emerald-400" />
                    <span style={S.liveAudioText}>
                        LIVE AUDIO
                    </span>
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                </div>
            )}
            <audio ref={audioRef} autoPlay />

            {/* ── Main content ── */}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8">
                <AnimatePresence mode="wait">
                    {!isConnected ? (
                        <ConnectingState />
                    ) : isCleared || !slideData ? (
                        <WaitingState dataShowId={dataShowId} />
                    ) : (
                        <motion.div
                            key={`${displayState?.currentHymnId}-${currentSlide}`}
                            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="w-full flex flex-col items-center justify-center text-center"
                        >
                            {/* ── Lyrics Container ── */}
                            <div className="presentation-wrapper w-full max-w-7xl">
                                <ChordLyrics
                                    chordedLyrics={Array.isArray(slideData) ? slideData : [slideData]}
                                    showChords={false}
                                    presentation={true}
                                    fontScale={fontScale}
                                />
                            </div>

                            {/* Subtle bottom line separator */}
                            <motion.div
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
                                style={{
                                    width: '60px',
                                    height: '1px',
                                    background: 'linear-gradient(90deg, transparent, rgba(210,160,80,0.4), transparent)',
                                    marginTop: '4em',
                                    borderRadius: '1px',
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default function DisplayPage() {
    return (
        <Suspense fallback={
            <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#050402' }}>
                <svg width="36" height="36" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(210,160,80,0.3)" strokeWidth="2"
                        strokeDasharray="25 76" strokeLinecap="round"
                        style={{ animation: 'spin 1.2s linear infinite', transformOrigin: 'center' }}
                    />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </svg>
            </div>
        }>
            <DisplayContent />
        </Suspense>
    );
}