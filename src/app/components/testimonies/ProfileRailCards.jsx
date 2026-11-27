import { flushSync } from 'react-dom';
import { useLayoutEffect, useState } from 'react';

// The surrounding rail owns scrolling and the Share/More buttons. Spacer widths
// include the gap between omitted cards so the browser keeps its native snap.
export default function ProfileRailCards({ rail, items, leading, position, renderCard }) {
  const [range, setRange] = useState(() => {
    const index = Math.max(0, items.findIndex(item => item._id === position.id));
    return { first: Math.max(0, index - 2), end: index + 8, gap: 12 };
  });
  const [focused, setFocused] = useState(null);
  useLayoutEffect(() => {
    const node = rail;
    if (!node) return;
    const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
    const pitch = 88 + gap;
    const savedIndex = items.findIndex(item => item._id === position.id);
    if (savedIndex >= 0) {
      const left = (savedIndex + Number(leading)) * pitch + position.offset;
      node.scrollLeft = getComputedStyle(node).direction === 'rtl' ? -left : left;
    }
    const measure = (rememberOnly = false) => {
      const left = Math.abs(node.scrollLeft);
      const index = Math.floor(left / pitch) - Number(leading);
      const first = Math.max(0, index - 2);
      const end = Math.max(first + 1, index + Math.ceil(node.clientWidth / pitch) + 3);
      const current = items[Math.max(index, 0)];
      if (current && node.clientWidth) {
        position.id = current._id;
        position.offset = left - (Math.max(index, 0) + Number(leading)) * pitch;
      }
      if (rememberOnly === true) return;
      setRange(old => old.first === first && old.end === end && old.gap === gap ? old : { first, end, gap });
    };
    const focus = event => setFocused(event.target.closest('[data-profile-note]')?.dataset.profileNote || null);
    const keydown = event => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const id = event.target.closest('[data-profile-note]')?.dataset.profileNote;
      if (!id) return;
      const index = items.findIndex(item => item._id === id) + (event.shiftKey ? -1 : 1);
      const next = items[index];
      if (!next) return;
      const selector = '[data-profile-note="' + CSS.escape(next._id) + '"] button';
      if (node.querySelector(selector)) return;
      event.preventDefault();
      // Rapid tab presses can outrun the scroll event that mounts the next window.
      flushSync(() => setRange(old => ({ ...old, first: Math.max(0, index - 2),
        end: index + Math.ceil(node.clientWidth / pitch) + 3 })));
      node.querySelector(selector)?.focus();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener('keydown', keydown);
    node.addEventListener('focusin', focus);
    node.addEventListener('scroll', measure, { passive: true });
    return () => {
      if (node.isConnected) measure(true);
      observer.disconnect();
      node.removeEventListener('keydown', keydown);
      node.removeEventListener('focusin', focus);
      node.removeEventListener('scroll', measure);
    };
  }, [rail, leading, position, items]);

  const indices = [];
  for (let i = range.first; i < Math.min(range.end, items.length); i++) indices.push(i);
  const pinned = focused ? items.findIndex(item => item._id === focused) : -1;
  if (pinned >= 0 && !indices.includes(pinned)) { indices.push(pinned); indices.sort((a, b) => a - b); }
  const nodes = [];
  let next = 0;
  const spacer = end => {
    if (end > next) nodes.push(<div key={'gap-' + next} aria-hidden="true" style={{ flex: '0 0 ' + ((end - next) * (88 + range.gap) - range.gap) + 'px' }} />);
  };
  for (const i of indices) {
    spacer(i);
    nodes.push(renderCard(items[i], i));
    next = i + 1;
  }
  spacer(items.length);
  return nodes;
}
