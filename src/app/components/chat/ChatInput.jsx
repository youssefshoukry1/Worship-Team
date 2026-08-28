'use client';
import React, { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { 
    Send, Mic, Square, Trash2, Loader2, Pause, Play, Plus, 
    BarChart2, X, CheckSquare, Image as ImageIcon, Lock, 
    ChevronUp, ChevronLeft, Smile, Sticker, Upload, Search, FileText
} from 'lucide-react';
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

export default function ChatInput({ onSendMessage, disabled, token }) {
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

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
                setShowAttachMenu(false);
            }
            if (emojiMenuRef.current && !emojiMenuRef.current.contains(event.target)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
        if (text.trim() && !isUploading && !isRecording) {
            onSendMessage(text, 'text');
            setText('');
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

    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;
        try {
            setIsUploading(true);
            const res = await axios.post(`${getApiBaseUrl()}/chat/upload-url`,
                { fileSize: file.size, type: 'file', mimeType: file.type, fileName: file.name },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await axios.put(res.data.uploadUrl, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
            const localUrl = URL.createObjectURL(file);
            onSendMessage('', 'file', res.data.fileUrl, null, localUrl, null, {
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream'
            });
        } catch (err) {
            console.error("File upload failed:", err);
            alert("Failed to upload file.");
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleImageSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;
        
        try {
            setIsUploading(true);
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
            
            canvas.toBlob((blob) => {
                if (!blob) {
                    setIsUploading(false);
                    return alert("Failed to compress image");
                }
                const localUrl = URL.createObjectURL(blob);

                const uploadFn = async () => {
                    try {
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
                    } finally {
                        setIsUploading(false);
                        if (e.target) e.target.value = ''; 
                    }
                };

                onSendMessage('', 'image', null, null, localUrl, uploadFn);
            }, 'image/webp', 0.8);
            
        } catch (err) {
            console.error("Image processing error:", err);
            setIsUploading(false);
        }
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
        <div className="bg-[#0f172a] p-3 md:p-4 border-t border-white/10 shrink-0 relative">
            <audio ref={audioPreviewRef} className="hidden" />
            
            <div className="max-w-4xl mx-auto flex items-end gap-2 relative">
                
                {isLocked ? (
                    /* Locked Voice UI */
                    <div className="flex-1 bg-[#1e293b] rounded-3xl flex items-center justify-between px-3 sm:px-4 py-2 border border-white/10 shadow-lg animate-in fade-in zoom-in duration-200">
                        <button type="button" onClick={cancelRecording} className="text-gray-400 hover:text-red-400 p-2 transition-colors rounded-full hover:bg-white/5" title="Delete recording">
                            <Trash2 size={20} />
                        </button>
                        
                        <div className="flex-1 flex items-center justify-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${!isPaused ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
                            <span className="text-white font-mono text-sm font-semibold">{formatTime(recordingTime)}</span>
                            <div className="hidden sm:flex items-center gap-1 opacity-70">
                                {[1,3,5,2,4,6,3,5,2,4,1].map((h, i) => (
                                    <div key={i} className="w-1 bg-sky-400 rounded-full animate-pulse" style={{ height: `${h * 4}px`, animationDelay: `${i * 100}ms` }} />
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2">
                            {isPaused && (
                                <button type="button" onClick={playPreview} className="w-10 h-10 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 flex items-center justify-center text-emerald-400 transition-colors">
                                    <Play size={18} fill="currentColor" className="ml-0.5" />
                                </button>
                            )}
                            <button type="button" onClick={togglePauseResume} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-sky-400 transition-colors">
                                {isPaused ? <Mic size={18} /> : <Pause size={18} fill="currentColor" />}
                            </button>
                            <button type="button" onClick={stopAndSendRecording} className="w-10 h-10 bg-sky-500 text-white rounded-full flex items-center justify-center hover:bg-sky-600 shadow-lg shadow-sky-500/25 transition-transform hover:scale-105">
                                <Send size={18} className="ml-0.5" />
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
                                }}
                                className={`p-3 rounded-full transition-all duration-300 ${showAttachMenu ? 'bg-sky-500 text-white rotate-45 shadow-lg shadow-sky-500/30' : 'text-gray-400 hover:text-sky-400 hover:bg-white/5'}`}
                                disabled={isUploading || isPressing}
                            >
                                <Plus size={22} />
                            </button>

                            {showAttachMenu && (
                                <div className="absolute bottom-16 left-0 bg-[#1e293b]/95 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-2xl flex gap-4 animate-in fade-in slide-in-from-bottom-3 duration-200 z-50">
                                    <div onClick={() => { setShowPollModal(true); setShowAttachMenu(false); }} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-white/5 transition-colors">
                                        <div className="w-11 h-11 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:bg-sky-500 group-hover:text-white transition-all shadow-inner">
                                            <BarChart2 size={22} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-300 group-hover:text-white">Poll</span>
                                    </div>
                                    <div onClick={triggerImageUpload} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-white/5 transition-colors">
                                        <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-inner">
                                            <ImageIcon size={22} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-300 group-hover:text-white">Image</span>
                                    </div>
                                    <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1.5 cursor-pointer group p-2 rounded-xl hover:bg-white/5 transition-colors">
                                        <div className="w-11 h-11 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center group-hover:bg-violet-500 group-hover:text-white transition-all shadow-inner">
                                            <FileText size={22} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-300 group-hover:text-white">File</span>
                                    </div>
                                </div>
                            )}
                            
                            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />
                            <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,audio/*" className="hidden" onChange={handleFileSelect} />
                        </div>

                        {/* Input Container */}
                        <div className="flex-1 relative flex flex-col" ref={emojiMenuRef}>
                            
                            {/* Emoji & Sticker Drawer (Responsive Centering & Sizing) */}
                            {showEmojiPicker && (
                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-[calc(100vw-2rem)] sm:w-[350px] max-w-[350px] h-[60vh] max-h-[430px] min-h-[300px] bg-[#1e293b]/95 backdrop-blur-md border border-white/15 rounded-3xl shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200 z-50 overflow-hidden">
                                    
                                    {/* Tabs */}
                                    <div className="flex border-b border-white/10 bg-[#0f172a]/80 p-1.5 shrink-0 gap-1">
                                        <button 
                                            onClick={() => setPickerTab('emoji')} 
                                            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex justify-center items-center gap-2 transition-all ${pickerTab === 'emoji' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                        >
                                            <Smile size={16} /> Emojis
                                        </button>
                                        <button 
                                            onClick={() => setPickerTab('sticker')} 
                                            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex justify-center items-center gap-2 transition-all ${pickerTab === 'sticker' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                        >
                                            <Sticker size={16} /> Stickers
                                        </button>
                                    </div>
                                    
                                    {/* Tab 1: Emoji Picker */}
                                    {pickerTab === 'emoji' && (
                                        <div className="flex-1 w-full h-full custom-emoji-picker-container overflow-hidden">
                                            <style jsx global>{`
                                                .custom-emoji-picker-container .EmojiPickerReact {
                                                    --epr-bg-color: transparent !important;
                                                    --epr-category-label-bg-color: #1e293b !important;
                                                    --epr-picker-border-color: transparent !important;
                                                    --epr-[#1e293b]-color: #1e293b !important;
                                                    --epr-search-input-bg-color: #0f172a !important;
                                                    --epr-search-input-bg-color-active: #0f172a !important;
                                                    --epr-search-input-[#1e293b]-color: #ffffff !important;
                                                    --epr-search-input-border-color: rgba(255, 255, 255, 0.1) !important;
                                                    --epr-hover-bg-color: rgba(255, 255, 255, 0.08) !important;
                                                    --epr-focus-bg-color: rgba(255, 255, 255, 0.12) !important;
                                                    font-family: inherit !important;
                                                }
                                                .custom-emoji-picker-container .EmojiPickerReact .epr-search-container input {
                                                    color: #fff !important;
                                                    border-radius: 12px !important;
                                                    font-size: 13px !important;
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

                                    {/* Tab 2: Stickers & Custom Sticker Add */}
                                    {pickerTab === 'sticker' && (
                                        <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden bg-[#1e293b]/60">
                                            {/* Search & Add Sticker Bar */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="flex-1 relative">
                                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input 
                                                        type="text"
                                                        value={stickerSearch}
                                                        onChange={(e) => setStickerSearch(e.target.value)}
                                                        placeholder="Search stickers..."
                                                        className="w-full bg-[#0f172a] text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-sky-500/50"
                                                    />
                                                </div>
                                                <button 
                                                    onClick={() => stickerInputRef.current?.click()}
                                                    className="p-2 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl hover:bg-sky-500 hover:text-white transition-all flex items-center gap-1 text-xs font-medium shrink-0"
                                                    title="Add custom sticker"
                                                >
                                                    <Upload size={14} /> Add
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
                                            <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-3 pr-1 custom-scrollbar">
                                                {filteredStickers.map((sticker) => (
                                                    <button
                                                        key={sticker.id}
                                                        onClick={() => handleSendSticker(sticker.url)}
                                                        className="aspect-square p-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-sky-500/40 rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 group"
                                                    >
                                                        <img 
                                                            src={sticker.url} 
                                                            alt={sticker.name} 
                                                            className="w-full h-full object-contain drop-shadow-md group-hover:drop-shadow-xl transition-all" 
                                                        />
                                                    </button>
                                                ))}
                                                {filteredStickers.length === 0 && (
                                                    <div className="col-span-3 h-full flex items-center justify-center text-gray-400 text-xs">
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
                                className="flex-1 relative bg-[#1e293b] rounded-3xl border border-white/10 focus-within:border-sky-500/50 focus-within:ring-1 focus-within:ring-sky-500/30 transition-all flex items-center px-3 sm:px-4 py-1.5 shadow-inner"
                            >
                                {!isPressing && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowEmojiPicker(!showEmojiPicker);
                                            setShowAttachMenu(false);
                                        }}
                                        className={`p-1.5 shrink-0 transition-all rounded-full mr-1.5 ${showEmojiPicker ? 'text-sky-400 bg-sky-500/10' : 'text-gray-400 hover:text-sky-400 hover:bg-white/5'}`}
                                    >
                                        <Smile size={22} />
                                    </button>
                                )}

                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                    placeholder="Type a message..."
                                    dir="auto"
                                    className="w-full bg-transparent text-white text-sm py-2.5 focus:outline-none resize-none max-h-32 custom-scrollbar leading-relaxed placeholder:text-gray-500 tracking-wide"
                                    rows={1}
                                    disabled={isUploading || isPressing}
                                    style={{ direction: 'auto', unicodeBidi: 'plaintext' }}
                                />

                                {/* Audio Recording Overlay */}
                                {isPressing && (
                                    <div className="absolute inset-0 bg-[#1e293b] rounded-3xl flex items-center justify-between px-4 z-10 pointer-events-none overflow-hidden border border-sky-500/30">
                                        <div 
                                            className="flex items-center text-gray-400 gap-2 whitespace-nowrap"
                                            style={{ transform: `translateX(${Math.min(0, dragOffset.x)}px)`, opacity: 1 - Math.abs(dragOffset.x)/100 }}
                                        >
                                            <ChevronLeft size={20} className="animate-pulse text-sky-400" />
                                            <span className="text-xs font-semibold text-gray-300">Slide left to cancel</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mr-6">
                                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                            <span className="text-white font-mono text-sm font-semibold">{formatTime(recordingTime)}</span>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                    </>
                )}

                {/* Right Action Button (Send Text vs Record Mic) */}
                {!isLocked && (
                    <div className="relative shrink-0">
                        {text.trim() && !isRecording ? (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isUploading}
                                className="p-3 rounded-full flex items-center justify-center transition-all bg-sky-500 text-white hover:bg-sky-600 shadow-lg shadow-sky-500/25 hover:scale-105 active:scale-95"
                            >
                                {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-0.5" />}
                            </button>
                        ) : (
                            <div className="relative flex items-center justify-center">
                                {isPressing && (
                                    <div 
                                        className="absolute -top-20 flex flex-col items-center gap-1 transition-transform duration-75 pointer-events-none"
                                        style={{ transform: `translateY(${Math.min(0, dragOffset.y)}px)`, opacity: 1 - Math.abs(dragOffset.y)/60 }}
                                    >
                                        <div className="bg-[#1e293b] p-2.5 rounded-full border border-sky-500/30 shadow-xl animate-bounce text-sky-400">
                                            <Lock size={16} />
                                        </div>
                                        <ChevronUp size={16} className="text-sky-400 animate-pulse" />
                                    </div>
                                )}
                                
                                <button
                                    type="button"
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                    title="Hold to record, tap to lock"
                                    className={`p-3 rounded-full transition-all duration-200 shrink-0 select-none ${
                                        isPressing 
                                            ? 'bg-sky-500 text-white scale-125 shadow-2xl shadow-sky-500/40 z-20' 
                                            : 'text-gray-400 hover:text-sky-400 hover:bg-white/5'
                                    }`}
                                    disabled={disabled || isUploading}
                                    style={{ touchAction: 'none' }} 
                                >
                                    <Mic size={isPressing ? 24 : 22} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Poll Modal */}
            {showPollModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-[#1e293b] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0f172a]">
                            <h3 className="text-white font-semibold text-sm">Create Poll</h3>
                            <button onClick={() => setShowPollModal(false)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/5">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs font-medium text-gray-400 mb-1.5 block">Question</label>
                                <input 
                                    type="text" 
                                    value={pollQuestion}
                                    onChange={(e) => setPollQuestion(e.target.value)}
                                    placeholder="Ask a question..."
                                    dir="auto"
                                    className="w-full bg-[#0f172a] text-white border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-sky-500/50 transition-colors"
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-400 block">Options</label>
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
                                        className="w-full bg-[#0f172a] text-white border border-white/10 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-sky-500/50 transition-colors"
                                    />
                                ))}
                                {pollOptions.length < 6 && (
                                    <button 
                                        onClick={handleAddPollOption}
                                        className="text-sky-400 text-xs font-semibold hover:text-sky-300 py-1 flex items-center gap-1 transition-colors"
                                    >
                                        <Plus size={15} /> Add Option
                                    </button>
                                )}
                            </div>

                            <div className="pt-2 border-t border-white/5">
                                <label className="flex items-center gap-2.5 cursor-pointer group">
                                    <div className="relative flex items-center justify-center">
                                        <input 
                                            type="checkbox"
                                            checked={allowMultipleAnswers}
                                            onChange={(e) => setAllowMultipleAnswers(e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                            allowMultipleAnswers 
                                                ? 'bg-sky-500 border-sky-500 shadow-sm shadow-sky-500/30' 
                                                : 'border-gray-500 group-hover:border-sky-400 bg-transparent'
                                        }`}>
                                            {allowMultipleAnswers && <CheckSquare size={13} className="text-white" />}
                                        </div>
                                    </div>
                                    <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
                                        Allow multiple answers
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/10 bg-[#0f172a] flex justify-end gap-2">
                            <button 
                                onClick={() => setShowPollModal(false)}
                                className="px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSendPoll}
                                disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                                className="px-4 py-2 text-xs font-semibold bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-all shadow-md shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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