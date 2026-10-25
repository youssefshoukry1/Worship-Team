'use client';
import PageSkeleton from '../components/PageSkeleton';

import Link from 'next/link';
import { ArrowUpRight, Download, ShieldCheck, Sparkles } from 'lucide-react';
import useProgramerAccess from './useProgramerAccess';

export default function ProgramerDashboard() {
    const access = useProgramerAccess();

    if (!access.isLogin || [401, 403].includes(access.error?.status)) {
        return <div className="mx-auto max-w-lg px-5 py-24 text-center"><ShieldCheck className="mx-auto mb-4 text-slate-400" size={36} /><h1 className="text-2xl font-bold">Private dashboard</h1><p className="mt-3 text-slate-400">Only PROGRAMER accounts can access these controls.</p><Link href="/normal_UserProfile" className="mt-6 inline-block text-sky-300">Back to profile</Link></div>;
    }

    return <div className="min-h-screen bg-[#090f1a] px-4 pb-28 pt-12 text-slate-200 sm:px-7" dir="ltr">
        <div className="mx-auto max-w-5xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300"><ShieldCheck size={15} />PROGRAMER</div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">App control center</h1>
            <p className="mt-3 text-sm text-slate-400">Choose what you want to control.</p>
            {access.isPending && <PageSkeleton variant="dashboard" compact />}
            {access.error && <p role="alert" className="mt-8 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{access.error.message}</p>}
            {access.hasAccess && <div className="mt-10 grid gap-5 sm:grid-cols-2">
                {[
                    { href: '/ProgramerDashboard/ota', title: 'OTA controll', Icon: Download, description: 'Hold a release, test with PROGRAMER, or publish to all users. Manage update intros and see device versions.', color: 'text-sky-300 bg-sky-400/10' },
                    { href: '/ProgramerDashboard/animations', title: 'UI animations', Icon: Sparkles, description: 'Request the navbar logo intro when you choose. Preview it, choose an audience, or cancel a pending request.', color: 'text-violet-300 bg-violet-400/10' },
                ].map(({ href, title, Icon, description, color }) => <Link key={href} href={href} className="group rounded-2xl border border-white/[0.08] bg-[#101725] p-6 transition hover:border-sky-400/40 hover:bg-[#141e2e] sm:p-8">
                    <div className="flex items-center justify-between"><span className={`rounded-xl p-3 ${color}`}><Icon size={25} /></span><ArrowUpRight size={20} className="text-slate-500 transition group-hover:text-sky-300" /></div>
                    <h2 className="mt-6 text-xl font-semibold text-white">{title}</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
                </Link>)}
            </div>}
        </div>
    </div>;
}
