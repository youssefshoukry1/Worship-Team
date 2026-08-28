'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import AudioMessage from './AudioMessage';
import ImageMessage from './ImageMessage';
import FileMessage from './FileMessage';
import { useLocalMedia } from '../../hooks/useLocalMedia';
import { BarChart2, ChevronDown, Clock, Check, CheckCheck, MoreVertical } from 'lucide-react';

const SENDER_NAME_COLORS = [
    'text-sky-400',
    'text-[#38bdf8]',
    'text-cyan-400',
    'text-teal-400',
    'text-amber-400',
    'text-emerald-400',
    'text-indigo-400',
    'text-rose-400',
];

const getSenderColor = (userId) => {
    if (!userId) return SENDER_NAME_COLORS[0];
    let hash = 0;
    const str = String(userId);
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % SENDER_NAME_COLORS.length;
    return SENDER_NAME_COLORS[index];
};

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function StickerMessage({ msg }) {
    const { localUrl, loading } = useLocalMedia(msg.mediaUrl, msg._id || msg.createdAt);
    return loading
        ? <div className="h-24 w-24 animate-pulse rounded-2xl bg-white/5" />
        : localUrl
            ? <img src={localUrl} alt="Sticker" className="h-24 w-24 object-contain drop-shadow-md transition-transform duration-200 hover:scale-105 sm:h-32 sm:w-32" />
            : null;
}

