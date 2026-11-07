'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gauge, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import PageSkeleton from '../../components/PageSkeleton';
import useProgramerAccess from '../useProgramerAccess';
import { controlApiRequest } from '../../services/controlApi';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';
const panel = 'rounded-2xl border border-white/[0.08] bg-[#101725] p-5 sm:p-7';
const format = value => new Intl.NumberFormat('en-GB').format(value);
const date = value => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not started';
const request = (token, path, options) => controlApiRequest(token, `/ai/admin${path}`, options, 'AI token controls');

export default function AiTokenControlsPage() {
    const access = useProgramerAccess();
    if (!access.isLogin || [401, 403].includes(access.error?.status)) return <div className="mx-auto max-w-lg px-5 py-24 text-center"><ShieldCheck className="mx-auto mb-4 text-slate-400" size={36} /><h1 className="text-2xl font-bold">Private dashboard</h1><p className="mt-3 text-slate-400">Only PROGRAMER accounts can access these controls.</p><Link href="/normal_UserProfile" className="mt-6 inline-block text-sky-300">Back to profile</Link></div>;
    return <div className="app-page min-h-screen px-4 pb-28 pt-8 text-slate-200 sm:px-7 sm:pt-12" dir="ltr"><div className="mx-auto max-w-5xl">
        <Link href="/ProgramerDashboard" className="mb-6 inline-block text-sm text-sky-300 hover:text-sky-200">← App control center</Link>
        <header className="mb-8"><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300"><Gauge size={15} />PROGRAMER</div><h1 className="text-3xl font-bold text-white sm:text-4xl">AI token controls</h1><p className="mt-3 text-sm leading-6 text-slate-400">Review an account’s usage or manage the shared Free launch offer.</p></header>
        {access.error && <p role="alert" className="mb-5 rounded-xl bg-rose-400/10 p-4 text-sm text-rose-200">{access.error.message}<button className={`${button} ms-3`} onClick={() => access.refetch()}>Retry access check</button></p>}
        {access.isPending && <PageSkeleton variant="dashboard" compact />}
        {access.hasAccess && <Controls key={access.isLogin} token={access.isLogin} />}
    </div></div>;
}

