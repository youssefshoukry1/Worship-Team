import { controlApiRequest } from './controlApi';

export const NAVBAR_PREVIEW_EVENT = 'wasla_navbar_intro_preview';
export const UI_CONTROLS_CHANGED_EVENT = 'wasla_ui_controls_changed';

export function uiControlRequest(token, path, options = {}) {
    return controlApiRequest(token, `/ui-controls${path}`, options, 'UI animation controls');
}

export function navbarRequestIsFresh(request) {
    return typeof request?.id === 'string' && Boolean(request.id) &&
        Number.isFinite(Date.parse(request.expiresAt)) && Date.parse(request.expiresAt) > Date.now();
}

export function navbarSeenKey(userId) {
    return `wasla_navbar_intro_seen:${userId}`;
}
