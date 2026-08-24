'use client';
import React, { useState, useEffect } from 'react';
import { BarChart2, CheckCircle2, Circle } from 'lucide-react';

export default function PollMessage({ poll: initialPoll, messageId, currentUserId, onVote, isMe }) {
    const [poll, setPoll] = useState(initialPoll);

    // Sync when server broadcasts updated poll votes
    useEffect(() => { setPoll(initialPoll); }, [initialPoll]);

    const userVotes  = poll.options.filter(o => (o.votes || []).includes(currentUserId)).map(o => o.id);
    const hasVoted   = userVotes.length > 0;
    const totalVotes = poll.options.reduce((acc, o) => acc + (o.votes?.length || 0), 0);
    const maxCount   = Math.max(...poll.options.map(o => o.votes?.length || 0), 0);

    const getPercent = (option) =>
        totalVotes === 0 ? 0 : Math.round(((option.votes?.length || 0) / totalVotes) * 100);

    const handleVote = (optionId) => {
        const alreadyOnThis = userVotes.includes(optionId);
        let newOptions;

        if (poll.allowMultiple) {
            newOptions = poll.options.map(opt => ({
                ...opt,
                votes: opt.id === optionId
                    ? alreadyOnThis
                        ? (opt.votes || []).filter(v => v !== currentUserId)
                        : [...(opt.votes || []), currentUserId]
                    : opt.votes || []
            }));
        } else {
            if (alreadyOnThis) return; // same choice, no-op
            newOptions = poll.options.map(opt => ({
                ...opt,
                votes: opt.id === optionId
                    ? [...(opt.votes || []).filter(v => v !== currentUserId), currentUserId]
                    : (opt.votes || []).filter(v => v !== currentUserId)
            }));
        }

        setPoll(prev => ({ ...prev, options: newOptions })); // optimistic
        if (onVote) onVote(messageId, optionId, currentUserId);
    };

    return (
        <div className="min-w-[200px] max-w-[255px] w-full">

            {/* ── Header ── */}
            <div className="flex items-start gap-2 mb-2.5">
                <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isMe ? 'bg-white/20' : 'bg-violet-500/20'}`}>
                    <BarChart2 size={13} className={isMe ? 'text-white' : 'text-violet-400'} />
                </div>
                <p className={`text-[13px] font-semibold leading-snug ${isMe ? 'text-white' : 'text-gray-100'}`}>
                    {poll.question}
                </p>
            </div>

            <div className={`h-px mb-2.5 ${isMe ? 'bg-white/20' : 'bg-white/10'}`} />

            {/* ── Options ── */}
            <div className="flex flex-col gap-1.5">
                {poll.options.map((option) => {
                    const percent     = getPercent(option);
                    const isVotedByMe = userVotes.includes(option.id);
                    const isLeading   = hasVoted && (option.votes?.length || 0) === maxCount && maxCount > 0;

                    return (
                        <button
                            key={option.id}
                            onClick={() => handleVote(option.id)}
                            disabled={hasVoted && !poll.allowMultiple && isVotedByMe}
                            className="relative w-full rounded-xl overflow-hidden text-left transition-transform duration-100 active:scale-[0.97] focus:outline-none"
                        >
                            {/* Base background */}
                            <div className={`absolute inset-0 rounded-xl ${
                                isVotedByMe
                                    ? (isMe ? 'bg-white/25' : 'bg-violet-500/25')
                                    : (isMe ? 'bg-white/10' : 'bg-white/5')
                            }`} />

                            {/* Animated fill bar - only visible after voting */}
                            {hasVoted && (
                                <div
                                    className={`absolute inset-y-0 left-0 rounded-xl transition-all duration-700 ease-out ${
                                        isVotedByMe
                                            ? (isMe ? 'bg-white/30' : 'bg-violet-500/35')
                                            : (isMe ? 'bg-white/10' : 'bg-white/5')
                                    }`}
                                    style={{ width: `${percent}%` }}
                                />
                            )}

                            {/* Row content */}
                            <div className="relative z-10 flex items-center justify-between px-3 py-[9px] gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {isVotedByMe
                                        ? <CheckCircle2 size={13} className={`shrink-0 ${isMe ? 'text-white' : 'text-violet-400'}`} />
                                        : <Circle       size={13} className={`shrink-0 ${isMe ? 'text-white/50' : 'text-gray-500'}`} />
                                    }
                                    <span className={`text-xs font-medium truncate leading-tight ${
                                        isVotedByMe
                                            ? (isMe ? 'text-white' : 'text-violet-200')
                                            : (isMe ? 'text-white/75' : 'text-gray-300')
                                    }`}>
                                        {option.text}
                                    </span>
                                    {isLeading && hasVoted && (
                                        <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-violet-500/30 text-violet-300 font-bold uppercase tracking-wide">
                                            top
                                        </span>
                                    )}
                                </div>

                                {hasVoted && (
                                    <span className={`text-[11px] font-bold shrink-0 tabular-nums ${
                                        isVotedByMe
                                            ? (isMe ? 'text-white' : 'text-violet-300')
                                            : (isMe ? 'text-white/40' : 'text-gray-500')
                                    }`}>
                                        {percent}%
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── Footer ── */}
            <div className={`mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] ${isMe ? 'text-white/40' : 'text-gray-500'}`}>
                <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
                {poll.allowMultiple && <><span>·</span><span>Multiple choice</span></>}
                {!hasVoted && <><span>·</span><span>Tap to vote</span></>}
                {hasVoted && !poll.allowMultiple && <><span>·</span><span>Tap to change</span></>}
            </div>
        </div>
    );
}