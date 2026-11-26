'use client';
import { useEffect, useRef } from 'react';
export default function PeoplePager({ page, active = true, section }) {
  const anchor = useRef(null);
  const { nextCursor, loading, error, loadMore } = page;
  const provisionalItems = section && page.verifiedCount < page.items.length ? page.items : null;
  useEffect(() => {
    if (!active || !nextCursor || loading || error || !anchor.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '120px' });
    observer.observe(anchor.current);
    if (provisionalItems) {
      const list = anchor.current.closest('[data-people-section]');
      for (const row of list.querySelectorAll(`[data-pending-page="${section}"]`)) observer.observe(row);
    }
    return () => observer.disconnect();
  }, [active, nextCursor, loading, error, loadMore, section, provisionalItems, page.verifiedCount]);
  return <div ref={anchor} className="py-3 text-center text-xs text-slate-400">
    {page.error ? <><p role="alert">{page.error}</p><button className="mt-2 text-sky-400" type="button" onClick={page.retry}>Retry</button></>
      : page.loading ? <span role="status">Loading people…</span>
        : page.nextCursor ? <button className="text-sky-400" type="button" onClick={page.loadMore}>Show more</button> : null}
  </div>;
}
