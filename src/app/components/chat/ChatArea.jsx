'use client';
import React, { useEffect, useRef } from 'react';
import AudioMessage from './AudioMessage';

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
                            {msg.type === 'audio' && msg.mediaUrl ? (
                                <AudioMessage mediaUrl={msg.mediaUrl} />
                            ) : (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                            )}
                            <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-sky-200' : 'text-gray-500'}`}>
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
