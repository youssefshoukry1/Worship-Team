'use client';
import React from 'react';
import { MessageSquare, GraduationCap, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MainSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-16 h-full bg-[#0b0f19] border-r border-white/10 flex flex-col items-center py-6 gap-6 shrink-0 z-20">
            {/* Optional back button to main site if needed */}
            <Link href="/" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 transition-colors mb-4">
                <ArrowLeft size={20} />
            </Link>

            <Link href="/chat_team" title="Chat" className="w-full flex justify-center group relative">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${pathname?.startsWith('/chat_team')
                        ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                        : 'text-gray-400 hover:bg-white/5 hover:text-sky-400'
                    }`}>
                    <MessageSquare size={24} />
                </div>
            </Link>

            <Link href="/Trainings" title="Trainings" className="w-full flex justify-center group relative">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${pathname?.startsWith('/Trainings')
                        ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                        : 'text-gray-400 hover:bg-white/5 hover:text-sky-400'
                    }`}>
                    <GraduationCap size={24} />
                </div>
            </Link>
        </div>
    );
}
