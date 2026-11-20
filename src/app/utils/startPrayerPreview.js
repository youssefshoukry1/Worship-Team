// Runs from the exported HTML before the Next.js bundles. Only the native
// cover can be dismissed here. Account services still await the live screen.
export const startPrayerPreview = `(() => {
  const root = document.documentElement;
  const bridge = window.Capacitor?.Plugins?.WaslaLaunch;
  const shell = document.currentScript?.parentElement;
  if (!shell || typeof bridge?.ready !== 'function' || window.waslaPrayerPreview ||
      root.dataset.startupSession !== 'returning' || !matchMedia('(max-width: 767px)').matches) return;
  const field = shell.querySelector('[data-startup-editor]');
  if (!field || !field.getBoundingClientRect().height) return;

  // The public copy is inert. Hit-test only a completed tap on the editor.
  const capture = event => {
    const box = field.getBoundingClientRect();
    preview.focusRequested = event.clientX >= box.left && event.clientX < box.right &&
      event.clientY >= box.top && event.clientY < box.bottom;
  };
  const preview = window.waslaPrayerPreview = {
    focusRequested: false,
    close() {
      cancelAnimationFrame(frame);
      shell.removeEventListener('click', capture);
      shell.hidden = true;
      delete root.dataset.nativePrayerPreview;
      delete window.waslaPrayerPreview;
    }
  };
  root.dataset.nativePrayerPreview = '';
  shell.addEventListener('click', capture);
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (!shell.isConnected || !field.getBoundingClientRect().height) return;
      preview.visible = bridge.ready().then(() => true, () => false);
    });
  });
})();`;
