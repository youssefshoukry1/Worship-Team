"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Heart, BookOpen, Music, Users, User } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Home', icon: Home, href: '/' },
  { label: 'Pray', icon: Heart, href: '/pray' },
  { label: 'Bible', icon: BookOpen, href: '/bible_form' },
  { label: 'Hymns', icon: Music, href: '/hymns' },
  { label: 'Friends', icon: Users, href: '/friends' },
  { label: 'Profile', icon: User, href: '/normal_UserProfile' }
];

const normalizePath = (path) => {
  if (!path || path === '/') return '/';
  return path.endsWith('/') ? path : `${path}/`;
};

export default function BottomNav() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  const currentPath = normalizePath(pathname);
  const visualPath = pendingNavigation?.from === currentPath
    ? pendingNavigation.to
    : currentPath;

  useEffect(() => {
    const handleScroll = (e) => {
      let currentScrollY;
      if (e && e.type === 'internalScroll') {
        currentScrollY = e.detail.scrollY;
      } else {
        currentScrollY = window.scrollY;
      }
      
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY || currentScrollY <= 50) {
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('internalScroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('internalScroll', handleScroll);
    };
  }, [lastScrollY]);

  return (
    <div
      data-lenis-prevent
      className={`fixed bottom-0 left-0 right-0 z-[10000] border-t border-white/[0.06] bg-[#020a1c]/95 shadow-[0_-10px_30px_rgba(2,10,28,0.28)] backdrop-blur-xl transition-transform duration-200 ease-out touch-manipulation select-none ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
    >
      <nav className="flex justify-around items-center h-[58px] max-w-md mx-auto" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const destinationPath = normalizePath(item.href);
          const isActive = visualPath === destinationPath || (item.href !== '/' && visualPath.startsWith(destinationPath));
          const isCurrentDestination = currentPath === destinationPath;

          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch
              aria-current={isActive ? 'page' : undefined}
              onPointerDown={() => {
                if (!isCurrentDestination) {
                  setPendingNavigation({ from: currentPath, to: destinationPath });
                }
              }}
              onPointerCancel={() => setPendingNavigation(null)}
              onClick={(e) => {
                if (isCurrentDestination) {
                  e.preventDefault();
                  setPendingNavigation(null);
                  return;
                }

                setPendingNavigation({ from: currentPath, to: destinationPath });
              }}
              className="group relative flex h-full w-full touch-manipulation flex-col items-center justify-center gap-0.5 outline-none transition-transform duration-150 ease-out active:scale-[0.94]"
            >
              <div
                className={`pointer-events-none absolute top-[5px] h-8 w-12 rounded-2xl bg-sky-400/12 transition-[opacity,transform] duration-200 ease-out ${
                  isActive ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                }`}
              />
              <div className={`relative flex h-8 w-10 items-center justify-center pointer-events-none transition-transform duration-200 ease-out ${isActive ? '-translate-y-0.5 scale-105' : 'translate-y-0 scale-100'}`}>
                <item.icon
                  size={21}
                  className={`z-10 transition-[color,filter] duration-150 ${isActive ? 'text-[#00C2FF] drop-shadow-[0_0_6px_rgba(0,194,255,0.45)]' : 'text-slate-400'}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span className={`pointer-events-none text-[10px] font-medium leading-none transition-[color,transform] duration-150 ease-out ${isActive ? '-translate-y-px text-[#00C2FF]' : 'translate-y-0 text-slate-400'}`}>
                {item.label}
              </span>
              <span
                className={`pointer-events-none absolute bottom-0 h-0.5 w-5 rounded-full bg-[#00C2FF] transition-[opacity,transform] duration-200 ease-out ${
                  isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
