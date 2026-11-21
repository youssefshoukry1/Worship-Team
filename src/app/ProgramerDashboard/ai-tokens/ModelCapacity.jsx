'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { controlApiRequest } from '../../services/controlApi';

const limitsLink = 'https://aistudio.google.com/rate-limit';
const number = new Intl.NumberFormat('en-GB');
const localTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-semibold text-sky-300 hover:bg-white/5 disabled:opacity-50';
const metrics = [
    ['requestsPerDay', 'Requests today (RPD)', 'Requests per day (RPD)'],
    ['requestsPerMinute', 'Requests in the last minute (RPM)', 'Requests per minute (RPM)'],
    ['inputTokensPerMinute', 'Input tokens in the last minute (TPM)', 'Input tokens per minute (TPM)'],
];
const request = (token, path, options) => controlApiRequest(token, `/ai/admin/capacity${path}`, options, 'Gemini model capacity');

export default function ModelCapacity({ token }) {
    const client = useQueryClient();
    const queryKey = ['ai-model-capacity', token];
    const capacity = useQuery({ queryKey, queryFn: async () => {
        const data = await request(token, '');
        if (!Array.isArray(data.models)) throw new Error('Couldn’t load Gemini model capacity.');
        return data;
    }, retry: false, refetchOnWindowFocus: false });

    const data = capacity.data;
    return (
        <section className="rounded-2xl border border-white/[0.08] bg-[#101725] p-5 sm:p-7" aria-labelledby="gemini-capacity-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="gemini-capacity-title" className="scroll-mt-24 text-xl font-semibold text-white">Gemini model capacity</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">See what Wasla sent to Gemini and how much of the shared capacity Free readers used.</p>
                </div>
                <button type="button" className={button} onClick={() => capacity.refetch()} disabled={capacity.isFetching}>
                    <RefreshCw size={16} className={capacity.isFetching ? 'animate-spin' : ''} />Refresh capacity
                </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
                Estimates use observed Wasla calls and the quotas you enter. Minute counts use ten-second buckets. Check your Google project for current limits and traffic from other apps.{' '}
                <a href={limitsLink} target="_blank" rel="noreferrer" className="font-semibold text-sky-300 underline">Open AI Studio rate limits</a>
            </p>
            {capacity.isPending && <p role="status" className="mt-5 text-sm text-slate-400">Loading capacity…</p>}
            {capacity.isError && <p role="alert" className="mt-5 text-sm text-rose-300">{capacity.error.message}</p>}
            {data && <>
                <p className="mt-3 text-xs text-slate-400">Snapshot {localTime.format(new Date(data.measuredAt))}. The Gemini day resets {localTime.format(new Date(data.resetsAt))}.</p>
                {data.models.length === 0 && <p className="mt-5 text-sm text-slate-400">There are no Gemini models in the backend catalog.</p>}
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {data.models.map(model => <ModelCard key={model.id} model={model} token={token}
                        onSave={next => client.setQueryData(queryKey, next)} />)}
                </div>
            </>}
        </section>
    );
}

