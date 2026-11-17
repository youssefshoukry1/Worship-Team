'use client';
export default function FriendDirectoryStatus({ page }) {
  if (!page.syncError && !page.storageError && page.complete) return null;
  return <div className="py-2 text-xs text-slate-400" role="status">
    {page.syncError ? <><span>Could not refresh friends. Showing saved friends. </span><button type="button" className="text-sky-400" onClick={page.retry}>Retry sync</button></>
      : !page.complete ? <span>{page.syncing ? 'Preparing offline friends…' : 'Showing saved friends. Connect to finish syncing.'}</span> : null}
    {page.storageError && <p>{page.storageError}</p>}
  </div>;
}
