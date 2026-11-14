import { useEffect, useState } from 'react';

export function noteCanEdit(createdAt, now = Date.now()) {
    const savedAt = Date.parse(createdAt || '');
    return Number.isFinite(savedAt) && savedAt <= now && now < savedAt + 5 * 60000;
}

export default function useNoteEditWindow(createdAt) {
    const [allowed, setAllowed] = useState(() => noteCanEdit(createdAt));
    useEffect(() => {
        let timer;
        const refresh = () => {
            clearTimeout(timer);
            setAllowed(noteCanEdit(createdAt));
            const remaining = Date.parse(createdAt || '') + 5 * 60000 - Date.now();
            if (remaining > 0) timer = setTimeout(refresh, remaining);
        };
        timer = setTimeout(refresh, 0);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('focus', refresh);
        return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
    }, [createdAt]);
    return allowed;
}
