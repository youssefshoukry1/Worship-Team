'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import styles from './testimonies.module.css';

export default function NoteActionsMenu({ canEdit, disabled, onEdit, onDelete }) {
    const [open, setOpen] = useState(false);
    const root = useRef(null);
    const trigger = useRef(null);
    const id = useId();
    const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
    useEffect(() => {
        if (!open) return;
        root.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
        const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open, canEdit]);
    return <div ref={root} className={styles.noteActions} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
        <button ref={trigger} type="button" className={styles.iconButton} disabled={disabled}
            aria-label="Note options" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
            onClick={() => setOpen(value => !value)} onKeyDown={event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
            }}><Ellipsis size={20} /></button>
        {open && <div id={id} role="menu" aria-label="Note options" className={styles.noteActionsPopup}
            onKeyDown={event => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
                const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')];
                const current = items.indexOf(document.activeElement);
                let next;
                if (event.key === 'ArrowDown') next = (current + 1) % items.length;
                if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
                if (event.key === 'Home') next = 0;
                if (event.key === 'End') next = items.length - 1;
                if (next !== undefined) { event.preventDefault(); items[next].focus(); }
            }}>
            {canEdit && <button type="button" role="menuitem" disabled={disabled} onClick={() => { close(); onEdit(); }}><Pencil size={14} />Edit</button>}
            <button type="button" role="menuitem" disabled={disabled} className={styles.noteDeleteAction} onClick={() => { close(); onDelete(); }}><Trash2 size={14} />Delete</button>
        </div>}
    </div>;
}
