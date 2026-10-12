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
      if (!record || !active) return false;
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
      try {
        const cached = await readCachedAvatar(userKey, remoteUrl);
        const hasCached = applyRecord(cached);
        const isCurrent = cached?.remoteUrl === (remoteUrl || null);

        if (isCurrent || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          if (!hasCached && active) setSrc(remoteUrl);
          return;
        }

        try {
          const downloaded = await downloadAndCacheAvatar(userKey, remoteUrl);
          applyRecord(downloaded);
        } catch {
          // A previous cached image is preferable to a broken image while offline.
          if (!hasCached && active) setSrc(remoteUrl);
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