export default function ChatArea({ messages, currentUserId, loading, socket, activeTeamId }) {
    const scrollRef = useRef(null);
    const messagesEndRef = useRef(null);
    const isAtBottomRef = useRef(true);
    const prevMsgCountRef = useRef(0);
    const initialLoadDoneRef = useRef(false);

    const [unreadCount, setUnreadCount] = useState(0);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [contextMenu, setContextMenu] = useState({ x: 0, y: 0, visible: false });
    const [editingMessage, setEditingMessage] = useState(null);
    const [editText, setEditText] = useState('');
    const [showMessageActions, setShowMessageActions] = useState(false);
    const longPressTimerRef = useRef(null);

    const handleReaction = (msg, emoji) => {
        if (!socket?.current || !msg._id) return;
        socket.current.emit('toggle-reaction', {
            teamId: activeTeamId,
            messageId: msg._id,
            userId: currentUserId,
            emoji
        });
        setContextMenu({ ...contextMenu, visible: false });
        setSelectedMessage(null);
    };

    const checkIfAtBottom = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    }, []);

    const scrollToBottom = useCallback((instant = false) => {
        messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
        setUnreadCount(0);
        setShowScrollBtn(false);
        isAtBottomRef.current = true;
    }, []);

    const handleScroll = useCallback(() => {
        const atBottom = checkIfAtBottom();
        isAtBottomRef.current = atBottom;
        if (atBottom) {
            setUnreadCount(0);
            setShowScrollBtn(false);
        }
    }, [checkIfAtBottom]);

    useEffect(() => {
        if (!loading && messages.length > 0 && !initialLoadDoneRef.current) {
            initialLoadDoneRef.current = true;
            prevMsgCountRef.current = messages.length;
            scrollToBottom(true);
        }
    }, [loading, messages.length, scrollToBottom]);

    useEffect(() => {
        if (loading) {
            initialLoadDoneRef.current = false;
            prevMsgCountRef.current = 0;
            setUnreadCount(0);
            setShowScrollBtn(false);
            isAtBottomRef.current = true;
        }
    }, [loading]);

    useEffect(() => {
        if (!initialLoadDoneRef.current) return;
        const newCount = messages.length - prevMsgCountRef.current;
        if (newCount <= 0) return;

        prevMsgCountRef.current = messages.length;

        if (isAtBottomRef.current) {
            scrollToBottom(true);
        } else {
            setUnreadCount(c => c + newCount);
            setShowScrollBtn(true);
        }
    }, [messages.length, scrollToBottom]);

    useEffect(() => {
        if (!socket?.current) return;
        const handleMessageDeleted = (updatedMsg) => {};
        socket.current.on('message-deleted', handleMessageDeleted);
        return () => {
            socket.current?.off('message-deleted', handleMessageDeleted);
        };
    }, [socket]);

    useEffect(() => {
        const handleClickOutside = () => {
            if (contextMenu.visible) {
                setContextMenu({ ...contextMenu, visible: false });
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [contextMenu.visible]);

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handleLongPress = (msg, e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setSelectedMessage(msg);
        setShowMessageActions(false);
        setContextMenu({
            x: Math.min(rect.left, window.innerWidth - 300),
            y: Math.max(12, rect.top - 62),
            visible: true
        });
    };

    const startLongPress = (msg, event) => {
        if (event.touches.length !== 1) return;
        longPressTimerRef.current = window.setTimeout(() => {
            handleLongPress(msg, { currentTarget: event.currentTarget });
        }, 500);
    };

    const cancelLongPress = () => {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    };

    const handleDeleteMessage = (deleteForAll) => {
        if (!selectedMessage || !socket?.current) {
            setContextMenu({ ...contextMenu, visible: false });
            return;
        }
        socket.current.emit('delete-message', {
            teamId: activeTeamId,
            messageId: selectedMessage._id,
            deleteForAll,
            userId: currentUserId
        });
        setContextMenu({ ...contextMenu, visible: false });
        setSelectedMessage(null);
    };

    const isMessageDeleted = (msg) => {
        if (msg.isDeletedForAll) return true;
        if (msg.deletedFor?.includes(String(currentUserId))) return true;
        return false;
    };

    const handleEditStart = () => {
        if (selectedMessage && (selectedMessage.type === 'text' || !selectedMessage.type) && !isMessageDeleted(selectedMessage)) {
            setEditingMessage(selectedMessage);
            setEditText(selectedMessage.text);
            setContextMenu({ ...contextMenu, visible: false });
        }
    };

    const handleEditSubmit = () => {
        if (!editingMessage || !editText.trim() || !socket?.current) {
            setEditingMessage(null);
            setEditText('');
            return;
        }
        if (editText.trim() === editingMessage.text.trim()) {
            setEditingMessage(null);
            setEditText('');
            return;
        }
        socket.current.emit('edit-message', {
            teamId: activeTeamId,
            messageId: editingMessage._id,
            newText: editText.trim(),
            userId: currentUserId
        });
        setEditingMessage(null);
        setEditText('');
    };

    const handleEditCancel = () => {
        setEditingMessage(null);
        setEditText('');
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
            if (!socket?.current) return;
            socket.current.emit('vote-poll', {
                teamId: activeTeamId,
                messageId,
                optionId,
                userId: currentUserId
            });
        };

        return (
            <div className="flex flex-col min-w-[220px] sm:min-w-[260px] pt-1 pb-3">
                <div className="flex items-start gap-2 mb-2.5">
                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isMe ? 'bg-cyan-500/20 text-cyan-100' : 'bg-slate-700/50 text-cyan-400'}`}>
                        <BarChart2 size={16} />
                    </div>
                    <span dir="auto" className="font-semibold text-[14px] leading-snug text-slate-100 text-start">
                        {pollData.question}
                    </span>
                </div>

                <div className="space-y-1.5">
                    {pollData.options.map((option) => {
                        const votesCount = option.votes?.length || 0;
                        const percentage = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
                        const hasMyVote = option.votes?.some((voteId) => String(voteId) === String(currentUserId));

                        return (
                            <button
                                key={option.id}
                                onClick={() => handleVote(msg._id, option.id)}
                                className={`group relative w-full text-left overflow-hidden rounded-xl px-2.5 py-1.5 text-[13px] transition-all duration-300 ease-out active:scale-[0.98] border ${
                                    hasMyVote
                                        ? 'border-cyan-500/50 bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                        : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-700/60 hover:border-slate-600'
                                }`}
                            >
                                {votesCount > 0 && (
                                    <div
                                        className={`absolute left-0 top-0 bottom-0 transition-all duration-700 ease-out ${
                                            hasMyVote ? 'bg-cyan-500/30' : 'bg-slate-600/25'
                                        }`}
                                        style={{ width: `${percentage}%` }}
                                    />
                                )}
                                <div className="relative z-10 flex justify-between items-center gap-2">
                                    <span dir="auto" className={`font-medium transition-colors duration-300 text-start ${
                                        hasMyVote ? 'text-cyan-200' : 'text-slate-200 group-hover:text-white'
                                    }`}>
                                        {option.text}
                                    </span>
                                    {votesCount > 0 && (
                                        <span className={`text-[11px] font-medium ${hasMyVote ? 'text-cyan-300' : 'text-slate-400'}`}>
                                            {percentage}%
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {topOptions.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-700/50 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5">
                        <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider shrink-0">Top</span>
                        <div className="flex gap-1.5">
                            {topOptions.map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-1 bg-slate-800/80 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap shadow-sm">
                                    <span dir="auto" className="truncate max-w-[80px] text-start" title={opt.text}>{opt.text}</span>
                                    <span className="text-slate-500 font-medium">•</span>
                                    <span className="font-bold text-cyan-400">{opt.votes?.length}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 relative min-h-0 flex flex-col">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                data-lenis-prevent
                className="flex-1 overflow-y-auto p-3 md:p-4 bg-[#0b0f19] custom-scrollbar flex flex-col gap-1.5"
            >
                {loading && (
                    <div className="flex justify-center my-2">
                        <div className="bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-800">
                            <span className="text-slate-400 text-xs animate-pulse">Loading messages...</span>
                        </div>
                    </div>
                )}

                {messages.length === 0 && !loading && (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-slate-400 text-xs bg-slate-900/60 border border-slate-800 px-4 py-2 rounded-full shadow-sm">
                            No messages yet. Say hi!
                        </p>
                    </div>
                )}

                {messages.map((msg, index) => {
                    const isMe = String(msg.senderId) === String(currentUserId);
                    const prevMsg = messages[index - 1];
                    const nextMsg = messages[index + 1];

                    const isFirstInGroup = !prevMsg || String(prevMsg.senderId) !== String(msg.senderId);
                    const isSticker = msg.type === 'sticker';

                    const displayName = msg.senderName && msg.senderName !== 'User'
                        ? msg.senderName
                        : (typeof msg.senderId === 'object' && msg.senderId?.Name)
                            ? msg.senderId.Name
                            : 'Member';

                    const nameColorClass = getSenderColor(msg.senderId);

                    return (
                        <div
                            key={msg._id || msg._tempId || `${msg.createdAt}-${index}`}
                            className={`flex flex-col max-w-[85%] sm:max-w-[70%] md:max-w-[55%] ${
                                isMe ? 'self-end' : 'self-start'
                            } ${isFirstInGroup ? 'mt-2.5' : 'mt-0.5'} ${
                                msg.status === 'pending' ? 'opacity-80' : ''
                            }`}
                        >
                            <div
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    handleLongPress(msg, e);
                                }}
                                onTouchStart={(e) => startLongPress(msg, e)}
                                onTouchEnd={cancelLongPress}
                                onTouchCancel={cancelLongPress}
                                onTouchMove={cancelLongPress}
                                className={`relative cursor-context-menu ${
                                    isSticker
                                        ? 'bg-transparent text-slate-100'
                                        : isMe
                                            ? 'px-3 py-2 bg-cyan-800 text-cyan-50 shadow-md rounded-2xl'
                                            : 'px-3 py-2 bg-[#1e293b] text-slate-200 shadow-md rounded-2xl border border-slate-700/50'
                                } ${
                                    isMe && isFirstInGroup && !isSticker ? 'rounded-tr-xs' : ''
                                } ${
                                    !isMe && isFirstInGroup && !isSticker ? 'rounded-tl-xs' : ''
                                } ${isMessageDeleted(msg) ? 'opacity-50' : ''}`}
                            >
                                {!isMe && !isSticker && (
                                    <div className="flex items-center gap-1.5 mb-1 select-none">
                                        <span className={`text-[12px] font-bold ${nameColorClass} truncate max-w-[200px]`}>
                                            {displayName}
                                        </span>
                                    </div>
                                )}

                                {isMessageDeleted(msg) ? (
                                    <p dir="auto" className="text-[13px] italic text-slate-400 pb-2 min-w-[70px] text-start">
                                        {msg.isDeletedForAll ? 'This message was deleted' : 'You deleted this message'}
                                    </p>
                                ) : msg.type === 'poll' ? (
                                    <PollMessageBubble msg={msg} isMe={isMe} />
                                ) : msg.type === 'audio' && msg.mediaUrl ? (
                                    <div className="pb-3">
                                        <AudioMessage mediaUrl={msg.mediaUrl} messageId={msg._id || msg.createdAt} />
                                    </div>
                                ) : msg.type === 'image' && msg.mediaUrl ? (
                                    <div className="pb-3">
                                        <ImageMessage msg={msg} />
                                    </div>
                                ) : msg.type === 'sticker' && msg.mediaUrl ? (
                                    <div className="pb-3">
                                        <StickerMessage msg={msg} />
                                    </div>
                                ) : ['file', 'document'].includes(msg.type) && msg.mediaUrl ? (
                                    <div className="pb-3">
                                       <FileMessage msg={msg} />
                                    </div>
                                ) : (
                                    <div dir="auto" className="text-[14px] leading-relaxed whitespace-pre-wrap break-words pb-3 min-w-[65px] text-start">
                                        {msg.text}
                                    </div>
                                )}

                                <div className={`absolute bottom-1 right-2 flex items-center justify-end gap-1 select-none pointer-events-none ${isSticker ? 'bg-black/30 px-1.5 py-0.5 rounded-full backdrop-blur-sm' : ''}`}>
                                    {msg.editedAt && (
                                        <span className={`text-[8px] italic font-normal ${isSticker ? 'text-white' : isMe ? 'text-cyan-200/50' : 'text-slate-500'}`}>
                                            edited
                                        </span>
                                    )}
                                    <span className={`text-[9px] font-normal ${isSticker ? 'text-white' : isMe ? 'text-cyan-200/70' : 'text-slate-400'}`}>
                                        {formatTime(msg.createdAt)}
                                    </span>
                                    {isMe && (
                                        msg.status === 'pending' ? (
                                            <Clock size={10} className={`${isSticker ? 'text-white' : 'text-cyan-200/70'} animate-pulse`} />
                                        ) : (
                                            <CheckCheck size={13} className={isSticker ? 'text-white' : 'text-cyan-300'} />
                                        )
                                    )}
                                </div>
                                {msg.reactions?.length > 0 && (
                                    <div className={`absolute -bottom-3 ${isMe ? 'left-2' : 'right-2'} flex gap-1 rounded-full border border-slate-700/70 bg-[#172033] px-1.5 py-0.5 shadow-lg`}>
                                        {Object.entries(msg.reactions.reduce((counts, reaction) => {
                                            counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
                                            return counts;
                                        }, {})).map(([emoji, count]) => (
                                            <button key={emoji} onClick={() => handleReaction(msg, emoji)} className="text-xs transition-transform hover:scale-125">
                                                {emoji}{count > 1 && <span className="ml-0.5 text-[9px] text-slate-300">{count}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} className="h-1" />
            </div>

            {showScrollBtn && (
                <button
                    onClick={() => scrollToBottom(false)}
                    className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg transition-all active:scale-95"
                >
                    <ChevronDown size={14} />
                    <span>{unreadCount} new message{unreadCount !== 1 ? 's' : ''}</span>
                </button>
            )}

            {contextMenu.visible && (
                <div
                    className="fixed bg-[#1e293b] border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        left: `${contextMenu.x}px`,
                        top: `${contextMenu.y}px`,
                    }}
                >
                    <div className="flex items-center gap-1 border-b border-slate-700/50 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        {REACTION_EMOJIS.map((emoji) => (
                            <button key={emoji} onClick={() => handleReaction(selectedMessage, emoji)} className="rounded-full p-1 text-lg transition-all hover:scale-125 hover:bg-white/10" aria-label={`React ${emoji}`}>
                                {emoji}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowMessageActions((visible) => !visible)}
                            className="ml-1 rounded-full p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                            aria-label="Message actions"
                        >
                            <MoreVertical size={18} />
                        </button>
                    </div>
                    {!showMessageActions ? null : (
                        <div onClick={(e) => e.stopPropagation()}>
                    {String(selectedMessage?.senderId) === String(currentUserId) &&
                        (!selectedMessage?.type || selectedMessage?.type === 'text') &&
                        !isMessageDeleted(selectedMessage) && (
                        <button
                            onClick={handleEditStart}
                            className="w-full px-4 py-2.5 text-left text-sm text-sky-400 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 flex items-center gap-2"
                        >
                            <span>✏️</span>
                            <span>Edit</span>
                        </button>
                    )}
                    <button
                        onClick={() => handleDeleteMessage(false)}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 flex items-center gap-2"
                    >
                        <span>🗑️</span>
                        <span>Delete for me</span>
                    </button>
                    {String(selectedMessage?.senderId) === String(currentUserId) && (
                        <>
                            <button
                                onClick={() => handleDeleteMessage(true)}
                                className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                            >
                                <span>🗑️</span>
                                <span>Delete for all</span>
                            </button>
                        </>
                    )}
                        </div>
                    )}
                </div>
            )}

            {editingMessage && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-[#1e293b] border border-slate-700 rounded-lg sm:rounded-xl w-full sm:w-96 shadow-xl">
                        <div className="border-b border-slate-700 px-4 py-3">
                            <h3 className="text-sm font-semibold text-slate-200">Edit Message</h3>
                        </div>
                        <div className="p-4">
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                placeholder="Edit your message..."
                                dir="auto"
                                className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-none text-start"
                                rows="4"
                                autoFocus
                            />
                        </div>
                        <div className="border-t border-slate-700 flex gap-2 p-4">
                            <button
                                onClick={handleEditCancel}
                                className="flex-1 px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleEditSubmit}
                                disabled={!editText.trim()}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}     