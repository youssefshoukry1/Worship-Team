'use client';
import React, { useEffect, useRef } from 'react';
import AudioMessage from './AudioMessage';
import ImageMessage from './ImageMessage';
import { BarChart2 } from 'lucide-react';

export default function ChatArea({ messages, currentUserId, loading, socket, activeTeamId }) {
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const formatTime = (dateString) => {
        const d = new Date(dateString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const PollMessageBubble = ({ msg, isMe }) => {
        let pollData = msg.pollData || null;
        if (!pollData && msg.text) {
            try {
                pollData = typeof msg.text === 'string' ? JSON.parse(msg.text) : msg.text;
            } catch (e) {
                return <p className="text-[13px] text-red-400">Invalid Poll Data</p>;
            }
        }
        if (!pollData || !pollData.options) return null;

        const totalVotes = pollData.options.reduce((acc, opt) => acc + (opt.votes?.length || 0), 0);

        const topOptions = [...pollData.options]
            .filter(opt => opt.votes?.length > 0)
            .sort((a, b) => b.votes?.length - a.votes?.length)
            .slice(0, 2);

        const handleVote = (messageId, optionId) => {
            socket.current?.emit('vote-poll', {
                teamId: activeTeamId,
                messageId,
                optionId,
                userId: currentUserId
            });
        };

        return (
            // تم تصغير العرض ليكون ملموم أكثر
            <div className="flex flex-col min-w-[200px] sm:min-w-[240px]">
                {/* رأس الـ Poll */}
                <div className="flex items-start gap-2 mb-2.5">
                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isMe ? 'bg-indigo-500/20 text-indigo-100' : 'bg-slate-700/50 text-indigo-400'}`}>
                        {/* تصغير حجم الأيقونة */}
                        <BarChart2 size={16} />
                    </div>
                    {/* تصغير حجم الخط */}
                    <span className="font-semibold text-[14px] leading-snug">
                        {pollData.question}
                    </span>
                </div>

                {/* خيارات التصويت */}
                <div className="space-y-1.5">
                    {pollData.options.map((option) => {
                        const votesCount = option.votes?.length || 0;
                        const percentage = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
                        const hasMyVote = option.votes?.some(
                            (voteId) => String(voteId) === String(currentUserId)
                        );

                        return (
                            <button
                                key={option.id}
                                onClick={() => handleVote(msg._id, option.id)}
                                // تقليل الـ Padding الداخلي للخيارات (p-2 بدل p-3)
                                className={`group relative w-full text-left overflow-hidden rounded-xl px-2.5 py-1.5 text-[13px] transition-all duration-300 ease-out active:scale-[0.98] border ${
                                    hasMyVote
                                        ? 'border-indigo-500/40 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.05)]'
                                        : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-700/60 hover:border-slate-600'
                                }`}
                            >
                                {votesCount > 0 && (
                                    <div
                                        className={`absolute left-0 top-0 bottom-0 transition-all duration-700 ease-out ${
                                            hasMyVote ? 'bg-indigo-500/20' : 'bg-slate-600/20'
                                        }`}
                                        style={{ width: `${percentage}%` }}
                                    />
                                )}

                                <div className="relative z-10 flex justify-between items-center gap-2">
                                    <span className={`font-medium transition-colors duration-300 ${
                                        hasMyVote ? 'text-indigo-300' : 'text-slate-200 group-hover:text-white'
                                    }`}>
                                        {option.text}
                                    </span>
                                    {votesCount > 0 && (
                                        <span className={`text-[11px] font-medium ${
                                            hasMyVote ? 'text-indigo-300' : 'text-slate-400'
                                        }`}>
                                            {Math.round(percentage)}%
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* الديف الصغير */}
                {topOptions.length > 0 && (
                    // تقليل الـ Margin والـ Padding للـ Top Rated
                    <div className="mt-2.5 pt-2 border-t border-slate-700/50 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5">
                        <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider shrink-0">
                            Top
                        </span>
                        <div className="flex gap-1.5">
                            {topOptions.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-1 bg-slate-800/80 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap shadow-sm">
                                    <span className="truncate max-w-[80px]" title={opt.text}>{opt.text}</span>
                                    <span className="text-slate-500 font-medium">•</span>
                                    <span className="font-bold text-indigo-400">{opt.votes?.length}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        /* تقليل الـ padding العام والـ gap بين الرسايل */
        <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-950 custom-scrollbar flex flex-col gap-3">
            {loading && (
                <div className="flex justify-center my-2">
                    <div className="bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-800">
                        <span className="text-slate-400 text-xs animate-pulse">Loading messages...</span>
                    </div>
                </div>
            )}

            {messages.length === 0 && !loading && (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-slate-400 text-xs bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-full shadow-sm">
                        No messages yet. Say hi!
                    </p>
                </div>
            )}

            {messages.map((msg) => {
                const isMe = msg.senderId === currentUserId;
                return (
                    <div
                        key={msg._id || msg.createdAt}
                        // تقليل أقصى عرض للرسالة لـ 75% عالموبايل و 55% عالديسك توب
                        className={`flex flex-col max-w-[75%] md:max-w-[55%] ${isMe ? 'self-end' : 'self-start'}`}
                    >
                        {!isMe && (
                            <span className="text-[10px] text-slate-400 ml-1.5 mb-1 font-medium tracking-wide">
                                {msg.senderName}
                            </span>
                        )}
                        {/* تقليل الـ Padding الداخلي للرسالة نفسها */}
                        <div className={`relative px-3 py-2 shadow-sm ${
                            isMe
                                ? 'bg-indigo-600 text-indigo-50 rounded-2xl rounded-tr-sm'
                                : 'bg-slate-800/90 text-slate-200 rounded-2xl rounded-tl-sm border border-slate-700/50'
                        }`}>
                            
                            {msg.type === 'poll' ? (
                                <PollMessageBubble msg={msg} isMe={isMe} />
                            ) : msg.type === 'audio' && msg.mediaUrl ? (
                                <AudioMessage mediaUrl={msg.mediaUrl} messageId={msg._id || msg.createdAt} />
                            ) : msg.type === 'image' && msg.mediaUrl ? (
                                <ImageMessage msg={msg} />
                            ) : (
                                // تصغير حجم خط النص العادي ليكون متناسق ومريح
                                <p className="text-[14px] leading-snug whitespace-pre-wrap break-words">
                                    {msg.text}
                                </p>
                            )}

                            <div className={`text-[9px] mt-1 text-right font-medium ${
                                isMe ? 'text-indigo-200/70' : 'text-slate-500'
                            }`}>
                                {formatTime(msg.createdAt)}
                            </div>
                        </div>
                    </div>
                );
            })}

            <div ref={messagesEndRef} className="h-1" />
        </div>
    );
}