'use client';
import React from 'react';
import { MessageSquare, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <div className="md:hidden w-full h-16 bg-[#0d1322] border-t border-slate-800/80 flex items-center justify-around shrink-0 pb-safe z-50">
            <Link
                href="/chat_team"
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${pathname?.startsWith('/chat_team') ? 'text-sky-400 font-bold' : 'text-slate-400'
                    }`}
            >
                <MessageSquare size={22} />
                <span className="text-[10px] font-semibold">Chats</span>
            </Link>

            <Link
                href="/Trainings"
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${pathname?.startsWith('/Trainings') ? 'text-sky-400 font-bold' : 'text-slate-400'
                    }`}
            >
                <GraduationCap size={22} />
                <span className="text-[10px] font-semibold">Trainings</span>
            </Link>
        </div>
    );
}
