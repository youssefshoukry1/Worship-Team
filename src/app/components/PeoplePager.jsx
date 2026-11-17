'use client';
import { useEffect, useRef } from 'react';
export default function PeoplePager({ page, active = true }) {
  const anchor = useRef(null);
  const { nextCursor, loading, error, loadMore } = page;
  useEffect(() => {
    if (!active || !nextCursor || loading || error || !anchor.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '120px' });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, [active, nextCursor, loading, error, loadMore]);
  return <div ref={anchor} className="py-3 text-center text-xs text-slate-400">
    {page.error ? <><p role="alert">{page.error}</p><button className="mt-2 text-sky-400" type="button" onClick={page.retry}>Retry</button></>
      : page.loading ? <span role="status">Loading people…</span>
        : page.nextCursor ? <button className="text-sky-400" type="button" onClick={page.loadMore}>Show more</button> : null}
  </div>;
}
