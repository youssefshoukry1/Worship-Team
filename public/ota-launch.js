// Also imported directly from the exported HTML before React starts.
export async function checkRelease(apiBase, token, report, signal) {
    const response = await fetch(apiBase + '/ota/check', {
        method: 'POST', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(report),
    });
    if (!response.ok) throw new Error('Release check failed (' + response.status + ').');
    return response.json();
}

export const SPLASH_POLICY_KEY = 'wasla_ota_splash_policy';
export const PENDING_KEY = 'wasla_ota_pending_bundle';
export const INTRO_TARGET = 'wasla_ota_intro_target';

export function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function rememberSplashPolicy(release) {
    if (!release?.version || typeof release.showSplash !== 'boolean') return;
    const stored = readJson(SPLASH_POLICY_KEY);
    const policies = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    policies[release.version] = release.showSplash;
    localStorage.setItem(SPLASH_POLICY_KEY, JSON.stringify(policies));
}

export async function activatePreparedRelease({ apiBase, updater, pending, token, signal, commit }) {
    const report = pending.report;
    if (!report || !pending.url || !token || signal.aborted) return;
    const [current, listing] = await Promise.all([updater.current(), updater.list()]);
    if (current.bundle?.id !== report.bundleId || (current.native || '') !== report.nativeVersion ||
        pending.id === current.bundle.id) return;
    // A binary upgrade can change the built-in web version without changing its bundle ID.
    const activeVersion = current.bundle.id === 'builtin'
        ? (await (await fetch('/version.json', { cache: 'no-store', signal })).json()).version
        : current.bundle.version;
    if (activeVersion !== report.version || !listing.bundles?.some(bundle =>
        bundle.id === pending.id && bundle.version === pending.version &&
        (bundle.status === 'success' || bundle.status === 'pending'))) return;
    if (signal.aborted || localStorage.getItem('user_Taspe7_Token') !== token) return;
    const { release } = await checkRelease(apiBase, token, report, signal);
    if (release?.version !== pending.version || release.url !== pending.url) return;
    if (signal.aborted || localStorage.getItem('user_Taspe7_Token') !== token || !commit()) return;
    rememberSplashPolicy(release);
    localStorage.removeItem(PENDING_KEY);
    if (release.showSplash) localStorage.setItem(INTRO_TARGET, release.version);
    try {
        await updater.set({ id: pending.id });
        return true;
    } catch (error) {
        localStorage.removeItem(INTRO_TARGET);
        throw error;
    }
}
