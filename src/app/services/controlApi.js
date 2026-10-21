import { getApiBaseUrl } from '../utils/apiBase';

export async function readControlResponse(response, serviceName) {
    const isJson = (response.headers.get('content-type') || '').includes('json');
    let data;
    if (isJson) {
        try { data = await response.json(); } catch { /* Report a readable API error below. */ }
    }
    const validBody = data !== null && typeof data === 'object' && !Array.isArray(data);
    if (!response.ok || !validBody) {
        let message = validBody && typeof data.message === 'string' ? data.message : null;
        if (!message) {
            if (response.status === 401) message = 'Your session has expired. Please sign in again.';
            else if (response.status === 403) message = 'Only PROGRAMER accounts can access these controls.';
            else if (response.status === 404) message = `${serviceName} are not available on the configured backend yet. Deploy the backend update, or connect to a backend that includes these routes.`;
            else message = `${serviceName} returned an unexpected response (HTTP ${response.status}). Check the configured API address and backend deployment.`;
        }
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return data;
}

export async function controlApiRequest(token, path, options = {}, serviceName = 'App controls') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(`${getApiBaseUrl()}${path}`, {
            ...options, cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        return await readControlResponse(response, serviceName);
    } finally { clearTimeout(timeout); }
}
