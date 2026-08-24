'use client';
import React, { useEffect, useRef, useState } from 'react';
import AudioMessage from './AudioMessage';
import { BarChart2, CheckCircle2 } from 'lucide-react';

export default function ChatArea({ messages, currentUserId, loading }) {
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

    // هذا الـ Component الداخلي لتشغيل شكل الـ Poll وعرض الديف الأفقي
    const PollMessageBubble = ({ msg, isMe }) => {
        // فك تشفير البيانات التي أرسلناها كـ JSON string
        let pollData = null;
        try {
            pollData = typeof msg.text === 'string' ? JSON.parse(msg.text) : msg.text;
        } catch (e) {
            return <p className="text-sm">Invalid Poll Data</p>;
        }

        if (!pollData || !pollData.options) return null;

        const totalVotes = pollData.options.reduce((acc, opt) => acc + (opt.votes?.length || 0), 0);
        
        // استخراج أعلى خيارين بناءً على عدد المصوتين (لعمل الـ Div الأفقي)
        const topOptions = [...pollData.options]
            .filter(opt => opt.votes?.length > 0)
            .sort((a, b) => b.votes?.length - a.votes?.length)
            .slice(0, 2); // يمكنك تغيير الرقم 2 لعرض أكثر إن أردت

        const handleVote = (optionId) => {
            // هنا سيتم استدعاء السوكيت الخاص بك لإرسال التصويت
            // مثال: socket.emit('vote_poll', { messageId: msg._id, optionId, userId: currentUserId });
            console.log("Voted for option:", optionId);
        };

        return (
            <div className="flex flex-col min-w-[240px]">
                {/* رأس الـ Poll */}
                <div className="flex items-start gap-2 mb-3">
                    <div className="mt-1 bg-white/10 p-1.5 rounded-full shrink-0">
                        <BarChart2 size={16} className={isMe ? "text-sky-200" : "text-sky-400"} />
                    </div>
                    <span className="font-semibold text-[15px]">{pollData.question}</span>
                </div>

                {/* خيارات التصويت */}
                <div className="space-y-1.5">
                    {pollData.options.map((option) => {
                        const votesCount = option.votes?.length || 0;
                        const percentage = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
                        const hasMyVote = option.votes?.includes(currentUserId);

                        return (
                            <button
                                key={option.id}
                                onClick={() => handleVote(option.id)}
                                className={`relative w-full text-left overflow-hidden rounded-lg p-2.5 text-sm transition-colors border ${
                                    hasMyVote 
                                        ? 'border-sky-400/50 bg-sky-500/10' 
                                        : 'border-white/5 bg-black/20 hover:bg-black/40'
                                }`}
                            >
                                {/* شريط التقدم الخلفي */}
                                {votesCount > 0 && (
                                    <div 
                                        className="absolute left-0 top-0 bottom-0 bg-sky-500/20 transition-all duration-500" 
                                        style={{ width: `${percentage}%` }}
                                    />
                                )}
                                
                                <div className="relative z-10 flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2">
                                        {hasMyVote && <CheckCircle2 size={14} className="text-sky-400 shrink-0" />}
                                        <span className="break-words">{option.text}</span>
                                    </span>
                                    {votesCount > 0 && (
                                        <span className="text-xs opacity-70 shrink-0">{votesCount}</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
                
                {/* الديف الصغير الذي طلبته (بالعرض للأعلى تقييماً) */}
                {topOptions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider shrink-0">Top Rated:</span>
                        <div className="flex gap-1.5">
                            {topOptions.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap">
                                    <span className="truncate max-w-[80px]" title={opt.text}>{opt.text}</span>
                                    <span className="font-bold">({opt.votes?.length})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0b0f19] custom-scrollbar flex flex-col gap-3">
            {loading && (
                <div className="flex justify-center my-4">
                    <span className="text-gray-500 text-sm">Loading messages...</span>
                </div>
            )}
            
            {messages.length === 0 && !loading && (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500 text-sm bg-white/5 px-4 py-2 rounded-full">
                        No messages yet. Say hi!
                    </p>
                </div>
            )}

            {messages.map((msg) => {
                const isMe = msg.senderId === currentUserId;
                return (
                    <div 
                        key={msg._id || msg.createdAt} 
                        className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? 'self-end' : 'self-start'}`}
                    >
                        {!isMe && (
                            <span className="text-xs text-sky-400 ml-1 mb-1 font-medium">
                                {msg.senderName}
                            </span>
                        )}
                        <div className={`relative px-4 py-2.5 rounded-2xl ${
                            isMe 
                                ? 'bg-sky-600 text-white rounded-tr-sm' 
                                : 'bg-[#1e293b] text-gray-200 rounded-tl-sm border border-white/5'
                        }`}>
                            {/* فلترة نوع الرسالة */}
                            {msg.type === 'poll' ? (
                                <PollMessageBubble msg={msg} isMe={isMe} />
                            ) : msg.type === 'audio' && msg.mediaUrl ? (
                                <AudioMessage mediaUrl={msg.mediaUrl} />
                            ) : (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                            )}

                            <div className={`text-[10px] mt-1.5 text-right ${isMe ? 'text-sky-200' : 'text-gray-500'}`}>
                                {formatTime(msg.createdAt)}
                            </div>
                        </div>
                    </div>
                );
            })}
            
            <div ref={messagesEndRef} />
        </div>
    );
}