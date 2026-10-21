import { getApiBaseUrl } from '../utils/apiBase';
import { compareVersions } from '../utils/appVersion';

const PENDING_KEY = 'wasla_ota_pending_bundle';
export const SPLASH_POLICY_KEY = 'wasla_ota_splash_policy';

function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function rememberSplashPolicy(release) {
    if (!release?.version || typeof release.showSplash !== 'boolean') return;
    const stored = readJson(SPLASH_POLICY_KEY);
    const policies = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    policies[release.version] = release.showSplash;
    localStorage.setItem(SPLASH_POLICY_KEY, JSON.stringify(policies));
}

export function shouldShowReleaseSplash(version) {
    return readJson(SPLASH_POLICY_KEY)?.[version] === true;
}

export async function runningAppVersion(bundle) {
    if (bundle?.id !== 'builtin' && bundle?.version !== 'builtin' && bundle?.version) return bundle.version;
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not read the running bundle version.');
    const data = await response.json();
    return compareVersions(data.version, data.version) === 0 ? data.version : 'builtin';
}

async function checkRelease({ token, version, current, platform, nativeVersion }) {
    let installationId = localStorage.getItem('wasla_ota_installation_id');
    if (!installationId) {
        installationId = crypto.randomUUID();
        localStorage.setItem('wasla_ota_installation_id', installationId);
    }
    const response = await fetch(`${getApiBaseUrl()}/ota/check`, {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ installationId, version, bundleId: current.id || 'builtin', platform, nativeVersion: nativeVersion || '' }),
    });
    if (!response.ok) throw new Error(`Release check failed (${response.status}).`);
    return response.json();
}

// No native next() queue: activation always waits for fresh server authorization.
// This also lets Hold revoke a bundle downloaded during an earlier app opening.
export async function runControlledOtaUpdate({ updater, token, platform, isCurrentSession = () => true }) {
    const currentResult = await updater.current();
    if (!isCurrentSession() || !token) return;
    const current = currentResult?.bundle || { id: 'builtin', version: 'builtin' };
    const version = await runningAppVersion(current);
    const result = await checkRelease({ token, version, current, platform, nativeVersion: currentResult?.native });
    if (!isCurrentSession()) return;
    if (result.currentRelease) rememberSplashPolicy(result.currentRelease);

    const release = result.release;
    if (!release || compareVersions(release.version, version) !== 1 ||
        typeof release.url !== 'string' || !release.url.startsWith('https://')) return;

    const pending = readJson(PENDING_KEY);
    const { bundles = [] } = await updater.list();
    if (!isCurrentSession()) return;
    const existing = bundles.find(bundle => bundle.version === release.version &&
        bundle.id !== current.id && (bundle.status === 'success' || bundle.status === 'pending'));

    if (existing) {
        // Recheck permission just before reloading, including a recently saved Hold.
        const fresh = await checkRelease({ token, version, current, platform, nativeVersion: currentResult?.native });
        if (!isCurrentSession() || fresh.release?.version !== release.version || fresh.release?.url !== release.url) return;
        rememberSplashPolicy(fresh.release);
        localStorage.setItem(PENDING_KEY, JSON.stringify({ id: existing.id, version: release.version }));
        await updater.set({ id: existing.id });
        return;
    }

    // A stale pending marker never grants permission and never selects a bundle.
    if (pending) localStorage.removeItem(PENDING_KEY);
    const downloaded = await updater.download({ url: release.url, version: release.version });
    if (!isCurrentSession()) return;
    rememberSplashPolicy(release);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ id: downloaded.id, version: release.version }));
    // The next launch/foreground check will authorize and activate this bundle.
}
