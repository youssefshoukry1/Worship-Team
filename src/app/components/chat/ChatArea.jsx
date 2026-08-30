'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import AudioMessage from './AudioMessage';
import ImageMessage from './ImageMessage';
import FileMessage from './FileMessage';
import { useLocalMedia } from '../../hooks/useLocalMedia';
import { BarChart2, ChevronDown, Clock, Check, CheckCheck, Smile, Edit2, Trash2, X, Plus, Copy, CornerUpLeft, Info, BookOpen, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import HymnsBibleLyricsModal from './HymnsBibleLyricsModal';

const SENDER_NAME_COLORS = [
    'text-sky-400', 'text-[#38bdf8]', 'text-cyan-400', 'text-teal-400',
    'text-amber-400', 'text-emerald-400', 'text-indigo-400', 'text-rose-400',
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
const EXTENDED_EMOJIS = ['😀','😂','🤣','❤️','😍','🙏','😮','😢','😭','😡','👍','👎','🔥','🎉','💯','👀','🤔','🙌'];

function StickerMessage({ msg }) {
    const { localUrl, loading } = useLocalMedia(msg.mediaUrl, msg._id || msg.createdAt);
    return loading
        ? <div className="h-24 w-24 animate-pulse rounded-2xl bg-white/5" />
        : localUrl
            ? <img src={localUrl} alt="Sticker" className="h-24 w-24 object-contain drop-shadow-md transition-transform duration-200 hover:scale-105 sm:h-32 sm:w-32" />
            : null;
}

export default function ChatArea({ messages, currentUserId, loading, socket, activeTeamId, onReplySelect, typingUsers = [] }) {
    const scrollRef = useRef(null);
    const messagesEndRef = useRef(null);
    const messageRefs = useRef(new Map());
    const isAtBottomRef = useRef(true);
    const prevMsgCountRef = useRef(0);
    const initialLoadDoneRef = useRef(false);

    const [unreadCount, setUnreadCount] = useState(0);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    
    const [selectedMessages, setSelectedMessages] = useState([]); 
    const isSelectionMode = selectedMessages.length > 0;

    const [viewingMedia, setViewingMedia] = useState(null);
    const [activeLyricsItem, setActiveLyricsItem] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [editText, setEditText] = useState('');
    const [reactionDetails, setReactionDetails] = useState(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [votingPoll, setVotingPoll] = useState(null);
    const [deliveryInfoMessage, setDeliveryInfoMessage] = useState(null);
    
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [mobileActiveMessage, setMobileActiveMessage] = useState(null);
    const [messagePosition, setMessagePosition] = useState(null);
    const [swipeReply, setSwipeReply] = useState({ id: null, offset: 0 });

    const longPressTimerRef = useRef(null);
    const swipeStartRef = useRef(null);
    const suppressClickRef = useRef(false);

    useEffect(() => {
        const checkTouch = () => setIsTouchDevice(window.matchMedia("(pointer: coarse)").matches);
        checkTouch();
        window.addEventListener('resize', checkTouch);
        return () => window.removeEventListener('resize', checkTouch);
    }, []);

    const toggleMessageSelection = (msg) => {
        setSelectedMessages(prev => {
            const isSelected = prev.some(m => m._id === msg._id);
            if (isSelected) {
                return prev.filter(m => m._id !== msg._id);
            } else {
                return [...prev, msg];
            }
        });
    };

    const handleBulkReaction = (emoji) => {
        if (!socket?.current) return;
        selectedMessages.forEach(msg => {
            if (msg._id) {
                socket.current.emit('toggle-reaction', {
                    teamId: activeTeamId,
                    messageId: msg._id,
                    userId: currentUserId,
                    emoji
                });
            }
        });
        setSelectedMessages([]);
        setShowEmojiPicker(false);
    };

    const handleBulkDelete = (deleteForAll) => {
        if (!socket?.current) return;
        selectedMessages.forEach(msg => {
            if (msg._id && (String(msg.senderId) === String(currentUserId) || !deleteForAll)) {
                socket.current.emit('delete-message', {
                    teamId: activeTeamId,
                    messageId: msg._id,
                    deleteForAll,
                    userId: currentUserId
                });
            }
        });
        setSelectedMessages([]);
        setShowDeleteModal(false);
    };

    const handleEditStart = () => {
        if (selectedMessages.length === 1) {
            const msgToEdit = selectedMessages[0];
            if ((msgToEdit.type === 'text' || !msgToEdit.type) && !isMessageDeleted(msgToEdit) && String(msgToEdit.senderId) === String(currentUserId)) {
                setEditingMessage(msgToEdit);
                setEditText(msgToEdit.text);
                setSelectedMessages([]);
            }
        }
    };

    const handleEditSubmit = () => {
        if (!editingMessage || !editText.trim() || !socket?.current) {
            setEditingMessage(null);
            setEditText('');
            return;
        }
        if (editText.trim() !== editingMessage.text.trim()) {
            socket.current.emit('edit-message', {
                teamId: activeTeamId,
                messageId: editingMessage._id,
                newText: editText.trim(),
                userId: currentUserId
            });
        }
        setEditingMessage(null);
        setEditText('');
    };

    const handleReply = (msg) => {
        setMobileActiveMessage(null);
        if (onReplySelect) onReplySelect(msg);
    };

    const cancelReply = () => {
        if (onReplySelect) onReplySelect(null);
    };

    const getReactionUserId = (reaction) => reaction.userId?._id || reaction.userId;
    const getReactionUserName = (reaction) => reaction.userId?.Name || reaction.userName || 'Member';
    
    const getReactionGroups = (msg) => Object.entries((msg.reactions || []).reduce((groups, reaction) => {
        const key = reaction.emoji;
        if (!groups[key]) groups[key] = [];
        groups[key].push(reaction);
        return groups;
    }, {}));

    const getReplyPreviewText = (replyTo) => {
        if (!replyTo) return '';
        if (replyTo.type === 'audio') return '🎵 Audio message';
        if (replyTo.type === 'image') return '📷 Photo';
        if (['file', 'document'].includes(replyTo.type)) return '📎 File';
        return replyTo.text || '';
    };

    const getReplyMessageId = (replyTo) => {
        if (!replyTo) return null;
        return replyTo._id || replyTo.id || replyTo.messageId || null;
    };

    const scrollToReply = (replyTo) => {
        const targetId = getReplyMessageId(replyTo);
        if (!targetId) return;
        const target = messageRefs.current.get(String(targetId));
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('ring-2', 'ring-cyan-400/80');
        window.setTimeout(() => target.classList.remove('ring-2', 'ring-cyan-400/80'), 1400);
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
        if (!initialLoadDoneRef.current || messages.length <= prevMsgCountRef.current) return;

        const newCount = messages.length - prevMsgCountRef.current;
        const newestMessage = messages[messages.length - 1];
        const sentByCurrentUser = newestMessage &&
            String(newestMessage.senderId) === String(currentUserId);

        prevMsgCountRef.current = messages.length;

        if (isAtBottomRef.current || sentByCurrentUser) {
            scrollToBottom(true);
            return;
        }

        setUnreadCount(count => count + newCount);
        setShowScrollBtn(true);
    }, [messages, currentUserId, scrollToBottom]);

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getPollData = (msg) => {
        if (msg.pollData && typeof msg.pollData === 'object') return msg.pollData;
        if (msg.type !== 'poll' || typeof msg.text !== 'string') return null;
        try {
            return JSON.parse(msg.text);
        } catch {
            return null;
        }
    };

    const handlePollVote = (msg, optionId) => {
        const messageId = msg._id;
        if (!socket?.current || !messageId || votingPoll === String(messageId)) return;
        setVotingPoll(String(messageId));
        socket.current.emit('vote-poll', {
            teamId: activeTeamId,
            messageId,
            optionId,
            userId: currentUserId
        });
        window.setTimeout(() => setVotingPoll(current => (
            current === String(messageId) ? null : current
        )), 500);
    };

    const startLongPress = (msg, event) => {
        if (event.touches.length !== 1) return;
        const targetElement = event.currentTarget;
        swipeStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, msg };
        suppressClickRef.current = false;
        
        longPressTimerRef.current = window.setTimeout(() => {
            if (isTouchDevice) {
                if (navigator.vibrate) navigator.vibrate(50);
                if (!isSelectionMode) {
                    const rect = targetElement.getBoundingClientRect();
                    setMessagePosition({
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        right: rect.right,
                        width: rect.width,
                        isMe: String(msg.senderId) === String(currentUserId)
                    });
                    setMobileActiveMessage(msg);
                }
            } else {
                if (!isSelectionMode) toggleMessageSelection(msg);
            }
        }, 400);
    };

    const cancelLongPress = () => {
        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handleMessageTouchMove = (event) => {
        if (!swipeStartRef.current || event.touches.length !== 1) return;
        const deltaX = event.touches[0].clientX - swipeStartRef.current.x;
        const deltaY = Math.abs(event.touches[0].clientY - swipeStartRef.current.y);
        if (deltaY > 24 || Math.abs(deltaX) > 8) cancelLongPress();
        if (deltaY > 24) return;

        const msg = swipeStartRef.current.msg;
        // WhatsApp-style gesture: own messages reveal reply by swiping left;
        // incoming messages reveal it by swiping right.
        const isOwnMessage = String(msg.senderId) === String(currentUserId);
        const intendedDirection = isOwnMessage ? -1 : 1;
        const progress = Math.max(0, Math.min(88, deltaX * intendedDirection));
        // Keep the visual translation in the actual swipe direction. Own
        // messages must move left; incoming messages must move right.
        const offset = progress * intendedDirection;
        setSwipeReply({ id: msg._id, offset });
    };

    const finishMessageTouch = () => {
        const swipe = swipeReply;
        const msg = swipeStartRef.current?.msg;
        cancelLongPress();
        if (msg && swipe.id === msg._id && Math.abs(swipe.offset) >= 64) {
            suppressClickRef.current = true;
            handleReply(msg);
        }
        swipeStartRef.current = null;
        setSwipeReply({ id: null, offset: 0 });
    };

    const handleMessageClick = (msg) => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        if (isSelectionMode) {
            toggleMessageSelection(msg);
        }
    };

    const isMessageDeleted = (msg) => {
        if (msg.isDeletedForAll) return true;
        if (msg.deletedFor?.includes(String(currentUserId))) return true;
        return false;
    };

    const canDeleteForAll = selectedMessages.every(msg => String(msg.senderId) === String(currentUserId));
    const getTypingName = (typingUser) => {
        const matchingMessage = [...messages].reverse().find(message =>
            String(message.senderId?._id || message.senderId) === String(typingUser.userId)
        );
        const name = matchingMessage?.senderName ||
            matchingMessage?.senderId?.Name ||
            typingUser.userName;
        return name && name !== 'User' ? name : 'Member';
    };
    const getMessageReceipt = (msg) => {
        if (msg.status === 'pending') return 'pending';
        if (Array.isArray(msg.seenBy) && msg.seenBy.length > 0) return 'seen';
        if (Array.isArray(msg.deliveredTo) && msg.deliveredTo.length > 0) return 'delivered';
        return 'sent';
    };
    const getReceiptUserName = (user) => {
        if (typeof user === 'object') return user.Name || user.name || 'Member';
        const matchingMessage = messages.find(message =>
            String(message.senderId?._id || message.senderId) === String(user)
        );
        return matchingMessage?.senderName || 'Member';
    };

    return (
        <div className="flex-1 relative min-h-0 flex flex-col">
            
            {isSelectionMode && (
                <div className="absolute top-0 left-0 right-0 z-[60] bg-[#1e293b] border-b border-slate-700 shadow-lg px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSelectedMessages([])} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 transition-colors">
                            <X size={20} />
                        </button>
                        <span className="text-white font-medium">{selectedMessages.length} Selected</span>
                    </div>
                    
                    <div className="flex items-center gap-1 sm:gap-2">
                        <div className="hidden sm:flex items-center gap-1 bg-slate-800 rounded-full px-2 py-1 mr-2 border border-slate-700">
                            {REACTION_EMOJIS.slice(0, 5).map(emoji => (
                                <button key={emoji} onClick={() => handleBulkReaction(emoji)} className="hover:scale-125 transition-transform p-1 text-lg">
                                    {emoji}
                                </button>
                            ))}
                            <button onClick={() => setShowEmojiPicker(true)} className="p-1.5 text-slate-400 hover:text-white transition-colors hover:bg-slate-700 rounded-full">
                                <Plus size={18} />
                            </button>
                        </div>

                        {selectedMessages.length === 1 && String(selectedMessages[0].senderId) === String(currentUserId) && (!selectedMessages[0].type || selectedMessages[0].type === 'text') && !isMessageDeleted(selectedMessages[0]) && (
                            <button onClick={handleEditStart} className="p-2 hover:bg-slate-700 rounded-full text-sky-400 transition-colors" title="Edit">
                                <Edit2 size={18} />
                            </button>
                        )}
                        
                        <button onClick={() => setShowDeleteModal(true)} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 transition-colors" title="Delete">
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>
            )}

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                data-lenis-prevent
                className="flex-1 overflow-y-auto pt-4 pb-2 bg-[#080c14] custom-scrollbar flex flex-col z-10"
            >
                {loading && (
                    <div className="flex justify-center py-4">
                        <div className="bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60">
                            <span className="text-slate-300 text-xs flex items-center gap-2">
                                <Clock size={12} className="animate-spin text-sky-400" /> Loading messages...
                            </span>
                        </div>
                    </div>
                )}

                {messages.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center flex-1 my-auto py-10">
                        <p className="text-slate-400 text-xs bg-slate-900/80 border border-slate-800 px-4 py-2 rounded-full shadow-sm">
                            No messages yet. Send a message to start the conversation!
                        </p>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    const isMe = String(msg.senderId) === String(currentUserId);
                    const isSelected = selectedMessages.some(m => m._id === msg._id);
                    const isSticker = msg.type === 'sticker';
                    const hasReactions = msg.reactions?.length > 0;
                    
                    const displayName = msg.senderName || 'Member';
                    const nameColorClass = getSenderColor(msg.senderId);

                    return (
                        <div 
                            key={msg._id || idx}
                            className={`flex w-full px-2 sm:px-4 py-1 transition-colors duration-150 ${isSelected ? 'bg-sky-500/10' : 'hover:bg-white/[0.01]'}`}
                        >
                            {isSelectionMode && (
                                <div className="flex items-center justify-center pr-3 cursor-pointer select-none shrink-0" onClick={() => toggleMessageSelection(msg)}>
                                    <div className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-all ${isSelected ? 'bg-sky-500 border-sky-500' : 'border-slate-500'}`}>
                                        {isSelected && <Check size={12} className="text-white stroke-[3]" />}
                                    </div>
                                </div>
                            )}

                            <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'} ${hasReactions ? 'mb-4 mt-1' : 'mb-0.5'}`}>
                                <div
                                    ref={(element) => {
                                        const messageId = msg._id || msg._tempId;
                                        if (messageId) {
                                            if (element) messageRefs.current.set(String(messageId), element);
                                            else messageRefs.current.delete(String(messageId));
                                        }
                                    }}
                                    onClick={() => handleMessageClick(msg)}
                                    onTouchStart={(e) => startLongPress(msg, e)}
                                    onTouchEnd={finishMessageTouch}
                                    onTouchCancel={finishMessageTouch}
                                    onTouchMove={handleMessageTouchMove}
                                    onContextMenu={(e) => { e.preventDefault(); }}
                                    style={{
                                        WebkitTouchCallout: 'none',
                                        WebkitUserSelect: 'none',
                                        userSelect: 'none',
                                        touchAction: 'pan-y',
                                        transform: swipeReply.id === msg._id ? `translateX(${swipeReply.offset}px)` : undefined
                                    }}
                                    className={`group relative select-none rounded-2xl transition-[transform,box-shadow] duration-150 ${isSelectionMode ? 'cursor-pointer' : ''} ${
                                        isSticker
                                            ? 'bg-transparent text-slate-100'
                                            : isMe
                                                ? 'px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm rounded-2xl rounded-tr-xs border border-blue-500/30'
                                                : 'px-3.5 py-2 bg-[#131b2e] text-slate-100 shadow-sm rounded-2xl rounded-tl-xs border border-slate-700/60'
                                    } ${msg.status === 'pending' ? 'opacity-80' : ''}`}
                                >
                                    {!isMe && !isSticker && (
                                        <div className="flex items-center gap-1.5 mb-1 select-none">
                                            <span className={`text-[12px] font-bold ${nameColorClass} truncate max-w-[200px]`}>
                                                {displayName}
                                            </span>
                                        </div>
                                    )}

                                     {msg.replyTo && !isMessageDeleted(msg) && !isSticker && (
                                        <div
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                scrollToReply(msg.replyTo);
                                            }}
                                            className={`mb-2 rounded-lg px-2.5 py-1.5 border-l-[3px] cursor-pointer select-none transition-colors hover:bg-white/10 ${
                                                isMe
                                                    ? 'bg-black/20 border-l-sky-300'
                                                    : 'bg-slate-800/80 border-l-sky-500'
                                            }`}
                                        >
                                            <p className={`text-[11px] font-bold mb-0.5 truncate ${isMe ? 'text-sky-200' : 'text-sky-400'}`}>
                                                {msg.replyTo.senderName || 'Member'}
                                            </p>
                                            <p className={`text-[12px] truncate ${isMe ? 'text-white/80' : 'text-slate-300'}`}>
                                                {getReplyPreviewText(msg.replyTo)}
                                            </p>
                                        </div>
                                    )}

                                    {!isSelectionMode && (
                                        <div className="absolute right-1 top-1 z-20 hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-md rounded-lg p-0.5">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); toggleMessageSelection(msg); setShowEmojiPicker(true); }}
                                                className="p-1 text-slate-200 hover:text-white hover:bg-white/20 rounded-md transition-colors"
                                                title="React"
                                            >
                                                <Smile size={14} />
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); toggleMessageSelection(msg); }}
                                                className="p-1 text-slate-200 hover:text-white hover:bg-white/20 rounded-md transition-colors"
                                                title="Options"
                                            >
                                                <ChevronDown size={14} />
                                            </button>
                                            {isMe && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeliveryInfoMessage(msg); }}
                                                    className="p-1 text-slate-200 hover:text-white hover:bg-white/20 rounded-md transition-colors"
                                                    title="Message info"
                                                    aria-label="Message info"
                                                >
                                                    <Info size={14} />
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {isMessageDeleted(msg) ? (
                                        <p dir="auto" className="text-[13px] italic text-slate-400 pb-4 min-w-[70px] text-start">
                                            {msg.isDeletedForAll ? 'This message was deleted' : 'You deleted this message'}
                                        </p>
                                    ) : msg.type === 'poll' ? (
                                        (() => {
                                            const poll = getPollData(msg);
                                            if (!poll?.options?.length) {
                                                return <p className="pb-4 text-[13px] text-slate-400">Poll unavailable</p>;
                                            }
                                            const totalVotes = poll.options.reduce(
                                                (total, option) => total + (Array.isArray(option.votes) ? option.votes.length : 0),
                                                0
                                            );
                                            const topVoteCount = Math.max(...poll.options.map(option =>
                                                Array.isArray(option.votes) ? option.votes.length : 0
                                            ));
                                            const topOptions = poll.options.filter(option =>
                                                (Array.isArray(option.votes) ? option.votes.length : 0) === topVoteCount
                                            );
                                            return (
                                                <div className="min-w-[220px] max-w-[min(72vw,360px)] space-y-3 pb-4">
                                                    <div>
                                                        <p dir="auto" className="text-[14px] font-semibold leading-relaxed break-words">{poll.question || msg.text}</p>
                                                        <p className={`mt-1 text-[11px] ${isMe ? 'text-slate-200' : 'text-slate-400'}`}>
                                                            {poll.allowMultipleAnswers ? 'Select one or more' : 'Select one'} · {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                                                        </p>
                                                    </div>
                                                    {totalVotes > 0 && topVoteCount > 0 && (
                                                        <div className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                                                            isMe
                                                                ? 'border-white/20 bg-black/20 text-white'
                                                                : 'border-slate-700/80 bg-slate-800/80 text-slate-200'
                                                        }`}>
                                                            <span className="flex min-w-0 items-center gap-1.5">
                                                                <BarChart2 size={13} className="shrink-0 text-amber-400" />
                                                                <span className="truncate">
                                                                    Top voted: 
                                                                    {topOptions.map(option => option.text).join(' · ')}
                                                                </span>
                                                            </span>
                                                            <span className="shrink-0 font-semibold">{topVoteCount}</span>
                                                        </div>
                                                    )}
                                                    <div className="space-y-2">
                                                        {poll.options.map((option) => {
                                                            const votes = Array.isArray(option.votes) ? option.votes : [];
                                                            const selected = votes.some(id => String(id?._id || id) === String(currentUserId));
                                                            const percentage = totalVotes ? Math.round((votes.length / totalVotes) * 100) : 0;
                                                            return (
                                                                <button
                                                                    key={String(option.id)}
                                                                    type="button"
                                                                    disabled={votingPoll === String(msg._id)}
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        handlePollVote(msg, option.id);
                                                                    }}
                                                                    className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-wait disabled:opacity-70 ${
                                                                        selected
                                                                            ? (isMe ? 'border-white/40 bg-black/40 text-white font-semibold' : 'border-sky-500/70 bg-sky-600/30 text-sky-200 font-semibold')
                                                                            : (isMe ? 'border-white/10 bg-black/20 text-slate-100 hover:bg-black/30' : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-800')
                                                                    }`}
                                                                >
                                                                    <span className="absolute inset-y-0 left-0 bg-white/15 transition-all" style={{ width: `${percentage}%` }} />
                                                                    <span className="relative flex items-center justify-between gap-3">
                                                                        <span className="break-words">{option.text}</span>
                                                                        <span className="shrink-0 text-[11px] opacity-90">{percentage}%</span>
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()
                                    ) : msg.type === 'hymns_bible' && msg.items ? (
                                        <div className="min-w-[220px] max-w-[min(72vw,360px)] space-y-2 pb-4">
                                            <p dir="auto" className="text-[14px] font-semibold leading-relaxed break-words">
                                                {msg.text}
                                            </p>
                                            <div className="flex flex-col gap-2 mt-2">
                                                {msg.items.map((item, idx) => (
                                                    <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                                        <div className="flex items-center gap-2">
                                                            {item.type === 'bible' ? <BookOpen size={16} className="text-purple-400 shrink-0" /> : <Music size={16} className="text-orange-400 shrink-0" />}
                                                            <span className="text-[12px] font-semibold text-white truncate flex-1">
                                                                {item.title || item.bookName} {item.chapter || ''}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setActiveLyricsItem(item); }}
                                                            className="w-full py-1.5 text-xs font-bold bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white rounded-lg transition-colors border border-sky-500/30"
                                                        >
                                                            Lyrics
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : msg.type === 'audio' && msg.mediaUrl ? (
                                        <div className="pb-4"><AudioMessage mediaUrl={msg.mediaUrl} messageId={msg._id || msg.createdAt} /></div>
                                    ) : msg.type === 'image' && msg.mediaUrl ? (
                                        <div className="pb-4"><ImageMessage msg={msg} /></div>
                                    ) : ['file', 'document'].includes(msg.type) && msg.mediaUrl ? (
                                        <div className="pb-4"><FileMessage msg={msg} /></div>
                                    ) : (
                                        <div dir="auto" className="text-[14px] leading-relaxed whitespace-pre-wrap break-words pb-4 min-w-[70px] text-start">
                                            {msg.text}
                                        </div>
                                    )}

                                    <div className={`absolute bottom-1 right-2 flex items-center justify-end gap-1 select-none pointer-events-none`}>
                                        {msg.editedAt && <span className={`text-[9px] italic font-normal ${isMe ? 'text-white/60' : 'text-slate-500'}`}>edited</span>}
                                        <span className={`text-[10px] font-medium ${isMe ? 'text-white/80' : 'text-slate-400'}`}>{formatTime(msg.createdAt)}</span>
                                        {isMe && getMessageReceipt(msg) === 'pending' && <Clock size={11} className="text-white/70 animate-pulse" />}
                                        {isMe && getMessageReceipt(msg) === 'sent' && <Check size={13} className="text-white/80" strokeWidth={2.5} />}
                                        {isMe && getMessageReceipt(msg) === 'delivered' && <CheckCheck size={14} className="text-white/80" />}
                                        {isMe && getMessageReceipt(msg) === 'seen' && <CheckCheck size={14} className="text-sky-300" />}
                                    </div>
                                    
                                    {hasReactions && (
                                        <div 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setReactionDetails({ msg, allReactions: msg.reactions });
                                            }}
                                            className={`absolute -bottom-3.5 cursor-pointer ${isMe ? 'left-2' : 'right-2'} flex items-center gap-1 rounded-full border border-slate-700/70 bg-[#172033] px-1.5 py-0.5 shadow-md z-20 hover:bg-white/10 transition-colors`}
                                        >
                                            <div className="flex -space-x-1">
                                                {getReactionGroups(msg).map(([emoji, reactions]) => (
                                                    <span key={emoji} className="text-[11px] drop-shadow-sm">{emoji}</span>
                                                ))}
                                            </div>
                                            <span className="text-[10px] font-semibold text-slate-300 ml-1">{msg.reactions.length}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {typingUsers.length > 0 && (
                    <div className="flex w-full px-2 py-1 sm:px-4">
                        <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-700/50 bg-[#1e293b] px-3 py-2 shadow-sm">
                            <div className="flex items-center gap-1.5">
                                {typingUsers.slice(0, 2).map(user => (
                                    <span
                                        key={String(user.userId)}
                                        className={`text-[12px] font-bold ${getSenderColor(user.userId)}`}
                                    >
                                        {getTypingName(user)}
                                    </span>
                                ))}
                                {typingUsers.length > 2 && (
                                    <span className="text-[11px] text-slate-400">+{typingUsers.length - 2}</span>
                                )}
                            </div>
                            <span className="flex gap-0.5" aria-hidden="true">
                                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400" />
                                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:120ms]" />
                                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-400 [animation-delay:240ms]" />
                            </span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-2" />
            </div>

            {showScrollBtn && (
                <button
                    onClick={() => scrollToBottom(false)}
                    aria-label={`Scroll to latest messages${unreadCount ? ` (${unreadCount} unread)` : ''}`}
                    className="absolute bottom-5 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/70 bg-[#1e293b] text-sky-400 shadow-xl transition-all hover:bg-slate-800 active:scale-95 animate-in slide-in-from-bottom-2"
                >
                    <ChevronDown size={20} />
                    {unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-white">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>
            )}


            {/* Modal: تفاصيل الريأكت */}
            {reactionDetails && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 sm:p-4 backdrop-blur-sm" onClick={() => setReactionDetails(null)}>
                    <div className="w-full max-w-sm rounded-t-xl sm:rounded-xl bg-[#1e293b] p-0 shadow-2xl border border-slate-700 animate-in slide-in-from-bottom-2 sm:slide-in-from-bottom-0 sm:zoom-in-95 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-700/50 p-4 bg-slate-800/50">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                Reactions ({reactionDetails.allReactions.length})
                            </h3>
                            <button onClick={() => setReactionDetails(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto p-2 custom-scrollbar">
                            {reactionDetails.allReactions.map((reaction, i) => (
                                <div key={i} className="flex items-center justify-between rounded-lg p-3 hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 border border-slate-600 text-lg font-bold text-white shadow-sm">
                                            {getReactionUserName(reaction)[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-200">{getReactionUserName(reaction)}</span>
                                            {getReactionUserId(reaction) === currentUserId && <span className="text-[10px] text-cyan-400">You</span>}
                                        </div>
                                    </div>
                                    <span className="text-2xl drop-shadow-sm">{reaction.emoji}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {deliveryInfoMessage && (
                <div
                    className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
                    onClick={() => setDeliveryInfoMessage(null)}
                >
                    <div
                        className="w-full max-w-sm overflow-hidden rounded-t-2xl border border-slate-700 bg-[#1e293b] shadow-2xl sm:rounded-2xl"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-700/70 bg-slate-800/50 p-4">
                            <div>
                                <h3 className="text-sm font-semibold text-white">Message info</h3>
                                <p className="mt-0.5 text-[11px] text-slate-400">{formatTime(deliveryInfoMessage.createdAt)}</p>
                            </div>
                            <button onClick={() => setDeliveryInfoMessage(null)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="max-h-72 space-y-4 overflow-y-auto p-4">
                            <div>
                                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
                                    <CheckCheck size={16} className="text-slate-300" /> Delivered
                                </p>
                                {deliveryInfoMessage.deliveredTo?.length ? deliveryInfoMessage.deliveredTo.map((user, index) => (
                                    <div key={`delivered-${index}`} className="flex items-center justify-between px-2 py-1.5 text-sm text-slate-200">
                                        <span>{getReceiptUserName(user)}</span>
                                        <span className="text-[11px] text-slate-500">Delivered</span>
                                    </div>
                                )) : <p className="px-2 text-xs text-slate-500">Not delivered yet</p>}
                            </div>
                            <div>
                                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
                                    <CheckCheck size={16} className="text-sky-300" /> Seen
                                </p>
                                {deliveryInfoMessage.seenBy?.length ? deliveryInfoMessage.seenBy.map((user, index) => (
                                    <div key={`seen-${index}`} className="flex items-center justify-between px-2 py-1.5 text-sm text-slate-200">
                                        <span>{getReceiptUserName(user)}</span>
                                        <span className="text-[11px] text-sky-300">Seen</span>
                                    </div>
                                )) : <p className="px-2 text-xs text-slate-500">Not seen yet</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: الـ Emoji Picker */}
            {showEmojiPicker && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 transition-opacity" onClick={() => setShowEmojiPicker(false)}>
                    <div className="w-full max-w-sm rounded-t-xl sm:rounded-xl bg-[#1e293b] p-4 shadow-2xl border border-slate-700 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
                        <h3 className="text-slate-300 text-sm mb-4 font-medium px-1">Choose Reaction</h3>
                        <div className="grid grid-cols-6 gap-3">
                            {EXTENDED_EMOJIS.map(emoji => (
                                <button 
                                    key={emoji} 
                                    onClick={() => handleBulkReaction(emoji)} 
                                    className="text-2xl hover:scale-125 transition-transform p-2 flex items-center justify-center hover:bg-slate-700 rounded-lg"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: المسح */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 transition-opacity" onClick={() => setShowDeleteModal(false)}>
                    <div className="w-full max-w-sm bg-[#1e293b] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="p-2 flex flex-col gap-1">
                            {canDeleteForAll && (
                                <button onClick={() => handleBulkDelete(true)} className="w-full text-center py-3.5 text-red-400 font-medium hover:bg-slate-800 rounded-xl transition-colors">
                                    Delete for everyone
                                </button>
                            )}
                            <button onClick={() => handleBulkDelete(false)} className="w-full text-center py-3.5 text-slate-200 font-medium hover:bg-slate-800 rounded-xl transition-colors">
                                Delete for me
                            </button>
                            <div className="h-px bg-slate-700/50 my-1"></div>
                            <button onClick={() => setShowDeleteModal(false)} className="w-full text-center py-3.5 text-slate-400 font-medium hover:bg-slate-800 rounded-xl transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Message Bar */}
            {editingMessage && (
                <div className="absolute bottom-full left-0 right-0 z-50 bg-[#131b2e] border-t border-slate-700/80 p-3 shadow-2xl animate-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2 text-sky-400">
                            <Edit2 size={16} />
                            <span className="text-xs font-semibold uppercase tracking-wider">Edit Message</span>
                        </div>
                        <button onClick={() => { setEditingMessage(null); setEditText(''); }} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="flex items-end gap-2 bg-[#0d1322] rounded-xl p-2 border border-slate-700/60">
                        <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleEditSubmit();
                                }
                            }}
                            autoFocus
                            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-32 min-h-[40px] px-2 py-1 custom-scrollbar"
                            placeholder="Edit your message..."
                            dir="auto"
                        />
                        <button onClick={handleEditSubmit} disabled={!editText.trim() || editText.trim() === editingMessage.text.trim()} className="bg-sky-600 hover:bg-sky-500 text-white rounded-lg p-2.5 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                            <Check size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile Long Touch Overlay - WhatsApp Style */}
            <AnimatePresence>
                {mobileActiveMessage && isTouchDevice && messagePosition && (
                    <div className="fixed inset-0 z-[120] flex flex-col sm:hidden" onClick={() => setMobileActiveMessage(null)}>
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/70 backdrop-blur-xs"
                            onClick={() => setMobileActiveMessage(null)}
                        />
                        
                        <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between overflow-hidden">
                            {/* Message clone in exact position */}
                            <div 
                                className="absolute left-3 right-3 pointer-events-auto"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    top: `${Math.max(
                                        12,
                                        Math.min(
                                            messagePosition.top > window.innerHeight / 2
                                                ? messagePosition.top - 230
                                                : messagePosition.top,
                                            window.innerHeight - 300
                                        )
                                    )}px`
                                }}
                            >
                                <div className={`flex w-full flex-col relative ${messagePosition.isMe ? 'items-end' : 'items-start'}`}>
                                    {/* Quick Emoji Reaction Bar */}
                                    <motion.div 
                                        initial={{ scale: 0.8, opacity: 0, y: 10 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        exit={{ scale: 0.8, opacity: 0, y: 10 }}
                                        className="mb-2 flex max-w-full gap-2.5 overflow-x-auto rounded-full border border-slate-700/80 bg-[#131b2e] px-3 py-1.5 shadow-2xl"
                                    >
                                        {REACTION_EMOJIS.map((emoji) => (
                                            <button 
                                                key={emoji} 
                                                className="text-xl hover:scale-125 transition-transform" 
                                                onClick={() => {
                                                    if (socket?.current && mobileActiveMessage._id) {
                                                        socket.current.emit('toggle-reaction', {
                                                            teamId: activeTeamId,
                                                            messageId: mobileActiveMessage._id,
                                                            userId: currentUserId,
                                                            emoji
                                                        });
                                                    }
                                                    setMobileActiveMessage(null);
                                                }}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </motion.div>

                                    {/* Active Message Preview */}
                                    <div className={`max-w-[min(85vw,32rem)] rounded-2xl p-3 shadow-2xl ${messagePosition.isMe ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs border border-blue-500/30' : 'bg-[#131b2e] text-slate-100 rounded-tl-xs border border-slate-700/60'}`}>
                                        {mobileActiveMessage.type === 'audio' && mobileActiveMessage.mediaUrl ? (
                                            <div className="pointer-events-none"><AudioMessage mediaUrl={mobileActiveMessage.mediaUrl} messageId={mobileActiveMessage._id || mobileActiveMessage.createdAt} /></div>
                                        ) : mobileActiveMessage.type === 'image' && mobileActiveMessage.mediaUrl ? (
                                            <div className="pointer-events-none"><ImageMessage msg={mobileActiveMessage} /></div>
                                        ) : ['file', 'document'].includes(mobileActiveMessage.type) && mobileActiveMessage.mediaUrl ? (
                                            <div className="pointer-events-none"><FileMessage msg={mobileActiveMessage} /></div>
                                        ) : (
                                            <div dir="auto" className="text-[14px] leading-relaxed whitespace-pre-wrap break-words min-w-[70px] text-start">
                                                {mobileActiveMessage.text}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Options Popup */}
                                    <motion.div 
                                        initial={{ scale: 0.8, opacity: 0, y: messagePosition.top > window.innerHeight / 2 ? -10 : 10 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        exit={{ scale: 0.8, opacity: 0 }}
                                        className="mt-2.5 w-56 max-w-[calc(100vw-24px)] flex max-h-[min(42vh,18rem)] flex-col overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-700/80 bg-[#131b2e] shadow-2xl pointer-events-auto"
                                    >
                                        <button 
                                            onClick={() => { toggleMessageSelection(mobileActiveMessage); setMobileActiveMessage(null); }}
                                            className="flex items-center justify-between w-full px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 text-sky-400 font-semibold"
                                        >
                                            <span className="text-[14px]">Select</span>
                                            <Check size={16} className="text-sky-400" />
                                        </button>

                                        {String(mobileActiveMessage.senderId) === String(currentUserId) && (
                                            <button
                                                onClick={() => { setDeliveryInfoMessage(mobileActiveMessage); setMobileActiveMessage(null); }}
                                                className="flex items-center justify-between w-full px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 text-slate-200"
                                            >
                                                <span className="text-[14px]">Info</span>
                                                <Info size={16} />
                                            </button>
                                        )}

                                        {(!mobileActiveMessage.type || mobileActiveMessage.type === 'text') && (
                                            <button 
                                                onClick={() => { navigator.clipboard.writeText(mobileActiveMessage.text); setMobileActiveMessage(null); }}
                                                className="flex items-center justify-between w-full px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 text-slate-200"
                                            >
                                                <span className="text-[14px]">Copy</span>
                                                <Copy size={16} />
                                            </button>
                                        )}

                                        {String(mobileActiveMessage.senderId) === String(currentUserId) && (!mobileActiveMessage.type || mobileActiveMessage.type === 'text') && !isMessageDeleted(mobileActiveMessage) && (
                                            <button 
                                                onClick={() => { 
                                                    setEditingMessage(mobileActiveMessage); 
                                                    setEditText(mobileActiveMessage.text); 
                                                    setMobileActiveMessage(null); 
                                                }}
                                                className="flex items-center justify-between w-full px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800 text-sky-400"
                                            >
                                                <span className="text-[14px]">Edit</span>
                                                <Edit2 size={16} />
                                            </button>
                                        )}

                                        <button 
                                            options-id="delete"
                                            onClick={() => { 
                                                setSelectedMessages([mobileActiveMessage]); 
                                                setMobileActiveMessage(null); 
                                                setShowDeleteModal(true); 
                                            }}
                                            className="flex items-center justify-between w-full px-4 py-3 hover:bg-slate-800 transition-colors text-rose-400"
                                        >
                                            <span className="text-[14px]">Delete</span>
                                            <Trash2 size={16} />
                                        </button>
                                    </motion.div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            <HymnsBibleLyricsModal 
                item={activeLyricsItem}
                showModal={!!activeLyricsItem}
                onClose={() => setActiveLyricsItem(null)}
            />
        </div>
    );
}