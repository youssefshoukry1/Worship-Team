import '../../../public/bible-change-journal';
import { invalidateProfile } from './profileCache';
import { groupNotes, groupHighlights } from './bibleProfileGroups';

export const journal = globalThis.waslaBibleJournal;
export const activeTeam = () => {
    const value = localStorage.getItem('user_Taspe7_ChurchId');
    return value && !['null', 'undefined'].includes(value) ? value : '';
};
export function credentials() {
    return { owner: localStorage.getItem('user_Taspe7_ID'), token: localStorage.getItem('user_Taspe7_Token'), team: activeTeam() };
}

const observers = new Set();
let disconnect;
export function watchBibleChanges(callback) {
    observers.add(callback);
    if (!disconnect) {
        const deliver = detail => {
            const auth = credentials();
            if (auth.owner !== detail.owner) return;
            invalidateProfile(detail.api, auth.token);
            for (const observer of observers) observer(detail);
        };
        if (typeof BroadcastChannel === 'function') {
            const channel = new BroadcastChannel('wasla-bible-changes');
            channel.onmessage = event => deliver(event.data);
            disconnect = () => channel.close();
        } else {
            const receive = event => deliver(event.detail);
            window.addEventListener('wasla:bible-change', receive);
            disconnect = () => window.removeEventListener('wasla:bible-change', receive);
        }
    }
    return () => {
        observers.delete(callback);
        if (!observers.size) { disconnect(); disconnect = null; }
    };
}

export async function writeBibleChange(api, owner, token, kind, remove, entries) {
    const sequence = await journal.enqueue({ api, owner, team: activeTeam(), kind, remove, entries, token });
    invalidateProfile(api, token);
    const synced = navigator.onLine && await journal.flush(credentials(), sequence);
    invalidateProfile(api, token);
    if (!synced) navigator.serviceWorker?.getRegistration().then(reg => reg?.sync?.register('wasla-bible-changes')).catch(() => {});
    return synced;
}

export function overlayBibleGroups(base, edits, kind) {
    if (!edits.length) return base;
    const field = kind === 'notes' ? 'note' : 'color';
    const verses = new Map();
    const key = (team, verse) => JSON.stringify([team, String(verse)]);
    for (const group of base) for (const verse of group.verses) {
        verses.set(key(verse.churchId || '', verse.verseId), { ...verse, bookName: group.bookName,
            chapter: group.chapter, date: verse.date || group.date, [field]: group[field] });
    }
    for (const edit of edits) for (const entry of edit.entries) {
        const id = key(edit.team, entry.verseId);
        const existing = verses.get(id);
        if (entry.noteId && existing?._id && String(existing._id) !== entry.noteId) continue;
        if (edit.remove) verses.delete(id);
        else verses.set(id, { ...entry, _id: existing?._id || entry.noteId, churchId: edit.team || null,
            date: edit.date, [field]: entry.value });
    }
    return (kind === 'notes' ? groupNotes : groupHighlights)(Array.from(verses.values()));
}

export function applyBibleMap(base, edits) {
    const map = { ...base };
    for (const edit of edits) for (const entry of edit.entries) {
        if (edit.remove) delete map[entry.verseId];
        else map[entry.verseId] = entry.value;
    }
    return map;
}
export function readerKey(api, owner, team, kind) {
    return 'wasla_bible_reader_' + JSON.stringify([api, owner || 'guest', team, kind]);
}
export function readReaderMap(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
export function saveReaderMap(key, map) {
    try { localStorage.setItem(key, JSON.stringify(map)); } catch { /* Journal remains durable. */ }
}