function Controls({ token }) {
    const client = useQueryClient();
    const [input, setInput] = useState('');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [confirmation, setConfirmation] = useState(null);
    const [notice, setNotice] = useState('');
    const policyKey = ['ai-token-policy', token];
    const accountKey = id => ['ai-token-account', token, id];
    const policy = useQuery({ queryKey: policyKey, queryFn: () => request(token, '/policy'), retry: false, refetchOnWindowFocus: false });
    const users = useQuery({ queryKey: ['ai-token-users', token, search], enabled: search.length >= 2,
        queryFn: () => request(token, `/users?username=${encodeURIComponent(search)}`), retry: false, refetchOnWindowFocus: false });
    const account = useQuery({ queryKey: accountKey(selectedId), enabled: !!selectedId,
        queryFn: () => request(token, `/users/${selectedId}`), retry: false, refetchOnWindowFocus: false });
    const action = useMutation({
        mutationFn: command => request(token, command.kind === 'reset' ? `/users/${command.userId}/reset` : '/policy/launch', {
            method: 'POST', body: JSON.stringify({ requestId: command.requestId, expectedRevision: command.revision })
        }),
        onSuccess: (result, command) => {
            if (command.kind === 'reset') {
                client.setQueryData(accountKey(command.userId), result);
                setNotice(`AI allowance reset for @${result.user.username}. Their new 24-hour window has started.`);
            } else {
                client.setQueryData(policyKey, result);
                client.invalidateQueries({ queryKey: ['ai-token-account', token] });
                setNotice(`The six-month Free offer has started. It ends ${date(result.launch.endsAt)}.`);
            }
            setConfirmation(null);
        },
        onError: error => {
            if (error.status === 409) {
                setConfirmation(null);
                if (selectedId) account.refetch();
                policy.refetch();
            }
        }
    });
    const busy = action.isPending;
    const target = account.data;
    const quota = target?.quota;
    const offer = policy.data;
    const active = offer?.launch.status === 'active';
    const error = (!confirmation && action.error) || account.error || users.error || policy.error;

    function confirm(kind) {
        action.reset(); setNotice('');
        setConfirmation({ kind, requestId: crypto.randomUUID(),
            revision: kind === 'reset' ? target.revision : offer.revision,
            ...(kind === 'reset' ? { userId: selectedId, username: target.user.username } : {}) });
    }

    const confirmationPanel = confirmation && <ConfirmAction confirmation={confirmation} active={active} offer={offer} action={action} onCancel={() => { setConfirmation(null); action.reset(); }} />;

    return <div className="space-y-6">
        {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error.message}</p>}
        {notice && <p role="status" className="flex gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-200"><Check size={18} className="mt-0.5 shrink-0" />{notice}</p>}
        <section className={panel} aria-labelledby="account-usage-title">
            <h2 id="account-usage-title" className="text-xl font-semibold text-white">Account usage</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Search by username, then select an account. Up to 20 matching usernames are shown.</p>
            <form className="mt-5 flex flex-wrap gap-3" onSubmit={event => {
                event.preventDefault();
                const value = input.trim().replace(/^@/, '').toLowerCase();
                if (value.length < 2 || value.length > 30 || busy) return;
                setConfirmation(null); setSelectedId(''); action.reset(); setNotice('');
                if (value === search) users.refetch(); else setSearch(value);
            }}>
                <div className="min-w-0 flex-1 basis-44"><label htmlFor="ai-token-username" className="mb-2 block text-xs font-medium text-slate-400">Username</label><input id="ai-token-username" value={input} onChange={event => setInput(event.target.value)} placeholder="@username" minLength={2} maxLength={31} required autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy} className="min-h-11 w-full rounded-xl border border-white/10 bg-black/15 px-3 text-sm text-white outline-none focus:border-sky-400" /></div>
                <button className={`${button} self-end text-sky-300`} disabled={busy || users.isFetching || input.trim().replace(/^@/, '').length < 2 || input.trim().replace(/^@/, '').length > 30}><Search size={16} />Search</button>
            </form>
            {users.isFetching && <p className="mt-4 text-sm text-slate-400" role="status">Searching accounts…</p>}
            {users.isSuccess && !users.data.users.length && <p className="mt-4 text-sm text-slate-400">No matching usernames.</p>}
            {!!users.data?.users.length && <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto" aria-label="Matching accounts">{users.data.users.map(user => <li key={user.id}><button type="button" disabled={busy} aria-pressed={selectedId === user.id} onClick={() => { setSelectedId(user.id); setConfirmation(null); action.reset(); setNotice(''); }} className={`w-full min-w-0 rounded-xl border p-3 text-left ${selectedId === user.id ? 'border-sky-400/40 bg-sky-400/5' : 'border-white/10 hover:bg-white/5'}`}><span className="block break-words text-sm font-semibold text-white">{user.name}</span><span className="block break-all text-xs text-slate-400">@{user.username}</span></button></li>)}</ul>}
            {account.isFetching && <p className="mt-5 text-sm text-slate-400" role="status">Loading usage…</p>}
            {target && !account.isError && <div data-ai-admin-account className="mt-6 border-t border-white/10 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="break-words text-lg font-semibold text-white">{target.user.name}</h3><p className="break-all text-sm text-slate-400">@{target.user.username}</p></div><span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-300">{quota.unlimited ? 'Unlimited' : quota.plan === 'free' ? 'Free' : quota.plan === 'pro' ? 'Pro' : 'Plus'}</span></div>
                {quota.unlimited ? <p className="mt-4 text-sm text-slate-400">This account has unlimited AI access. No reset is needed.</p> : <>
                    <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">{[['Used', quota.used], ['Remaining', quota.remaining], ['24-hour allowance', quota.limit]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-white">{format(value)}</dd></div>)}</dl>
                    <div role="progressbar" aria-label="Account tokens remaining" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.remaining} className="mt-5 h-2 overflow-hidden rounded-full bg-slate-500/20"><div className="h-full rounded-full bg-sky-400" style={{ width: `${quota.limit ? quota.remaining / quota.limit * 100 : 0}%` }} /></div>
                    <p className="mt-3 text-xs leading-6 text-slate-400">{quota.resetsAt ? `Resets ${date(quota.resetsAt)}` : 'The 24-hour window starts with their first AI request.'}</p>
                    {quota.pending && <p className="mt-2 text-sm text-amber-300">An AI request is running. Refresh after it finishes before resetting.</p>}
                </>}
                {target.lastAdminResetAt && <p className="mt-2 text-xs text-slate-400">Last admin reset: {date(target.lastAdminResetAt)}</p>}
                <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={button} disabled={busy || account.isFetching} onClick={() => { setConfirmation(null); action.reset(); account.refetch(); }}><RefreshCw size={16} />Refresh usage</button><button type="button" className={`${button} border-sky-400/30 text-sky-300`} disabled={busy || account.isFetching || quota.unlimited || quota.pending} onClick={() => confirm('reset')}>Reset allowance</button></div>
                {confirmation?.kind === 'reset' && confirmationPanel}
            </div>}
        </section>

        <section className={panel} aria-labelledby="launch-offer-title">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="launch-offer-title" className="text-xl font-semibold text-white">Six-month Free launch offer</h2><p className="mt-2 text-sm leading-6 text-slate-400">One shared offer for all Free accounts. Plus, Pro and unlimited accounts keep their current limits.</p></div><button type="button" className={button} disabled={busy || policy.isFetching} onClick={() => { setConfirmation(null); action.reset(); policy.refetch(); }}><RefreshCw size={16} />Refresh offer</button></div>
            {policy.isPending && <p className="mt-5 text-sm text-slate-400" role="status">Loading launch offer…</p>}
            {offer && !policy.isError && <>
                <p className="mt-5 text-3xl font-semibold tabular-nums text-emerald-300">{format(offer.freeLaunchTokenLimit)} <span className="text-sm font-normal text-slate-400">tokens / 24 hours</span></p>
                <p className="mt-2 text-sm text-slate-400">After the offer: {format(offer.freeStandardTokenLimit)} tokens / 24 hours.</p>
                <dl className="mt-5 space-y-2 text-sm"><div className="flex flex-wrap gap-x-3"><dt className="text-slate-400">Status</dt><dd className={active ? 'text-emerald-300' : 'text-slate-200'}>{active ? 'Active' : offer.launch.status === 'scheduled' ? 'Scheduled' : 'Ended'}</dd></div><div className="flex flex-wrap gap-x-3"><dt className="text-slate-400">Starts</dt><dd>{date(offer.launch.startsAt)}</dd></div><div className="flex flex-wrap gap-x-3"><dt className="text-slate-400">Ends</dt><dd>{date(offer.launch.endsAt)}</dd></div></dl>
                <button type="button" className={`${button} mt-6 border-emerald-400/30 text-emerald-300`} disabled={busy || policy.isFetching} onClick={() => confirm('launch')}>{active ? 'Restart six-month offer' : 'Start six-month offer'}</button>
                {confirmation?.kind === 'launch' && confirmationPanel}
            </>}
        </section>

    </div>;
}