function ModelCard({ model, token, onSave }) {
    const [editing, setEditing] = useState(false);
    const { today, recent, limits } = model;
    const status = !model.enabled ? 'Disabled' : !model.qualityApproved ? 'Pending approval' : !model.configured ? 'Missing API setup' : 'Enabled';
    const usage = [today.attempts, recent.attempts, recent.input];
    const freeShare = today.attempts ? Math.round(100 * today.freeAttempts / today.attempts) : null;
    const averages = [
        ['Normal average', today.freeTokens - today.freeDeepTokens, today.freeAnswers - today.freeDeepAnswers],
        ['Deep study average', today.freeDeepTokens, today.freeDeepAnswers],
    ];
    return (
        <article className="min-w-0 rounded-xl border border-white/10 bg-black/15 p-4" aria-label={model.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="break-all text-sm font-semibold text-white">{model.id}</h3>
                <span className="text-xs text-slate-400">{status}</span>
            </div>
            <dl className="mt-4 space-y-3">
                {metrics.map(([key, label], i) => <CapacityMeter key={key} label={label} used={usage[i]} limit={limits?.[key]} />)}
            </dl>
            <div className="mt-4 border-t border-white/10 pt-3 text-xs leading-6 text-slate-400">
                <p><span className="font-medium text-slate-200">Tokens today</span> {number.format(today.input)} input · {number.format(today.output)} output · {number.format(today.thinking)} thinking</p>
                {today.unmeasured > 0 && <p>{number.format(today.unmeasured)} calls had no reported input count.</p>}
                <p className={today.rateLimited || today.unavailable ? 'text-amber-300' : undefined}>{number.format(today.rateLimited)} quota errors (429) · {number.format(today.unavailable)} provider errors (5xx)</p>
                {today.attempts === 0 && <p>No Wasla calls recorded today.</p>}
                {freeShare !== null && <p><span className="font-medium text-slate-200">Free plan</span> {freeShare}% of Wasla calls · {number.format(today.freeAnswers)} answers · {number.format(today.freeTokens)} tokens used</p>}
                {today.freeAnswers > 0 && <p>{averages.filter(([, , count]) => count > 0).map(([label, total, count]) => `${label} ${number.format(Math.round(total / count))} tokens`).join(' · ')}</p>}
            </div>
            <div className="mt-4">
                {model.limitsUpdatedAt && <p className="mb-2 text-xs text-slate-400">Quota values entered {localTime.format(new Date(model.limitsUpdatedAt))}.</p>}
                {editing ? <CapacityLimitForm token={token} model={model} onCancel={() => setEditing(false)} onSave={next => { onSave(next); setEditing(false); }} />
                    : <button type="button" className={button} onClick={() => setEditing(true)}>{limits ? 'Edit quota estimates' : 'Enter Google quota'}</button>}
            </div>
        </article>
    );
}

function CapacityMeter({ label, used, limit }) {
    const known = Number.isSafeInteger(limit);
    const remaining = known ? Math.max(0, limit - used) : null;
    const consumed = known ? (limit > 0 ? Math.min(100, used / limit * 100) : 100) : 0;
    return (
        <div>
            <div className="flex flex-wrap justify-between gap-x-3 text-xs">
                <dt className="font-medium text-slate-300">{label}</dt>
                <dd className="tabular-nums text-slate-400">{known ? `${number.format(used)} / ${number.format(limit)} · ${number.format(remaining)} est. left` : `${number.format(used)} observed · quota unset`}</dd>
            </div>
            {known && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700/60" aria-hidden="true">
                <div className={`h-full rounded-full ${consumed >= 80 ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${consumed}%` }} />
            </div>}
        </div>
    );
}

function CapacityLimitForm({ token, model, onSave, onCancel }) {
    const dialogRef = useRef(null);
    const [fields, setFields] = useState(() => Object.fromEntries(metrics.map(([key]) => [key, model.limits?.[key]?.toString() ?? ''])));
    const save = useMutation({ mutationFn: () => request(token, `/${encodeURIComponent(model.id)}`, {
        method: 'PUT', body: JSON.stringify(Object.fromEntries(metrics.map(([key]) => [key, fields[key] === '' ? null : Number(fields[key])]))),
    }), onSuccess: onSave });
    useEffect(() => {
        const dialog = dialogRef.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return (
        <dialog ref={dialogRef} aria-labelledby="quota-editor-title"
            onCancel={event => { event.preventDefault(); if (!save.isPending) onCancel(); }}
            className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#101725] p-5 text-white backdrop:bg-black/60">
            <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
                <h3 id="quota-editor-title" className="text-lg font-semibold">Google quota for {model.id}</h3>
                <p className="text-xs leading-5 text-slate-400">Use the values for Wasla’s project in AI Studio. Leave unknown limits blank.</p>
                <div className="grid gap-2">
                    {metrics.map(([key, , label]) => <label key={key} className="min-w-0 text-xs text-slate-300">
                        {label}
                        <input type="number" min="0" max="1000000000000" step="1" value={fields[key]} disabled={save.isPending}
                            onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))}
                            className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-base text-white" />
                    </label>)}
                </div>
                {save.error && <p role="alert" className="text-xs text-rose-300">{save.error.message}</p>}
                <div className="flex flex-wrap gap-2">
                    <button className={button} disabled={save.isPending}>Save quota estimates</button>
                    <button type="button" className={button} disabled={save.isPending} onClick={onCancel}>Cancel</button>
                </div>
            </form>
        </dialog>
    );
}
