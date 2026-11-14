'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import styles from './PrayerBackup.module.css';

const intervals = [0, 7, 14, 30];

export default function BackupFrequency({ value, labels, disabled, onChange }) {
    const [open, setOpen] = useState(false);
    const root = useRef(null);
    const trigger = useRef(null);
    const menuId = useId();
    const label = days => days === 0 ? labels.off : labels.days(days);
    const close = () => { setOpen(false); trigger.current?.focus(); };

    useEffect(() => {
        if (!open) return;
        const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', dismiss);
        root.current?.querySelector('[aria-checked="true"]')?.focus();
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

    return <div ref={root} className={styles.frequencyPicker} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
        <button ref={trigger} type="button" disabled={disabled} className={styles.frequencyTrigger}
            aria-label={`${labels.automatic}: ${label(value)}`} aria-haspopup="menu" aria-expanded={open && !disabled}
            aria-controls={open && !disabled ? menuId : undefined}
            onClick={() => setOpen(previous => !previous)}
            onKeyDown={event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
            }}>
            <span>{label(value)}</span><ChevronDown size={14} className={open ? styles.frequencyChevronOpen : undefined} />
        </button>
        {open && !disabled && <div id={menuId} role="menu" aria-label={labels.automatic} className={styles.frequencyMenu}
            onKeyDown={event => {
                const options = [...event.currentTarget.querySelectorAll('[role="menuitemradio"]')];
                const current = options.indexOf(document.activeElement);
                let next;
                if (event.key === 'ArrowDown') next = (current + 1) % options.length;
                if (event.key === 'ArrowUp') next = (current - 1 + options.length) % options.length;
                if (event.key === 'Home') next = 0;
                if (event.key === 'End') next = options.length - 1;
                if (next !== undefined) { event.preventDefault(); options[next].focus(); }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
                if (event.key === 'Tab') setOpen(false);
            }}>
            {intervals.map(days => <button key={days} type="button" role="menuitemradio" aria-checked={value === days}
                className={styles.frequencyOption} tabIndex={-1}
                onClick={() => { close(); onChange(days, trigger.current); }}>
                <span>{label(days)}</span>{value === days && <Check size={14} />}
            </button>)}
        </div>}
    </div>;
}
