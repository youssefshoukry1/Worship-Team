"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Heart, BookOpen, Music, Users, User } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

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

  const navItems = [
    { label: 'Home', icon: Home, href: '/' },
    { label: 'Pray', icon: Heart, href: '/pray' },
    { label: 'Bible', icon: BookOpen, href: '/bible_form' },
    { label: 'Hymns', icon: Music, href: '/hymns' },
    { label: 'Friends', icon: Users, href: '/friends' },
    { label: 'Profile', icon: User, href: '/normal_UserProfile' }
  ];

  return (
    <div
      data-lenis-prevent
      className={`fixed bottom-0 left-0 right-0 z-[10000] bg-[#020a1c]/95 backdrop-blur-xl transition-transform duration-200 ease-in-out touch-manipulation select-none ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
    >
      <nav className="flex justify-around items-center h-[56px] max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch={true}
              className="relative flex flex-col items-center justify-center w-full h-full space-y-0.5 cursor-pointer"
            >
              <div className="relative flex items-center justify-center w-10 h-8 pointer-events-none">
                <item.icon
                  size={isActive ? 22 : 20}
                  className={`transition-colors duration-150 z-10 ${isActive ? 'text-[#00C2FF]' : 'text-slate-400'}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {isActive && (
                  <div className="absolute inset-0 bg-[#00C2FF]/20 blur-[8px] rounded-full pointer-events-none" />
                )}
              </div>
              <span className={`text-[10px] font-medium transition-colors duration-150 pointer-events-none ${isActive ? 'text-[#00C2FF]' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
