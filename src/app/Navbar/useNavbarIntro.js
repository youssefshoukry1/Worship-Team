'use client';

import { useEffect, useRef, useState } from 'react';
import { uiControlRequest, navbarRequestIsFresh, navbarSeenKey, NAVBAR_PREVIEW_EVENT, UI_CONTROLS_CHANGED_EVENT } from '../services/uiAnimationService';

export default function useNavbarIntro(token, userId) {
    const [intro, setIntro] = useState({ id: null, stage: 'done' });
    const activeRef = useRef(false);
    const holdTimerRef = useRef(null);
    const playPendingRef = useRef(null);

    useEffect(() => {
        if (!token || !userId) return;
        let cancelled = false;
        let checking = false;
        let pending = null;
        const seenKey = navbarSeenKey(userId);
        const isCurrentSession = () => !cancelled && localStorage.getItem('user_Taspe7_Token') === token;

        const playPending = () => {
            if (!isCurrentSession() || activeRef.current || document.visibilityState !== 'visible' ||
                window.__wasla_splash_done !== true || window.__wasla_splash_active ||
                document.getElementById('wasla-splash-screen') || !navbarRequestIsFresh(pending)) return;
            try {
                if (!pending.preview) {
                    if (localStorage.getItem(seenKey) === pending.id) { pending = null; return; }
                    // Consume at the start so closing mid-animation never replays it.
                    localStorage.setItem(seenKey, pending.id);
                }
                activeRef.current = true;
                setIntro({ id: pending.id, stage: 'center' });
                pending = null;
            } catch { pending = null; }
        };
        playPendingRef.current = playPending;

        const check = async () => {
            if (checking || !isCurrentSession() || document.visibilityState !== 'visible') return;
            checking = true;
            try {
                const data = await uiControlRequest(token, '/requests');
                if (!isCurrentSession()) return;
                // A cancellation clears a request that was waiting behind the OTA splash.
                pending = navbarRequestIsFresh(data.navbarIntro) ? data.navbarIntro : null;
                playPending();
            } catch {
                // Network errors must not replay a cached command or block the app.
                pending = null;
            } finally { checking = false; }
        };
        const preview = () => {
            if (!isCurrentSession()) return;
            pending = { id: `preview:${crypto.randomUUID()}`, preview: true, expiresAt: new Date(Date.now() + 60000).toISOString() };
            playPending();
        };
        const onVisible = () => { if (document.visibilityState === 'visible') check(); };
        // Reset an interrupted intro if the authenticated session changes.
        const startup = setTimeout(() => { setIntro({ id: null, stage: 'done' }); check(); }, 0);
        const interval = setInterval(check, 60000);
        window.addEventListener('wasla_splash_done', check);
        window.addEventListener(UI_CONTROLS_CHANGED_EVENT, check);
        window.addEventListener(NAVBAR_PREVIEW_EVENT, preview);
        window.addEventListener('online', check);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            pending = null;
            activeRef.current = false;
            playPendingRef.current = null;
            clearTimeout(startup);
            clearInterval(interval);
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
            window.removeEventListener('wasla_splash_done', check);
            window.removeEventListener(UI_CONTROLS_CHANGED_EVENT, check);
            window.removeEventListener(NAVBAR_PREVIEW_EVENT, preview);
            window.removeEventListener('online', check);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [token, userId]);

    const handleLogoAssembleComplete = () => {
        if (!activeRef.current || holdTimerRef.current !== null) return;
        holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null;
            if (activeRef.current) setIntro(current => ({ ...current, stage: 'sliding' }));
        }, 700);
    };

    const handleSlideComplete = () => {
        if (intro.stage !== 'sliding') return;
        activeRef.current = false;
        setIntro({ id: null, stage: 'done' });
        playPendingRef.current?.();
    };

    return { introStage: intro.stage, introId: intro.id, handleLogoAssembleComplete, handleSlideComplete };
}
