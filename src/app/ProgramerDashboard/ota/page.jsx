'use client';
import PageSkeleton from '../../components/PageSkeleton';

import { useContext, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, RefreshCw, Package, Users, Smartphone, FlaskConical, Pause, ArrowUpRight, Check, Loader2, SlidersHorizontal } from 'lucide-react';
import { UserContext } from '../../context/User_Context';
import { controlApiRequest } from '../../services/controlApi';
import { compareVersions } from '../../utils/appVersion';

const labels = { held: 'On hold', programer: 'PROGRAMER only', all: 'All users' };
const badgeColors = { held: 'bg-slate-400/10 text-slate-300', programer: 'bg-violet-400/10 text-violet-300', all: 'bg-emerald-400/10 text-emerald-300' };
const panel = 'rounded-2xl border border-white/[0.08] bg-[#101725]';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed';

function apiRequest(token, path, options = {}) {
    return controlApiRequest(token, `/ota${path}`, options, 'OTA controls');
}

function Status({ audience = 'held' }) {
    return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeColors[audience]}`}>{labels[audience]}</span>;
}

function ReleaseControls({ release, onSave, busy }) {
    const [audience, setAudience] = useState(release.audience || 'held');
    const [showSplash, setShowSplash] = useState(release.showSplash === true);
    const changed = audience !== (release.audience || 'held') || showSplash !== (release.showSplash === true);
    return <form onSubmit={event => {
        event.preventDefault();
        onSave({ version: release.version, url: release.url, audience, showSplash, expectedRevision: release.revision || 0 });
    }} className="space-y-5">
        <fieldset disabled={busy}>
            <legend className="mb-3 text-sm font-semibold text-slate-200">Who should receive this version?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
                {[
                    { value: 'held', Icon: Pause, title: 'Hold', description: 'Keep this version private.' },
                    { value: 'programer', Icon: FlaskConical, title: 'PROGRAMER only', description: 'Test on your signed-in devices.' },
                    { value: 'all', Icon: Users, title: 'All users', description: 'Release to everyone.' },
                ].map(({ value, Icon, title, description }) => <label key={value} className={`relative cursor-pointer rounded-xl border p-4 transition ${audience === value ? 'border-sky-400/70 bg-sky-400/[0.07]' : 'border-white/[0.08] hover:border-white/20'}`}>
                    <input type="radio" name={`audience-${release.version}`} value={value} checked={audience === value} onChange={() => setAudience(value)} className="absolute right-3 top-4 accent-sky-400" />
                    <Icon size={19} className={audience === value ? 'text-sky-300' : 'text-slate-400'} />
                    <span className="mt-3 block pr-3 text-sm font-semibold text-white">{title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-400">{description}</span>
                </label>)}
            </div>
        </fieldset>
        <label className="flex cursor-pointer items-center justify-between gap-5 rounded-xl border border-white/[0.07] bg-black/10 p-4">
            <span><span className="block text-sm font-semibold text-slate-100">Show update intro</span><span className="mt-1 block text-xs leading-relaxed text-slate-400">Play the Wasla intro once after this higher version activates. First openings stay silent.</span></span>
            <input aria-label="Show update intro" type="checkbox" role="switch" checked={showSplash} onChange={event => setShowSplash(event.target.checked)} disabled={busy} className="h-5 w-5 shrink-0 accent-sky-400" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-sm text-xs leading-relaxed text-slate-400">Holding a version stops future delivery. Devices already running it keep their installed version.</p>
            <button type="submit" disabled={busy || (!changed && Boolean(release.revision))} className={`${button} border-sky-400/30 bg-sky-400 text-[#07121e] hover:bg-sky-300`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {audience === 'held' ? 'Hold this version' : audience === 'programer' ? 'Release to PROGRAMER' : 'Release to all users'}
            </button>
        </div>
    </form>;
}

function Metric({ Icon, label, value, detail }) {
    return <div className={`${panel} p-5`}><div className="flex items-center gap-2 text-xs font-medium text-slate-400"><Icon size={15} />{label}</div><p className="mt-3 break-words text-2xl font-bold tracking-tight text-white">{value || '—'}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p></div>;
}

