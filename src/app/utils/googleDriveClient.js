/**
 * googleDriveClient.js — upload/download files to the user's own Google Drive
 * straight from the device. The backend only issues a short-lived access token
 * (/backup/drive-token); file bytes never pass through our server.
 */
import { getApiBaseUrl } from './apiBase';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveNotLinkedError extends Error {}

export async function getDriveAccessToken(appToken, email = null) {
    const url = `${getApiBaseUrl()}/backup/drive-token${email ? `?email=${encodeURIComponent(email)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${appToken}` } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 || res.status === 401 || data.linked === false) {
        throw new DriveNotLinkedError(data.message || 'Google Drive is not linked.');
    }
    if (!res.ok || !data.access_token) throw new Error(data.message || 'Could not get Google Drive access.');
    return data.access_token;
}

export async function getDriveAuthUrl(appToken) {
    const res = await fetch(`${getApiBaseUrl()}/backup/auth-url`, { headers: { Authorization: `Bearer ${appToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error('Could not start Google Drive link.');
    return data.url;
}

export async function getDriveAccounts(appToken) {
    const res = await fetch(`${getApiBaseUrl()}/backup/drive-accounts`, { headers: { Authorization: `Bearer ${appToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Could not fetch Drive accounts.');
    return data.accounts || [];
}

export async function setDefaultDriveAccount(appToken, email) {
    const res = await fetch(`${getApiBaseUrl()}/backup/set-default-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
        body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Could not set default Drive account.');
    return data;
}

export async function disconnectDriveAccount(appToken, email = null) {
    const res = await fetch(`${getApiBaseUrl()}/backup/drive-account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
        body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || 'Could not disconnect Drive account.');
    return data;
}

const escapeQuery = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function driveJson(accessToken, url, options = {}) {
    const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const reason = data?.error?.errors?.[0]?.reason;
        if (reason === 'storageQuotaExceeded') throw new Error('Google Drive storage is full.');
        if (res.status === 401) throw new DriveNotLinkedError('Google Drive link expired. Please reconnect.');
        throw new Error(data?.error?.message || `Google Drive request failed (${res.status})`);
    }
    return data;
}

export async function findDriveFile(accessToken, { name, parentId, mimeType }) {
    const q = [`name='${escapeQuery(name)}'`, 'trashed=false'];
    if (parentId) q.push(`'${escapeQuery(parentId)}' in parents`);
    if (mimeType) q.push(`mimeType='${mimeType}'`);
    const params = new URLSearchParams({ q: q.join(' and '), fields: 'files(id,name,modifiedTime,size)', orderBy: 'modifiedTime desc', spaces: 'drive' });
    const data = await driveJson(accessToken, `${DRIVE_API}?${params}`);
    return data.files?.[0] || null;
}

export async function ensureDriveFolder(accessToken, name) {
    const existing = await findDriveFile(accessToken, { name, mimeType: FOLDER_MIME });
    if (existing) return existing.id;
    const created = await driveJson(accessToken, `${DRIVE_API}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    });
    return created.id;
}

const putWithProgress = (url, bytes, mimeType, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error while uploading to Google Drive.'));
    xhr.send(bytes);
});

async function multipartUpload(accessToken, { metadata, bytes, mimeType, fileId }) {
    const boundary = `my_prays_${Date.now()}`;
    const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        bytes,
        `\r\n--${boundary}--`,
    ]);
    const url = fileId ? `${DRIVE_UPLOAD}/${fileId}?uploadType=multipart` : `${DRIVE_UPLOAD}?uploadType=multipart`;
    return driveJson(accessToken, url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
    });
}

/**
 * Create or replace a file in a Drive folder (resumable upload with progress,
 * falling back to a multipart upload if the upload session URL is unavailable).
 */
export async function uploadDriveFile(accessToken, { name, folderId, bytes, mimeType, onProgress = () => {} }) {
    const existing = await findDriveFile(accessToken, { name, parentId: folderId });
    const metadata = existing ? { name } : { name, parents: [folderId] };
    const sessionUrl = existing ? `${DRIVE_UPLOAD}/${existing.id}?uploadType=resumable` : `${DRIVE_UPLOAD}?uploadType=resumable`;

    const session = await fetch(sessionUrl, {
        method: existing ? 'PATCH' : 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': mimeType,
        },
        body: JSON.stringify(metadata),
    });
    const location = session.ok ? session.headers.get('Location') : null;

    if (location) {
        await putWithProgress(location, bytes, mimeType, onProgress);
    } else {
        if (session.status === 401) throw new DriveNotLinkedError('Google Drive link expired. Please reconnect.');
        await multipartUpload(accessToken, { metadata, bytes, mimeType, fileId: existing?.id });
        onProgress(1);
    }
}

export async function downloadDriveFile(accessToken, fileId) {
    const res = await fetch(`${DRIVE_API}/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401) throw new DriveNotLinkedError('Google Drive link expired. Please reconnect.');
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
}
