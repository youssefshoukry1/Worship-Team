'use client';

import React, { Component, Suspense, lazy } from 'react';

function FeatureStatus({ label, error, retry, close, inline }) {
  // Turbopack retains rejected chunk promises for the document's lifetime.
  // Only an explicit reload can recover those; closing still preserves the page.
  const chunkFailed = error?.name === 'ChunkLoadError';
  return (
    <div className={inline ? 'flex items-center justify-center gap-3 p-6' : 'fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/90 p-6'}>
      <div className="flex flex-col items-center gap-4 text-center text-slate-200" role={error ? 'alert' : 'status'}>
        {!error && <span className="h-6 w-6 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" aria-hidden="true" />}
        <p>{error ? `Unable to open ${label}.` : `Loading ${label}…`}</p>
        <div className="flex gap-3">
          {error && <button type="button" className="rounded-lg bg-sky-600 px-4 py-2" onClick={chunkFailed ? () => window.location.reload() : retry}>{chunkFailed ? 'Reload app' : 'Retry'}</button>}
          {close && <button type="button" className="rounded-lg bg-white/10 px-4 py-2" onClick={close}>Close</button>}
        </div>
      </div>
    </div>
  );
}

// Create boundaries at module scope. Loading or render errors stay local to the
// panel, so dismissing them keeps the parent page and background work running.
export function createDeferredFeature(load, label, { inline = false } = {}) {
  return class DeferredFeature extends Component {
    state = { View: lazy(load), error: null };

    static getDerivedStateFromError(error) { return { error }; }

    retry = () => { this.setState({ View: lazy(load), error: null }); };

    render() {
      const { onLoadClose, ...props } = this.props;
      const { View, error } = this.state;
      const status = <FeatureStatus label={label} error={error} retry={this.retry} close={onLoadClose} inline={inline} />;
      if (error) return status;
      return <Suspense fallback={status}><View {...props} /></Suspense>;
    }
  };
}
