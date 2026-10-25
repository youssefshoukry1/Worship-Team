import { Heart, BookOpen, Music, Users, User, Mic, Share2, Check, Lock, MoreVertical } from 'lucide-react';
import PageSkeleton from './PageSkeleton';

function Label({ en, ar, de }) {
  return <><span data-startup-lang="en">{en}</span><span data-startup-lang="ar">{ar}</span><span data-startup-lang="de">{de}</span></>;
}

// Public, non-interactive HTML: no account data, drafts, or saved prayers. CSS
// selects the returning-user layout before React or its route chunks execute.
export default function AppStartupShell({ prayerEntry = false, variant = 'form', publicPage = false }) {
  return (
    <div data-startup-shell data-prayer-entry={prayerEntry} aria-busy="true" aria-label="Opening Wasla" className="min-h-screen bg-[var(--app-bg)] text-white">
      <div data-startup-loading className="min-h-screen">
        <PageSkeleton variant={publicPage ? variant : 'form'} fullPage />
      </div>
      {!prayerEntry && <div data-startup-content><PageSkeleton variant={variant} fullPage chrome={!publicPage && variant !== 'form' && variant !== 'presentation'} /></div>}
      {prayerEntry && <div data-startup-prayer aria-hidden="true" inert>
        <div className="h-20 border-b border-white/5 bg-[#080e18] px-4 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wasla.svg" alt="" width="80" height="80" />
        </div>
        <div className="pt-8 px-4 pb-[100px] max-w-5xl mx-auto">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 shadow-xl shadow-black/20">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2"><Heart className="w-5 h-5 text-sky-300" /><h3 className="text-base sm:text-lg font-bold"><Label en="Pray Time" ar="وقت الصلاة" de="Gebetszeit" /></h3></div>
              <MoreVertical className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mb-3.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs font-semibold text-sky-300"><Share2 className="w-3.5 h-3.5" />Share with friend...</div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mb-4">
              <div className="min-h-[110px] text-sm text-white/20"><Label en="Write your general prayer words here..." ar="اكتب كلمات صلاتك هنا..." de="Schreibe hier dein Gebet..." /></div>
              <span className="inline-flex items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300"><Mic className="w-3.5 h-3.5" /><Label en="Record voice" ar="تسجيل صوتي" de="Sprache aufnehmen" /></span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-4 text-[11px] text-slate-400"><span>0 <Label en="total words" ar="كلمات" de="Wörter" /></span><span className="flex items-center gap-2 rounded-lg bg-sky-500/40 px-4 py-2 text-xs text-white/50"><Check className="w-4 h-4" /><Label en="Save Note" ar="حفظ الملاحظة" de="Notiz speichern" /></span></div>
          </div>
          <div className="flex gap-2 my-5 text-xs font-bold"><span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/20 px-3.5 py-2"><Lock className="w-3.5 h-3.5" />My Journal</span><span className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3.5 py-2 text-slate-400"><Users className="w-3.5 h-3.5" />Prayer Circle</span></div>
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-4 space-y-4">
            <div className="h-3 w-32 rounded bg-white/10" />
            <div className="h-3 w-3/4 rounded bg-white/5" />
            <div className="h-3 w-1/2 rounded bg-white/5" />
          </div>
        </div>
        <div className="fixed bottom-0 inset-x-0 h-[58px] flex items-center justify-around border-t border-white/5 bg-[#060b13] text-slate-400">
          {[['Pray', Heart], ['Bible', BookOpen], ['Hymns', Music], ['Friends', Users], ['Profile', User]].map(([label, Icon], index) => <div key={label} className={`flex flex-col items-center gap-1 text-[10px] ${index === 0 ? 'text-[#00C2FF]' : ''}`}><Icon size={21} /><span>{label}</span></div>)}
        </div>
      </div>}
    </div>
  );
}
