// This small guard runs before either path can dismiss the native launch cover.
// The activation module is fetched locally only for an already staged update.
export function otaLaunchScript(apiBase) {
    return `(() => { try {
        const plugins = window.Capacitor?.Plugins;
        if (!plugins?.WaslaLaunch?.ready || !plugins.CapacitorUpdater) return;
        const first = !sessionStorage.getItem('wasla_ota_opened');
        sessionStorage.setItem('wasla_ota_opened', '1');
        const intro = localStorage.getItem('wasla_ota_intro_target');
        if (intro) {
            let release;
            const painted = new Promise(resolve => { release = resolve; });
            const finish = () => {
                clearTimeout(timer);
                try { localStorage.removeItem('wasla_ota_intro_target'); } catch {}
                delete window.waslaOtaIntro;
                release();
            };
            const timer = setTimeout(() => {
                window.waslaSkippedOtaIntro = intro;
                finish();
            }, 2500);
            window.waslaOtaIntro = { version: intro, finish };
            window.waslaBeforeReveal = () => painted;
            return;
        }
        if (!first || document.hidden || !navigator.onLine ||
            !['/', '/index.html', '/pray', '/pray/', '/pray/index.html'].includes(location.pathname) ||
            performance.getEntriesByType('navigation')[0]?.type !== 'navigate') return;
        const pending = JSON.parse(localStorage.getItem('wasla_ota_pending_bundle'));
        const token = localStorage.getItem('user_Taspe7_Token');
        if (!pending?.report || !token) return;

        const controller = new AbortController();
        let resolve, committed = false;
        const decision = new Promise(done => { resolve = done; });
        const budget = 4000;
        const deadline = performance.now() + budget;
        const cancel = () => {
            if (committed) return;
            controller.abort();
            resolve();
        };
        const timer = setTimeout(cancel, budget);
        document.addEventListener('visibilitychange', cancel, { once: true });
        window.addEventListener('pagehide', cancel, { once: true });
        // The preview and live reader must wait on the same decision. An early
        // paint must not cancel the dashboard check for an already staged OTA.
        window.waslaBeforeReveal = () => decision;
        const commit = () => {
            if (document.hidden || controller.signal.aborted || performance.now() >= deadline) return false;
            committed = true;
            return true;
        };
        import('/ota-launch.js').then(module => module.activatePreparedRelease({
            apiBase: ${JSON.stringify(apiBase).replace(/</g, '\\u003c')}, updater: plugins.CapacitorUpdater,
            pending, token, signal: controller.signal, commit
        })).then(switched => {
            // The new document owns the cover once native activation succeeds.
            if (!switched) resolve();
        }, resolve).finally(() => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', cancel);
            window.removeEventListener('pagehide', cancel);
        });
    } catch {} })();`;
}
