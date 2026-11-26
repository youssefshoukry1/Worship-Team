'use client';

import { useLayoutEffect, useRef, useState } from 'react';

// Each single-line card has a 2.5rem avatar, 1.5rem of padding, two
// border pixels and a .5rem gap. Measure the slot to respect root text sizing.
const slot = 'calc(4.5rem + 2px)';

export default function FriendWindow({ rows, total, active, target, onReveal, children }) {
  const root = useRef(null);
  const handled = useRef(null);
  const anchor = useRef(null);
  const restored = useRef(null);
  const previousRows = useRef(rows);
  const [range, setRange] = useState({ start: 0, end: 24 });
  const [focusId, setFocusId] = useState(null);

  useLayoutEffect(() => {
    if (!active || !rows.length) return;
    const list = root.current;
    const update = () => {
      const stride = list.firstElementChild?.getBoundingClientRect().height;
      if (!stride) return;
      const top = list.getBoundingClientRect().top;
      const start = Math.max(0, Math.min(rows.length - 1, Math.floor((-top - innerHeight) / stride)));
      const end = Math.min(rows.length, Math.max(start + 1, Math.ceil((2 * innerHeight - top) / stride)));
      const first = Math.max(0, Math.floor(-top / stride));
      anchor.current = top <= 0 && rows[first] ? { id: rows[first]._id, index: first } : null;
      setRange(old => old.start === start && old.end === end ? old : { start, end });
    };
    const previous = anchor.current;
    if (!target && previousRows.current !== rows && previous && rows[previous.index]?._id !== previous.id) {
      const index = rows.findIndex(row => row._id === previous.id);
      const stride = list.firstElementChild?.getBoundingClientRect().height;
      if (index >= 0 && stride) window.scrollBy({ top: (index - previous.index) * stride, behavior: 'instant' });
    }
    previousRows.current = rows;
    if (target && handled.current !== target) {
      const index = rows.findIndex(row => row._id === target.actorId);
      const stride = list.firstElementChild?.getBoundingClientRect().height;
      if (index >= 0 && stride) {
        const offset = target.offset ?? (innerHeight - stride) / 2;
        window.scrollTo({ top: scrollY + list.getBoundingClientRect().top + index * stride - offset, behavior: 'instant' });
        restored.current = target.offset == null ? null : { index, offset };
        handled.current = target;
        onReveal();
      }
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    const release = () => { restored.current = null; };
    const observer = new ResizeObserver(() => {
      const position = restored.current;
      const stride = list.firstElementChild?.getBoundingClientRect().height;
      if (position && stride) {
        const delta = list.getBoundingClientRect().top + position.index * stride - position.offset;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
      }
      update();
    });
    const page = list.closest('.app-page');
    if (page) observer.observe(page);
    const inputs = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
    inputs.forEach(type => window.addEventListener(type, release, { passive: true, capture: true }));
    observer.observe(list);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      inputs.forEach(type => window.removeEventListener(type, release, true));
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [active, rows, target, onReveal]);

  const indices = [];
  for (let i = Math.min(range.start, Math.max(0, rows.length - 1)); i < Math.min(range.end, rows.length); i++) indices.push(i);
  if (focusId) {
    const focused = rows.findIndex(row => row._id === focusId);
    if (focused >= 0 && !indices.includes(focused)) indices.push(focused);
    indices.sort((a, b) => a - b);
  }
  return <div ref={root} role="list" aria-label="My Friends" className="relative"
    style={{ height: `calc(${rows.length} * ${slot})` }}
    onFocus={event => setFocusId(event.target.closest('[data-friend-id]')?.dataset.friendId)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusId(null); }}>
    {indices.map(index => <div key={rows[index]._id} role="listitem" aria-posinset={index + 1} aria-setsize={total}
      className="absolute inset-x-0" style={{ height: slot, top: `calc(${index} * ${slot})` }}>
      {children(rows[index])}
    </div>)}
  </div>;
}
