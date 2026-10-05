'use client';
import React, { useEffect } from 'react';
import { MessageSquare, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ensureNavigationServiceWorker, navigateDocumentFallback } from '../../utils/appNavigation';

export default function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        let cancelled = false;

        ensureNavigationServiceWorker().then((workerReady) => {
            if (workerReady && !cancelled) {
                router.prefetch('/chat_team');
                router.prefetch('/Trainings');
            }
        });

        return () => {
            cancelled = true;
        };
    }, [router]);

    const navigate = async (event, href) => {
        event.preventDefault();
        const workerReady = await ensureNavigationServiceWorker();
        if (workerReady) router.push(href);
        else navigateDocumentFallback(href);
    };

    return (
        <div className="md:hidden w-full h-16 bg-[#0d1322] border-t border-slate-800/80 flex items-center justify-around shrink-0 pb-safe z-50">
            <Link
                href="/chat_team"
                prefetch
                onClick={(event) => navigate(event, '/chat_team')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${pathname?.startsWith('/chat_team') ? 'text-sky-400 font-bold' : 'text-slate-400'
                    }`}
            >
                <MessageSquare size={22} />
                <span className="text-[10px] font-semibold">Chats</span>
            </Link>

            <Link
                href="/Trainings"
                prefetch
                onClick={(event) => navigate(event, '/Trainings')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${pathname?.startsWith('/Trainings') ? 'text-sky-400 font-bold' : 'text-slate-400'
                    }`}
            >
                <GraduationCap size={22} />
                <span className="text-[10px] font-semibold">Trainings</span>
            </Link>
        </div>
    );
}
