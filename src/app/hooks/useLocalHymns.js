'use client';

import { useEffect, useState } from 'react';
import { readLocalHymnsResult, selectLocalHymns } from '../utils/hymnSearch';

const EMPTY = [];

export function useLocalHymns(hymns, category, query, enabled) {
  const [result, setResult] = useState(null);
  const cached = enabled ? readLocalHymnsResult(hymns, { category, query }) : null;
  const current = result?.source === hymns && result.category === category && result.query === query ? result : null;
  // A background version update must not replace the mounted list with a
  // spinner and tear down a playing metronome while the new snapshot is sorted.
  const previous = result?.category === category && result.query === query && result.items.length ? result.items : null;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    selectLocalHymns(hymns, { category, query, signal: controller.signal }).then(items => {
      if (!controller.signal.aborted) setResult({ source: hymns, category, query, items });
    }).catch(error => {
      if (!controller.signal.aborted) {
        console.error('Local hymn search failed:', error);
        setResult({ source: hymns, category, query, items: EMPTY });
      }
    });
    return () => controller.abort();
  }, [hymns, category, query, enabled]);
  return { items: cached || current?.items || previous || EMPTY, pending: enabled && !cached && !current, hasData: Boolean(cached || current || previous) };
}
