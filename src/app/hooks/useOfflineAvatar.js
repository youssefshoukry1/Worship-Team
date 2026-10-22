'use client';

import { useEffect, useState } from 'react';
import { downloadAndCacheAvatar, readCachedAvatar, removeCachedAvatar } from '../utils/avatarStorage';

export function useOfflineAvatar(userKey, remoteUrl) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = null;

    const applyRecord = (record) => {
      if (!record) return false;
      if (!active) {
        if (record.objectUrl) URL.revokeObjectURL(record.src);
        return false;
      }
      if (objectUrl && objectUrl !== record.src) URL.revokeObjectURL(objectUrl);
      objectUrl = record.objectUrl ? record.src : null;
      setSrc(record.src);
      setFailed(false);
      return true;
    };

    const load = async () => {
      setFailed(false);
      if (!remoteUrl) {
        setSrc(null);
        try {
          await removeCachedAvatar(userKey, remoteUrl);
        } catch {
          // Cache cleanup must not prevent the fallback avatar from rendering.
        }
        return;
      }
      // Display the image while the offline copy downloads in the background.
      if (active) setSrc(remoteUrl);
      try {
        const cached = await readCachedAvatar(userKey, remoteUrl);
        const isCurrent = cached?.remoteUrl === (remoteUrl || null);
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const hasCached = (isCurrent || isOffline) && applyRecord(cached);

        if (isCurrent || isOffline) {
          if (!hasCached && active) setSrc(remoteUrl);
          return;
        }

        try {
          const downloaded = await downloadAndCacheAvatar(userKey, remoteUrl);
          applyRecord(downloaded);
        } catch {
          // Keep the last saved photo if connectivity fails during a refresh.
          if (!applyRecord(cached) && active) setSrc(remoteUrl);
        } finally {
          if (cached?.objectUrl && cached.src !== objectUrl) URL.revokeObjectURL(cached.src);
        }
      } catch {
        if (active) setSrc(remoteUrl || null);
      }
    };

    load();
    window.addEventListener('online', load, { passive: true });
    return () => {
      active = false;
      window.removeEventListener('online', load);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userKey, remoteUrl]);

  return {
    src: failed ? null : src,
    markFailed: () => setFailed(true),
  };
}
