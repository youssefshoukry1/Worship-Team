'use client';

// Before changing this page or its dependencies, read ./README.md.

import { useSyncExternalStore, useMemo, useCallback, useEffect, useLayoutEffect, useState, useContext, useRef } from 'react';
import { UserContext } from '../context/User_Context';
import { usePathname } from 'next/navigation';
import { Heart, Users, Send, Inbox, Lock, Layers } from 'lucide-react';
import privacyStyles from './PrayerBackup.module.css';
import { getApiBaseUrl } from '../utils/apiBase';
import {
    importLegacyPrayers, repairPrayerTexts, getGuestPrays, getRecordingsIndex, addExternalRecordings, getPrayerStorageError, subscribePrayerStorageError, refreshLocalPrayerCache, getCachedPrayerSnapshot, subscribeLocalPrayers,
    mergeIncomingPrayers, applyPrayerReplies, markPrayerActivitySeen, migratePrayerReadState, getPrayerDeletionState, applyPrayerRevocations
} from '../utils/prayRecordings';
import PrayerComposer from './PrayerComposer';
import { syncPrayerPages } from '../services/prayerInbox';
import { downloadPrayerPayload } from '../utils/prayerPayload';
import useNavigationState from './useNavigationState';
import PrayerSettings from './PrayerSettings';
import { PrayerCard, ListPanel, isReceivedPrayer, isSentPrayer, isPersonalPrayer } from './PrayerCards';
import { waitForNativeLaunch } from '../utils/nativeLaunch';
import { usePrayerSession, usePrayerField } from './PrayerSessionProvider';
import { useLanguage } from '../context/LanguageContext';
import useLocalFriends from '../utils/friendDirectory/useLocalFriends';
import { savedNotificationPrayer, readPrayerNotificationTarget, takePrayerOpen } from '../utils/prayerNotificationNavigation';
import { readCachedProfile, refreshProfile } from '../utils/profileCache';
import { readTabJson, tabReadKey } from '../utils/tabRequests';
import { runSessionTask } from '../utils/sessionTasks';
import { incomingPrayerActivity, isPrayerUnread, reconcilePrayerEntries, reconcilePrayerRecordings, seenPrayerChanges, sortPrayerActivity } from '../utils/prayerActivity';
import { prayerCircleText } from './prayerCircleText';
import usePrayerCircleOrder from './usePrayerCircleOrder';
import { newPrayerAction, preparePrayerAction, retryPrayerAction, localPrayerOverlay, PRAYER_SYNC_EVENT } from '../services/prayerSync';
import usePrayerDeleteWindow, { prayerDeleteAvailable } from './usePrayerDeleteWindow';
import { HOME_REFRESH_EVENT } from '../utils/androidBack';
import { useTabPageActive } from '../components/TabPageActivity';
import { PRAYER_READ_EVENT } from '../services/prayerReadSync';

const API_URL = getApiBaseUrl();

const EMPTY_CIRCLE = [];
const CIRCLE_REFRESH_MS = 15000;

function normalizePrayerView(previous, incoming) {
    const overlay = localPrayerOverlay();
    const ids = new Set(overlay.map(entry => String(entry._id)));
    return reconcilePrayerEntries(previous, [...overlay.filter(entry => !entry._sync?.hidden), ...incoming.filter(entry => !entry._sync?.hidden && !ids.has(String(entry._id)))]);
}

