'use client';
import { useEffect, useState } from 'react';
import { Maximize, Minimize, MonitorUp } from 'lucide-react';
import { openLocalDisplayManual, toggleLocalFullscreen } from './openLocalDisplay';

const baseClass = 'flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all hover:scale-105 active:scale-95';
const idleClass = 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10';
const activeClass = 'bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-[0_0_15px_rgba(56,189,248,0.15)]';

// HDMI display controls: "add display screen" while no window is open, fullscreen toggle once it is.
export default function LocalFullscreenButton({ displayRef, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const check = () => {
      const win = displayRef.current;
      const open = !!win && !win.closed;
      setIsOpen(open);
      try {
        setIsFullscreen(open && !!win.document.fullscreenElement);
      } catch {
        setIsFullscreen(false);
      }
    };
    check();
    const id = setInterval(check, 800);
    return () => clearInterval(id);
  }, [displayRef]);

  if (!isOpen) {
    return (
      <button
        onClick={() => { openLocalDisplayManual(displayRef); setIsOpen(!!displayRef.current); }}
        className={`${baseClass} ${idleClass} ${className}`}
      >
        <MonitorUp className="w-4 h-4" />
        إضافة شاشة العرض
      </button>
    );
  }

  return (
    <button
      onClick={() => toggleLocalFullscreen(displayRef)}
      className={`${baseClass} ${isFullscreen ? activeClass : idleClass} ${className}`}
    >
      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      {isFullscreen ? 'إلغاء ملء الشاشة' : 'ملء الشاشة'}
    </button>
  );
}
