'use client';

import { useContext, useEffect, useState, useMemo } from 'react';
import {
    Activity,
    BarChart3,
    Book,
    Building2,
    CalendarCheck,
    ChevronDown,
    Edit3,
    FileText,
    ListMusic,
    Mail,
    Target,
    Trash2,
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

const previewText = (value, maxLength = 80) => {
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

    const isCanceled = eventLike?.isCanceled === true ||
        fallbackEntry?.eventId?.isCanceled === true ||
        existing?.isCanceled === true;

    map.set(eventId.toString(), {
        id: eventId.toString(),
        name: eventName || existing?.name || UNKNOWN_EVENT,
        createdAt,
        isCanceled
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
            eventName: report?.eventName || UNKNOWN_EVENT,
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

/* --- UI COMPONENTS --- */

function Badge({ icon: Icon, label, value, classes = "text-slate-200 bg-white/5 border-white/10" }) {
    return (
        <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${classes}`}>
            <Icon className="w-3.5 h-3.5 opacity-70" />
            <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider opacity-60 leading-[1]">{label}</span>
                <span className="text-xs sm:text-sm font-semibold leading-[1.2] mt-0.5">{value}</span>
            </div>
        </div>
    );
}

function SummaryCard({
    icon: Icon,
    title,
    primaryLabel,
    primaryValue,
    secondaryLabel,
    secondaryValue,
    accentClass = 'text-sky-400',
    bgClass = 'bg-sky-500/10 border-sky-400/20'
}) {
    return (
        <div className={`rounded-2xl border ${bgClass} p-4 sm:p-5 flex flex-col justify-between transition-transform hover:scale-[1.02] duration-300`}>
            <div className="flex items-center gap-2 mb-4">
                <div className={`p-2 rounded-lg bg-black/30 backdrop-blur-md ${accentClass}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <p className="text-xs sm:text-sm font-bold tracking-wide text-white">
                    {title}
                </p>
            </div>
            <div className="flex items-end justify-between mt-auto">
                <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">{primaryLabel}</p>
                    <p className={`text-3xl sm:text-4xl font-black ${accentClass} leading-none`}>{primaryValue}</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">{secondaryLabel}</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-200 leading-none">{secondaryValue}</p>
                </div>
            </div>
        </div>
    );
}

function ListPanel({ title, icon: Icon, accentClass = 'text-sky-400', iconBgClass = 'bg-sky-500/20 text-sky-400 border-sky-500/30', items, emptyText, renderItem }) {
    return (
        <div className="flex flex-col h-full rounded-3xl border border-white/5 bg-white/[0.03] backdrop-blur-2xl overflow-hidden shadow-xl shadow-black/20">
            <div className="flex items-center gap-3 border-b border-white/5 p-4 sm:p-5 bg-black/20">
                <div className={`p-2 rounded-xl flex items-center justify-center border ${iconBgClass}`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                    {title}
                </h2>
                <div className="ml-auto bg-white/10 text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg text-slate-300">
                    {items.length} records
                </div>
            </div>
            <div className="flex-1 p-3 sm:p-5 overflow-y-auto max-h-[350px] space-y-2.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
                {items.length > 0 ? (
                    items.map((item, index) => renderItem(item, index))
                ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-[200px]">
                        <Icon className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-xs font-semibold">{emptyText}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function PeerComparisonCard({ member, isCurrentUser }) {
    return (
        <div className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-colors ${isCurrentUser ? 'border-sky-400/40 bg-sky-900/20 shadow-[0_0_20px_rgba(56,189,248,0.1)]' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}>
            {isCurrentUser && <div className="absolute top-0 right-0 w-24 h-24 bg-sky-400/10 blur-2xl rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>}

            <div className="flex items-center justify-between gap-3 mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-inner ${isCurrentUser ? 'bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-sky-400/20' : 'bg-gradient-to-br from-slate-700 to-slate-900 text-slate-300 border border-white/5'}`}>
                        {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <p className={`font-bold text-sm sm:text-base ${isCurrentUser ? 'text-white' : 'text-slate-200'}`}>{member.name}</p>
                            {isCurrentUser && (
                                <span className="bg-sky-500/20 text-sky-300 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border border-sky-400/20">You</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Total Count</p>
                    <p className={`text-2xl font-black leading-none ${isCurrentUser ? 'text-sky-400' : 'text-white'}`}>{member.allCount}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 relative z-10">
                <div className="rounded-xl border border-white/5 bg-white/5 p-3 flex justify-between items-center">
                    <div className="flex items-center gap-1.5 opacity-60">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                        <p className="text-[10px] uppercase tracking-wide font-bold">Current</p>
                    </div>
                    <p className="text-sm font-black text-emerald-400">{member.currentCount}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/5 p-3 flex justify-between items-center">
                    <div className="flex items-center gap-1.5 opacity-60">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                        <p className="text-[10px] uppercase tracking-wide font-bold">History</p>
                    </div>
                    <p className="text-sm font-black text-amber-400">{member.historyCount}</p>
                </div>
            </div>
        </div>
    );
}

/* --- MAIN PAGE COMPONENT --- */

export default function UserProfile() {
    const { user_id, churchId, isLogin } = useContext(UserContext);
    const [profile, setProfile] = useState(null);
    const [userEmail, setUserEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedEventKey, setSelectedEventKey] = useState('all');

    const allEventOptions = useMemo(() => {
        if (!profile) return [];
        const optionsMap = new Map();

        (profile.churchEvents || []).forEach(e => {
            const name = e.eventName || e.name || UNKNOWN_EVENT;
            const key = normalizeEventKey(name);
            if (key) optionsMap.set(key, name);
        });

        profile.eventsMap.forEach(e => {
            const key = normalizeEventKey(e.name);
            if (key) optionsMap.set(key, e.name);
        });

        return Array.from(optionsMap.entries()).map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [profile]);

    const displayProfile = useMemo(() => {
        if (!profile) return null;
        if (selectedEventKey === 'all') return profile;

        const filterByEvent = (items) => items.filter(item => {
            const itemEventName = item.eventName || item.name || UNKNOWN_EVENT;
            return normalizeEventKey(itemEventName) === selectedEventKey;
        });

        return {
            ...profile,
            currentTrainingEvents: filterByEvent(profile.currentTrainingEvents),
            currentHymns: filterByEvent(profile.currentHymns),
            hymnHistory: filterByEvent(profile.hymnHistory),
            currentAttendance: filterByEvent(profile.currentAttendance),
            attendanceHistory: filterByEvent(profile.attendanceHistory),
            currentReports: filterByEvent(profile.currentReports),
            reportHistory: filterByEvent(profile.reportHistory),
            bibleNotes: profile.bibleNotes || [],
            memberAttendanceRows: profile.memberAttendanceRows.map(row => {
                const currentCount = row.countsByEvent.current[selectedEventKey] || 0;
                const historyCount = row.countsByEvent.history[selectedEventKey] || 0;
                return {
                    ...row,
                    currentCount,
                    historyCount,
                    allCount: currentCount + historyCount
                };
            })
        };
    }, [profile, selectedEventKey]);

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

                if (ignore) return;

                setProfile({
                    user: currentUser,
                    churchEventsCount: Array.isArray(churchEvents) ? churchEvents.length : 0,
                    churchEvents,
                    eventsMap,
                    currentTrainingEvents,
                    currentHymns,
                    hymnHistory,
                    currentAttendance,
                    attendHistoryCount: currentUser.attendHistory?.length || 0,
                    attendanceHistory,
                    currentReports,
                    reportHistory,
                    bibleNotes: currentUser.bibleNotes || [],
                    memberAttendanceRows,
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

    const handleDeleteBibleNote = async (noteId) => {
        if (!window.confirm('Are you sure you want to delete this bible note?')) return;
        try {
            const response = await fetch(`${API_URL}/users/bible-note/${user_id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${isLogin}`
                },
                body: JSON.stringify({ noteId })
            });

            if (response.ok) {
                setProfile(prev => ({
                    ...prev,
                    bibleNotes: (prev.bibleNotes || []).filter(n => n._id !== noteId)
                }));
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to delete note');
            }
        } catch (error) {
            console.error('Delete note error:', error);
            alert('Error deleting note');
        }
    };

    const handleEditBibleNote = async (noteItem) => {
        const newNote = window.prompt('Update your bible note:', noteItem.note);
        if (newNote === null || newNote === noteItem.note) return;

        try {
            const response = await fetch(`${API_URL}/users/bible-note`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${isLogin}`
                },
                body: JSON.stringify({
                    userid: user_id,
                    verseId: noteItem.verseId,
                    bookName: noteItem.bookName,
                    chapter: noteItem.chapter,
                    verseNumber: noteItem.verseNumber,
                    text: noteItem.text,
                    note: newNote
                })
            });

            if (response.ok) {
                setProfile(prev => ({
                    ...prev,
                    bibleNotes: (prev.bibleNotes || []).map(n =>
                        n.verseId === noteItem.verseId ? { ...n, note: newNote } : n
                    )
                }));
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to update note');
            }
        } catch (error) {
            console.error('Update note error:', error);
            alert('Error updating note');
        }
    };


    const comparisonRows = displayProfile
        ? [...displayProfile.memberAttendanceRows].sort((left, right) => {
            const allDifference = right.allCount - left.allCount;
            if (allDifference !== 0) return allDifference;
            return left.name.localeCompare(right.name);
        })
        : [];

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-sky-500/20 border-t-sky-400 rounded-full animate-spin mb-6 shadow-[0_0_30px_rgba(56,189,248,0.2)]"></div>
                <p className="text-sky-300 font-medium tracking-wide">Loading your dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 max-w-md w-full text-center backdrop-blur-xl">
                    <Activity className="w-12 h-12 text-red-400 mx-auto mb-4 opacity-80" />
                    <h2 className="text-xl font-bold text-red-200 mb-2">Oops! Something went wrong.</h2>
                    <p className="text-red-300/80 text-sm mb-6">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-sm font-bold rounded-xl transition-colors border border-red-500/30">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: User },
        { id: 'bible', label: 'Bible', icon: Book },
        { id: 'current', label: 'Current Cycle', icon: TrendingUp },
        { id: 'history', label: 'History', icon: CalendarCheck },
        { id: 'compare', label: 'Compare', icon: BarChart3 },
    ];

    const generateAttendanceStatusBlock = () => {
        if (!displayProfile) return null;

        // Exclude completely canceled events and filter by selectedEventKey
        const validChurchEvents = profile.churchEvents?.filter(e => {
            if (e.isCanceled) return false;
            if (selectedEventKey !== 'all' && normalizeEventKey(e.eventName || e.name || UNKNOWN_EVENT) !== selectedEventKey) return false;
            return true;
        }) || [];
        const validExpectedCount = validChurchEvents.length;

        // Filter out User attendances to explicitly only count valid un-canceled ones
        const validAttendedCount = displayProfile.currentAttendance?.filter(a => {
            const eMeta = displayProfile.eventsMap?.get(a.eventId);
            return !eMeta?.isCanceled;
        }).length || 0;

        const maxScore = validExpectedCount > 0 ? validExpectedCount : 1;
        let consistencyPercentage = Math.round((validAttendedCount / maxScore) * 100);
        if (consistencyPercentage > 100) consistencyPercentage = 100;

        const historyCountDisplay = selectedEventKey === 'all'
            ? displayProfile.attendHistoryCount
            : displayProfile.attendanceHistory.length;

        let statusMessage = "";
        let statusIcon = null;
        let statusClass = "";

        if (consistencyPercentage >= 80) {
            statusMessage = "🔥 You are one of the most committed members! Keep going!";
            statusIcon = "🔥";
            statusClass = "shadow-[0_0_30px_rgba(251,146,60,0.15)] border-orange-500/50 bg-gradient-to-r from-orange-500/10 to-orange-500/5 text-orange-200";
        } else if (consistencyPercentage >= 50) {
            statusMessage = "⚠️ You are doing okay, but you need to be more consistent.";
            statusIcon = "⚠️";
            statusClass = "border-yellow-500/50 bg-gradient-to-r from-yellow-500/10 to-yellow-500/5 text-yellow-200";
        } else {
            statusMessage = "❗ You need to improve your attendance and commitment.";
            statusIcon = "❗";
            statusClass = "border-red-500/50 bg-gradient-to-r from-red-500/10 to-red-500/5 text-red-200";
        }

        return (
            <div className={`rounded-3xl border p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden transition-all duration-500 mb-8 shadow-xl ${statusClass}`}>
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none scale-150 -translate-y-10">
                    <Target className="w-64 h-64" />
                </div>
                <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8 lg:gap-12 justify-between">
                    <div className="flex-1 text-center lg:text-left">
                        <h2 className="text-2xl sm:text-3xl font-black mb-3 text-white flex justify-center lg:justify-start items-center gap-3">
                            <span className="text-3xl sm:text-4xl filter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] animate-pulse">{statusIcon}</span>
                            Attendance Status
                        </h2>
                        <p className="text-sm sm:text-base font-bold opacity-90 mx-auto lg:mx-0 max-w-sm">
                            {statusMessage}
                        </p>
                    </div>
                    <div className="flex gap-6 sm:gap-10 justify-center items-center bg-black/20 p-5 rounded-2xl border border-white/5 shadow-inner">
                        <div className="text-center min-w-[80px]">
                            <p className="text-[10px] uppercase tracking-widest font-black opacity-60 mb-2">Current Score</p>
                            <p className="text-4xl sm:text-5xl font-black text-white">{validAttendedCount} <span className="text-lg sm:text-xl font-bold opacity-40">/ {validExpectedCount}</span></p>
                        </div>
                        <div className="w-px h-16 bg-white/10"></div>
                        <div className="text-center min-w-[80px]">
                            <p className="text-[10px] uppercase tracking-widest font-black opacity-60 mb-2">Historical</p>
                            <p className="text-3xl sm:text-4xl font-black text-white opacity-90">{historyCountDisplay}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] text-white pb-24">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-8 sm:pt-12">

                {/* --- HEADER PROFILE CARD --- */}
                <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-5 sm:p-8 backdrop-blur-2xl mb-6 sm:mb-8 relative overflow-hidden shadow-2xl shadow-black/50">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 opacity-[0.03] pointer-events-none">
                        <User className="w-64 h-64 sm:w-96 sm:h-96" />
                    </div>
                    <div className="absolute top-1/2 left-0 w-32 h-32 bg-sky-500/10 blur-[100px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-400/20 text-sky-300 text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-4">
                            User Dashboard
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400 mb-2 leading-tight tracking-tight">
                            {profile?.user?.Name || 'N/A'}
                        </h1>
                        <p className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 mb-6 font-medium">
                            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-500" />
                            {userEmail || 'Email not available'}
                        </p>

                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            <Badge icon={User} label="Role" value={titleCase(profile?.user?.role)} classes="bg-sky-500/5 text-sky-200 border-sky-500/10" />
                            <Badge icon={Target} label="Status" value={titleCase(profile?.user?.status)} classes="bg-emerald-500/5 text-emerald-200 border-emerald-500/10" />
                            <Badge icon={Building2} label="Church" value={profile?.user?.ChurchName || 'N/A'} classes="bg-indigo-500/5 text-indigo-200 border-indigo-500/10" />
                            <Badge
                                icon={TrendingUp}
                                label="Training"
                                value={profile?.user?.isInTraining ? 'Active' : 'Inactive'}
                                classes={profile?.user?.isInTraining ? 'border-emerald-500/20 text-emerald-300 bg-emerald-500/10' : 'border-slate-500/20 text-slate-400 bg-slate-500/10'}
                            />
                        </div>
                    </div>
                </div>

                {/* --- SMART TABS NAVIGATION & FILTER --- */}
                <div className="sticky top-4 z-40 mb-6 sm:mb-8 flex flex-col lg:flex-row gap-3 items-center justify-between">
                    <div className="flex gap-1.5 p-1.5 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-x-auto shadow-2xl shadow-black/50 custom-scrollbar-hide w-full lg:w-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap min-w-[110px] ${activeTab === tab.id
                                        ? 'bg-white/10 text-white shadow-lg shadow-black/20 border border-white/5 ring-1 ring-white/10'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                                    }`}
                            >
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-sky-400' : 'opacity-60'}`} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="w-full lg:w-auto flex items-center bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 p-1 shadow-2xl shadow-black/50 overflow-hidden relative group">
                        <select
                            value={selectedEventKey}
                            onChange={(e) => setSelectedEventKey(e.target.value)}
                            className="bg-transparent text-slate-200 text-xs sm:text-sm font-bold appearance-none outline-none py-2.5 pl-4 pr-10 w-full lg:w-56 cursor-pointer hover:bg-white/5 transition-colors z-10 rounded-xl"
                        >
                            <option value="all" className="bg-slate-900 text-white font-bold">All Events</option>
                            {allEventOptions.map(opt => (
                                <option key={opt.key} value={opt.key} className="bg-slate-900 text-white font-medium">
                                    {opt.name.length > 25 ? opt.name.substring(0, 25) + '...' : opt.name}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-white transition-colors z-0">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>
                </div>

                {/* --- TAB CONTENT AREAS --- */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <SummaryCard
                                icon={Activity}
                                title="Events"
                                primaryLabel="Training"
                                primaryValue={displayProfile?.currentTrainingEvents.length || 0}
                                secondaryLabel="all events"
                                secondaryValue={displayProfile?.churchEventsCount || 0}
                                accentClass="text-sky-400"
                                bgClass="bg-gradient-to-br from-`sky-500/10 to-transparent border-sky-400/20"
                            />
                            <SummaryCard
                                icon={ListMusic}
                                title="Hymns"
                                primaryLabel="Current"
                                primaryValue={displayProfile?.currentHymns.length || 0}
                                secondaryLabel="History"
                                secondaryValue={displayProfile?.hymnHistory.length || 0}
                                accentClass="text-indigo-400"
                                bgClass="bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-400/20"
                            />
                            <SummaryCard
                                icon={CalendarCheck}
                                title="Attendance"
                                primaryLabel="Current"
                                primaryValue={displayProfile?.currentAttendance.length || 0}
                                secondaryLabel="History"
                                secondaryValue={displayProfile?.attendanceHistory.length || 0}
                                accentClass="text-emerald-400"
                                bgClass="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-400/20"
                            />
                            <SummaryCard
                                icon={FileText}
                                title="Reports"
                                primaryLabel="Current"
                                primaryValue={displayProfile?.currentReports.length || 0}
                                secondaryLabel="History"
                                secondaryValue={displayProfile?.reportHistory.length || 0}
                                accentClass="text-amber-400"
                                bgClass="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-400/20"
                            />
                            <SummaryCard
                                icon={Book}
                                title="Bible"
                                primaryLabel="Notes"
                                primaryValue={displayProfile?.bibleNotes?.length || 0}
                                secondaryLabel="Total Verses"
                                secondaryValue={displayProfile?.bibleNotes?.length || 0}
                                accentClass="text-blue-400"
                                bgClass="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-400/20"
                            />
                        </div>
                    )}

                    {/* BIBLE TAB */}
                    {activeTab === 'bible' && (
                        <div className="grid gap-5 sm:gap-6">
                            <ListPanel
                                title="My Bible Notes"
                                icon={Book}
                                accentClass="text-blue-400"
                                iconBgClass="bg-blue-500/10 text-blue-400 border-blue-500/20"
                                items={displayProfile?.bibleNotes || []}
                                emptyText="No bible notes saved yet"
                                renderItem={(note) => (
                                    <div key={note._id || note.verseId} className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-5 hover:bg-white/5 transition-all duration-300">
                                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    <h4 className="text-base font-bold text-white tracking-tight">{note.bookName}</h4>
                                                    <span className="bg-blue-500/20 text-blue-300 text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-500/20">
                                                        {note.chapter}:{note.verseNumber}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-bold ml-auto sm:ml-0">
                                                        {formatDate(note.date)}
                                                    </span>
                                                </div>
                                                <p className="text-xs sm:text-sm text-slate-400 italic leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5 mb-3" dir="rtl">
                                                    "{note.text}"
                                                </p>
                                                <div className="flex flex-col gap-1.5">
                                                    <p className="text-[9px] uppercase tracking-widest text-blue-400/60 font-black">My Personal Note</p>
                                                    <p className="text-sm text-slate-200 font-medium leading-relaxed">
                                                        {note.note}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex sm:flex-col gap-2 shrink-0">
                                                <button 
                                                    onClick={() => handleEditBibleNote(note)}
                                                    className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all border border-white/5"
                                                    title="Edit Note"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteBibleNote(note._id)}
                                                    className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5"
                                                    title="Delete Note"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                    )}

                    {/* CURRENT CYCLE TAB */}
                    {activeTab === 'current' && (
                        <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
                            <ListPanel
                                title="Training Events"
                                icon={Activity}
                                accentClass="text-sky-400"
                                iconBgClass="bg-sky-500/10 text-sky-400 border-sky-500/20"
                                items={displayProfile?.currentTrainingEvents || []}
                                emptyText="No current training events active"
                                renderItem={(event) => (
                                    <div key={event.id} className="rounded-xl border border-white/5 bg-black/20 p-3.5 hover:bg-white/5 transition-colors">
                                        <h4 className="text-sm font-bold text-white mb-1.5">{event.name}</h4>
                                        <p className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-slate-500 bg-white/5 px-2 py-1 rounded">
                                            <CalendarCheck className="w-3 h-3" />
                                            {formatDate(event.createdAt, 'No date')}
                                        </p>
                                    </div>
                                )}
                            />

                            <ListPanel
                                title="Current Hymns"
                                icon={ListMusic}
                                accentClass="text-indigo-400"
                                iconBgClass="bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                items={displayProfile?.currentHymns || []}
                                emptyText="No current hymns assigned"
                                renderItem={(hymn) => (
                                    <div key={hymn.id} className="rounded-xl border border-white/5 bg-black/20 p-3.5 hover:bg-white/5 transition-colors">
                                        <h4 className="text-sm font-bold text-white mb-2">{hymn.title}</h4>
                                        <div className="flex flex-wrap gap-1.5">
                                            <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">{hymn.eventName}</span>
                                            <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{hymn.scale}</span>
                                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{hymn.BPM} BPM</span>
                                        </div>
                                    </div>
                                )}
                            />

                            <ListPanel
                                title="Current Attendance"
                                icon={CalendarCheck}
                                accentClass="text-emerald-400"
                                iconBgClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                items={displayProfile?.currentAttendance || []}
                                emptyText="No current attendance recorded"
                                renderItem={(entry) => (
                                    <div key={entry.id} className="rounded-xl border border-white/5 bg-black/20 p-3.5 hover:bg-white/5 transition-colors flex justify-between items-center">
                                        <h4 className="text-sm font-bold text-white max-w-[60%] truncate">{entry.eventName}</h4>
                                        <p className="text-[10px] sm:text-xs font-semibold text-emerald-400/80 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/10 whitespace-nowrap">
                                            {formatDate(entry.date, 'N/A')}
                                        </p>
                                    </div>
                                )}
                            />

                            <ListPanel
                                title="Current Reports"
                                icon={FileText}
                                accentClass="text-amber-400"
                                iconBgClass="bg-amber-500/10 text-amber-400 border-amber-500/20"
                                items={displayProfile?.currentReports || []}
                                emptyText="No current reports found"
                                renderItem={(report) => (
                                    <div key={report.id} className="rounded-xl border border-white/5 bg-black/20 p-4 hover:bg-white/5 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-[11px] font-black uppercase tracking-wider text-amber-400/80">{report.eventName}</h4>
                                            <span className="text-[9px] font-bold text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">{formatDate(report.date, 'N/A')}</span>
                                        </div>
                                        <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed bg-black/30 p-2.5 rounded-lg border border-white/5">
                                            "{previewText(report.text)}"
                                        </p>
                                    </div>
                                )}
                            />
                        </div>
                    )}

                    {/* HISTORY TAB */}
                    {activeTab === 'history' && (
                        <div className="grid gap-5 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
                            <ListPanel
                                title="Hymn History"
                                icon={ListMusic}
                                accentClass="text-fuchsia-400"
                                iconBgClass="bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20"
                                items={displayProfile?.hymnHistory || []}
                                emptyText="No archived hymns"
                                renderItem={(hymn) => (
                                    <div key={hymn.id} className="rounded-xl border border-white/5 bg-black/20 p-3.5">
                                        <h4 className="text-sm font-bold text-white mb-2">{hymn.title}</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <p className="text-[8px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Event</p>
                                                <p className="text-[10px] text-slate-300 font-semibold truncate">{hymn.eventName}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Scale</p>
                                                <p className="text-[10px] text-fuchsia-300 font-bold">{hymn.scale}</p>
                                            </div>
                                            <div className="col-span-2 pt-1.5 mt-1 border-t border-white/5">
                                                <p className="text-[8px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Archived</p>
                                                <p className="text-[10px] text-slate-400 font-semibold">{formatDate(hymn.savedAt, 'N/A')}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            />

                            <ListPanel
                                title="Attendance History"
                                icon={CalendarCheck}
                                accentClass="text-orange-400"
                                iconBgClass="bg-orange-500/10 text-orange-400 border-orange-500/20"
                                items={displayProfile?.attendanceHistory || []}
                                emptyText="No archived attendance"
                                renderItem={(entry) => (
                                    <div key={entry.id} className="rounded-xl border border-white/5 bg-black/20 p-3.5">
                                        <h4 className="text-[11px] font-black uppercase tracking-wider text-orange-400/80 mb-2 truncate">{entry.eventName}</h4>
                                        <div className="flex gap-2">
                                            <div className="flex-1 bg-white/5 rounded-lg p-2 border border-white/5">
                                                <p className="text-[8px] sm:text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Date</p>
                                                <p className="text-[10px] text-white font-bold">{formatDate(entry.date, 'N/A')}</p>
                                            </div>
                                            <div className="flex-1 bg-white/5 rounded-lg p-2 border border-white/5">
                                                <p className="text-[8px] sm:text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Archived</p>
                                                <p className="text-[10px] text-slate-400 font-semibold">{formatDate(entry.savedAt, 'N/A')}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            />

                            <ListPanel
                                title="Report History"
                                icon={FileText}
                                accentClass="text-rose-400"
                                iconBgClass="bg-rose-500/10 text-rose-400 border-rose-500/20"
                                items={displayProfile?.reportHistory || []}
                                emptyText="No archived reports"
                                renderItem={(report) => (
                                    <div key={report.id} className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <p className="text-[11px] sm:text-xs text-slate-300 font-medium leading-relaxed mb-3 italic bg-black/30 p-2.5 rounded-lg border border-white/5">
                                            "{previewText(report.text, 60)}"
                                        </p>
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-[8px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">Report Date</p>
                                                <p className="text-[9px] text-slate-300 font-bold">{formatDate(report.date, 'N/A')}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[8px] uppercase tracking-widest text-rose-500/50 font-bold mb-0.5">Archived</p>
                                                <p className="text-[9px] text-rose-400/80 font-bold">{formatDate(report.savedAt, 'N/A')}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                    )}

                    {/* COMPARE TAB */}
                    {activeTab === 'compare' && (
                        <div className="space-y-6 sm:space-y-8">

                            {generateAttendanceStatusBlock()}

                            {/* LEADERBOARD LIST */}
                            <div className="rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-xl overflow-hidden shadow-2xl">
                                <div className="border-b border-white/5 p-4 sm:p-5 bg-black/40 flex items-center justify-between">
                                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 tracking-wide">
                                        <Users className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                                        Church Leaderboard
                                    </h3>
                                    <span className="text-[10px] sm:text-xs font-bold text-slate-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                                        Sorted by All-Time Score
                                    </span>
                                </div>

                                {/* MOBILE LEADERBOARD (CARDS) */}
                                <div className="p-4 sm:p-5 space-y-3 lg:hidden max-h-[60vh] overflow-y-auto custom-scrollbar">
                                    {comparisonRows.map((member) => (
                                        <PeerComparisonCard
                                            key={member.memberId || member.name}
                                            member={member}
                                            isCurrentUser={member.memberId === user_id}
                                        />
                                    ))}
                                    {comparisonRows.length === 0 && (
                                        <div className="text-center p-8 text-slate-500 text-sm font-semibold">No peers found.</div>
                                    )}
                                </div>

                                {/* DESKTOP LEADERBOARD (TABLE) */}
                                <div className="hidden lg:block">
                                    <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-[10px] uppercase text-slate-400 font-bold bg-black/20 sticky top-0 z-10 backdrop-blur-md">
                                                <tr>
                                                    <th className="px-6 py-4 tracking-wider">Member</th>
                                                    <th className="px-6 py-4 tracking-wider text-center border-l border-white/5">Global Current</th>
                                                    <th className="px-6 py-4 tracking-wider text-center">Global History</th>
                                                    <th className="px-6 py-4 tracking-wider text-center text-sky-400 font-black">Global Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {comparisonRows.map((member, index) => {
                                                    const isCurrentUser = member.memberId === user_id;
                                                    return (
                                                        <tr
                                                            key={member.memberId || member.name}
                                                            className={`transition-colors hover:bg-white/5 ${isCurrentUser ? 'bg-sky-500/10' : ''
                                                                }`}
                                                        >
                                                            <td className="px-6 py-4 font-semibold text-white">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isCurrentUser ? 'bg-sky-500 text-white' : 'bg-white/10 text-slate-300'}`}>
                                                                        {member.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <span className="truncate max-w-[150px]">{member.name}</span>
                                                                    {isCurrentUser && (
                                                                        <span className="bg-sky-500 text-white text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(56,189,248,0.5)]">You</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-center font-bold text-emerald-400 border-l border-white/5">{member.currentCount}</td>
                                                            <td className="px-6 py-4 text-center font-bold text-amber-400">{member.historyCount}</td>
                                                            <td className="px-6 py-4 text-center text-lg font-black text-sky-400">{member.allCount}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {comparisonRows.length === 0 && (
                                                    <tr>
                                                        <td colSpan="4" className="px-6 py-12 text-center text-slate-500 text-sm font-semibold">No peers found.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                </div>
            </div>

            {/* Injected CSS for custom scrollbar hidden utilities used locally */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .custom-scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}} />
        </main>
    );
}
