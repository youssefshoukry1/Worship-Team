'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EyeOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { MyPraysBackup } from './PrayRecordings';
import privacyStyles from './PrayerBackup.module.css';
export default function PrayerSettings({ pageRef, prayList, token, userId, onRestored }) {
    const { language } = useLanguage();
    const [privacy, setPrivacy] = useState({ enabled: false, strength: 2 });
    const pending = useRef(null);
    const timer = useRef(null);
    const persist = () => {
        if (!pending.current) return;
        try { localStorage.setItem('taspe7_prayer_privacy', JSON.stringify(pending.current)); } catch { /* Session preference still works. */ }
        pending.current = null;
    };
    useLayoutEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('taspe7_prayer_privacy') || 'null');
            // Apply saved privacy before the editor can paint or receive a queued tap.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (saved) setPrivacy({ enabled: saved.enabled === true, strength: Math.min(4, Math.max(1, Number(saved.strength) || 2)) });
        } catch { /* Use defaults if storage is unavailable. */ }
    }, []);
    const changePrivacy = (patch) => {
        const next = { ...privacy, ...patch };
        setPrivacy(next);
        pending.current = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(persist, 150);
    };
    useEffect(() => () => { clearTimeout(timer.current); persist(); }, []);
    useLayoutEffect(() => {
        const page = pageRef.current;
        if (!page) return;
        page.toggleAttribute('data-private-writing', privacy.enabled);
        if (privacy.enabled) page.setAttribute('data-private-writing', 'true');
        page.style.setProperty('--prayer-blur', `${privacy.strength}px`);
    }, [pageRef, privacy]);
    return (
                            <MyPraysBackup
                                privacySettings={
                                    <div className={privacyStyles.privacySection} dir={language === 'ar' ? 'rtl' : undefined}>
                                        <label className={privacyStyles.wifiRow}>
                                            <span className={privacyStyles.wifiLabel}><EyeOff className="w-4 h-4" />{language === 'ar' ? 'تمويه نص الصلاة' : 'Blur prayer text'}</span>
                                            <span className={privacyStyles.wifiSwitch}>
                                                <input type="checkbox" role="switch" className={privacyStyles.wifiInput} checked={privacy.enabled} onChange={event => changePrivacy({ enabled: event.target.checked })} />
                                                <span className={privacyStyles.wifiTrack} />
                                            </span>
                                        </label>
                                        {privacy.enabled && <label className={privacyStyles.blurControl}>
                                            <span>{language === 'ar' ? 'درجة التمويه' : 'Strength'}</span>
                                            <span className={privacyStyles.blurSlider} style={{ '--blur-progress': `${(privacy.strength - 1) / 3 * 100}%` }}>
                                                <span className={privacyStyles.blurPercent} aria-hidden="true">{Math.round(privacy.strength / 4 * 100)}%</span>
                                                <input aria-label={language === 'ar' ? 'درجة التمويه' : 'Blur strength'} aria-valuetext={`${Math.round(privacy.strength / 4 * 100)}%`} type="range" min="1" max="4" step="0.01" value={privacy.strength} onChange={event => changePrivacy({ strength: Number(event.target.value) })} />
                                            </span>
                                        </label>}
                                    </div>
                                }
                                prayTime={prayList}
                                token={token}
                                userId={userId}
                                onRestored={onRestored}
                            />
    );
}
