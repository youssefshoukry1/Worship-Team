'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import AudioMessage from './AudioMessage';
import ImageMessage from './ImageMessage';
import FileMessage from './FileMessage';
import { useLocalMedia } from '../../hooks/useLocalMedia';
import { BarChart2, ChevronDown, Clock, Check, CheckCheck, Smile, Edit2, Trash2, X, Plus, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function ChatArea({ messages, currentUserId, loading, socket, activeTeamId }) {
    const scrollRef = useRef(null);
    const messagesEndRef = useRef(null);
    const isAtBottomRef = useRef(true);
    const prevMsgCountRef = useRef(0);
    const initialLoadDoneRef = useRef(false);

    const [unreadCount, setUnreadCount] = useState(0);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    
    const [selectedMessages, setSelectedMessages] = useState([]); 
    const isSelectionMode = selectedMessages.length > 0;

    const [editingMessage, setEditingMessage] = useState(null);
    const [editText, setEditText] = useState('');
    const [reactionDetails, setReactionDetails] = useState(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [mobileActiveMessage, setMobileActiveMessage] = useState(null);

    const longPressTimerRef = useRef(null);

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

    const getReactionUserId = (reaction) => reaction.userId?._id || reaction.userId;
    const getReactionUserName = (reaction) => reaction.userId?.Name || reaction.userName || 'Member';
    
    // دالة لتجميع الريأكتات المتشابهة مع بعض
    const getReactionGroups = (msg) => Object.entries((msg.reactions || []).reduce((groups, reaction) => {
        const key = reaction.emoji;
        if (!groups[key]) groups[key] = [];
        groups[key].push(reaction);
        return groups;
    }, {}));

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

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const startLongPress = (msg, event) => {
        if (event.touches.length !== 1) return;
        longPressTimerRef.current = window.setTimeout(() => {
            if (isTouchDevice) {
                if (navigator.vibrate) navigator.vibrate(50);
                if (!isSelectionMode) setMobileActiveMessage(msg);
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

    const handleMessageClick = (msg) => {
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
                className="flex-1 overflow-y-auto pt-4 pb-2 bg-[#0b0f19] custom-scrollbar flex flex-col z-10"
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
                    const isSelected = selectedMessages.some(m => m._id === msg._id);
                    const isSticker = msg.type === 'sticker';
                    const hasReactions = msg.reactions?.length > 0;
                    
                    const displayName = msg.senderName && msg.senderName !== 'User'
                        ? msg.senderName : (typeof msg.senderId === 'object' && msg.senderId?.Name) ? msg.senderId.Name : 'Member';
                    const nameColorClass = getSenderColor(msg.senderId);

                    return (
                        <div 
                            key={msg._id || msg._tempId || `${msg.createdAt}-${index}`}
                            className={`flex w-full px-2 sm:px-4 py-1 transition-colors duration-200 ${isSelected ? 'bg-cyan-500/10' : 'hover:bg-white/[0.01]'}`}
                        >
                            {isSelectionMode && (
                                <div className="flex items-center justify-center w-10 shrink-0 cursor-pointer" onClick={() => toggleMessageSelection(msg)}>
                                    <div className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-all ${isSelected ? 'bg-cyan-500 border-cyan-500' : 'border-slate-500'}`}>
                                        {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                                    </div>
                                </div>
                            )}

                            <div className={`flex flex-col relative max-w-[85%] sm:max-w-[70%] md:max-w-[55%] ${isMe ? 'ml-auto' : 'mr-auto'} ${hasReactions ? 'mb-4 mt-1' : 'mb-0.5'}`}>
                                <div
                                    onClick={() => handleMessageClick(msg)}
                                    onTouchStart={(e) => startLongPress(msg, e)}
                                    onTouchEnd={cancelLongPress}
                                    onTouchCancel={cancelLongPress}
                                    onTouchMove={cancelLongPress}
                                    onContextMenu={(e) => { if (isTouchDevice) e.preventDefault(); }}
                                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: isTouchDevice ? 'none' : 'auto', userSelect: isTouchDevice ? 'none' : 'auto' }}
                                    className={`group relative ${isSelectionMode ? 'cursor-pointer' : ''} ${
                                        isSticker
                                            ? 'bg-transparent text-slate-100'
                                            : isMe
                                                ? 'px-3 py-2 bg-cyan-800 text-cyan-50 shadow-sm rounded-2xl rounded-tr-sm'
                                                : 'px-3 py-2 bg-[#1e293b] text-slate-200 shadow-sm rounded-2xl rounded-tl-sm border border-slate-700/50'
                                    } ${msg.status === 'pending' ? 'opacity-80' : ''}`}
                                >
                                    {!isMe && !isSticker && (
                                        <div className="flex items-center gap-1.5 mb-1 select-none">
                                            <span className={`text-[12px] font-bold ${nameColorClass} truncate max-w-[200px]`}>
                                                {displayName}
                                            </span>
                                        </div>
                                    )}

                                    {!isSelectionMode && (
                                        <div className="absolute right-1 top-1 z-20 hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 backdrop-blur-md rounded-lg p-0.5">
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
                                        </div>
                                    )}

                                    {isMessageDeleted(msg) ? (
                                        <p dir="auto" className="text-[13px] italic text-slate-400 pb-4 min-w-[70px] text-start">
                                            {msg.isDeletedForAll ? 'This message was deleted' : 'You deleted this message'}
                                        </p>
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
                                        {msg.editedAt && <span className={`text-[9px] italic font-normal ${isMe ? 'text-cyan-200/50' : 'text-slate-500'}`}>edited</span>}
                                        <span className={`text-[10px] font-medium ${isMe ? 'text-cyan-200/80' : 'text-slate-400'}`}>{formatTime(msg.createdAt)}</span>
                                        {isMe && (msg.status === 'pending' ? <Clock size={11} className="text-cyan-200/70 animate-pulse" /> : <CheckCheck size={14} className="text-cyan-400" />)}
                                    </div>
                                    
                                    {/* تجميع كل الريأكتات في Div واحد */}
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
                <div ref={messagesEndRef} className="h-2" />
            </div>

            {showScrollBtn && (
                <button onClick={() => scrollToBottom(false)} className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 bg-[#1e293b] border border-slate-700/50 text-sky-400 p-2.5 pr-4 rounded-full shadow-xl hover:bg-slate-800 transition-all active:scale-95 animate-in slide-in-from-bottom-2">
                    <ChevronDown size={20} />
                    {unreadCount > 0 && <span className="font-semibold text-sm">{unreadCount}</span>}
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

            {/* حالة التعديل */}
            {editingMessage && (
                <div className="absolute bottom-full left-0 right-0 z-50 bg-[#1e293b] border-t border-slate-700 p-3 shadow-lg animate-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2 text-sky-400">
                            <Edit2 size={16} />
                            <span className="text-xs font-semibold uppercase tracking-wider">Edit Message</span>
                        </div>
                        <button onClick={() => { setEditingMessage(null); setEditText(''); }} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="flex items-end gap-2 bg-[#0f172a] rounded-xl p-2 border border-slate-700/50">
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
                            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none resize-none max-h-32 min-h-[40px] px-2 py-1 custom-scrollbar"
                            placeholder="Edit your message..."
                            dir="auto"
                        />
                        <button onClick={handleEditSubmit} disabled={!editText.trim() || editText.trim() === editingMessage.text.trim()} className="bg-sky-500 hover:bg-sky-400 text-white rounded-lg p-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            <Check size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* القائمة المنبثقة الخاصة بالموبايل */}
            <AnimatePresence>
                {mobileActiveMessage && isTouchDevice && (
                    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center sm:hidden">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40"
                            onClick={() => setMobileActiveMessage(null)}
                        />
                        
                        <div className="relative z-10 flex flex-col items-center w-full px-4 gap-4">
                            
                            <motion.div 
                                initial={{ scale: 0.8, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.8, opacity: 0, y: 20 }}
                                className="bg-[#1e293b] border border-slate-700 rounded-full px-4 py-2 flex gap-3 shadow-xl"
                            >
                                {REACTION_EMOJIS.map((emoji) => (
                                    <button 
                                        key={emoji} 
                                        className="text-2xl hover:scale-125 transition-transform" 
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

                            <div className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${String(mobileActiveMessage.senderId) === String(currentUserId) ? 'bg-cyan-800 text-cyan-50 rounded-tr-sm' : 'bg-[#1e293b] text-slate-200 rounded-tl-sm border border-slate-700/50'}`}>
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

                            <motion.div 
                                initial={{ scale: 0.8, opacity: 0, y: -20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.8, opacity: 0, y: -20 }}
                                className="bg-[#1e293b] border border-slate-700 rounded-2xl w-64 flex flex-col shadow-xl overflow-hidden"
                            >
                                <button 
                                    onClick={() => { toggleMessageSelection(mobileActiveMessage); setMobileActiveMessage(null); }}
                                    className="flex items-center justify-between w-full p-4 hover:bg-slate-800 transition-colors border-b border-slate-700/50 text-cyan-400 font-medium"
                                >
                                    <span className="text-[15px]">Select Messages</span>
                                    <div className="w-5 h-5 rounded-full border-[1.5px] border-cyan-400 flex items-center justify-center bg-cyan-400/10">
                                        <Check size={12} className="text-cyan-400" strokeWidth={3} />
                                    </div>
                                </button>

                                {(!mobileActiveMessage.type || mobileActiveMessage.type === 'text') && (
                                    <button 
                                        onClick={() => { navigator.clipboard.writeText(mobileActiveMessage.text); setMobileActiveMessage(null); }}
                                        className="flex items-center justify-between w-full p-4 hover:bg-slate-800 transition-colors border-b border-slate-700/50 text-slate-200"
                                    >
                                        <span className="text-[15px]">Copy</span>
                                        <Copy size={18} />
                                    </button>
                                )}

                                {String(mobileActiveMessage.senderId) === String(currentUserId) && (!mobileActiveMessage.type || mobileActiveMessage.type === 'text') && !isMessageDeleted(mobileActiveMessage) && (
                                    <button 
                                        onClick={() => { 
                                            setEditingMessage(mobileActiveMessage); 
                                            setEditText(mobileActiveMessage.text); 
                                            setMobileActiveMessage(null); 
                                        }}
                                        className="flex items-center justify-between w-full p-4 hover:bg-slate-800 transition-colors border-b border-slate-700/50 text-sky-400"
                                    >
                                        <span className="text-[15px]">Edit</span>
                                        <Edit2 size={18} />
                                    </button>
                                )}

                                <button 
                                    onClick={() => { 
                                        setSelectedMessages([mobileActiveMessage]); 
                                        setMobileActiveMessage(null); 
                                        setShowDeleteModal(true); 
                                    }}
                                    className="flex items-center justify-between w-full p-4 hover:bg-slate-800 transition-colors text-red-400"
                                >
                                    <span className="text-[15px]">Delete</span>
                                    <Trash2 size={18} />
                                </button>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}