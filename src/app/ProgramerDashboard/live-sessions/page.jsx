'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import SettingsLink from '../../components/profile/SettingsLink';
import useProgramerAccess from '../useProgramerAccess';
import { controlApiRequest } from '../../services/controlApi';

const card = 'rounded-2xl border border-white/10 bg-[#101725] p-5 sm:p-6';
const input = 'mt-2 block w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white';
const button = 'rounded-lg bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-400/20 disabled:opacity-40';
const fields = [
    ['allowanceMinutes', 'Account allowance (minutes)', 34560],
    ['resetHours', 'Allowance reset interval (hours)', 8760],
    ['roomHours', 'Room expires after (hours)', 576],
];

function Controls({ token }) {
    const client = useQueryClient();
    const [draft, setDraft] = useState(null);
    const [username, setUsername] = useState('');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [notice, setNotice] = useState('');
    const api = (path, options) => controlApiRequest(token, '/presentation/admin' + path, options, 'Live session controls');
    const key = ['live-session-policy', token];
    const policy = useQuery({ queryKey: key, queryFn: () => api('/policy'), retry: false });
    const users = useQuery({ queryKey: ['live-session-users', token, search], enabled: !!search,
        queryFn: () => api('/users?username=' + encodeURIComponent(search)), retry: false });
    const save = useMutation({
        mutationFn: () => api('/policy', { method: 'PUT', body: JSON.stringify(draft) }),
        onSuccess: data => { client.setQueryData(key, data); setDraft(null); setNotice('Session settings saved.'); }
    });
    const reset = useMutation({
        mutationFn: id => api('/users/' + id + '/reset', { method: 'POST' }),
        onSuccess: data => { setSelected(null); setNotice('Allowance reset for @' + data.username + '.'); }
    });
    const values = draft || policy.data;
    const error = save.error || reset.error || users.error || policy.error;

    return <div className="space-y-5">
        <section className={card}>
            <h2 className="text-lg font-semibold">Session limits</h2>
            <p className="mt-1 text-sm text-slate-400">Room expiry applies to new rooms. The allowance applies to signed-in readers.</p>
            {policy.isLoading && <p role="status">Loading settings…</p>}
            {values && <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
                <div className="grid gap-4 sm:grid-cols-3">{fields.map(([name, label, max]) =>
                    <label key={name} className="text-sm text-slate-300">{label}
                        <input className={input} type="number" required min="1" max={max} step="1" value={values[name]} disabled={save.isPending}
                            onChange={e => { setNotice(''); setDraft({ ...values, [name]: e.target.value === '' ? '' : Number(e.target.value) }); }} />
                    </label>)}</div>
                <button className={button} disabled={!draft || save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</button>
            </form>}
        </section>
        <section className={card}>
            <h2 className="text-lg font-semibold">Reset an account</h2>
            <form className="mt-3 flex items-end gap-2" onSubmit={e => {
                e.preventDefault(); setSelected(null); setNotice(''); reset.reset();
                const value = username.trim().replace(/^@/, '');
                if (value === search) users.refetch(); else setSearch(value);
            }}>
                <label className="flex-1 text-sm text-slate-300">Username<input className={input} placeholder="@username" maxLength={31} value={username} onChange={e => setUsername(e.target.value)} /></label>
                <button className={button} disabled={reset.isPending || username.trim().replace(/^@/, '').length < 2}>Search</button>
            </form>
            {users.isFetching && <p role="status" className="mt-3 text-sm">Searching…</p>}
            {users.data?.users.length === 0 && <p className="mt-3 text-sm text-slate-400">No matching accounts.</p>}
            <ul className="mt-3 divide-y divide-white/10">{users.data?.users.map(user =>
                <li key={user.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span>@{user.username}</span>
                    <button className={button} disabled={reset.isPending} onClick={() => { setSelected(user); setNotice(''); }}>Reset</button></li>)}</ul>
            {selected && <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                <p className="text-sm">Restore the full live-session allowance for <strong>@{selected.username}</strong> and start a new reset window now?</p>
                <button className={button} disabled={reset.isPending} onClick={() => reset.mutate(selected.id)}>Confirm reset</button>
                <button className="ms-4 text-sm text-slate-400" disabled={reset.isPending} onClick={() => setSelected(null)}>Cancel</button>
            </div>}
        </section>
        {error && <p role="alert" className="text-sm text-rose-300">{error.message}</p>}
        {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    </div>;
}

export default function LiveSessionControlsPage() {
    const access = useProgramerAccess();
    return <main className="app-page min-h-screen px-4 pb-24 pt-10 text-slate-200" dir="ltr"><div className="mx-auto max-w-3xl">
        <SettingsLink href="/ProgramerDashboard" className="text-sm text-sky-300">← App control center</SettingsLink>
        <h1 className="mb-6 mt-4 text-3xl font-bold text-white">Live sessions</h1>
        {access.isPending ? <p>Checking access…</p> : access.hasAccess ? <Controls token={access.isLogin} key={access.isLogin} /> :
            <p role="alert">{access.error?.message || 'Programmer access required.'}</p>}
    </div></main>;
}