export default function OtaControlPage() {
    const { isLogin } = useContext(UserContext);
    const queryClient = useQueryClient();
    const [notice, setNotice] = useState('');
    const [expanded, setExpanded] = useState(null);
    // The server's current account role decides access, even if the cached role is stale.
    const allowed = Boolean(isLogin);
    const queryKey = ['ota-dashboard', isLogin];
    const query = useQuery({
        queryKey, enabled: allowed, queryFn: () => apiRequest(isLogin, '/admin'),
        refetchInterval: 60000, retry: false,
    });
    const save = useMutation({
        mutationFn: body => apiRequest(isLogin, '/admin/releases', { method: 'POST', body: JSON.stringify(body) }),
        onSuccess: async ({ release }) => {
            setNotice(`Version ${release.version}: ${labels[release.audience].toLowerCase()}. Update intro ${release.showSplash ? 'enabled' : 'disabled'}.`);
            await queryClient.invalidateQueries({ queryKey });
            window.dispatchEvent(new CustomEvent('wasla_ota_check'));
        },
    });

    if (!allowed || [401, 403].includes(query.error?.status)) return <div className="mx-auto max-w-lg px-5 py-24 text-center"><ShieldCheck className="mx-auto mb-4 text-slate-400" size={36} /><h1 className="text-2xl font-bold">Private dashboard</h1><p className="mt-3 text-slate-400">Only PROGRAMER accounts can access these controls.</p><Link href="/normal_UserProfile" className={`${button} mt-6`}>Back to profile</Link></div>;

    const data = query.data;
    const candidate = data?.candidate;
    const candidateRelease = candidate && data.releases.find(release => release.version === candidate.version);
    const versions = Object.values((data?.versions || []).reduce((rows, row) => {
        const group = rows[row.version] ||= { version: row.version, users: 0, programers: 0, android: 0, ios: 0 };
        group[row.role === 'PROGRAMER' ? 'programers' : 'users'] += row.count;
        group[row.platform] += row.count;
        return rows;
    }, {})).sort((a, b) => compareVersions(b.version, a.version) || 0);
    const totalDevices = versions.reduce((sum, row) => sum + row.users + row.programers, 0);
    const latestUserVersion = versions.find(row => row.users > 0 && compareVersions(row.version, row.version) === 0)?.version;

    return <div className="min-h-screen bg-[#090f1a] px-4 pb-28 pt-8 text-slate-200 sm:px-7 sm:pt-12" dir="ltr">
        <div className="mx-auto max-w-6xl">
            <Link href="/ProgramerDashboard" className="mb-5 inline-block text-sm text-sky-300 hover:text-sky-200">← App control center</Link>
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300"><ShieldCheck size={15} />PROGRAMER</div><h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">App control center</h1><p className="mt-2 text-sm text-slate-400">Test privately. Release when you’re ready.</p></div>
                <button className={button} disabled={query.isFetching || save.isPending} onClick={() => query.refetch()}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />Refresh</button>
            </header>
            <div className="mb-7 flex items-center gap-2 border-b border-white/[0.08] pb-4 text-sm font-semibold text-sky-300"><SlidersHorizontal size={17} />OTA controll</div>
            {(query.error || save.error) && <div role="alert" className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{(save.error || query.error).message}</div>}
            {notice && <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200"><Check size={18} className="shrink-0" />{notice}</div>}
            {query.isPending ? <PageSkeleton variant="dashboard" compact /> : data && <>
                <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric Icon={Users} label="Released to users" value={data.publicRelease?.version} detail="Highest version approved for everyone" />
                    <Metric Icon={FlaskConical} label="Available to PROGRAMER" value={data.programerRelease?.version} detail="Includes public and private test releases" />
                    <Metric Icon={Smartphone} label="Latest on user devices" value={latestUserVersion} detail="Last reported by regular users" />
                    <Metric Icon={Package} label="Candidate ready" value={candidate?.version} detail={candidate ? 'Read from version.json · manual release' : 'Candidate could not be loaded'} />
                </div>
                <section className={`${panel} mb-7 overflow-hidden`} aria-labelledby="candidate-title">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-gradient-to-r from-sky-400/[0.06] to-transparent px-5 py-5 sm:px-6"><div><p className="mb-1 text-xs uppercase tracking-wider text-slate-500">Next release</p><h2 id="candidate-title" className="text-lg font-semibold text-white">{candidate ? `Version ${candidate.version}` : 'GitHub candidate'}</h2></div><Status audience={candidateRelease?.audience} /></div>
                    <div className="space-y-5 p-5 sm:p-6">
                        <p className="text-sm leading-relaxed text-slate-400">Uploading a new bundle and changing version.json makes it available here. Choose an audience and save to allow delivery. Earlier public releases remain available while a newer version is on hold or being tested.</p>
                        {data.candidateError && <p role="alert" className="text-sm text-amber-300">{data.candidateError}</p>}
                        {candidate && <><a href={candidate.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200">View GitHub bundle<ArrowUpRight size={15} /></a>
                            <ReleaseControls key={`${candidate.version}-${candidateRelease?.revision || 0}`} release={{ ...candidate, ...candidateRelease }} onSave={save.mutate} busy={save.isPending} /></>}
                    </div>
                </section>
                <section className={`${panel} mb-7 p-5 sm:p-6`} aria-labelledby="device-versions-title">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 id="device-versions-title" className="text-lg font-semibold text-white">Versions on devices</h2><p className="mt-1 text-xs leading-relaxed text-slate-400">{totalDevices} installations seen in the last {data.reportWindowDays} days. Reports update when signed-in apps check for updates.</p></div><span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-400">Refreshes every minute</span></div>
                    {versions.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm leading-relaxed text-slate-500">No device reports yet. Versions appear after installed apps receive this updater and open while signed in.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-white/10 text-xs text-slate-500"><tr>{['Version', 'Users', 'PROGRAMER', 'Android', 'iOS'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{versions.map(row => <tr key={row.version} className="border-b border-white/5 last:border-0"><td className="px-3 py-4 font-mono font-semibold text-white">{row.version}</td><td className="px-3 py-4">{row.users}</td><td className="px-3 py-4 text-violet-300">{row.programers}</td><td className="px-3 py-4 text-slate-400">{row.android}</td><td className="px-3 py-4 text-slate-400">{row.ios}</td></tr>)}</tbody></table></div>}
                </section>
                <section className={`${panel} mb-7 p-5 sm:p-6`} aria-labelledby="release-history-title"><h2 id="release-history-title" className="mb-1 text-lg font-semibold text-white">Release history</h2><p className="mb-5 text-xs text-slate-400">Review earlier releases or change their audience and intro setting.</p>
                    {data.releases.length === 0 ? <p className="text-sm text-slate-500">No releases saved yet. Candidates start on hold.</p> : <div className="divide-y divide-white/[0.07]">{data.releases.map(release => <div key={release.version} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><span className="font-mono font-semibold text-white">{release.version}</span><Status audience={release.audience} /><span className="text-xs text-slate-500">Intro {release.showSplash ? 'on' : 'off'} · {new Date(release.updatedAt).toLocaleString()}</span></div><button className="rounded-lg px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-white/5" aria-expanded={expanded === release.version} onClick={() => setExpanded(expanded === release.version ? null : release.version)}>{expanded === release.version ? 'Close' : 'Manage'}</button></div>{expanded === release.version && <div className="mt-5"><ReleaseControls key={`${release.version}-${release.revision}`} release={release} onSave={save.mutate} busy={save.isPending} /></div>}</div>)}</div>}
                </section>
                <details className={`${panel} px-5 py-4 sm:px-6`}><summary className="cursor-pointer text-sm font-semibold text-slate-300">Recent device check-ins</summary><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr>{['Device', 'Platform', 'Version', 'Role', 'Last seen'].map(label => <th key={label} className="whitespace-nowrap px-2 py-2">{label}</th>)}</tr></thead><tbody>{data.devices.map(device => <tr key={device._id} className="border-t border-white/5"><td className="px-2 py-3 font-mono">{device.installationId.slice(0, 8)}</td><td className="px-2 py-3">{device.platform}</td><td className="px-2 py-3">{device.version}</td><td className="px-2 py-3">{device.role}</td><td className="whitespace-nowrap px-2 py-3 text-slate-400">{new Date(device.lastSeen).toLocaleString()}</td></tr>)}</tbody></table></div></details>
            </>}
        </div>
    </div>;
}
