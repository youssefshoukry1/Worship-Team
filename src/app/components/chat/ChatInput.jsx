'use client';
import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { 
    Send, Mic, Square, Trash2, Loader2, Pause, Play, Plus, 
    BarChart2, X, CheckSquare, Image as ImageIcon, Lock, 
    ChevronUp, ChevronLeft, Smile, Sticker, Upload, Search, FileText, CornerUpLeft,
    Music, BookOpen
} from 'lucide-react';
import HymnsBiblePicker from './HymnsBiblePicker';
import axios from 'axios';
import { getApiBaseUrl } from '../../utils/apiBase';

// Dynamically import EmojiPicker to prevent SSR hydration mismatches
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { 
    ssr: false,
    loading: () => (
        <div className="h-full w-full flex items-center justify-center bg-[#1e293b]/90 text-sky-400">
            <Loader2 className="animate-spin" size={24} />
        </div>
    )
});

// Default Mock Stickers (Replace image URLs with your CDN links)
const DEFAULT_STICKERS = [
    { id: '1', name: 'Pepe Happy', url: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png' },
    { id: '2', name: 'Cat Vibe', url: 'https://cdn-icons-png.flaticon.com/512/4712/4712027.png' },
    { id: '3', name: 'Cool Doge', url: 'https://cdn-icons-png.flaticon.com/512/4712/4712009.png' },
    { id: '4', name: 'Fire', url: 'https://cdn-icons-png.flaticon.com/512/4712/4712040.png' },
    { id: '5', name: 'Mind Blown', url: 'https://cdn-icons-png.flaticon.com/512/4712/4712038.png' },
];

export default function ChatInput({ onSendMessage, disabled, token, replyingTo, onCancelReply, onTyping }) {
    const [text, setText] = useState('');
    
    // Voice Recording & Drag States
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    
    // UI/UX States
    const [isLocked, setIsLocked] = useState(false);
    const [isPressing, setIsPressing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const pressTimer = useRef(null);
    
    // Attach Menu & Poll State
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showHymnsBiblePicker, setShowHymnsBiblePicker] = useState(null);
    const [selectedHymnsBible, setSelectedHymnsBible] = useState([]);
    const [showPollModal, setShowPollModal] = useState(false);
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState(['', '']);
    const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(false);

    // Emoji & Sticker State
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [pickerTab, setPickerTab] = useState('emoji'); // 'emoji' or 'sticker'
    const [stickers, setStickers] = useState(DEFAULT_STICKERS);
    const [stickerSearch, setStickerSearch] = useState('');

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);
    const audioPreviewRef = useRef(null);
    const cancelRecordingRef = useRef(false);
    const attachMenuRef = useRef(null);
    const emojiMenuRef = useRef(null);
    const imageInputRef = useRef(null);
    const stickerInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingTimerRef = useRef(null);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
                setShowAttachMenu(false);
            }
            if (emojiMenuRef.current && !emojiMenuRef.current.contains(event.target)) {
                setShowEmojiPicker(false);
                setShowHymnsBiblePicker(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => () => {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        onTyping?.(false);
    }, [onTyping]);

    const handleTextChange = (event) => {
        setText(event.target.value);
        onTyping?.(Boolean(event.target.value.trim()));
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        if (event.target.value.trim()) {
            typingTimerRef.current = setTimeout(() => onTyping?.(false), 1800);
        }
    };

    const stopTyping = () => {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        onTyping?.(false);
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    const handleSubmit = (e) => {
        e?.preventDefault();
        if (selectedHymnsBible.length > 0) {
            onSendMessage(text, 'hymns_bible', null, null, null, null, { items: selectedHymnsBible });
            setSelectedHymnsBible([]);
            setText('');
            onCancelReply?.();
            setShowAttachMenu(false);
            setShowEmojiPicker(false);
            setShowHymnsBiblePicker(null);
        } else if (text.trim() && !isUploading && !isRecording) {
            onSendMessage(text, 'text');
            setText('');
            onCancelReply?.();
            setShowAttachMenu(false);
            setShowEmojiPicker(false);
        }
    };

    // --- Emoji & Sticker Handlers ---
    const handleEmojiClick = (emojiData) => {
        setText((prev) => prev + emojiData.emoji);
    };

    const handleSendSticker = (stickerUrl) => {
        onSendMessage('', 'sticker', stickerUrl);
        setShowEmojiPicker(false);
    };

    const handleAddCustomSticker = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;

        const stickerUrl = URL.createObjectURL(file);
        const newSticker = {
            id: Date.now().toString(),
            name: file.name,
            url: stickerUrl
        };
        setStickers((prev) => [newSticker, ...prev]);
        try {
            const res = await axios.post(`${getApiBaseUrl()}/chat/upload-url`,
                { fileSize: file.size, type: 'sticker', mimeType: file.type, fileName: file.name },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await axios.put(res.data.uploadUrl, file, { headers: { 'Content-Type': file.type } });
            setStickers((prev) => prev.map(sticker => sticker.id === newSticker.id ? { ...sticker, url: res.data.fileUrl } : sticker));
            URL.revokeObjectURL(stickerUrl);
        } catch (err) {
            console.error("Sticker upload failed:", err);
            setStickers((prev) => prev.filter(sticker => sticker.id !== newSticker.id));
        }
        if (e.target) e.target.value = '';
    };

    // --- Audio Logic ---
    const startRecording = async () => { 
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                if (audioBlob.size > 0 && !cancelRecordingRef.current) {
                     await handleUploadAudio(audioBlob);
                }
                resetRecordingState();
            };

            cancelRecordingRef.current = false;
            mediaRecorder.start();
            setIsRecording(true);
            setIsPaused(false);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error("Microphone error:", err);
            alert("Could not access microphone.");
        }
    };

    const resetRecordingState = () => {
        setIsRecording(false);
        setIsPaused(false);
        setRecordingTime(0);
        setIsLocked(false);
        setIsPressing(false);
        setDragOffset({ x: 0, y: 0 });
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            cancelRecordingRef.current = true;
            mediaRecorderRef.current.stop();
        }
        resetRecordingState();
    };

    const stopAndSendRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
        }
    };

    const togglePauseResume = () => {
        if (!mediaRecorderRef.current) return;
        if (isPaused) {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } else {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            clearInterval(timerRef.current);
            mediaRecorderRef.current.requestData(); 
        }
    };

    const playPreview = () => {
        if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            if (audioPreviewRef.current) {
                audioPreviewRef.current.src = url;
                audioPreviewRef.current.play();
            }
        }
    };

    const handleUploadAudio = (blob) => {
        if (!token) return;
        const localUrl = URL.createObjectURL(blob);

        const uploadFn = async () => {
            setIsUploading(true);
            try {
                const res = await axios.post(`${getApiBaseUrl()}/chat/upload-url`, 
                    { fileSize: blob.size, type: 'audio' },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const { uploadUrl, fileUrl } = res.data;
                await axios.put(uploadUrl, blob, { headers: { 'Content-Type': blob.type } });
                return fileUrl;
            } catch (err) {
                console.error("Audio upload failed:", err);
                alert("Failed to upload audio message.");
                throw err;
            } finally {
                setIsUploading(false);
            }
        };

        onSendMessage('', 'audio', null, null, localUrl, uploadFn);
    };

    // --- Pointer Events ---
    const handlePointerDown = (e) => {
        if (disabled || isUploading) return;
        if (e.currentTarget.setPointerCapture) {
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        startPos.current = { x: e.clientX, y: e.clientY };
        setIsPressing(true);
        setIsLocked(false);
        setDragOffset({ x: 0, y: 0 });
        pressTimer.current = Date.now();
        startRecording();
    };

    const handlePointerMove = (e) => {
        if (!isPressing || isLocked) return;
        const deltaX = e.clientX - startPos.current.x;
        const deltaY = e.clientY - startPos.current.y;
        setDragOffset({ x: deltaX, y: deltaY });

        if (deltaY < -60) {
            setIsLocked(true);
            setIsPressing(false);
            setDragOffset({ x: 0, y: 0 });
            if (e.currentTarget.releasePointerCapture) e.currentTarget.releasePointerCapture(e.pointerId);
        } else if (deltaX < -100) {
            cancelRecording();
            if (e.currentTarget.releasePointerCapture) e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    const handlePointerUp = (e) => {
        if (!isPressing) return;
        if (e.currentTarget.releasePointerCapture) e.currentTarget.releasePointerCapture(e.pointerId);
        const pressDuration = Date.now() - (pressTimer.current || 0);
        
        if (pressDuration < 300) {
            setIsLocked(true);
            setIsPressing(false);
        } else {
            stopAndSendRecording();
        }
    };

    // --- Image Upload ---
    const triggerImageUpload = () => {
        if (imageInputRef.current) imageInputRef.current.click();
        setShowAttachMenu(false);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;
        const localUrl = URL.createObjectURL(file);
        
        const uploadFn = async () => {
            try {
                const res = await axios.post(`${getApiBaseUrl()}/chat/upload-url`,
                    { fileSize: file.size, type: 'file', mimeType: file.type, fileName: file.name },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                await axios.put(res.data.uploadUrl, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
                return res.data.fileUrl;
            } catch (err) {
                console.error("File upload failed:", err);
                alert("Failed to upload file.");
                throw err;
            }
        };

        onSendMessage('', 'file', null, null, localUrl, uploadFn, {
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream'
        });
        if (e.target) e.target.value = '';
    };

    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;
        
        const localUrl = URL.createObjectURL(file);

        const uploadFn = async () => {
            try {
                const imageBitmap = await createImageBitmap(file);
                const canvas = document.createElement('canvas');
                
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                let width = imageBitmap.width;
                let height = imageBitmap.height;
                
                if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                    const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imageBitmap, 0, 0, width, height);
                
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
                if (!blob) throw new Error("Image compression failed");

                const res = await axios.post(`${getApiBaseUrl()}/chat/upload-url`, 
                    { fileSize: blob.size, type: 'image' },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const { uploadUrl, fileUrl } = res.data;
                await axios.put(uploadUrl, blob, { headers: { 'Content-Type': blob.type } });
                return fileUrl;
            } catch (uploadErr) {
                console.error("Image upload failed:", uploadErr);
                alert("Failed to upload image.");
                throw uploadErr;
            }
        };

        onSendMessage('', 'image', null, null, localUrl, uploadFn);
        if (e.target) e.target.value = '';
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // --- Poll Functions ---
    const handleAddPollOption = () => {
        if (pollOptions.length < 6) setPollOptions([...pollOptions, '']);
    };

    const handleSendPoll = () => {
        const validOptions = pollOptions.filter(opt => opt.trim() !== '');
        if (pollQuestion.trim() && validOptions.length >= 2) {
            const pollData = {
                question: pollQuestion,
                allowMultipleAnswers: allowMultipleAnswers,
                options: validOptions.map((opt, index) => ({ id: index, text: opt, votes: [] }))
            };
            onSendMessage('', 'poll', null, pollData);
            setShowPollModal(false);
            setPollQuestion('');
            setPollOptions(['', '']);
            setAllowMultipleAnswers(false); 
        }
    };

    const filteredStickers = stickers.filter(s => s.name.toLowerCase().includes(stickerSearch.toLowerCase()));


    return (
        <div className="bg-[#0d1322] p-2.5 md:p-3 border-t border-slate-800/80 shrink-0 relative">
            <audio ref={audioPreviewRef} className="hidden" />

            {replyingTo && (
                <div className="mx-auto mb-2 flex max-w-4xl items-center gap-2 rounded-xl border border-sky-500/30 bg-[#131b2e] px-3 py-2 shadow-sm">
                    <div className="flex h-8 w-1 shrink-0 rounded-full bg-sky-400" />
                    <CornerUpLeft size={16} className="shrink-0 text-sky-400" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-sky-400">
                            Replying to {replyingTo.senderName || 'Member'}
                        </p>
                        <p className="truncate text-xs text-slate-300">
                            {replyingTo.type === 'audio' ? 'Audio message' :
                                replyingTo.type === 'image' ? 'Photo' :
                                    ['file', 'document'].includes(replyingTo.type) ? 'File' :
                                        replyingTo.text || 'Message'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancelReply}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                        aria-label="Cancel reply"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {selectedHymnsBible.length > 0 && (
                <div className="mx-auto mb-2 flex max-w-4xl items-center gap-2 rounded-xl border border-orange-500/30 bg-[#131b2e] px-3 py-2 shadow-sm flex-wrap">
                    <div className="flex h-8 w-1 shrink-0 rounded-full bg-orange-400" />
                    <Music size={16} className="shrink-0 text-orange-400" />
                    <div className="min-w-0 flex-1 flex gap-2 flex-wrap max-h-24 overflow-y-auto custom-scrollbar py-1">
                        {selectedHymnsBible.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1 bg-slate-800 rounded-md px-2 py-1">
                                <span className="text-[11px] font-semibold text-white">{item.title || item.bookName} {item.chapter || ''}</span>
                                <X size={12} className="cursor-pointer hover:text-rose-400" onClick={() => setSelectedHymnsBible(prev => prev.filter((_, i) => i !== idx))} />
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelectedHymnsBible([])}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
            
            <div className="max-w-4xl mx-auto flex items-end gap-2 relative">
                
                {isLocked ? (
                    /* Locked Voice UI */
                    <div className="flex-1 bg-[#131b2e] rounded-2xl flex items-center justify-between px-3 sm:px-4 py-2 border border-slate-700/60 shadow-lg">
                        <button type="button" onClick={cancelRecording} className="text-slate-400 hover:text-rose-400 p-2 transition-colors rounded-full hover:bg-slate-800" title="Delete recording">
                            <Trash2 size={18} />
                        </button>
                        
                        <div className="flex-1 flex items-center justify-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${!isPaused ? 'bg-rose-500 animate-pulse' : 'bg-slate-500'}`} />
                            <span className="text-white font-mono text-xs font-semibold">{formatTime(recordingTime)}</span>
                            <div className="hidden sm:flex items-center gap-1 opacity-70">
                                {[1,3,5,2,4,6,3,5,2,4,1].map((h, i) => (
                                    <div key={i} className="w-1 bg-sky-400 rounded-full animate-pulse" style={{ height: `${h * 4}px`, animationDelay: `${i * 100}ms` }} />
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2">
                            {isPaused && (
                                <button type="button" onClick={playPreview} className="w-9 h-9 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 flex items-center justify-center text-emerald-400 transition-colors">
                                    <Play size={16} fill="currentColor" className="ml-0.5" />
                                </button>
                            )}
                            <button type="button" onClick={togglePauseResume} className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-sky-400 transition-colors">
                                {isPaused ? <Mic size={16} /> : <Pause size={16} fill="currentColor" />}
                            </button>
                            <button type="button" onClick={stopAndSendRecording} className="w-9 h-9 bg-sky-600 text-white rounded-full flex items-center justify-center hover:bg-sky-500 shadow-md shadow-sky-600/30 transition-transform active:scale-95">
                                <Send size={16} className="ml-0.5" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Attach Plus Button & Popup */}
                        <div className="relative shrink-0" ref={attachMenuRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAttachMenu(!showAttachMenu);
                                    setShowEmojiPicker(false);
                                    setShowHymnsBiblePicker(null);
                                }}
                                className={`p-2.5 rounded-xl transition-colors ${showAttachMenu ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30' : 'text-slate-400 hover:text-sky-400 hover:bg-slate-800'}`}
                                disabled={isUploading || isPressing}
                            >
                                <Plus size={20} />
                            </button>

                            {showAttachMenu && (
                                <div className="absolute bottom-14 left-0 bg-[#131b2e] border border-slate-700/70 rounded-2xl p-2.5 shadow-2xl flex gap-3 z-50">
                                    <div onClick={() => { setShowHymnsBiblePicker('hymns'); setShowAttachMenu(false); }} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-slate-800 transition-colors">
                                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                            <Music size={20} />
                                        </div>
                                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">Hymns</span>
                                    </div>
                                    <div onClick={() => { setShowHymnsBiblePicker('bible'); setShowAttachMenu(false); }} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-slate-800 transition-colors">
                                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                            <BookOpen size={20} />
                                        </div>
                                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">Bible</span>
                                    </div>
                                    <div onClick={() => { setShowPollModal(true); setShowAttachMenu(false); }} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-slate-800 transition-colors">
                                        <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors">
                                            <BarChart2 size={20} />
                                        </div>
                                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">Poll</span>
                                    </div>
                                    <div onClick={triggerImageUpload} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-slate-800 transition-colors">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                            <ImageIcon size={20} />
                                        </div>
                                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">Image</span>
                                    </div>
                                    <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-slate-800 transition-colors">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                            <FileText size={20} />
                                        </div>
                                        <span className="text-[11px] font-semibold text-slate-300 group-hover:text-white">File</span>
                                    </div>
                                </div>
                            )}
                            
                            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />
                            <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,audio/*" className="hidden" onChange={handleFileSelect} />
                        </div>

                        {/* Input Container */}
                        <div className="flex-1 relative flex flex-col" ref={emojiMenuRef}>
                            
                            {/* Hymns & Bible Drawer */}
                            {showHymnsBiblePicker && (
                                <HymnsBiblePicker 
                                    type={showHymnsBiblePicker}
                                    onSelect={(item) => {
                                        setSelectedHymnsBible(prev => [...prev, item]);
                                    }}
                                    onClose={() => setShowHymnsBiblePicker(null)}
                                />
                            )}

                            {/* Emoji & Sticker Drawer */}
                            {showEmojiPicker && (
                                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-[calc(100vw-2rem)] sm:w-[350px] max-w-[350px] h-[60vh] max-h-[420px] min-h-[300px] bg-[#131b2e] border border-slate-700/70 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
                                    
                                    {/* Tabs */}
                                    <div className="flex border-b border-slate-800 bg-[#0d1322] p-1.5 shrink-0 gap-1">
                                        <button 
                                            onClick={() => setPickerTab('emoji')} 
                                            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex justify-center items-center gap-1.5 transition-colors ${pickerTab === 'emoji' ? 'bg-sky-600/30 text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                        >
                                            <Smile size={15} /> Emojis
                                        </button>
                                        <button 
                                            onClick={() => setPickerTab('sticker')} 
                                            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex justify-center items-center gap-1.5 transition-colors ${pickerTab === 'sticker' ? 'bg-sky-600/30 text-sky-400 border border-sky-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                        >
                                            <Sticker size={15} /> Stickers
                                        </button>
                                    </div>
                                    
                                    {/* Tab 1: Emoji Picker */}
                                    {pickerTab === 'emoji' && (
                                        <div className="flex-1 w-full h-full custom-emoji-picker-container overflow-hidden">
                                            <style jsx global>{`
                                                .custom-emoji-picker-container .EmojiPickerReact {
                                                    --epr-bg-color: transparent !important;
                                                    --epr-category-label-bg-color: #131b2e !important;
                                                    --epr-picker-border-color: transparent !important;
                                                    --epr-[#1e293b]-color: #131b2e !important;
                                                    --epr-search-input-bg-color: #0d1322 !important;
                                                    --epr-search-input-bg-color-active: #0d1322 !important;
                                                    --epr-search-input-[#1e293b]-color: #ffffff !important;
                                                    --epr-search-input-border-color: rgba(255, 255, 255, 0.1) !important;
                                                    --epr-hover-bg-color: rgba(255, 255, 255, 0.08) !important;
                                                    --epr-focus-bg-color: rgba(255, 255, 255, 0.12) !important;
                                                    font-family: inherit !important;
                                                }
                                                .custom-emoji-picker-container .EmojiPickerReact .epr-search-container input {
                                                    color: #fff !important;
                                                    border-radius: 10px !important;
                                                    font-size: 12px !important;
                                                }
                                            `}</style>
                                            <EmojiPicker 
                                                onEmojiClick={handleEmojiClick}
                                                theme="dark"
                                                width="100%"
                                                height="100%"
                                                lazyLoadEmojis={true}
                                                searchPlaceHolder="Search emoji..."
                                                previewConfig={{ showPreview: false }}
                                                skinTonesDisabled={false}
                                            />
                                        </div>
                                    )}

                                    {/* Tab 2: Stickers */}
                                    {pickerTab === 'sticker' && (
                                        <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden bg-[#131b2e]">
                                            {/* Search & Add Sticker Bar */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="flex-1 relative">
                                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input 
                                                        type="text"
                                                        value={stickerSearch}
                                                        onChange={(e) => setStickerSearch(e.target.value)}
                                                        placeholder="Search stickers..."
                                                        className="w-full bg-[#0d1322] text-white text-xs pl-8 pr-3 py-1.5 rounded-xl border border-slate-700/60 focus:outline-none focus:border-sky-500/70"
                                                    />
                                                </div>
                                                <button 
                                                    onClick={() => stickerInputRef.current?.click()}
                                                    className="p-1.5 px-2 bg-sky-600/20 text-sky-400 border border-sky-500/30 rounded-xl hover:bg-sky-600 hover:text-white transition-colors flex items-center gap-1 text-xs font-semibold shrink-0"
                                                    title="Add custom sticker"
                                                >
                                                    <Upload size={13} /> Add
                                                </button>
                                                <input 
                                                    type="file" 
                                                    ref={stickerInputRef} 
                                                    accept="image/png, image/webp, image/gif" 
                                                    className="hidden" 
                                                    onChange={handleAddCustomSticker} 
                                                />
                                            </div>

                                            {/* Sticker Grid */}
                                            <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-2.5 pr-1 custom-scrollbar">
                                                {filteredStickers.map((sticker) => (
                                                    <button
                                                        key={sticker.id}
                                                        onClick={() => handleSendSticker(sticker.url)}
                                                        className="aspect-square p-2 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 hover:border-sky-500/50 rounded-xl flex items-center justify-center transition-colors group"
                                                    >
                                                        <img 
                                                            src={sticker.url} 
                                                            alt={sticker.name} 
                                                            className="w-full h-full object-contain drop-shadow-md" 
                                                        />
                                                    </button>
                                                ))}
                                                {filteredStickers.length === 0 && (
                                                    <div className="col-span-3 h-full flex items-center justify-center text-slate-500 text-xs">
                                                        No stickers found.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* Textarea Form Box */}
                            <form 
                                onSubmit={handleSubmit} 
                                className="flex-1 relative bg-[#131b2e] rounded-2xl border border-slate-700/60 focus-within:border-sky-500/70 transition-colors flex items-center px-3 sm:px-4 py-1"
                            >
                                {!isPressing && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowEmojiPicker(!showEmojiPicker);
                                            setShowAttachMenu(false);
                                            setShowHymnsBiblePicker(null);
                                        }}
                                        className={`p-1.5 shrink-0 transition-colors rounded-lg mr-1 ${showEmojiPicker ? 'text-sky-400 bg-sky-500/10' : 'text-slate-400 hover:text-sky-400 hover:bg-slate-800'}`}
                                    >
                                        <Smile size={20} />
                                    </button>
                                )}

                                <textarea
                                    value={text}
                                    onChange={handleTextChange}
                                    onBlur={stopTyping}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                    placeholder="Type a message..."
                                    dir="auto"
                                    className="w-full bg-transparent text-slate-100 text-xs sm:text-sm py-2 focus:outline-none resize-none max-h-32 custom-scrollbar leading-relaxed placeholder:text-slate-400 tracking-wide"
                                    rows={1}
                                    disabled={isUploading || isPressing}
                                    style={{ direction: 'auto', unicodeBidi: 'plaintext' }}
                                />

                                {/* Audio Recording Overlay */}
                                {isPressing && (
                                    <div className="absolute inset-0 bg-[#131b2e] rounded-2xl flex items-center justify-between px-4 z-10 pointer-events-none overflow-hidden border border-sky-500/40">
                                        <div 
                                            className="flex items-center text-slate-400 gap-2 whitespace-nowrap"
                                            style={{ transform: `translateX(${Math.min(0, dragOffset.x)}px)`, opacity: 1 - Math.abs(dragOffset.x)/100 }}
                                        >
                                            <ChevronLeft size={18} className="animate-pulse text-sky-400" />
                                            <span className="text-xs font-semibold text-slate-300">Slide left to cancel</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mr-6">
                                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                                            <span className="text-white font-mono text-xs font-semibold">{formatTime(recordingTime)}</span>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                    </>
                )}

                {/* Right Action Button */}
                {!isLocked && (
                    <div className="relative shrink-0">
                        {(text.trim() || selectedHymnsBible.length > 0) && !isRecording ? (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isUploading}
                                className="p-2.5 rounded-xl flex items-center justify-center transition-colors bg-sky-600 text-white hover:bg-sky-500 shadow-md shadow-sky-600/30 active:scale-95"
                            >
                                {isUploading ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} className="ml-0.5" />}
                            </button>
                        ) : (
                            <div className="relative flex items-center justify-center">
                                {isPressing && (
                                    <div 
                                        className="absolute -top-16 flex flex-col items-center gap-1 pointer-events-none"
                                        style={{ transform: `translateY(${Math.min(0, dragOffset.y)}px)`, opacity: 1 - Math.abs(dragOffset.y)/60 }}
                                    >
                                        <div className="bg-[#131b2e] p-2 rounded-full border border-sky-500/40 shadow-xl text-sky-400">
                                            <Lock size={15} />
                                        </div>
                                        <ChevronUp size={15} className="text-sky-400 animate-pulse" />
                                    </div>
                                )}
                                
                                <button
                                    type="button"
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                    title="Hold to record, tap to lock"
                                    className={`p-2.5 rounded-xl transition-colors shrink-0 select-none ${
                                        isPressing 
                                            ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30 z-20' 
                                            : 'text-slate-400 hover:text-sky-400 hover:bg-slate-800'
                                    }`}
                                    disabled={disabled || isUploading}
                                    style={{ touchAction: 'none' }} 
                                >
                                    <Mic size={20} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Poll Modal */}
            {showPollModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
                    <div className="bg-[#131b2e] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-700/70">
                        <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-[#0d1322]">
                            <h3 className="text-slate-100 font-bold text-sm">Create Poll</h3>
                            <button onClick={() => setShowPollModal(false)} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                                <X size={17} />
                            </button>
                        </div>
                        
                        <div className="p-4 space-y-3.5">
                            <div>
                                <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Question</label>
                                <input 
                                    type="text" 
                                    value={pollQuestion}
                                    onChange={(e) => setPollQuestion(e.target.value)}
                                    placeholder="Ask a question..."
                                    dir="auto"
                                    className="w-full bg-[#0d1322] text-white border border-slate-700/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sky-500/70 transition-colors"
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-semibold text-slate-400 block">Options</label>
                                {pollOptions.map((opt, i) => (
                                    <input 
                                        key={i}
                                        type="text" 
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...pollOptions];
                                            newOpts[i] = e.target.value;
                                            setPollOptions(newOpts);
                                        }}
                                        placeholder={`Option ${i + 1}`}
                                        dir="auto"
                                        className="w-full bg-[#0d1322] text-white border border-slate-700/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-sky-500/70 transition-colors"
                                    />
                                ))}
                                {pollOptions.length < 6 && (
                                    <button 
                                        onClick={handleAddPollOption}
                                        className="text-sky-400 text-xs font-semibold hover:text-sky-300 py-1 flex items-center gap-1 transition-colors"
                                    >
                                        <Plus size={14} /> Add Option
                                    </button>
                                )}
                            </div>

                            <div className="pt-2 border-t border-slate-800">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className="relative flex items-center justify-center">
                                        <input 
                                            type="checkbox"
                                            checked={allowMultipleAnswers}
                                            onChange={(e) => setAllowMultipleAnswers(e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                            allowMultipleAnswers 
                                                ? 'bg-sky-600 border-sky-600' 
                                                : 'border-slate-600 group-hover:border-sky-400 bg-transparent'
                                        }`}>
                                            {allowMultipleAnswers && <CheckSquare size={12} className="text-white" />}
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
                                        Allow multiple answers
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="p-3 border-t border-slate-800 bg-[#0d1322] flex justify-end gap-2">
                            <button 
                                onClick={() => setShowPollModal(false)}
                                className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSendPoll}
                                disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                                className="px-3.5 py-1.5 text-xs font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-500 transition-colors shadow-md shadow-sky-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Send Poll
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}