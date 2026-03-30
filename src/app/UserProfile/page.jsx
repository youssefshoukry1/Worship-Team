'use client';

import { useContext, useEffect, useState } from 'react';
import {
    BarChart3,
    Building2,
    CalendarCheck,
    FileText,
    ListMusic,
    Mail,
    Target,
    TrendingUp,
    User,
    Users,
} from 'lucide-react';
import { UserContext } from '../context/User_Context';
import { getApiBaseUrl } from '../utils/apiBase';

const API_URL = getApiBaseUrl();
const UNKNOWN_EVENT = 'Unknown Event';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeEventKey = (value) => normalizeText(value).toLowerCase();

const getEntityId = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value._id || value.id || null;
};

const toTimestamp = (value) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const formatDate = (value, fallback = 'N/A') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const formatAverage = (value) => (Number.isFinite(value) ? value.toFixed(1) : '0.0');

const titleCase = (value) => {
    const text = normalizeText(value);
    if (!text) return 'N/A';
    return text
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const previewText = (value, maxLength = 140) => {
    const text = normalizeText(value);
    if (!text) return 'No details available';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trimEnd()}...`;
};

const addEventMetaToMap = (map, eventLike, fallbackEntry = null) => {
    const eventId = getEntityId(eventLike) || getEntityId(fallbackEntry?.eventId);
    if (!eventId) return;

    const existing = map.get(eventId.toString());
    const eventName = normalizeText(
        eventLike?.eventName ||
        eventLike?.name ||
        fallbackEntry?.eventName ||
        fallbackEntry?.eventId?.eventName ||
        fallbackEntry?.eventId?.name
    );
    const createdAt =
        eventLike?.createdAt ||
        fallbackEntry?.createdAt ||
        fallbackEntry?.eventId?.createdAt ||
        existing?.createdAt ||
        null;

    map.set(eventId.toString(), {
        id: eventId.toString(),
        name: eventName || existing?.name || UNKNOWN_EVENT,
        createdAt,
    });
};

const buildEventsMap = (events, members = []) => {
    const map = new Map();
    (events || []).forEach((event) => {
        addEventMetaToMap(map, event);
    });

    (members || []).forEach((member) => {
        (member?.trainingEvents || []).forEach((event) => {
            addEventMetaToMap(map, event);
        });

        (member?.songs_Array || []).forEach((song) => {
            addEventMetaToMap(map, song?.eventId, song);
        });

        (member?.attends || []).forEach((attendance) => {
            addEventMetaToMap(map, attendance?.eventId, attendance);
        });

        (member?.reports || []).forEach((report) => {
            addEventMetaToMap(map, report?.eventId, report);
        });
    });

    return map;
};

const resolveEventMeta = (entry, eventsMap) => {
    const eventId = getEntityId(entry?.eventId);
    const fromMap = eventId ? eventsMap.get(eventId.toString()) : null;
    const eventName =
        entry?.eventId?.eventName ||
        entry?.eventId?.name ||
        entry?.eventName ||
        fromMap?.name ||
        UNKNOWN_EVENT;

    return {
        eventId: eventId ? eventId.toString() : null,
        eventName,
        eventCreatedAt: entry?.eventId?.createdAt || fromMap?.createdAt || null,
    };
};

const sortNewestFirst = (items, getDate, fallbackKey) =>
    [...items].sort((a, b) => {
        const dateDifference = toTimestamp(getDate(b)) - toTimestamp(getDate(a));
        if (dateDifference !== 0) return dateDifference;
        return String(a[fallbackKey] || '').localeCompare(String(b[fallbackKey] || ''));
    });

const normalizeTrainingEvents = (trainingEvents, eventsMap) =>
    sortNewestFirst(
        (trainingEvents || []).map((event) => {
            const eventId = getEntityId(event);
            const fromMap = eventId ? eventsMap.get(eventId.toString()) : null;
            return {
                id: eventId || `${event?.eventName || event?.name || UNKNOWN_EVENT}-${event?.createdAt || ''}`,
                name: event?.eventName || event?.name || fromMap?.name || UNKNOWN_EVENT,
                createdAt: event?.createdAt || fromMap?.createdAt || null,
            };
        }),
        (item) => item.createdAt,
        'name'
    );

const normalizeCurrentHymns = (songs, eventsMap) =>
    sortNewestFirst(
        (songs || []).map((song, index) => {
            const { eventId, eventName, eventCreatedAt } = resolveEventMeta(song, eventsMap);
            return {
                id: getEntityId(song) || getEntityId(song?.hymnId) || `${song?.title || 'song'}-${index}`,
                title: song?.title || 'Untitled Hymn',
                scale: song?.scale || 'N/A',
                BPM: song?.BPM || 'N/A',
                eventId,
                eventName,
                eventCreatedAt,
            };
        }),
        (item) => item.eventCreatedAt,
        'title'
    );

const normalizeHymnHistory = (hymns) =>
    sortNewestFirst(
        (hymns || []).map((hymn, index) => ({
            id: getEntityId(hymn) || `${hymn?.title || 'history-hymn'}-${index}`,
            title: hymn?.title || 'Untitled Hymn',
            scale: hymn?.scale || 'N/A',
            BPM: hymn?.BPM || 'N/A',
            eventName: hymn?.eventName || UNKNOWN_EVENT,
            savedAt: hymn?.savedAt || null,
        })),
        (item) => item.savedAt,
        'title'
    );

const normalizeCurrentAttendance = (attends, eventsMap) =>
    sortNewestFirst(
        (attends || []).map((entry, index) => {
            const { eventId, eventName } = resolveEventMeta(entry, eventsMap);
            return {
                id: getEntityId(entry) || `${eventName}-${index}`,
                eventId,
                eventName,
                date: entry?.date || null,
            };
        }),
        (item) => item.date,
        'eventName'
    );

const normalizeAttendanceHistory = (attendHistory) =>
    sortNewestFirst(
        (attendHistory || []).map((entry, index) => ({
            id: getEntityId(entry) || `${entry?.eventName || UNKNOWN_EVENT}-${index}`,
            eventName: entry?.eventName || UNKNOWN_EVENT,
            date: entry?.date || null,
            savedAt: entry?.savedAt || null,
        })),
        (item) => item.date || item.savedAt,
        'eventName'
    );

const normalizeCurrentReports = (reports, eventsMap) =>
    sortNewestFirst(
        (reports || []).map((report, index) => {
            const { eventName } = resolveEventMeta(report, eventsMap);
            return {
                id: getEntityId(report) || `report-${index}`,
                text: report?.text || '',
                eventName,
                date: report?.date || null,
            };
        }),
        (item) => item.date,
        'text'
    );

const normalizeReportHistory = (reports) =>
    sortNewestFirst(
        (reports || []).map((report, index) => ({
            id: getEntityId(report) || `report-history-${index}`,
            text: report?.text || '',
            date: report?.date || null,
            savedAt: report?.savedAt || null,
        })),
        (item) => item.date || item.savedAt,
        'text'
    );

const buildCountMap = (entries, labelsByEvent) => {
    const counts = {};
    entries.forEach((entry) => {
        const cleanName = normalizeText(entry?.eventName);
        const eventKey = normalizeEventKey(cleanName);
        if (!cleanName || !eventKey || eventKey === normalizeEventKey(UNKNOWN_EVENT)) return;
        labelsByEvent[eventKey] = labelsByEvent[eventKey] || cleanName;
        counts[eventKey] = (counts[eventKey] || 0) + 1;
    });
    return counts;
};

const mergeCountMaps = (primary, secondary) => {
    const merged = { ...primary };
    Object.entries(secondary).forEach(([key, value]) => {
        merged[key] = (merged[key] || 0) + value;
    });
    return merged;
};

const buildMemberAttendanceRow = (member, eventsMap) => {
    const currentEntries = normalizeCurrentAttendance(member?.attends, eventsMap);
    const historyEntries = normalizeAttendanceHistory(member?.attendHistory);
    const labelsByEvent = {};
    const currentByEvent = buildCountMap(currentEntries, labelsByEvent);
    const historyByEvent = buildCountMap(historyEntries, labelsByEvent);

    return {
        memberId: getEntityId(member),
        name: member?.Name || 'Unknown User',
        currentCount: currentEntries.length,
        historyCount: historyEntries.length,
        allCount: currentEntries.length + historyEntries.length,
        countsByEvent: {
            current: currentByEvent,
            history: historyByEvent,
            all: mergeCountMaps(currentByEvent, historyByEvent),
        },
        labelsByEvent,
    };
};

const buildEventOptions = (churchEvents, memberRows) => {
    const labels = {};

    (churchEvents || []).forEach((event) => {
        const eventName = normalizeText(event?.eventName || event?.name);
        const eventKey = normalizeEventKey(eventName);
        if (!eventKey) return;
        labels[eventKey] = labels[eventKey] || eventName;
    });

    (memberRows || []).forEach((row) => {
        Object.entries(row.labelsByEvent || {}).forEach(([key, label]) => {
            if (!key || !label) return;
            labels[key] = labels[key] || label;
        });
    });

    return Object.entries(labels)
        .filter(([key]) => key !== normalizeEventKey(UNKNOWN_EVENT))
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
};

const getScopeValue = (row, scope, eventKey) => {
    if (!row) return 0;
    if (!eventKey) return row[`${scope}Count`] || 0;
    return row.countsByEvent?.[scope]?.[eventKey] || 0;
};

const buildComparisonMetrics = (memberRows, currentUserId, scope, eventKey = '') => {
    const rows = memberRows || [];
    if (rows.length === 0) {
        return {
            count: 0,
            average: 0,
            rank: null,
            totalMembers: 0,
            usersAhead: 0,
            leaderName: 'N/A',
            leaderCount: 0,
        };
    }

    const sortedRows = [...rows].sort((left, right) => {
        const difference = getScopeValue(right, scope, eventKey) - getScopeValue(left, scope, eventKey);
        if (difference !== 0) return difference;
        return left.name.localeCompare(right.name);
    });

    const currentIndex = sortedRows.findIndex((row) => row.memberId === currentUserId);
    const currentRow = currentIndex >= 0 ? sortedRows[currentIndex] : null;
    const currentValue = getScopeValue(currentRow, scope, eventKey);
    const totalValue = sortedRows.reduce((sum, row) => sum + getScopeValue(row, scope, eventKey), 0);
    const leader = sortedRows[0];

    return {
        count: currentValue,
        average: totalValue / sortedRows.length,
        rank: currentIndex >= 0 ? currentIndex + 1 : null,
        totalMembers: sortedRows.length,
        usersAhead: sortedRows.filter((row) => getScopeValue(row, scope, eventKey) > currentValue).length,
        leaderName: leader?.name || 'N/A',
        leaderCount: getScopeValue(leader, scope, eventKey),
    };
};

function SummaryCard({
    icon: Icon,
    title,
    primaryLabel,
    primaryValue,
    secondaryLabel,
    secondaryValue,
    accentClass = 'text-sky-300',
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                <Icon className={`h-4 w-4 ${accentClass}`} />
                {title}
            </p>
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">{primaryLabel}</p>
                    <p className={`mt-1 text-2xl font-bold ${accentClass}`}>{primaryValue}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">{secondaryLabel}</p>
                    <p className="mt-1 text-2xl font-bold text-white">{secondaryValue}</p>
                </div>
            </div>
        </div>
    );
}

function ComparisonCard({ title, metrics, accentClass = 'text-sky-300' }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</p>
            <p className={`mt-2 text-3xl font-bold ${accentClass}`}>{metrics.count}</p>
            <div className="mt-3 space-y-1 text-xs text-slate-300">
                <p>Church average: {formatAverage(metrics.average)}</p>
                <p>Rank: {metrics.rank ? `${metrics.rank} / ${metrics.totalMembers}` : 'N/A'}</p>
                <p>Users ahead: {metrics.usersAhead}</p>
                <p>Leader: {metrics.leaderName} ({metrics.leaderCount})</p>
            </div>
        </div>
    );
}

function ListPanel({ title, icon: Icon, accentClass = 'text-sky-300', items, emptyText, renderItem }) {
    return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-5">
            <h2 className="mb-4 inline-flex items-center gap-2 text-base font-bold text-white sm:text-lg">
                <Icon className={`h-5 w-5 ${accentClass}`} />
                {title}
            </h2>
            <div className="max-h-[52vh] min-h-[180px] space-y-3 overflow-y-auto overscroll-contain pr-1 sm:max-h-[420px]">
                {items.length > 0 ? (
                    items.map(renderItem)
                ) : (
                    <p className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-5 text-center text-sm text-slate-400">
                        {emptyText}
                    </p>
                )}
            </div>
        </div>
    );
}

function PeerComparisonCard({ member, isCurrentUser, selectedEventKey, selectedEventLabel }) {
    return (
        <div className={`rounded-2xl border p-4 ${isCurrentUser ? 'border-sky-400/30 bg-sky-500/10' : 'border-white/10 bg-black/20'}`}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="font-semibold text-white">{member.name}</p>
                    {isCurrentUser && (
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-sky-200">You</p>
                    )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">All Events</p>
                    <p className="text-xl font-bold text-sky-300">{member.allCount}</p>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Current</p>
                    <p className="mt-1 text-lg font-bold text-emerald-300">{member.currentCount}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">History</p>
                    <p className="mt-1 text-lg font-bold text-amber-300">{member.historyCount}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Total</p>
                    <p className="mt-1 text-lg font-bold text-sky-300">{member.allCount}</p>
                </div>
            </div>

            {selectedEventKey && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {selectedEventLabel}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">Current</p>
                            <p className="mt-1 font-bold text-emerald-300">
                                {member.countsByEvent.current[selectedEventKey] || 0}
                            </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">History</p>
                            <p className="mt-1 font-bold text-amber-300">
                                {member.countsByEvent.history[selectedEventKey] || 0}
                            </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
                            <p className="mt-1 font-bold text-sky-300">
                                {member.countsByEvent.all[selectedEventKey] || 0}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function UserProfile() {
    const { user_id, churchId, isLogin } = useContext(UserContext);
    const [profile, setProfile] = useState(null);
    const [userEmail, setUserEmail] = useState('');
    const [selectedEventKey, setSelectedEventKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isLogin || !user_id || !churchId) {
            setError('Please log in first');
            setLoading(false);
            return;
        }

        let ignore = false;
        const storedEmail = localStorage.getItem('user_Taspe7_Email');
        if (storedEmail) {
            setUserEmail(storedEmail);
        }

        const loadProfile = async () => {
            try {
                setLoading(true);
                setError(null);

                const headers = {
                    Authorization: `Bearer ${isLogin}`,
                };

                const [membersRes, eventsRes] = await Promise.all([
                    fetch(`${API_URL}/users/my-church`, { headers }),
                    fetch(`${API_URL}/events/my-church`, { headers }).catch(() => null),
                ]);

                if (!membersRes.ok) {
                    throw new Error('Failed to fetch church members');
                }

                const members = await membersRes.json();
                const churchEvents = eventsRes?.ok ? await eventsRes.json() : [];
                const currentUser = (members || []).find((member) => member._id === user_id);

                if (!currentUser) {
                    throw new Error('Current user not found in church members');
                }

                const eventsMap = buildEventsMap(churchEvents, members);
                const currentTrainingEvents = normalizeTrainingEvents(currentUser.trainingEvents, eventsMap);
                const currentHymns = normalizeCurrentHymns(currentUser.songs_Array, eventsMap);
                const hymnHistory = normalizeHymnHistory(currentUser.hymnHistory);
                const currentAttendance = normalizeCurrentAttendance(currentUser.attends, eventsMap);
                const attendanceHistory = normalizeAttendanceHistory(currentUser.attendHistory);
                const currentReports = normalizeCurrentReports(currentUser.reports, eventsMap);
                const reportHistory = normalizeReportHistory(currentUser.reportHistory);
                const memberAttendanceRows = (members || []).map((member) =>
                    buildMemberAttendanceRow(member, eventsMap)
                );
                const eventOptions = buildEventOptions(churchEvents, memberAttendanceRows);

                if (ignore) return;

                setProfile({
                    user: currentUser,
                    churchEventsCount: Array.isArray(churchEvents) ? churchEvents.length : 0,
                    currentTrainingEvents,
                    currentHymns,
                    hymnHistory,
                    currentAttendance,
                    attendanceHistory,
                    currentReports,
                    reportHistory,
                    memberAttendanceRows,
                    eventOptions,
                });

                setSelectedEventKey((previous) => {
                    if (previous && eventOptions.some((option) => option.key === previous)) {
                        return previous;
                    }
                    return eventOptions[0]?.key || '';
                });
            } catch (fetchError) {
                if (!ignore) {
                    console.error('Error fetching profile:', fetchError);
                    setError(fetchError.message || 'Failed to load profile data');
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        };

        loadProfile();

        return () => {
            ignore = true;
        };
    }, [isLogin, user_id, churchId]);

    const overallCurrentMetrics = profile
        ? buildComparisonMetrics(profile.memberAttendanceRows, user_id, 'current')
        : null;
    const overallHistoryMetrics = profile
        ? buildComparisonMetrics(profile.memberAttendanceRows, user_id, 'history')
        : null;
    const overallAllMetrics = profile
        ? buildComparisonMetrics(profile.memberAttendanceRows, user_id, 'all')
        : null;

    const selectedEventLabel =
        profile?.eventOptions.find((option) => option.key === selectedEventKey)?.label || 'Selected Event';

    const selectedEventMetrics = profile && selectedEventKey
        ? {
            current: buildComparisonMetrics(profile.memberAttendanceRows, user_id, 'current', selectedEventKey),
            history: buildComparisonMetrics(profile.memberAttendanceRows, user_id, 'history', selectedEventKey),
            all: buildComparisonMetrics(profile.memberAttendanceRows, user_id, 'all', selectedEventKey),
        }
        : null;

    const comparisonRows = profile
        ? [...profile.memberAttendanceRows].sort((left, right) => {
            const allDifference = right.allCount - left.allCount;
            if (allDifference !== 0) return allDifference;
            return left.name.localeCompare(right.name);
        })
        : [];

    if (loading) {
        return (
            <div className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] px-4 py-20 text-white sm:px-6">
                <div className="mx-auto flex max-w-7xl items-center justify-center">
                    <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-10 backdrop-blur-xl">
                        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-sky-500/20 border-t-sky-400" />
                        <p className="text-sm text-sky-200">Loading profile...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] px-4 py-20 text-white sm:px-6">
                <div className="mx-auto max-w-3xl rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-center backdrop-blur-xl">
                    <p className="text-red-200">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <section className="relative min-h-screen overflow-hidden bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] px-4 py-12 text-white sm:px-6 sm:py-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(14,116,144,0.16),transparent_65%)]" />

            <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-8">
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="mb-2 inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
                                User Profile
                            </p>
                            <h1 className="text-2xl font-bold text-white sm:text-4xl">
                                {profile?.user?.Name || 'N/A'}
                            </h1>
                            <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-300">
                                <Mail className="h-4 w-4 text-sky-300" />
                                {userEmail || 'Email not available'}
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <User className="h-4 w-4 text-sky-300" />
                                    Role
                                </p>
                                <p className="text-sm font-semibold text-white">{titleCase(profile?.user?.role)}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <Target className="h-4 w-4 text-emerald-300" />
                                    Status
                                </p>
                                <p className="text-sm font-semibold text-white">{titleCase(profile?.user?.status)}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <Building2 className="h-4 w-4 text-indigo-300" />
                                    Church
                                </p>
                                <p className="text-sm font-semibold text-white">
                                    {profile?.user?.ChurchName || 'N/A'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <TrendingUp className="h-4 w-4 text-amber-300" />
                                    In Training
                                </p>
                                <p className="text-sm font-semibold text-white">
                                    {profile?.user?.isInTraining ? 'Active' : 'Inactive'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <SummaryCard
                            icon={CalendarCheck}
                            title="Events Overview"
                            primaryLabel="Training"
                            primaryValue={profile?.currentTrainingEvents.length || 0}
                            secondaryLabel="Church Events"
                            secondaryValue={profile?.churchEventsCount || 0}
                            accentClass="text-sky-300"
                        />
                        <SummaryCard
                            icon={ListMusic}
                            title="Hymns"
                            primaryLabel="Current"
                            primaryValue={profile?.currentHymns.length || 0}
                            secondaryLabel="History"
                            secondaryValue={profile?.hymnHistory.length || 0}
                            accentClass="text-indigo-300"
                        />
                        <SummaryCard
                            icon={CalendarCheck}
                            title="Attendance"
                            primaryLabel="Current"
                            primaryValue={profile?.currentAttendance.length || 0}
                            secondaryLabel="History"
                            secondaryValue={profile?.attendanceHistory.length || 0}
                            accentClass="text-emerald-300"
                        />
                        <SummaryCard
                            icon={FileText}
                            title="Reports"
                            primaryLabel="Current"
                            primaryValue={profile?.currentReports.length || 0}
                            secondaryLabel="History"
                            secondaryValue={profile?.reportHistory.length || 0}
                            accentClass="text-amber-300"
                        />
                    </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h2 className="inline-flex items-center gap-2 text-xl font-bold text-white">
                                <TrendingUp className="h-5 w-5 text-sky-300" />
                                Attendance Comparison
                            </h2>
                            <p className="mt-2 text-sm text-slate-300">
                                Current, history, and all-events attendance compared with other approved users in your church.
                            </p>
                        </div>

                        <div className="min-w-[220px] rounded-2xl border border-white/10 bg-black/20 p-4">
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                                Specific Event
                            </label>
                            <select
                                value={selectedEventKey}
                                onChange={(event) => setSelectedEventKey(event.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none"
                                disabled={!profile?.eventOptions.length}
                            >
                                {profile?.eventOptions.length ? (
                                    profile.eventOptions.map((option) => (
                                        <option key={option.key} value={option.key}>
                                            {option.label}
                                        </option>
                                    ))
                                ) : (
                                    <option value="">No event data</option>
                                )}
                            </select>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-3">
                        {overallCurrentMetrics && (
                            <ComparisonCard
                                title="All Events: Current"
                                metrics={overallCurrentMetrics}
                                accentClass="text-emerald-300"
                            />
                        )}
                        {overallHistoryMetrics && (
                            <ComparisonCard
                                title="All Events: History"
                                metrics={overallHistoryMetrics}
                                accentClass="text-amber-300"
                            />
                        )}
                        {overallAllMetrics && (
                            <ComparisonCard
                                title="All Events: Current + History"
                                metrics={overallAllMetrics}
                                accentClass="text-sky-300"
                            />
                        )}
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                                <Target className="h-4 w-4 text-sky-300" />
                                {selectedEventKey ? `${selectedEventLabel} Comparison` : 'Specific Event Comparison'}
                            </h3>
                            <p className="text-xs text-slate-400">
                                Current, history, and combined attendance for the selected event.
                            </p>
                        </div>

                        {selectedEventMetrics ? (
                            <div className="grid gap-4 lg:grid-cols-3">
                                <ComparisonCard
                                    title={`${selectedEventLabel}: Current`}
                                    metrics={selectedEventMetrics.current}
                                    accentClass="text-emerald-300"
                                />
                                <ComparisonCard
                                    title={`${selectedEventLabel}: History`}
                                    metrics={selectedEventMetrics.history}
                                    accentClass="text-amber-300"
                                />
                                <ComparisonCard
                                    title={`${selectedEventLabel}: Current + History`}
                                    metrics={selectedEventMetrics.all}
                                    accentClass="text-sky-300"
                                />
                            </div>
                        ) : (
                            <p className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-5 text-center text-sm text-slate-400">
                                No event comparison data available yet.
                            </p>
                        )}
                    </div>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                        <div className="border-b border-white/10 px-4 py-3">
                            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                                <Users className="h-4 w-4 text-indigo-300" />
                                Church Attendance Comparison
                            </h3>
                        </div>

                        <div className="max-h-[65vh] space-y-3 overflow-y-auto overscroll-contain p-4 pr-2 lg:hidden">
                            {comparisonRows.map((member) => (
                                <PeerComparisonCard
                                    key={member.memberId || member.name}
                                    member={member}
                                    isCurrentUser={member.memberId === user_id}
                                    selectedEventKey={selectedEventKey}
                                    selectedEventLabel={selectedEventLabel}
                                />
                            ))}
                        </div>

                        <div className="hidden max-h-[65vh] overflow-auto lg:block">
                            <table className="min-w-full text-sm">
                                <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">User</th>
                                        <th className="px-4 py-3 font-semibold">Current</th>
                                        <th className="px-4 py-3 font-semibold">History</th>
                                        <th className="px-4 py-3 font-semibold">All</th>
                                        {selectedEventKey && (
                                            <>
                                                <th className="px-4 py-3 font-semibold">{selectedEventLabel} Current</th>
                                                <th className="px-4 py-3 font-semibold">{selectedEventLabel} History</th>
                                                <th className="px-4 py-3 font-semibold">{selectedEventLabel} All</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonRows.map((member) => {
                                        const isCurrentUser = member.memberId === user_id;
                                        return (
                                            <tr
                                                key={member.memberId || member.name}
                                                className={`border-t border-white/5 ${
                                                    isCurrentUser ? 'bg-sky-500/10' : 'bg-transparent'
                                                }`}
                                            >
                                                <td className="px-4 py-3 font-semibold text-white">
                                                    <div className="flex items-center gap-2">
                                                        <span>{member.name}</span>
                                                        {isCurrentUser && (
                                                            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-200">
                                                                You
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-200">{member.currentCount}</td>
                                                <td className="px-4 py-3 text-slate-200">{member.historyCount}</td>
                                                <td className="px-4 py-3 font-semibold text-sky-300">{member.allCount}</td>
                                                {selectedEventKey && (
                                                    <>
                                                        <td className="px-4 py-3 text-slate-200">
                                                            {member.countsByEvent.current[selectedEventKey] || 0}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-200">
                                                            {member.countsByEvent.history[selectedEventKey] || 0}
                                                        </td>
                                                        <td className="px-4 py-3 text-sky-300">
                                                            {member.countsByEvent.all[selectedEventKey] || 0}
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-white">Current Cycle</h2>
                        <p className="mt-1 text-sm text-slate-300">
                            Live data from the current user model fields: training events, hymns, attendance, and reports.
                        </p>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                        <ListPanel
                            title="Training Events"
                            icon={CalendarCheck}
                            accentClass="text-sky-300"
                            items={profile?.currentTrainingEvents || []}
                            emptyText="No current training events"
                            renderItem={(event) => (
                                <div key={event.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <h4 className="text-base font-semibold text-white">{event.name}</h4>
                                    <p className="mt-1 text-xs text-slate-300">
                                        Created: {formatDate(event.createdAt, 'No date')}
                                    </p>
                                </div>
                            )}
                        />

                        <ListPanel
                            title="Current Hymns"
                            icon={ListMusic}
                            accentClass="text-indigo-300"
                            items={profile?.currentHymns || []}
                            emptyText="No current hymns"
                            renderItem={(hymn) => (
                                <div key={hymn.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <h4 className="text-base font-semibold text-white">{hymn.title}</h4>
                                    <div className="mt-1 space-y-1 text-xs text-slate-300">
                                        <p>Event: {hymn.eventName}</p>
                                        <p>Scale: {hymn.scale}</p>
                                        <p>BPM: {hymn.BPM}</p>
                                    </div>
                                </div>
                            )}
                        />

                        <ListPanel
                            title="Current Attendance"
                            icon={CalendarCheck}
                            accentClass="text-emerald-300"
                            items={profile?.currentAttendance || []}
                            emptyText="No current attendance"
                            renderItem={(entry) => (
                                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <h4 className="text-base font-semibold text-white">{entry.eventName}</h4>
                                    <p className="mt-1 text-xs text-slate-300">
                                        Attendance date: {formatDate(entry.date, 'No attendance date')}
                                    </p>
                                </div>
                            )}
                        />

                        <ListPanel
                            title="Current Reports"
                            icon={FileText}
                            accentClass="text-amber-300"
                            items={profile?.currentReports || []}
                            emptyText="No current reports"
                            renderItem={(report) => (
                                <div key={report.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <h4 className="text-sm font-semibold text-white">{report.eventName}</h4>
                                    <p className="mt-2 text-sm text-slate-200">{previewText(report.text)}</p>
                                    <p className="mt-2 text-xs text-slate-400">
                                        Report date: {formatDate(report.date, 'No report date')}
                                    </p>
                                </div>
                            )}
                        />
                    </div>
                </section>

                <section>
                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-white">Archived History</h2>
                        <p className="mt-1 text-sm text-slate-300">
                            Historical data from the saved history arrays in the user model.
                        </p>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-3">
                        <ListPanel
                            title="Hymn History"
                            icon={ListMusic}
                            accentClass="text-fuchsia-300"
                            items={profile?.hymnHistory || []}
                            emptyText="No hymn history"
                            renderItem={(hymn) => (
                                <div key={hymn.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <h4 className="text-base font-semibold text-white">{hymn.title}</h4>
                                    <div className="mt-1 space-y-1 text-xs text-slate-300">
                                        <p>Event: {hymn.eventName}</p>
                                        <p>Scale: {hymn.scale}</p>
                                        <p>Saved: {formatDate(hymn.savedAt, 'No archive date')}</p>
                                    </div>
                                </div>
                            )}
                        />

                        <ListPanel
                            title="Attendance History"
                            icon={BarChart3}
                            accentClass="text-orange-300"
                            items={profile?.attendanceHistory || []}
                            emptyText="No attendance history"
                            renderItem={(entry) => (
                                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <h4 className="text-base font-semibold text-white">{entry.eventName}</h4>
                                    <div className="mt-1 space-y-1 text-xs text-slate-300">
                                        <p>Attendance date: {formatDate(entry.date, 'No attendance date')}</p>
                                        <p>Saved: {formatDate(entry.savedAt, 'No archive date')}</p>
                                    </div>
                                </div>
                            )}
                        />

                        <ListPanel
                            title="Report History"
                            icon={FileText}
                            accentClass="text-rose-300"
                            items={profile?.reportHistory || []}
                            emptyText="No report history"
                            renderItem={(report) => (
                                <div key={report.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <p className="text-sm text-slate-200">{previewText(report.text)}</p>
                                    <div className="mt-2 space-y-1 text-xs text-slate-400">
                                        <p>Report date: {formatDate(report.date, 'No report date')}</p>
                                        <p>Saved: {formatDate(report.savedAt, 'No archive date')}</p>
                                    </div>
                                </div>
                            )}
                        />
                    </div>
                </section>
            </div>
        </section>
    );
}
