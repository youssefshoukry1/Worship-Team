'use client';

import { useOfflineAvatar } from '../hooks/useOfflineAvatar';

export default function OfflineAvatar({
  userKey,
  remoteUrl,
  name,
  className = '',
  imageClassName = 'w-full h-full object-cover',
  fallbackClassName = '',
  loading = 'lazy',
  onClick,
}) {
  const { src, markFailed } = useOfflineAvatar(userKey, remoteUrl);
  const initial = (name || 'U').charAt(0).toUpperCase();

  return (
    <div className={className} onClick={onClick}>
      {src ? (
        <img
          src={src}
          alt={name || 'User'}
          className={imageClassName}
          loading={loading}
          onError={markFailed}
        />
      ) : (
        <span className={fallbackClassName}>{initial}</span>
      )}
    </div>
  );
}
