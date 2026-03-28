'use client';

import React, { useContext, useEffect, useState } from 'react';
import {
    BarChart3,
    CalendarCheck,
    ListMusic,
    Mail,
    Target,
    TrendingUp,
    User,
    Users
} from 'lucide-react';
import { UserContext } from '../context/User_Context';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://worship-team-api.onrender.com/api').replace(/\/$/, '');

export default function UserProfile() {
    const { user_id, churchId, isLogin } = useContext(UserContext);
    const [userData, setUserData] = useState(null);
    const [userEmail, setUserEmail] = useState(null);
    const [currentHymns, setCurrentHymns] = useState([]);
    const [lastHymns, setLastHymns] = useState([]);
    const [currentAttends, setCurrentAttends] = useState([]);
    const [lastAttends, setLastAttends] = useState([]);
    const [eventsCount, setEventsCount] = useState(0);
    const [attendanceStats, setAttendanceStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isLogin || !user_id || !churchId) {
            setError('Please log in first');
            setLoading(false);
            return;
        }

        const storedEmail = localStorage.getItem('user_Taspe7_Email');
        if (storedEmail) {
            setUserEmail(storedEmail);
        }

        const fetchUserData = async () => {
            try {
                setLoading(true);

                const churchRes = await fetch(`${API_URL}/users/my-church`, {
                    headers: {
                        Authorization: `Bearer ${isLogin}`,
                    },
                });
                const eventsRes = await fetch(`${API_URL}/events`, {
                    headers: {
                        Authorization: `Bearer ${isLogin}`,
                    },
                }).catch(() => null);

                if (!churchRes.ok) throw new Error('Failed to fetch church members');
                const members = await churchRes.json();
                let churchEvents = [];
                if (eventsRes?.ok) {
                    const events = await eventsRes.json();
                    churchEvents = Array.isArray(events) ? events : [];
                }
                setEventsCount(churchEvents.length);

                const eventsMap = new Map(
                    churchEvents.map((event) => [
                        event._id?.toString(),
                        {
                            name: event.eventName || event.name || 'Unnamed Event',
                            date: event.date || event.createdAt || null,
                        },
                    ])
                );

                const currentUser = members.find((member) => member._id === user_id);
                if (currentUser) {
                    setUserData(currentUser);
                    processUserData(currentUser, eventsMap);
                    calculateStatistics(members, currentUser, churchEvents.length);
                } else {
                    setError('Current user not found in church members');
                }
            } catch (err) {
                console.error('Error fetching data:', err);
                setError(err.message || 'Failed to load profile data');
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [isLogin, user_id, churchId]);

    const getEventId = (entry) => {
        if (!entry?.eventId) return null;
        if (typeof entry.eventId === 'string') return entry.eventId;
        return entry.eventId._id || entry.eventId.id || null;
    };

    const resolveEventName = (entry, eventsMap) => {
        const eventId = getEventId(entry);
        const fromEntryObject = entry?.eventId?.eventName || entry?.eventId?.name;
        const fromEntryFlat = entry?.eventName;
        const fromEventsMap = eventId ? eventsMap.get(eventId.toString())?.name : null;
        return fromEntryObject || fromEntryFlat || fromEventsMap || 'Unknown Event';
    };

    const resolveEventDate = (entry, eventsMap) => {
        const eventId = getEventId(entry);
        const fromEntry = entry?.date || entry?.eventId?.date;
        const fromEventsMap = eventId ? eventsMap.get(eventId.toString())?.date : null;
        return fromEntry || fromEventsMap || null;
    };

    const processUserData = (data, eventsMap) => {
        if (data.songs_Array) {
            const sortedSongs = [...(data.songs_Array || [])].sort(
                (a, b) => new Date(b.eventId?.date || 0) - new Date(a.eventId?.date || 0)
            );

            setCurrentHymns(sortedSongs.slice(0, 5));
            setLastHymns(sortedSongs.slice(5, 10));
        }

        if (data.attends) {
            const now = new Date();
            const normalizedAttends = (data.attends || []).map((entry) => ({
                ...entry,
                eventId: getEventId(entry),
                resolvedEventName: resolveEventName(entry, eventsMap),
                resolvedDate: resolveEventDate(entry, eventsMap),
            }));

            const upcoming = normalizedAttends
                .filter((entry) => {
                    const compareDate = new Date(entry.resolvedDate || 0);
                    return compareDate > now;
                })
                .sort((a, b) => new Date(a.resolvedDate || 0) - new Date(b.resolvedDate || 0))
                .slice(0, 5);
            const past = normalizedAttends
                .filter((entry) => {
                    const compareDate = new Date(entry.resolvedDate || 0);
                    return compareDate <= now;
                })
                .sort((a, b) => new Date(b.resolvedDate || 0) - new Date(a.resolvedDate || 0))
                .slice(0, 5);

            setCurrentAttends(upcoming);
            setLastAttends(past);
        }
    };

    const calculateStatistics = (members, currentUser, totalEvents) => {
        if (!currentUser) return;

        const currentUserAttendCount = currentUser.attends?.length || 0;
        const now = new Date();
        const normalizedAttends = (currentUser.attends || []).map((entry) => {
            const compareDate = new Date(entry?.date || entry?.eventId?.date || 0);
            return {
                ...entry,
                compareDate,
            };
        });
        const currentUpcomingCount = normalizedAttends.filter((entry) => entry.compareDate > now).length;
        const historyCount = normalizedAttends.filter((entry) => entry.compareDate <= now).length;

        const memberStats = members.map((member) => ({
            attendCount: member.attends?.length || 0,
        }));

        const totalAttendance = memberStats.reduce((sum, member) => sum + member.attendCount, 0);
        const avgAttendance =
            memberStats.length > 0 ? (totalAttendance / memberStats.length).toFixed(1) : 0;

        const membersWithLessOrEqualAttendance = members.filter(
            (member) => (member.attends?.length || 0) <= currentUserAttendCount
        ).length;

        const commitmentPercentage =
            members.length > 1
                ? (((membersWithLessOrEqualAttendance - 1) / (members.length - 1)) * 100).toFixed(1)
                : 0;

        const moreCommittedUsers = members.filter(
            (member) => (member.attends?.length || 0) > currentUserAttendCount
        ).length;
        const attendedEventIds = new Set(
            (currentUser.attends || [])
                .map((entry) => getEventId(entry))
                .filter(Boolean)
                .map((id) => id.toString())
        );
        const attendedEventsCount = attendedEventIds.size;
        const totalChurchEvents = totalEvents || 0;
        const eventsCoveragePercentage =
            totalChurchEvents > 0 ? ((attendedEventsCount / totalChurchEvents) * 100).toFixed(1) : '0.0';

        setAttendanceStats({
            userAttends: currentUserAttendCount,
            avgAttendance,
            commitmentPercentage,
            totalMembers: members.length,
            moreCommittedUsers,
            currentUpcomingCount,
            historyCount,
            attendedEventsCount,
            totalChurchEvents,
            eventsCoveragePercentage,
        });
    };

    const formatDate = (date) =>
        date
            ? new Date(date).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            })
            : 'N/A';

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
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="mb-2 inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-200">
                                User Profile
                            </p>
                            <h1 className="text-2xl font-bold text-white sm:text-4xl">{userData?.Name || 'N/A'}</h1>
                            <p className="mt-2 text-sm text-slate-300">{userEmail || 'Email not available'}</p>
                        </div>

                        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <User className="h-4 w-4 text-sky-300" /> Name
                                </p>
                                <p className="truncate text-sm font-semibold text-white">{userData?.Name || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                                    <Mail className="h-4 w-4 text-sky-300" /> Email
                                </p>
                                <p className="truncate text-sm font-semibold text-white">{userEmail || 'Not available'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="mb-1 text-xs uppercase tracking-wider text-slate-300">Current Hymns</p>
                            <p className="text-2xl font-bold text-sky-300">{currentHymns.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="mb-1 text-xs uppercase tracking-wider text-slate-300">Last Hymns</p>
                            <p className="text-2xl font-bold text-indigo-300">{lastHymns.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="mb-1 text-xs uppercase tracking-wider text-slate-300">Upcoming Events</p>
                            <p className="text-2xl font-bold text-emerald-300">{currentAttends.length}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="mb-1 text-xs uppercase tracking-wider text-slate-300">Attendance History</p>
                            <p className="text-2xl font-bold text-amber-300">{lastAttends.length}</p>
                        </div>
                    </div>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                        <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-bold text-white">
                            <ListMusic className="h-5 w-5 text-sky-300" />
                            Current Hymns
                        </h2>
                        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                            {currentHymns.length > 0 ? (
                                currentHymns.map((hymn, idx) => (
                                    <div key={idx} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <h4 className="mb-1 text-base font-semibold text-white">{hymn.title}</h4>
                                        <p className="text-xs text-slate-300">Scale: {hymn.scale || 'N/A'}</p>
                                        <p className="text-xs text-slate-300">Event: {hymn.eventId?.eventName || hymn.eventId?.name || 'Unknown Event'}</p>
                                        <p className="text-xs text-slate-300">BPM: {hymn.BPM || 'N/A'}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-5 text-center text-sm text-slate-400">
                                    No current hymns
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                        <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-bold text-white">
                            <ListMusic className="h-5 w-5 text-indigo-300" />
                            Last Hymns
                        </h2>
                        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                            {lastHymns.length > 0 ? (
                                lastHymns.map((hymn, idx) => (
                                    <div key={idx} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <h4 className="mb-1 text-base font-semibold text-white">{hymn.title}</h4>
                                        <p className="text-xs text-slate-300">Scale: {hymn.scale || 'N/A'}</p>
                                        <p className="text-xs text-slate-300">Event: {hymn.eventId?.eventName || hymn.eventId?.name || 'Unknown Event'}</p>
                                        <p className="text-xs text-slate-300">Date: {formatDate(hymn.eventId?.date)}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-5 text-center text-sm text-slate-400">
                                    No last hymns
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                        <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-bold text-white">
                            <CalendarCheck className="h-5 w-5 text-emerald-300" />
                            Recent Attendance
                        </h2>
                        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                            {currentAttends.length > 0 ? (
                                currentAttends.map((attend, idx) => (
                                    <div key={idx} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <h4 className="mb-1 text-base font-semibold text-white">
                                            {attend.resolvedEventName}
                                        </h4>
                                        <p className="text-xs text-slate-300">{formatDate(attend.resolvedDate)}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-5 text-center text-sm text-slate-400">
                                    No recent attendance
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                        <h2 className="mb-4 inline-flex items-center gap-2 text-lg font-bold text-white">
                            <CalendarCheck className="h-5 w-5 text-amber-300" />
                            Attendance History
                        </h2>
                        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                            {lastAttends.length > 0 ? (
                                lastAttends.map((attend, idx) => (
                                    <div key={idx} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                        <h4 className="mb-1 text-base font-semibold text-white">
                                            {attend.resolvedEventName}
                                        </h4>
                                        <p className="text-xs text-slate-300">{formatDate(attend.resolvedDate)}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="rounded-2xl border border-dashed border-white/15 bg-black/10 p-5 text-center text-sm text-slate-400">
                                    No attendance history
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {attendanceStats && (
                    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
                        <h2 className="mb-6 inline-flex items-center gap-2 text-xl font-bold text-white">
                            <TrendingUp className="h-5 w-5 text-sky-300" />
                            Your Commitment Stats
                        </h2>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-1 text-xs uppercase tracking-wide text-slate-300">Your Attendance</p>
                                <p className="text-3xl font-bold text-sky-300">{attendanceStats.userAttends}</p>
                                <p className="mt-1 text-xs text-slate-400">Total Events</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-1 text-xs uppercase tracking-wide text-slate-300">Church Average</p>
                                <p className="text-3xl font-bold text-indigo-300">{attendanceStats.avgAttendance}</p>
                                <p className="mt-1 text-xs text-slate-400">Avg Events / Member</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-1 text-xs uppercase tracking-wide text-slate-300">Your Position</p>
                                <p className="text-3xl font-bold text-emerald-300">{attendanceStats.commitmentPercentage}%</p>
                                <p className="mt-1 text-xs text-slate-400">More Committed Than</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="mb-1 text-xs uppercase tracking-wide text-slate-300">More Committed Users</p>
                                <p className="text-3xl font-bold text-amber-300">{attendanceStats.moreCommittedUsers}</p>
                                <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400">
                                    <Users className="h-3.5 w-3.5" />
                                    Total Members: {attendanceStats.totalMembers}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-200">Commitment Level</h3>
                                <span className="text-sm font-bold text-sky-300">{attendanceStats.commitmentPercentage}%</span>
                            </div>
                            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-full rounded-full bg-linear-to-r from-sky-400 to-blue-500 transition-all duration-700"
                                    style={{
                                        width: `${attendanceStats.commitmentPercentage}%`,
                                    }}
                                />
                            </div>
                            <p className="mt-3 text-sm text-slate-300">
                                You are more committed than {attendanceStats.commitmentPercentage}% of your church members.
                            </p>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                                <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                                    <BarChart3 className="h-4 w-4 text-emerald-300" />
                                    Current vs History Attendance
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-xs text-slate-400">Current (Upcoming)</p>
                                        <p className="mt-1 text-2xl font-bold text-emerald-300">{attendanceStats.currentUpcomingCount}</p>
                                    </div>
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <p className="text-xs text-slate-400">History</p>
                                        <p className="mt-1 text-2xl font-bold text-amber-300">{attendanceStats.historyCount}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                                <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                                    <Target className="h-4 w-4 text-sky-300" />
                                    Events Coverage
                                </h3>
                                <div className="mb-3 flex items-center justify-between text-sm">
                                    <span className="text-slate-300">Attended / Total Events</span>
                                    <span className="font-bold text-sky-300">
                                        {attendanceStats.attendedEventsCount} / {attendanceStats.totalChurchEvents || eventsCount}
                                    </span>
                                </div>
                                <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                                    <div
                                        className="h-full rounded-full bg-linear-to-r from-emerald-400 to-sky-500 transition-all duration-700"
                                        style={{ width: `${attendanceStats.eventsCoveragePercentage}%` }}
                                    />
                                </div>
                                <p className="mt-3 text-sm text-slate-300">
                                    You covered {attendanceStats.eventsCoveragePercentage}% of your church total events.
                                </p>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </section>
    );
}
