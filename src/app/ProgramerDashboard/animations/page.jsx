'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Play, RefreshCw, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import useProgramerAccess from '../useProgramerAccess';
import { uiControlRequest, navbarRequestIsFresh, NAVBAR_PREVIEW_EVENT, UI_CONTROLS_CHANGED_EVENT } from '../../services/uiAnimationService';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';

export default function AnimationControlsPage() {
    const access = useProgramerAccess();
    const { isLogin } = access;
    const [audience, setAudience] = useState('programer');
    const [notice, setNotice] = useState('');
    const queryClient = useQueryClient();
    const queryKey = ['animation-controls', isLogin];
    const query = useQuery({ queryKey, queryFn: () => uiControlRequest(isLogin, '/admin'),
        enabled: access.hasAccess, retry: false, refetchInterval: 60000 });
    const save = useMutation({
        mutationFn: action => uiControlRequest(isLogin, '/admin/navbar-intro', {
            method: action === 'cancel' ? 'DELETE' : 'POST',
            ...(action === 'cancel' ? {} : { body: JSON.stringify({ audience }) }),
        }),
        onSuccess: async (data, action) => {
            queryClient.setQueryData(queryKey, data);
            setNotice(action === 'cancel' ? 'Pending request cancelled. Devices that already played it will not be affected.' : `Navbar animation requested for ${data.navbarIntro.audience === 'all' ? 'all users' : 'PROGRAMER accounts'}. Each device will play it once.`);
            window.dispatchEvent(new CustomEvent(UI_CONTROLS_CHANGED_EVENT));
        },
    });
    if (!isLogin || [401, 403].includes(access.error?.status) || [401, 403].includes(query.error?.status)) return <div className="mx-auto max-w-lg px-5 py-24 text-center"><ShieldCheck className="mx-auto mb-4 text-slate-400" size={36} /><h1 className="text-2xl font-bold">Private dashboard</h1><p className="mt-3 text-slate-400">Only PROGRAMER accounts can access these controls.</p></div>;
    const request = query.data?.navbarIntro;
    const active = navbarRequestIsFresh(request);

    return <div className="min-h-screen bg-[#090f1a] px-4 pb-28 pt-8 text-slate-200 sm:px-7 sm:pt-12" dir="ltr"><div className="mx-auto max-w-4xl">
        <Link href="/ProgramerDashboard" className="mb-6 inline-block text-sm text-sky-300 hover:text-sky-200">← App control center</Link>
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300"><Sparkles size={15} />UI controls</div><h1 className="text-3xl font-bold text-white sm:text-4xl">UI animations</h1><p className="mt-3 text-sm text-slate-400">Choose when the app plays an intro.</p></div><button className={button} onClick={() => { access.refetch(); if (access.hasAccess) query.refetch(); }} disabled={query.isFetching || save.isPending}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />Refresh</button></header>
        {(access.error || query.error || save.error) && <p role="alert" className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{(save.error || access.error || query.error).message}</p>}
        {notice && <p role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200"><Check size={18} className="shrink-0" />{notice}</p>}
        {access.isPending || (access.hasAccess && query.isPending) ? <p className="flex items-center gap-2 py-12 text-slate-400"><Loader2 size={18} className="animate-spin" />Loading animation controls...</p> : access.hasAccess && <section className="rounded-2xl border border-white/[0.08] bg-[#101725] p-5 sm:p-7" aria-labelledby="navbar-intro-title">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 id="navbar-intro-title" className="text-xl font-semibold text-white">Navbar logo intro</h2><p className="mt-2 max-w-xl text-sm leading-7 text-slate-400">The Wasla SVG assembles in the center, then moves into the navbar. It plays only when you request it here.</p></div><span className="rounded-full bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-300">On request</span></div>
            <div className="mb-6 rounded-xl border border-white/[0.07] bg-black/10 p-4 text-sm leading-7 text-slate-400">No first-opening or three-day schedule. Requests play once per device, after any OTA splash finishes. Active apps check every minute and when reopened. A request expires after 24 hours.</div>
            <fieldset disabled={!query.isSuccess || save.isPending} className="mb-6"><legend className="mb-3 text-sm font-semibold text-slate-200">Who should see the animation?</legend><div className="grid gap-3 sm:grid-cols-2">{[{ value: 'programer', label: 'PROGRAMER only', detail: 'Test on your signed-in devices first.' }, { value: 'all', label: 'All users', detail: 'Request it on all signed-in devices.' }].map(option => <label key={option.value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${audience === option.value ? 'border-violet-400/60 bg-violet-400/5' : 'border-white/10'}`}><input type="radio" name="animation-audience" value={option.value} checked={audience === option.value} onChange={() => setAudience(option.value)} className="mt-1 accent-violet-400" /><span><span className="block text-sm font-semibold text-white">{option.label}</span><span className="mt-1 block text-xs text-slate-400">{option.detail}</span></span></label>)}</div></fieldset>
            <div className="flex flex-wrap gap-3"><button className={`${button} border-violet-400/30 bg-violet-400 text-[#0c1020] hover:bg-violet-300`} disabled={!query.isSuccess || save.isPending} onClick={() => save.mutate('request')}>{save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Request animation</button><button className={button} disabled={save.isPending} onClick={() => { window.dispatchEvent(new CustomEvent(NAVBAR_PREVIEW_EVENT)); setNotice('Preview requested on this device only.'); }}><Play size={16} />Preview on this device</button><button className={`${button} text-slate-400`} disabled={!query.isSuccess || !active || save.isPending} onClick={() => save.mutate('cancel')}><X size={16} />Cancel pending request</button></div>
            <div className="mt-7 border-t border-white/10 pt-5 text-sm"><p className="font-medium text-slate-200">{!query.isSuccess ? 'Request status unavailable' : active ? 'Request is active' : request?.id ? 'Last request expired' : 'No pending request'}</p>{request?.id && <p className="mt-2 text-xs leading-6 text-slate-400">Audience: {request.audience === 'all' ? 'All users' : 'PROGRAMER only'} · Requested {new Date(request.requestedAt).toLocaleString()} · Expires {new Date(request.expiresAt).toLocaleString()}</p>}</div>
        </section>}
    </div></div>;
}
