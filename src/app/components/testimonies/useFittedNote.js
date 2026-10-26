import { useLayoutEffect } from 'react';

// Measure actual wrapping, including Arabic, attached verses and loaded fonts.
export default function useFittedNote(surfaceRef, text, contentKey) {
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !text) return;
    let disposed = false;
    let frame;

    const fit = () => {
      if (disposed) return;
      surface.style.removeProperty('--note-height');
      text.style.setProperty('--note-font-size', '18px');
      const squareHeight = surface.offsetHeight;
      const maxHeight = parseFloat(getComputedStyle(surface).maxHeight);
      const fits = () => text.scrollHeight <= text.clientHeight && text.scrollWidth <= text.clientWidth;
      const setSize = size => text.style.setProperty('--note-font-size', `${size}px`);

      // Keep short notes square. Use more screen height before going below 12px.
      setSize(12);
      if (!fits() && maxHeight > squareHeight) {
        const extraHeight = text.scrollHeight - text.clientHeight;
        surface.style.setProperty('--note-height', `${Math.min(maxHeight, squareHeight + extraHeight + 2)}px`);
      }
      // Older notes may exceed today's limit; keep all their text visible too.
      let low = 1;
      let high = 18;
      for (let step = 0; step < 9; step++) {
        const size = (low + high) / 2;
        setSize(size);
        if (fits()) low = size;
        else high = size;
      }
      setSize(Math.floor(low * 100) / 100);
    };
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    // Observe width rather than our own height changes to avoid resize loops.
    let previousWidth = surface.clientWidth;
    const observer = new ResizeObserver(() => {
      if (surface.clientWidth !== previousWidth) {
        previousWidth = surface.clientWidth;
        scheduleFit();
      }
    });
    observer.observe(surface);
    window.addEventListener('resize', scheduleFit);
    document.fonts?.addEventListener('loadingdone', scheduleFit);
    document.fonts?.ready.then(() => { if (!disposed) scheduleFit(); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', scheduleFit);
      document.fonts?.removeEventListener('loadingdone', scheduleFit);
    };
  }, [surfaceRef, text, contentKey]);
}
