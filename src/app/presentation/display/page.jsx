'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresentation } from '../../hooks/usePresentation';
import { useSearchParams } from 'next/navigation';
import { Wifi, WifiOff, Mic } from 'lucide-react';
import { Suspense } from 'react';
import ChordLyrics from '../../components/ChordLyrics';

/* ─── Grain overlay (CSS injected once) ─── */
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

  @keyframes grain {
    0%, 100% { transform: translate(0, 0) }
    10% { transform: translate(-2%, -3%) }
    20% { transform: translate(3%, 2%) }
    30% { transform: translate(-1%, 4%) }
    40% { transform: translate(4%, -1%) }
    50% { transform: translate(-3%, 3%) }
    60% { transform: translate(2%, -4%) }
    70% { transform: translate(-4%, 1%) }
    80% { transform: translate(1%, -2%) }
    90% { transform: translate(-2%, 4%) }
  }

  @keyframes halo-pulse {
    0%, 100% { opacity: 0.04; transform: scale(1); }
    50% { opacity: 0.09; transform: scale(1.08); }
  }

  @keyframes chord-appear {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes badge-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .grain-layer::before {
    content: '';
    position: fixed;
    inset: -50%;
    width: 200%;
    height: 200%;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
    opacity: 0.035;
    pointer-events: none;
    animation: grain 8s steps(10) infinite;
    z-index: 1;
  }

  .slide-text {
    font-family: 'Amiri', Georgia, serif;
    line-height: 1.85;
    letter-spacing: 0.01em;
    text-shadow:
      0 0 60px rgba(255,255,255,0.06),
      0 2px 40px rgba(0,0,0,0.8);
  }

  .chord-pill {
    animation: chord-appear 0.4s ease both;
  }

  .status-badge {
    animation: badge-in 0.5s ease both;
  }
`;

function GrainBackground() {
    return (
        <>
            <style>{grainStyle}</style>
            {/* Deep atmospheric base */}
            <div
                className="fixed inset-0 z-0"
                style={{
                    background: `
                        radial-gradient(ellipse 80% 60% at 50% 40%, #1a1008 0%, #0a0806 40%, #000000 100%)
                    `,
                }}
            />
            {/* Warm central halo — like candlelight glow */}
            <div
                className="fixed inset-0 z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(210,160,80,0.07) 0%, transparent 70%)',
                    animation: 'halo-pulse 6s ease-in-out infinite',
                }}
            />
            {/* Vignette */}
            <div
                className="fixed inset-0 z-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.75) 100%)',
                }}
            />
        </>
    );
}

function ConnectionBadge({ isConnected, dataShowId }) {
    return (
        <div className="absolute top-5 right-5 z-50 status-badge">
            {isConnected ? (
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full backdrop-blur-md"
                    style={{
                        background: 'rgba(20,40,20,0.55)',
                        border: '1px solid rgba(74,222,128,0.2)',
                        boxShadow: '0 0 12px rgba(74,222,128,0.08)',
                    }}
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
                    style={{
                        background: 'rgba(40,10,10,0.55)',
                        border: '1px solid rgba(248,113,113,0.2)',
                    }}
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
            style={{
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
            }}
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
            style={{
                fontFamily: "'IM Fell English SC', serif",
                fontSize: '13px',
                letterSpacing: '0.12em',
                color: 'rgba(210,160,80,0.35)',
            }}
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
            <div style={{ position: 'relative', width: 64, height: 64 }}>
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
                    <rect x="28" y="4" width="8" height="56" rx="4" fill="rgba(210,160,80,0.12)" />
                    <rect x="4" y="22" width="56" height="8" rx="4" fill="rgba(210,160,80,0.12)" />
                </svg>
                {/* Glow behind cross */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'radial-gradient(circle, rgba(210,160,80,0.08) 0%, transparent 70%)',
                    filter: 'blur(8px)',
                }} />
            </div>

            <div>
                <p style={{
                    fontFamily: "'IM Fell English SC', serif",
                    fontSize: '13px',
                    letterSpacing: '0.35em',
                    color: 'rgba(255,255,255,0.18)',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                }}>
                    Waiting for presenter
                </p>
                {dataShowId && (
                    <p style={{
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        letterSpacing: '0.2em',
                        color: 'rgba(210,160,80,0.18)',
                    }}>
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
                    style={{ animation: 'spin 1.2s linear infinite', transformOrigin: 'center' }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </svg>
            <p style={{
                fontFamily: "'IM Fell English SC', serif",
                fontSize: '12px',
                letterSpacing: '0.35em',
                color: 'rgba(255,255,255,0.2)',
                textTransform: 'uppercase',
            }}>
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
            style={{
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
            }}
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
                        style={{
                            fontFamily: "'Cinzel', serif",
                            fontSize: 'clamp(14px, 1.6vw, 20px)',
                            fontWeight: 600,
                            color: 'rgba(140,220,255,0.9)',
                            letterSpacing: '0.05em',
                        }}
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
        <div className="display-root grain-layer fixed inset-0 select-none overflow-hidden" style={{ fontFamily: "'Amiri', serif" }}>
            <GrainBackground />

            {/* ── Chrome ── */}
            <ConnectionBadge isConnected={isConnected} dataShowId={dataShowId} />
            <HymnLabel title={hymnTitle} />
            <SlideCounter current={currentSlide} total={totalSlides} />
            <CloseButton />

            {/* ── Live audio indicator ── */}
            {remoteAudioStream && (
                <div
                    className="absolute top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full status-badge"
                    style={{
                        background: 'rgba(5,40,25,0.6)',
                        border: '1px solid rgba(52,211,153,0.25)',
                        backdropFilter: 'blur(10px)',
                    }}
                >
                    <Mic size={11} className="text-emerald-400" />
                    <span style={{ fontSize: 11, letterSpacing: '0.15em', color: 'rgba(52,211,153,0.8)', fontFamily: 'monospace' }}>
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