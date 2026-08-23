'use client';
import React from 'react';
import { MessageSquare, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <div className="md:hidden w-full h-16 bg-[#0f172a] border-t border-white/10 flex items-center justify-around shrink-0 pb-safe z-50">
            <Link 
                href="/chat_team" 
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                    pathname?.startsWith('/chat_team') ? 'text-sky-400' : 'text-gray-500'
                }`}
            >
                <MessageSquare size={24} />
                <span className="text-[10px] font-medium">Chats</span>
            </Link>

            <Link 
                href="/Trainings" 
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                    pathname?.startsWith('/Trainings') ? 'text-sky-400' : 'text-gray-500'
                }`}
            >
                <GraduationCap size={24} />
                <span className="text-[10px] font-medium">Trainings</span>
            </Link>
        </div>
    );
}
