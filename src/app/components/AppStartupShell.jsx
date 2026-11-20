import { Heart, BookOpen, Users, User, Mic, Share2, Check, Lock, MoreVertical } from 'lucide-react';
import PageSkeleton, { PrayerCardsSkeleton } from './PageSkeleton';
import WaslaLogo from '../Navbar/WaslaLogo';
import { translations } from '../i18n/translations';
import { prayerCircleText } from '../pray/prayerCircleText';
import styles from '../pray/PrayerBackup.module.css';
import { startPrayerPreview } from '../utils/startPrayerPreview';

function Label({ name }) {
  return ['en', 'ar', 'de'].map(lang => <span key={lang} data-startup-lang={lang}>
    {name === 'circle' ? prayerCircleText(lang).circle : translations[lang][name] || translations.en[name]}
  </span>);
}

const tabs = [[Heart, 'navPray'], [BookOpen, 'navBible'], [Users, 'navFriends'], [User, 'navProfile']];

function PrayerPreview() {
  return <div data-startup-prayer aria-hidden="true" inert>
    <div className="h-20 border-b app-header px-2 flex items-center"><WaslaLogo className="w-20 sm:w-24 md:w-28 h-auto" /></div>
    <div className="pt-8 px-4 pb-[100px]">
      <div className="max-w-5xl mx-auto grid gap-5 sm:gap-6">
        <div className="app-card rounded-3xl border shadow-xl shadow-black/20 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><Heart className="w-5 h-5 text-sky-300" /><h3 className="text-base sm:text-lg font-bold"><Label name="prayTime" /></h3></div>
            <span className={styles.trigger}><MoreVertical className="w-4 h-4" /></span>
          </div>
          <div className="mb-3.5 flex"><span className={`${styles.matteButton} inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold`}><Share2 className="w-3.5 h-3.5" /><Label name="prayShareWithFriend" /></span></div>
          <div className="app-input border rounded-2xl p-3 sm:p-4 flex flex-col gap-3.5 mb-4">
            <div data-startup-editor className="min-h-[90px] text-sm leading-relaxed text-white/20"><Label name="writePrayerPlaceholder" /></div>
            <span className={`${styles.matteButton} flex items-center justify-center w-9 h-9 rounded-xl`}><Mic className="w-3.5 h-3.5" /></span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
            <span className="text-[11px] text-slate-400">0 <Label name="totalWords" /></span>
            <span className={`${styles.saveButton} px-4 py-2 rounded-lg text-xs font-bold opacity-40 flex items-center gap-2`}><Check className="w-4 h-4" /><Label name="saveNote" /></span>
          </div>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="flex items-center gap-2 rounded-xl px-3.5 py-2 bg-white/20 border border-white/10 shadow-sm"><Lock className="w-3.5 h-3.5" /><Label name="prayMyJournal" /></span>
          <span className="flex items-center gap-2 rounded-xl px-3.5 py-2 bg-white/5 border border-white/5 text-slate-400"><Users className="w-3.5 h-3.5" /><Label name="circle" /></span>
        </div>
        <div className="app-card rounded-3xl border" data-journal-panel>
          <h2 className="border-b border-white/5 p-4 sm:p-5 bg-black/20 text-sm sm:text-base font-bold tracking-wide"><Label name="myPrayTimeNotes" /></h2>
          <div className="p-3 sm:p-5"><PrayerCardsSkeleton /></div>
        </div>
      </div>
    </div>
    <div className="fixed bottom-0 inset-x-0 border-t app-bottom-nav">
      <div className="flex justify-around items-center h-[58px] max-w-md mx-auto">
        {tabs.map(([Icon, label], index) => <div key={label} className={`relative flex h-full w-full flex-col items-center justify-center gap-0.5 ${index ? 'text-slate-400' : 'text-[#00C2FF]'}`}>
          {!index && <span className="absolute top-[5px] h-8 w-12 rounded-2xl bg-sky-400/12" />}
          <div className={`relative flex h-8 items-center ${index ? '' : '-translate-y-0.5 scale-105'}`}><Icon size={21} strokeWidth={index ? 2 : 2.5} /></div>
          <span className="text-[10px] font-medium leading-none"><Label name={label} /></span>
          {!index && <span className="absolute bottom-0 h-0.5 w-5 rounded-full bg-[#00C2FF]" />}
        </div>)}
      </div>
    </div>
  </div>;
}

export default function AppStartupShell({ prayerEntry = false, variant = 'form', publicPage = false }) {
  return <div data-startup-shell data-prayer-entry={prayerEntry} aria-busy="true" aria-label="Opening Wasla" className="app-page min-h-screen text-white">
    <div data-startup-loading className="min-h-screen"><PageSkeleton variant={publicPage ? variant : 'form'} fullPage /></div>
    {prayerEntry ? <><PrayerPreview /><script dangerouslySetInnerHTML={{ __html: startPrayerPreview }} /></>
      : <div data-startup-content><PageSkeleton variant={variant} fullPage chrome={!publicPage && variant !== 'form' && variant !== 'presentation'} /></div>}
  </div>;
}
