'use client';
import { useEffect, useState, useCallback } from 'react';

// ─── Event bus (no React context needed — pure module-level singleton) ───────
const listeners = new Set();

/**
 * Call this from anywhere (including non-React files) to show a toast.
 * @param {{ message: string, type?: 'offline'|'success'|'error'|'info', duration?: number }} opts
 */
export function showToast({ message, type = 'info', duration = 5000 }) {
  const id = Date.now();
  listeners.forEach((cb) => cb({ id, message, type, duration }));
}

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconOffline() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <circle cx="12" cy="20" r="1" fill="currentColor"/>
    </svg>
  );
}

function IconSuccess() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function IconError() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
}

function IconInfo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

// ─── Style map ───────────────────────────────────────────────────────────────
const STYLES = {
  offline: {
    icon: <IconOffline />,
    bg: 'rgba(30, 22, 10, 0.97)',
    border: 'rgba(234, 179, 8, 0.35)',
    accent: '#fbbf24',
    bar: 'rgba(251, 191, 36, 0.8)',
    iconBg: 'rgba(234, 179, 8, 0.15)',
  },
  success: {
    icon: <IconSuccess />,
    bg: 'rgba(10, 26, 18, 0.97)',
    border: 'rgba(52, 211, 153, 0.3)',
    accent: '#34d399',
    bar: 'rgba(52, 211, 153, 0.8)',
    iconBg: 'rgba(52, 211, 153, 0.15)',
  },
  error: {
    icon: <IconError />,
    bg: 'rgba(26, 10, 10, 0.97)',
    border: 'rgba(248, 113, 113, 0.3)',
    accent: '#f87171',
    bar: 'rgba(248, 113, 113, 0.8)',
    iconBg: 'rgba(248, 113, 113, 0.15)',
  },
  info: {
    icon: <IconInfo />,
    bg: 'rgba(10, 18, 30, 0.97)',
    border: 'rgba(96, 165, 250, 0.3)',
    accent: '#60a5fa',
    bar: 'rgba(96, 165, 250, 0.8)',
    iconBg: 'rgba(96, 165, 250, 0.15)',
  },
};

// ─── Single Toast item ────────────────────────────────────────────────────────
function Toast({ id, message, type, duration, onRemove }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const s = STYLES[type] || STYLES.info;

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setVisible(true));

    // Animate progress bar
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct > 0) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Auto dismiss
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(id), 350);
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => onRemove(id), 350);
  };

  return (
    <div
      onClick={dismiss}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: '16px',
        border: `1px solid ${s.border}`,
        background: s.bg,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        minWidth: '280px',
        maxWidth: '380px',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
      }}
    >
      {/* Accent glow blob */}
      <div style={{
        position: 'absolute', top: '-30px', left: '-10px',
        width: '80px', height: '80px',
        borderRadius: '50%',
        background: s.accent,
        opacity: 0.07,
        filter: 'blur(30px)',
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <div style={{
        flexShrink: 0,
        width: '36px', height: '36px',
        borderRadius: '10px',
        background: s.iconBg,
        border: `1px solid ${s.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: s.accent,
      }}>
        {s.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, paddingTop: '2px' }}>
        <p style={{
          margin: 0,
          fontSize: '13px',
          fontWeight: 600,
          color: '#f1f5f9',
          lineHeight: '1.4',
          letterSpacing: '-0.01em',
        }}>
          {message}
        </p>
        <p style={{
          margin: '3px 0 0',
          fontSize: '11px',
          color: 'rgba(148,163,184,0.7)',
          fontWeight: 500,
        }}>
          Tap to dismiss
        </p>
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0,
        height: '2.5px',
        width: `${progress}%`,
        background: s.bar,
        borderRadius: '0 0 0 16px',
        transition: 'width 0.1s linear',
      }} />
    </div>
  );
}

// ─── Toast container ──────────────────────────────────────────────────────────
export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    return () => listeners.delete(addToast);
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast {...t} onRemove={removeToast} />
        </div>
      ))}
    </div>
  );
}
