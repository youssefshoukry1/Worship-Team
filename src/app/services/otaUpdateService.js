import { getApiBaseUrl } from '../utils/apiBase';
import { compareVersions } from '../utils/appVersion';

import { checkRelease, readJson, rememberSplashPolicy, PENDING_KEY, SPLASH_POLICY_KEY } from '../../../public/ota-launch';
export { rememberSplashPolicy, SPLASH_POLICY_KEY };

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

// Foreground checks can stage a bundle. Only the pre-display launch path activates it.
export async function runControlledOtaUpdate({ updater, token, platform, isCurrentSession = () => true }) {
    const { bundle: current, native } = await updater.current();
    if (!isCurrentSession() || !token || !current) return;
    const version = await runningAppVersion(current);
    let installationId = localStorage.getItem('wasla_ota_installation_id');
    if (!installationId) {
        installationId = crypto.randomUUID();
        localStorage.setItem('wasla_ota_installation_id', installationId);
    }
    const report = { installationId, version, bundleId: current.id, platform, nativeVersion: native || '' };
    const result = await checkRelease(getApiBaseUrl(), token, report, AbortSignal.timeout(15000));
    if (!isCurrentSession()) return;
    if (result.currentRelease) rememberSplashPolicy(result.currentRelease);
    const release = result.release;
    if (!release || compareVersions(release.version, version) !== 1 ||
        typeof release.url !== 'string' || !release.url.startsWith('https://')) {
        localStorage.removeItem(PENDING_KEY);
        return;
    }
    const { bundles = [] } = await updater.list();
    if (!isCurrentSession()) return;
    const existing = bundles.find(bundle => bundle.version === release.version &&
        bundle.id !== current.id && (bundle.status === 'success' || bundle.status === 'pending'));
    const bundle = existing || await updater.download({ url: release.url, version: release.version });
    if (!isCurrentSession()) return;
    rememberSplashPolicy(release);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ id: bundle.id, version: release.version, url: release.url, report }));
}