export default function PrayPage() {
    const session = usePrayerSession();
    const storageError = useSyncExternalStore(subscribePrayerStorageError, getPrayerStorageError, () => null);
    const pageRef = useRef(null);
    const handlePrayerSaved = entry => {
        if (!session.active) return;
        setGuestPrays(previous => [entry, ...previous]);
        setLocalActivityId(entry._sync.requestId);
        setListTarget({ id: String(entry._id), key: entry._sync.requestId, scope: entry.sharedWith ? 'shared:sent' : entry.sharedFrom ? `shared:${circleFilter}` : 'personal' });
        if (entry.sharedWith) { setActivePrayTab('shared'); setCircleFilter('sent'); }
        else setActivePrayTab('personal');
    };
    const pageActive = useTabPageActive();
    const pathname = usePathname();
    const [historyStarted, setHistoryStarted] = usePrayerField('historyStarted');
    const historyActive = pageActive && Boolean(historyStarted);
    useEffect(() => {
        if (!pageActive || historyStarted) return;
        let cancelled = false;
        void waitForNativeLaunch().then(() => {
            if (!cancelled) setHistoryStarted(true);
        });
        return () => { cancelled = true; };
    }, [pageActive, historyStarted, setHistoryStarted]);
    const [hasSnapshot, setHasSnapshot] = useNavigationState(
        () => Boolean(historyStarted && getCachedPrayerSnapshot()), pageActive);
    const mountedRef = useRef(true);
    const deletionSyncRef = useRef(null);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);
    const { user_id: userId, isLogin: token, username: contextUsername, profilePhoto: contextProfilePhoto } = useContext(UserContext);
    const [profile, setProfile] = useNavigationState(null, pageActive);

    const myUsername = profile?.user?.username || contextUsername || (typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_Username') : null) || 'me';
    const myProfilePhoto = profile?.user?.profilePhoto || contextProfilePhoto || (typeof window !== 'undefined' ? localStorage.getItem('user_Taspe7_ProfilePhoto') : null) || null;

    // Reuse only already downloaded people for optional profile enrichment.
    // The picker loads/searches its own pages when opened; prayers carry author metadata.
    const { items: friends } = useLocalFriends(token, userId, '', false);

    const friendLookup = useMemo(() => {
        const byId = new Map(), byUsername = new Map();
        for (const friend of friends) {
            const id = String(friend._id || friend.id || '');
            const username = friend.username?.toLowerCase();
            if (id && !byId.has(id)) byId.set(id, friend);
            if (username && !byUsername.has(username)) byUsername.set(username, friend);
        }
        return { byId, byUsername };
    }, [friends]);

    const resolveFriendProfile = useCallback((party, isSender = false) => {
        if (!party) return { username: 'friend', name: '', profilePhoto: null, status: 'pending' };
        if (isSender && party.isAnonymous) {
            return {
                userId: null,
                username: 'Anonymous',
                name: 'Anonymous Friend',
                profilePhoto: null,
                status: party.status || 'pending',
                responseWords: party.responseWords || '',
                respondedAt: party.respondedAt || null,
                shareId: party.shareId || null,
                isAnonymous: true
            };
        }
        const pUserId = party.userId ? party.userId.toString() : null;
        const pUsername = party.username && party.username !== 'Anonymous' ? party.username.toLowerCase() : null;

        const matched = friendLookup.byId.get(pUserId) || friendLookup.byUsername.get(pUsername);

        return {
            userId: party.userId || matched?._id || matched?.id,
            username: (matched?.username || (party.username !== 'Anonymous' ? party.username : null)) || 'friend',
            name: matched?.Name || (party.name !== 'Anonymous Friend' ? party.name : '') || matched?.username || '',
            profilePhoto: matched?.profilePhoto || party.profilePhoto || null,
            status: party.status || 'pending',
            responseWords: party.responseWords || '',
            respondedAt: party.respondedAt || null,
            shareId: party.shareId || null
        };
    }, [friendLookup]);

    const [localActivityId, setLocalActivityId] = useState('');
    const [listTarget, setListTarget] = useState(null);
    const handleConfirmSharedPrayer = (prayId, quickReplyText) => {
        const current = prayList.find(entry => String(entry._id) === String(prayId));
        if (!current || current._sync || current.sharedFrom?.status === 'confirmed') return;
        const responseText = ((quickReplyText ?? session.get(`reply:${prayId}`)) || 'Amen 🙏').trim();
        const entry = { ...current, sharedFrom: { ...current.sharedFrom, status: 'confirmed',
            responseWords: responseText, respondedAt: new Date().toISOString(),
            seenActivityBy: { ...current.sharedFrom?.seenActivityBy, [String(userId || 'guest')]: incomingPrayerActivity(current) } },
            _sync: newPrayerAction('reply', userId) };
        setGuestPrays(previous => previous.map(item => item._id === prayId ? entry : item));
        setLocalActivityId(entry._sync.requestId);
        setListTarget({ id: String(entry._id), key: entry._sync.requestId, scope: entry.sharedWith ? 'shared:sent' : entry.sharedFrom ? `shared:${circleFilter}` : 'personal' });
        session.set(`reply:${prayId}`, '');
        void preparePrayerAction(entry).then(() => window.dispatchEvent(new Event(PRAYER_READ_EVENT)));
    };

    useEffect(() => {
        if (!historyActive) return;
        if (!token || !userId) {
            return;
        }
        let ignore = false;
        const loadProfile = async () => {
            try {
                const cachedData = await readCachedProfile(userId);
                if (cachedData && !ignore) {
                    setProfile(cachedData);
                }
                const newProfileData = await refreshProfile(API_URL, token, userId);
                if (ignore) return;
                setProfile(newProfileData);
            } catch (err) {
                console.error(err);
            }
        };
        loadProfile();
        return () => { ignore = true; };
    }, [token, userId, historyActive, setProfile]);

    useEffect(() => {
        let ignore = false;
        const handleFocus = async () => {
            if (!historyActive || !token || !userId) return;
            try {
                const newProfileData = await refreshProfile(API_URL, token, userId, { force: true });
                if (!ignore) setProfile(newProfileData);
            } catch { }
        };
        window.addEventListener('focus', handleFocus);
        window.addEventListener(HOME_REFRESH_EVENT, handleFocus);
        return () => {
            ignore = true;
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener(HOME_REFRESH_EVENT, handleFocus);
        };
    }, [token, userId, historyActive, setProfile]);

    const { t, language } = useLanguage();

    const [recordingsIndex, setRecordingsIndex] = useNavigationState(() => (historyStarted && getCachedPrayerSnapshot()?.recordings) || {}, pageActive);
    // All prayers are stored 100% on this device
    const isGuest = !token || !userId;
    const [guestPrays, setGuestPrays] = useNavigationState(() => (historyStarted && getCachedPrayerSnapshot()?.prayers) || [], pageActive, normalizePrayerView);
    const rawPrayList = guestPrays;
    const prayList = useMemo(() => Array.from(new Map(rawPrayList.map(item => [String(item._id || item.date), item])).values()), [rawPrayList]);
    const { personalPrayList, receivedPrayList, sentPrayList } = useMemo(() => {
        const personalPrayList = [], receivedPrayList = [], sentPrayList = [];
        for (const entry of prayList) {
            if (isPersonalPrayer(entry)) personalPrayList.push(entry);
            if (isSentPrayer(entry)) sentPrayList.push(entry);
            if (isReceivedPrayer(entry)) {
                receivedPrayList.push(entry);
            }
        }
        return { personalPrayList, receivedPrayList, sentPrayList };
    }, [prayList]);
    const deleteCandidates = useMemo(() => [...personalPrayList, ...sentPrayList.filter(entry => entry.sharedWith?.shareId)].filter(entry => !entry._sync), [personalPrayList, sentPrayList]);
    const deletablePrayerIds = usePrayerDeleteWindow(deleteCandidates, pageActive);

    const [activePrayTab, setActivePrayTab] = usePrayerField('activePrayTab');
    const [sharedTabVisited, setSharedTabVisited] = useState(false);
    if (activePrayTab === 'shared' && !sharedTabVisited) setSharedTabVisited(true);
    const [circleFilter, setCircleFilter] = usePrayerField('circleFilter');
    const [expandedFriendPrayers, setExpandedFriendPrayers] = usePrayerField('expandedFriendPrayers');
    // Compatibility only. New read state belongs to each prayer and is scoped to the account.
    const [legacyOpenedFriendPrayers] = useState(() => {
        if (typeof window === 'undefined') return new Set();
        try { return new Set(JSON.parse(localStorage.getItem('taspe7_opened_friend_prayers') || '[]').map(String)); }
        catch { return new Set(); }
    });
    const { unreadPrayerIds, unreadReceivedCount } = useMemo(() => {
        const unreadPrayerIds = new Set();
        let unreadReceivedCount = 0;
        for (const entry of prayList) {
            if ((!isReceivedPrayer(entry) && !isSentPrayer(entry)) || !isPrayerUnread(entry, userId, legacyOpenedFriendPrayers)) continue;
            unreadPrayerIds.add(String(entry._id));
            if (isReceivedPrayer(entry)) unreadReceivedCount++;
        }
        return { unreadPrayerIds, unreadReceivedCount };
    }, [prayList, userId, legacyOpenedFriendPrayers]);

    const circleSelected = activePrayTab === 'shared';
    // A snapshot can survive multiple Journal/Circle switches. Sort it on its
    // first Circle visit and release that cached result when the snapshot changes.
    const getSharedActivity = useMemo(() => {
        let sorted;
        return () => sorted ??= sortPrayerActivity([...receivedPrayList, ...sentPrayList]);
    }, [receivedPrayList, sentPrayList]);
    const sortedSharedPrays = circleSelected && hasSnapshot ? getSharedActivity() : EMPTY_CIRCLE;
    const visiblePrayList = useMemo(() => {
        if (!sortedSharedPrays.length || circleFilter === 'all') return sortedSharedPrays;
        if (circleFilter === 'sent') return sortedSharedPrays.filter(isSentPrayer);
        if (circleFilter === 'received') return sortedSharedPrays.filter(isReceivedPrayer);
        return sortedSharedPrays.filter(entry => unreadPrayerIds.has(String(entry._id)) || expandedFriendPrayers.has(entry._id));
    }, [circleFilter, sortedSharedPrays, unreadPrayerIds, expandedFriendPrayers]);

    const [notificationTarget, setNotificationTarget] = useState(null);
    const [notificationPrayerId, setNotificationPrayerId] = useState(null);
    const [targetStatus, setTargetStatus] = useState('opening');
    const notificationTargetRef = useRef(null);
    useLayoutEffect(() => () => { notificationTargetRef.current = null; }, [session]);
    const expandNotification = useCallback(prayer => {
        setNotificationPrayerId(String(prayer._id));
        setExpandedFriendPrayers(previous => previous.has(prayer._id) ? previous : new Set(previous).add(prayer._id));
    }, [setExpandedFriendPrayers]);

    useLayoutEffect(() => {
        if (!pageActive) return;
        const openTarget = (target) => {
            const key = Number(session.get('notificationSequence') || 0) + 1;
            session.set('notificationSequence', key);
            const intent = { ...target, key };
            notificationTargetRef.current = intent;
            setTargetStatus(navigator.onLine === false ? 'offline' : 'opening');
            setListTarget(null);
            const saved = savedNotificationPrayer(getCachedPrayerSnapshot()?.prayers || EMPTY_CIRCLE, intent);
            if (saved) expandNotification(saved);
            else setNotificationPrayerId(null);
            setNotificationTarget(intent);
            setActivePrayTab('shared');
            setCircleFilter('all');
        };
        const handleOpen = () => {
            // A swipe preview may be active before its route has committed.
            if (!['/', '/index.html', '/pray', '/pray/', '/pray/index.html'].includes(location.pathname)) return;
            const url = new URL(location.href);
            const launchTarget = readPrayerNotificationTarget(url.search);
            const target = takePrayerOpen(userId) || launchTarget;
            if (!target) return;
            if (launchTarget) {
                url.searchParams.delete('shareId');
                url.searchParams.delete('notificationType');
                history.replaceState(history.state, '', url);
            }
            openTarget(target);
        };
        handleOpen();
        window.addEventListener('taspe7:prayer-target-ready', handleOpen);
        return () => window.removeEventListener('taspe7:prayer-target-ready', handleOpen);
    }, [pageActive, pathname, userId, session, expandNotification, setActivePrayTab, setCircleFilter]);

    // The target can arrive from local storage or the inbox sync. Expand it once,
    // without changing the card's styling or preventing the user from closing it.
    useLayoutEffect(() => {
        if (!notificationTarget || notificationPrayerId !== null) return;
        const prayer = savedNotificationPrayer(guestPrays, notificationTarget);
        if (prayer) expandNotification(prayer);
    }, [guestPrays, notificationTarget, notificationPrayerId, expandNotification]);

    const unreadPrayCount = unreadPrayerIds.size;
    const circleText = prayerCircleText(language);
    const circleAnchorRef = useRef(null);
    const { visibleItems: orderedPrayList, pendingUpdates, revealUpdates } = usePrayerCircleOrder(visiblePrayList, circleSelected && hasSnapshot ? `${userId || 'guest'}:${circleFilter}` : null, circleAnchorRef, `${notificationPrayerId || ''}:${localActivityId}`,
        expandedFriendPrayers.has(notificationPrayerId) ? notificationPrayerId : null);
    const seenWrites = useRef(new Set());
    const markSeen = useCallback(async (id, activity) => {
        const key = `${userId || 'guest'}:${id}:${activity}`;
        if (seenWrites.current.has(key)) return;
        seenWrites.current.add(key);
        setGuestPrays(previous => previous.map(entry => {
            if (String(entry._id) !== String(id)) return entry;
            const changes = seenPrayerChanges(entry, userId, activity);
            return changes ? { ...entry, ...changes } : entry;
        }));
        try {
            await markPrayerActivitySeen(id, userId, activity);
            window.dispatchEvent(new CustomEvent(PRAYER_READ_EVENT, { detail: { owner: userId, activity } }));
        } catch (error) { console.warn('Could not save prayer read state:', error); }
        finally { seenWrites.current.delete(key); }
    }, [userId, setGuestPrays]);

    useEffect(() => {
        if (historyActive && token && userId && hasSnapshot) session.set('readsReady', true);
    }, [historyActive, token, userId, hasSnapshot, session]);

    const toggleFriendPrayerExpand = (id) => {
        setExpandedFriendPrayers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getPrayTypeLabel = useCallback((value) => {
        const v = (value || 'general').toLowerCase();
        switch (v) {
            case 'prayer for me': return t('prayerForMe');
            case 'prayer for other':
            case 'prayer for others': return t('prayerForOthers');
            case 'chapter':
            case 'chapter reflection': return t('chapterReflection');
            default: return t('generalPrayer');
        }
    }, [t]);

    const refreshRecordings = useCallback(() => {
        getRecordingsIndex().then(next => setRecordingsIndex(previous => reconcilePrayerRecordings(previous, next)))
            .catch((err) => console.warn('Could not load prayer recordings:', err));
    }, [setRecordingsIndex]);

    // Storage publishes stable text/recording references after durable changes.
    // Hidden views unsubscribe; activation consumes the latest cached snapshot.
    useEffect(() => {
        if (!historyActive) return;
        let active = true;
        let lastPrayers, lastRecordings;
        const apply = next => {
            if (!active || !next) return;
            if (!lastPrayers) setHasSnapshot(true);
            if (next.prayers !== lastPrayers) { lastPrayers = next.prayers; setGuestPrays(next.prayers); }
            if (next.recordings !== lastRecordings) { lastRecordings = next.recordings; setRecordingsIndex(next.recordings); }
        };
        const unsubscribe = subscribeLocalPrayers(apply);
        apply(getCachedPrayerSnapshot());
        void getGuestPrays().then(() => apply(getCachedPrayerSnapshot())).catch(() => {});
        const syncChanged = event => {
            const entry = event?.detail?.entry;
            if (entry) setGuestPrays(previous => [entry, ...previous.filter(item => item._id !== entry._id)]);
            else {
                // Preparation overlays are removed after persistence publishes.
                // Reconcile that overlay change from memory, without rereading disk/audio.
                const current = getCachedPrayerSnapshot();
                if (current) setGuestPrays(current.prayers);
            }
        };
        window.addEventListener(PRAYER_SYNC_EVENT, syncChanged);
        return () => { active = false; unsubscribe(); window.removeEventListener(PRAYER_SYNC_EVENT, syncChanged); };
    }, [historyActive, setGuestPrays, setRecordingsIndex, setHasSnapshot]);


    const repairCompletedRef = useRef(session.get('repairCompleted') || null);
    useEffect(() => {
        if (!historyActive) return;
        if (repairCompletedRef.current?.userId === userId && repairCompletedRef.current?.token === token) return;
        let isCancelled = false;
        const loadAndRepairPrays = async () => {
            try {
                const locals = await migratePrayerReadState(userId, legacyOpenedFriendPrayers);
                if (!isCancelled) setGuestPrays(locals);

                if (token && Array.isArray(locals)) {
                    const encryptedItems = [];
                    locals.forEach((p) => {
                        if (typeof p.words === 'string' && p.words.startsWith('enc:v1:')) {
                            encryptedItems.push({ id: p._id, field: 'words', text: p.words });
                        }
                        if (typeof p.sharedFrom?.responseWords === 'string' && p.sharedFrom.responseWords.startsWith('enc:v1:')) {
                            encryptedItems.push({ id: p._id, field: 'sharedFrom.responseWords', text: p.sharedFrom.responseWords });
                        }
                        if (typeof p.sharedWith?.responseWords === 'string' && p.sharedWith.responseWords.startsWith('enc:v1:')) {
                            encryptedItems.push({ id: p._id, field: 'sharedWith.responseWords', text: p.sharedWith.responseWords });
                        }
                    });

                    if (encryptedItems.length > 0) {
                        const res = await fetch(`${API_URL}/users/pray-time/decrypt`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`
                            },
                            body: JSON.stringify({ texts: encryptedItems.map((item) => item.text) })
                        });
                        if (res.ok) {
                            const { decrypted } = await res.json();
                            const changed = await repairPrayerTexts(encryptedItems.map((item, i) => ({ ...item, plain: decrypted?.[i] })));
                            if (changed && !isCancelled) setGuestPrays(await getGuestPrays());
                        } else return;
                    }
                }
                if (!isCancelled) { repairCompletedRef.current = { userId, token }; session.set('repairCompleted', { userId, token }); }
            } catch (err) {
                console.warn('Could not load or decrypt local prayers:', err);
            }
        };

        loadAndRepairPrays();
        return () => { isCancelled = true; };
    }, [historyActive, token, userId, legacyOpenedFriendPrayers, setGuestPrays, session]);

    // One-time import for existing users who already had prayers in MongoDB
    useEffect(() => {
        if (!historyActive || !profile?.prayTime?.length) return;
        void importLegacyPrayers(profile.prayTime).then(async changed => {
            if (changed) setGuestPrays(await getGuestPrays());
        }).catch(() => {});
    }, [historyActive, profile?.prayTime, setGuestPrays]);

    const syncDeliveries = useCallback(async (kind, force, targetOnly = false, canStart = () => true) => {
        if (!token || !userId) return;
        const endpoint = `${API_URL}/users/pray-time/${kind === 'replies' ? 'sent-updates' : 'inbox'}`;
        const selectedTarget = notificationTargetRef.current;
        await runSessionTask(tabReadKey(targetOnly ? `${endpoint}:target:${selectedTarget?.shareId}` : endpoint, token), async () => {
            const active = () => session.active && session.owner === String(userId) && (!targetOnly || notificationTargetRef.current === selectedTarget);
            try {
                if (!active() || !canStart()) return;
                const started = Date.now();
                const freshKey = 'deliveryChecked:' + kind;
                const revision = session.get('deliveryRevision:' + kind);
                if (!targetOnly && started - Number(session.get(freshKey)) < CIRCLE_REFRESH_MS) return;
                if (deletionSyncRef.current?.owner !== userId) deletionSyncRef.current = { owner: userId, ...(await getPrayerDeletionState(userId)) };
                const sync = deletionSyncRef.current;
                const remove = async (ids, cursor) => {
                    if (!active()) return;
                    const unseen = ids.filter(id => !sync.seen.has(String(id)));
                    if (!unseen.length && (!cursor || cursor === sync.cursor)) return;
                    const result = await applyPrayerRevocations(unseen, userId, cursor);
                    ids.forEach(id => sync.seen.add(String(id))); if (cursor) sync.cursor = cursor;
                    if (result.prayers && mountedRef.current) { setGuestPrays(result.prayers); refreshRecordings(); }
                };
                const target = targetOnly ? selectedTarget : null;
                const result = await syncPrayerPages({ kind, active, targetOnly, deletedSince: sync.cursor,
                    target: target?.type === (kind === 'replies' ? 'PRAY_CONFIRMED' : 'PRAY_SHARED') ? target.shareId : null,
                    read: params => readTabJson(`${endpoint}?${new URLSearchParams(params)}`, token, { maxAge: 0 }),
                    download: (item, reply) => downloadPrayerPayload({ url: `${API_URL}/users/pray-time/inbox/payload/${encodeURIComponent(item.shareId)}${reply ? '?kind=reply' : ''}`,
                        token, shareId: item.shareId, isAnonymous: item.isAnonymous, reply }, active, targetOnly),
                    remove, saveDeletionCursor: cursor => remove([], cursor),
                    acknowledge: async (shareId, reply) => {
                        if (!active()) return { ok: false };
                        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
                        try { return await fetch(`${API_URL}/users/pray-time/${reply ? 'sent-ack' : 'ack'}`, {
                            method: 'POST', signal: controller.signal,
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ shareId }),
                        }); } finally { clearTimeout(timer); }
                    },
                    consume: async bundle => {
                        if (!active() || sync.seen.has(String(bundle.shareId))) return false;
                        if (kind === 'replies') {
                            const result = await applyPrayerReplies([bundle]);
                            if (result.prayers && mountedRef.current) setGuestPrays(result.prayers);
                            return result.acknowledged.includes(bundle.shareId);
                        }
                        const result = await mergeIncomingPrayers([bundle]);
                        if (!active()) return false;
                        if (result.prayers) window.dispatchEvent(new Event(PRAYER_SYNC_EVENT));
                        if (result.prayers && mountedRef.current) setGuestPrays(result.prayers);
                        const localId = result.prayerIds[String(bundle.shareId).replace(/^received-/, '')] || `received-${bundle.shareId}`;
                        const imported = await addExternalRecordings(localId, bundle.recordings || [], bundle.shareId);
                        if (imported.length && mountedRef.current) refreshRecordings();
                        return active();
                    },
                });
                if (targetOnly && active() && !result.targetSaved) {
                    setTargetStatus(result.failures ? 'failed' : 'unavailable');
                }
                if (!targetOnly && active() && !result.failures && revision === session.get('deliveryRevision:' + kind)) {
                    session.set(freshKey, started);
                }
            } catch {
                if (targetOnly && active()) setTargetStatus(navigator.onLine === false ? 'offline' : 'failed');
                // Pending deliveries retry on the next poll, reconnect or foreground refresh.
            }
        }, { force });
    }, [token, userId, session, refreshRecordings, setGuestPrays]);
    useEffect(() => {
        if (!notificationTarget || notificationPrayerId !== null) return;
        const requestMissing = () => {
            if (notificationTargetRef.current === notificationTarget) {
                setTargetStatus('opening');
                void syncDeliveries(notificationTarget.type === 'PRAY_CONFIRMED' ? 'replies' : 'inbox', true, true);
            }
        };
        const offline = () => setTargetStatus('offline');
        if (navigator.onLine !== false) requestMissing();
        window.addEventListener('online', requestMissing);
        window.addEventListener('offline', offline);
        return () => {
            window.removeEventListener('online', requestMissing);
            window.removeEventListener('offline', offline);
        };
    }, [notificationTarget, notificationPrayerId, syncDeliveries]);

    useEffect(() => {
        if (!historyActive || !hasSnapshot || activePrayTab !== 'shared' || !token || !userId) return;
        let listening = true;
        const canStart = () => listening && document.visibilityState === 'visible' && navigator.onLine !== false;
        const refresh = () => {
            if (!canStart()) return;
            void syncDeliveries('inbox', true, false, canStart);
            void syncDeliveries('replies', true, false, canStart);
        };
        const subscriptions = ['inbox', 'replies'].map(kind => session.subscribe('deliveryRevision:' + kind, () => {
            if (canStart()) void syncDeliveries(kind, true, false, canStart);
        }));
        refresh();
        const interval = setInterval(refresh, CIRCLE_REFRESH_MS);
        window.addEventListener(HOME_REFRESH_EVENT, refresh);
        window.addEventListener('online', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            listening = false;
            clearInterval(interval);
            subscriptions.forEach(unsubscribe => unsubscribe());
            window.removeEventListener(HOME_REFRESH_EVENT, refresh);
            window.removeEventListener('online', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [historyActive, hasSnapshot, activePrayTab, token, userId, session, syncDeliveries]);


    const handleDeletePrayTime = (prayId) => {
        const current = prayList.find(item => String(item._id) === String(prayId));
        if (!current || current._sync || isReceivedPrayer(current) || !prayerDeleteAvailable(current.date)) return;
        const sent = isSentPrayer(current);
        if (sent && (!token || !current.sharedWith?.shareId)) return;
        if (!window.confirm(sent ? circleText.deleteForEveryone : t('deletePrayerConfirm'))) return;
        if (!prayerDeleteAvailable(current.date)) return;
        const entry = { ...current, _sync: newPrayerAction(sent ? 'delete' : 'delete-local', userId, { hidden: true }) };
        // Functional updates remove the card in this frame; the durable copy remains until acknowledgement.
        setGuestPrays(previous => previous.filter(item => String(item._id) !== String(prayId)));
        void preparePrayerAction(entry);
    };

    // Event callbacks read the latest page state. Keeping their identity stable
    // lets unchanged saved cards skip composer/recording-timer renders.
    const cardActionsRef = useRef(null);
    useLayoutEffect(() => {
        cardActionsRef.current = { handleConfirmSharedPrayer, handleDeletePrayTime, refreshRecordings, toggleFriendPrayerExpand, markSeen };
    });
    const cardActions = useMemo(() => ({
        handleConfirmSharedPrayer: (...args) => cardActionsRef.current.handleConfirmSharedPrayer(...args),
        handleDeletePrayTime: (...args) => cardActionsRef.current.handleDeletePrayTime(...args),
        refreshRecordings: (...args) => cardActionsRef.current.refreshRecordings(...args),
        toggleFriendPrayerExpand: (...args) => cardActionsRef.current.toggleFriendPrayerExpand(...args),
        markSeen: (...args) => cardActionsRef.current.markSeen(...args),
        retryPrayerAction,
    }), []);
    const renderPrayer = useCallback(entry => (
        <PrayerCard key={entry._id} entry={entry}
            canDelete={deletablePrayerIds.has(String(entry._id))}
            isExpanded={expandedFriendPrayers.has(entry._id)}
            isUnread={unreadPrayerIds.has(String(entry._id))}
            recordings={recordingsIndex[entry._id]}
            resolveFriendProfile={resolveFriendProfile} myProfilePhoto={myProfilePhoto} myUsername={myUsername}
            getPrayTypeLabel={getPrayTypeLabel} t={t} language={language} actions={cardActions} />
    ), [deletablePrayerIds, expandedFriendPrayers, unreadPrayerIds, recordingsIndex, resolveFriendProfile, myProfilePhoto, myUsername, getPrayTypeLabel, t, language, cardActions]);

    return (
        <section ref={pageRef} className={`${privacyStyles.prayerPage} app-page min-h-screen pb-[100px] pt-8 px-4 text-white transition-colors duration-150`}>
            <div className="max-w-5xl mx-auto">
                <div className="grid grid-cols-1 gap-5 sm:gap-6">
                    <div className="app-card rounded-3xl border shadow-xl shadow-black/20 p-4 sm:p-6">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Heart className="w-5 h-5 text-sky-300" />
                                <h3 className="text-base sm:text-lg font-bold text-white">{t('prayTime')}</h3>
                            </div>
                            {<PrayerSettings pageRef={pageRef} prayList={prayList} token={isGuest ? null : token} userId={userId}
                                onRestored={async () => {
                                    repairCompletedRef.current = null;
                                    deletionSyncRef.current = null;
                                    window.dispatchEvent(new CustomEvent('taspe7:prayer-push', { detail: { type: 'PRAY_SHARED' } }));
                                    refreshRecordings();
                                    setGuestPrays(await getGuestPrays());
                                    setLocalActivityId(`restore-${crypto.randomUUID()}`);
                                }} />}
                        </div>
                        {<PrayerComposer onSaved={handlePrayerSaved} />}
                    </div>

                    {/* Primary Space Tabs: My Journal vs Prayer Circle */}
                    <div className="flex flex-col gap-3 min-w-0">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActivePrayTab('personal')}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activePrayTab === 'personal'
                                        ? 'bg-white/20 text-white border border-white/10 shadow-sm'
                                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5 hover:bg-white/10'
                                        }`}
                                >
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>{t('prayMyJournal')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActivePrayTab('shared')}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activePrayTab === 'shared'
                                        ? 'bg-white/20 text-white border border-white/10 shadow-sm'
                                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5 hover:bg-white/10'
                                        }`}
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{circleText.circle}</span>
                                    {unreadPrayCount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-[#00C2FF] text-[#020817] flex items-center gap-1 shadow-sm shadow-[#00C2FF]/30">
                                            <span className="sr-only">{circleText.unread}</span>
                                            <span>{unreadPrayCount}</span>
                                        </span>
                                    )}
                                </button>
                            </div>

                            {activePrayTab === 'shared' && (
                                <div role="group" aria-label={circleText.circle} className="flex flex-wrap items-center gap-1 min-w-0 max-w-full w-full sm:w-auto bg-white/[0.04] p-1 rounded-2xl border border-white/10">
                                    {[
                                        ['all', Layers, circleText.all],
                                        ['unread', Inbox, circleText.unread],
                                        ['received', Inbox, circleText.received],
                                        ['sent', Send, circleText.sent],
                                    ].map(([filter, Icon, label]) => (
                                        <button key={filter} type="button" onClick={() => setCircleFilter(filter)}
                                            aria-pressed={circleFilter === filter}
                                            className={`flex-auto min-w-0 max-w-full min-h-11 px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${circleFilter === filter ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
                                            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                            <span>{label}</span>
                                            {filter === 'unread' && unreadPrayCount > 0 && <span className="min-w-4 px-1 py-0.5 rounded-md text-[10px] bg-sky-500/20 text-sky-300">{unreadPrayCount}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div ref={circleAnchorRef} className="scroll-mt-3">
                    {storageError && <div role="alert" className="mb-4 rounded-xl bg-red-950/30 p-3 text-sm text-red-200">
                        <p>{language === 'ar' ? 'تعذر الوصول إلى الصلوات المحفوظة. حاول مرة أخرى.' : language === 'de' ? 'Gespeicherte Gebete sind nicht erreichbar. Bitte erneut versuchen.' : 'Saved prayers could not be accessed. Please try again.'}</p>
                        <button type="button" className="mt-2 underline" onClick={() => { void refreshLocalPrayerCache().catch(() => {}); }}>{language === 'ar' ? 'إعادة المحاولة' : language === 'de' ? 'Erneut versuchen' : 'Retry storage'}</button>
                    </div>}
                    {activePrayTab === 'shared' && pendingUpdates > 0 && (
                        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30" role="status">
                            <button type="button" onClick={() => { revealUpdates(); setListTarget({ id: String(visiblePrayList[0]?._id || ''), key: Date.now(), scope: `shared:${circleFilter}` }); }} aria-label={`${circleText.viewUpdates}: ${pendingUpdates}`}
                                className="whitespace-nowrap rounded-full border border-sky-400/40 bg-sky-950 text-sky-100 px-4 py-2.5 text-xs font-semibold shadow-lg">&uarr; {pendingUpdates} {circleText.updates}</button>
                        </div>
                    )}
                    <span className="sr-only" role="status">{unreadPrayCount} {circleText.unread}</span>
                    <div hidden={activePrayTab !== 'personal'}>
                        <ListPanel title={t('myPrayTimeNotes')} icon={Heart} items={personalPrayList}
                            emptyText={t('noPrayerNotesYet')} active={activePrayTab === 'personal'} scope="personal"
                            targetId={listTarget?.scope === 'personal' ? listTarget.id : null} targetKey={listTarget?.key} renderItem={renderPrayer}
                            hasSnapshot={hasSnapshot} storageError={storageError} loadingLabel={t('loadingSavedPrayers')} />
                    </div>
                    {sharedTabVisited && <div hidden={activePrayTab !== 'shared'}>
                    {circleFilter === 'all' && notificationTarget && notificationPrayerId === null &&
                        <p role="status" className="mb-2 px-3 text-xs text-slate-400">{circleText.notification[targetStatus]}</p>}
                    <ListPanel
                        title={activePrayTab === 'personal' ? t('myPrayTimeNotes')
                            : circleFilter === 'unread' ? `${circleText.unread} (${unreadPrayCount})`
                                : circleFilter === 'received' ? `${circleText.received}${unreadReceivedCount ? ` (${unreadReceivedCount})` : ''}`
                                    : circleFilter === 'sent' ? circleText.sent
                                        : circleText.circle}
                        icon={
                            activePrayTab === 'personal'
                                ? Heart
                                : circleFilter === 'received'
                                    ? Inbox
                                    : circleFilter === 'sent'
                                        ? Send
                                        : Layers
                        }
                        iconBgClass={
                            activePrayTab === 'personal'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                : circleFilter === 'received' || circleFilter === 'all'
                                    ? 'bg-[#00C2FF]/10 text-[#00C2FF] border-[#00C2FF]/20'
                                    : circleFilter === 'sent'
                                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }
                        items={orderedPrayList}
                        emptyText={
                            activePrayTab === 'personal'
                                ? t('noPrayerNotesYet')
                                : circleFilter === 'unread'
                                    ? circleText.noUnread
                                : circleFilter === 'received'
                                    ? t('noReceivedPrayers')
                                    : circleFilter === 'sent'
                                        ? t('noSentPrayers')
                                        : t('noSharedPrayers')
                        }
                        active={activePrayTab === 'shared'} scope={`shared:${circleFilter}`}
                        targetId={listTarget?.scope === `shared:${circleFilter}` ? listTarget.id : circleFilter === 'all' ? notificationPrayerId : null}
                        targetKey={listTarget?.scope === `shared:${circleFilter}` ? listTarget.key : `notification:${notificationTarget?.key}`}
                        targetReply={!listTarget && notificationTarget?.type === 'PRAY_CONFIRMED'}
                        renderItem={renderPrayer}
                        hasSnapshot={hasSnapshot} storageError={storageError} loadingLabel={t('loadingSavedPrayers')}
                    />
                    </div>}
                    </div>
                </div>
            </div>


        </section>
    );
}

