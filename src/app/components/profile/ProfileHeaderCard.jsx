'use client';

import { Edit3 } from 'lucide-react';
import OfflineAvatar from '../OfflineAvatar';

export default function ProfileHeaderCard({ user, avatar, badges, onEditName, onEditUsername, children }) {
  const name = user?.Name || user?.username || 'N/A';
  return <section data-testid="profile-header-card" className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-5 sm:p-8 backdrop-blur-2xl mb-6 sm:mb-8 relative overflow-hidden shadow-2xl shadow-black/50">
    <div className="absolute top-1/2 left-0 w-32 h-32 bg-sky-500/10 blur-[100px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2" />
    <div className="relative z-10 flex flex-row items-start justify-between gap-3 sm:gap-6">
      <div className="flex flex-row items-center gap-3 sm:gap-6 min-w-0">
        {avatar || <OfflineAvatar userKey={user?._id} remoteUrl={user?.profilePhoto} name={name} className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-sky-500/20 bg-black/40 flex items-center justify-center shadow-xl shadow-black/50 shrink-0 text-2xl sm:text-4xl font-bold text-sky-400/50" />}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
            <h1 dir="auto" className="text-xl sm:text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400 leading-tight tracking-tight truncate">{name}</h1>
            {onEditName && <button type="button" onClick={onEditName} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0" title="Edit Name"><Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>}
          </div>
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-400 font-medium">
            <span className="truncate">@{user?.username || name.toLowerCase().replace(/\s+/g, '') || 'username'}</span>
            {onEditUsername && <button type="button" onClick={onEditUsername} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0" title="Edit Username"><Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>}
          </div>
        </div>
      </div>
      {badges && <div className="flex flex-col sm:flex-row items-end gap-2 shrink-0">{badges}</div>}
    </div>
    {children && <div className="relative z-10 mt-5 sm:mt-6">{children}</div>}
  </section>;
}
