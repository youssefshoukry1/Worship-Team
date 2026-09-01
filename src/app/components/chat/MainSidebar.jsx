'use client';
import React from 'react';
import { MessageSquare, GraduationCap, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MainSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-16 h-full bg-[#080c14] border-r border-slate-800/80 flex flex-col items-center py-6 gap-6 shrink-0 z-20">

            <Link href="/chat_team" title="Chat" className="w-full flex justify-center group relative">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${pathname?.startsWith('/chat_team')
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-sky-400'
                    }`}>
                    <MessageSquare size={22} />
                </div>
            </Link>

            <Link href="/Trainings" title="Trainings" className="w-full flex justify-center group relative">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${pathname?.startsWith('/Trainings')
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-sky-400'
                    }`}>
                    <GraduationCap size={22} />
                </div>
            </Link>
        </div>
    );
}