function ConfirmAction({ confirmation, active, offer, action, onCancel }) {
    return <section role="group" aria-labelledby="ai-token-confirm-title" className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 sm:p-7">
            <h2 id="ai-token-confirm-title" className="text-lg font-semibold text-white">{confirmation.kind === 'reset' ? `Reset @${confirmation.username}?` : `${active ? 'Restart' : 'Start'} the shared launch offer?`}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">{confirmation.kind === 'reset'
                ? 'Used tokens will become 0 and a new 24-hour window will start now. The account receives its full allowance under its current plan and launch offer.'
                : `The six-month offer will start now for every Free account, replacing the current launch dates. Free accounts receive ${format(offer.freeLaunchTokenLimit)} tokens per 24 hours, then ${format(offer.freeStandardTokenLimit)} afterward. Existing usage and reset times are preserved.`}</p>
            {action.error && <p role="alert" className="mt-3 text-sm text-rose-200">{action.error.message}</p>}
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={`${button} border-amber-400/40 bg-amber-400 text-slate-950 hover:bg-amber-300`} disabled={action.isPending} onClick={() => action.mutate(confirmation)}>{action.isPending && <Loader2 size={16} className="animate-spin" />}{confirmation.kind === 'reset' ? 'Confirm account reset' : 'Confirm launch offer'}</button><button type="button" className={button} disabled={action.isPending} onClick={onCancel}>Cancel</button></div>
        </section>;
}
