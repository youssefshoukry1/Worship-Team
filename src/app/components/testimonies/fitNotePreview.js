// Observe the actual wrapped text at the two larger sizes. All measurements
// arrive from the same browser layout, before paint. Styling the visible title
// cannot resize the probes or the fixed-size button.
export function observeNotePreview(button) {
  const title = button.querySelector('h3');
  const probes = [...button.querySelectorAll('[data-preview-size]')];
  const heights = new Map();
  const observer = new ResizeObserver(entries => {
    for (const { target, contentRect } of entries) heights.set(target, contentRect.height);
    const available = heights.get(button);
    if (!available || probes.some(probe => !heights.get(probe))) return;

    let size = 8;
    for (const probe of probes) {
      const candidate = Number(probe.dataset.previewSize);
      const lineHeight = candidate * 1.4;
      const lines = Math.floor(available / lineHeight);
      if (heights.get(probe) <= lines * lineHeight + 0.5) {
        size = candidate;
        break;
      }
    }
    title.style.fontSize = `${size}px`;
    title.style.webkitLineClamp = String(Math.max(1, Math.floor(available / (size * 1.4))));
  });
  observer.observe(button);
  for (const probe of probes) observer.observe(probe);
  return () => observer.disconnect();
}
