// Choose from three sizes using rendered wrapping, not character counts.
export function fitNotePreview(text) {
  const button = text.parentElement;
  const padding = getComputedStyle(button);
  const available = button.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
  if (available <= 0 || !text.clientWidth) return;

  text.style.webkitLineClamp = 'unset';
  for (const size of [10, 9, 8]) {
    const lineHeight = size * 1.4;
    text.style.fontSize = `${size}px`;
    text.style.lineHeight = `${lineHeight}px`;
    const lines = Math.max(1, Math.floor(available / lineHeight));
    if (text.scrollHeight <= Math.round(lines * lineHeight) || size === 8) {
      text.style.webkitLineClamp = String(lines);
      break;
    }
  }
}
