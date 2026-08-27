'use client';
import React, { useState, useRef, useEffect } from 'react';
import { 
    Send, Mic, Square, Trash2, Loader2, Pause, Play, Plus, 
    BarChart2, X, CheckSquare, Image as ImageIcon, Lock, 
    ChevronUp, ChevronLeft 
} from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../../utils/apiBase';

export default function ChatInput({ onSendMessage, disabled, token }) {
    const [text, setText] = useState('');
    
    // Voice Recording & Drag States
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    
    // UI/UX States for WhatsApp feel
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

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);
    const audioPreviewRef = useRef(null);
    const cancelRecordingRef = useRef(false);
    const attachMenuRef = useRef(null);
    const imageInputRef = useRef(null);

    // Close attach menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
                setShowAttachMenu(false);
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
        }
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
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone. Please check permissions.");
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

    // --- Pointer Events (Drag & Lock UX) ---
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

        // Slide up to lock
        if (deltaY < -60) {
            setIsLocked(true);
            setIsPressing(false);
            setDragOffset({ x: 0, y: 0 });
            if (e.currentTarget.releasePointerCapture) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        } 
        // Slide left to cancel
        else if (deltaX < -100) {
            cancelRecording();
            if (e.currentTarget.releasePointerCapture) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        }
    };

    const handlePointerUp = (e) => {
        if (!isPressing) return;
        
        if (e.currentTarget.releasePointerCapture) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        
        const pressDuration = Date.now() - (pressTimer.current || 0);
        
        if (pressDuration < 300) {
            // Single quick tap => lock and show controls
            setIsLocked(true);
            setIsPressing(false);
        } else {
            // Held and released without locking => send automatic
            stopAndSendRecording();
        }
    };

    // --- Image Processing ---
    const triggerImageUpload = () => {
        if (imageInputRef.current) {
            imageInputRef.current.click();
        }
        setShowAttachMenu(false);
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
            console.error("Error processing image:", err);
            alert("Failed to process image.");
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
        if (pollOptions.length < 6) { 
            setPollOptions([...pollOptions, '']);
        }
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

    return (
        <div className="bg-[#0f172a] p-3 md:p-4 border-t border-white/10 shrink-0 relative">
            <audio ref={audioPreviewRef} className="hidden" />
            
            <div className="max-w-4xl mx-auto flex items-end gap-2 relative">
                
                {isLocked ? (
                    /* Locked UI (WhatsApp Style) */
                    <div className="flex-1 bg-[#1e293b] rounded-3xl flex items-center justify-between px-2 sm:px-4 py-2 border border-white/5 transition-all animate-in fade-in zoom-in duration-200">
                        <button type="button" onClick={cancelRecording} className="text-gray-400 hover:text-red-400 p-2 transition-colors rounded-full hover:bg-white/5" title="Delete recording">
                            <Trash2 size={20} />
                        </button>
                        
                        <div className="flex-1 flex items-center justify-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${!isPaused ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
                            <span className="text-white font-mono text-sm">{formatTime(recordingTime)}</span>
                            {/* Dummy waveform for aesthetics */}
                            <div className="hidden sm:flex items-center gap-1 opacity-60">
                                {[1,2,3,4,3,2,1,2,3,2,1].map((h, i) => (
                                    <div key={i} className="w-1 bg-sky-400 rounded-full" style={{ height: `${h * 4}px` }} />
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2">
                            {isPaused && (
                                <button type="button" onClick={playPreview} className="w-10 h-10 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center text-emerald-400 transition-colors">
                                    <Play size={18} fill="currentColor" className="ml-1" />
                                </button>
                            )}
                            <button type="button" onClick={togglePauseResume} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-400 transition-colors">
                                {isPaused ? <Mic size={18} /> : <Pause size={18} fill="currentColor" />}
                            </button>
                            <button type="button" onClick={stopAndSendRecording} className="w-10 h-10 bg-sky-500 text-white rounded-full flex items-center justify-center hover:bg-sky-600 shadow-lg transition-transform hover:scale-105">
                                <Send size={18} className="ml-1" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Attach Menu */}
                        <div className="relative shrink-0" ref={attachMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowAttachMenu(!showAttachMenu)}
                                className={`p-3 rounded-full transition-all duration-300 ${showAttachMenu ? 'bg-white/10 text-white rotate-45' : 'text-gray-400 hover:text-sky-400 hover:bg-white/5'}`}
                                disabled={isUploading || isPressing}
                            >
                                <Plus size={22} />
                            </button>

                            {showAttachMenu && (
                                <div className="absolute bottom-14 left-0 bg-[#1e293b] border border-white/10 rounded-2xl p-3 shadow-xl flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200 z-40">
                                    <div onClick={() => { setShowPollModal(true); setShowAttachMenu(false); }} className="flex flex-col items-center gap-2 cursor-pointer group">
                                        <div className="w-12 h-12 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:bg-sky-500 group-hover:text-white transition-all">
                                            <BarChart2 size={24} />
                                        </div>
                                        <span className="text-xs text-gray-300 group-hover:text-white transition-colors">Poll</span>
                                    </div>
                                    <div onClick={triggerImageUpload} className="flex flex-col items-center gap-2 cursor-pointer group">
                                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                            <ImageIcon size={24} />
                                        </div>
                                        <span className="text-xs text-gray-300 group-hover:text-white transition-colors">Image</span>
                                    </div>
                                </div>
                            )}
                            
                            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />
                        </div>

                        {/* Main Text Input area */}
                        <form onSubmit={handleSubmit} className="flex-1 relative bg-[#1e293b] rounded-3xl border border-white/5 focus-within:border-sky-500/50 transition-colors flex items-center px-4 py-1">
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
                                className="w-full bg-transparent text-white text-sm py-3 focus:outline-none resize-none max-h-32 custom-scrollbar"
                                rows={1}
                                disabled={isUploading || isPressing}
                            />

                            {/* Dragging Overlay (Slide to Cancel) covering input */}
                            {isPressing && (
                                <div className="absolute inset-0 bg-[#1e293b] rounded-3xl flex items-center justify-between px-4 z-10 pointer-events-none overflow-hidden">
                                    <div 
                                        className="flex items-center text-gray-400 gap-2 whitespace-nowrap"
                                        style={{ transform: `translateX(${Math.min(0, dragOffset.x)}px)`, opacity: 1 - Math.abs(dragOffset.x)/100 }}
                                    >
                                        <ChevronLeft size={20} className="animate-pulse" />
                                        <span className="text-sm font-medium">Slide to cancel</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 mr-6">
                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-white font-mono">{formatTime(recordingTime)}</span>
                                    </div>
                                </div>
                            )}
                        </form>
                    </>
                )}

                {/* Right Action Area: Text Send Button or Audio Mic Button */}
                {!isLocked && (
                    <div className="relative shrink-0">
                        {text.trim() && !isRecording ? (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isUploading}
                                className="p-3 rounded-full flex items-center justify-center transition-all bg-sky-500 text-white hover:bg-sky-600 shadow-lg"
                            >
                                {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-1" />}
                            </button>
                        ) : (
                            <div className="relative flex items-center justify-center">
                                {/* Slide up to lock indicator */}
                                {isPressing && (
                                    <div 
                                        className="absolute -top-20 flex flex-col items-center gap-2 transition-transform duration-75 pointer-events-none"
                                        style={{ transform: `translateY(${Math.min(0, dragOffset.y)}px)`, opacity: 1 - Math.abs(dragOffset.y)/60 }}
                                    >
                                        <div className="bg-[#1e293b] p-3 rounded-full border border-white/10 shadow-lg animate-bounce">
                                            <Lock size={16} className="text-gray-400" />
                                        </div>
                                        <ChevronUp size={16} className="text-gray-500 animate-pulse" />
                                    </div>
                                )}
                                
                                <button
                                    type="button"
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                    title="Record voice message"
                                    className={`p-3 rounded-full transition-all duration-200 shrink-0 select-none ${
                                        isPressing 
                                            ? 'bg-sky-500 text-white scale-125 shadow-xl shadow-sky-500/20 z-20' 
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

            {/* Poll Modal remains strictly unchanged */}
            {showPollModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-[#1e293b] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#0f172a]">
                            <h3 className="text-white font-medium">Create Poll</h3>
                            <button onClick={() => setShowPollModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Question</label>
                                <input 
                                    type="text" 
                                    value={pollQuestion}
                                    onChange={(e) => setPollQuestion(e.target.value)}
                                    placeholder="Ask a question..."
                                    className="w-full bg-[#0f172a] text-white border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-500/50 transition-colors"
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-gray-400 block">Options</label>
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
                                        className="w-full bg-[#0f172a] text-white border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-500/50 transition-colors"
                                    />
                                ))}
                                {pollOptions.length < 6 && (
                                    <button 
                                        onClick={handleAddPollOption}
                                        className="text-sky-400 text-sm font-medium hover:text-sky-300 py-1 flex items-center gap-1"
                                    >
                                        <Plus size={16} /> Add Option
                                    </button>
                                )}
                            </div>

                            <div className="pt-2 border-t border-white/5 mt-2">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className="relative flex items-center justify-center">
                                        <input 
                                            type="checkbox"
                                            checked={allowMultipleAnswers}
                                            onChange={(e) => setAllowMultipleAnswers(e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                            allowMultipleAnswers 
                                                ? 'bg-sky-500 border-sky-500' 
                                                : 'border-gray-500 group-hover:border-sky-400 bg-transparent'
                                        }`}>
                                            {allowMultipleAnswers && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                                        Allow multiple answers
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/5 bg-[#0f172a] flex justify-end gap-2">
                            <button 
                                onClick={() => setShowPollModal(false)}
                                className="px-4 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSendPoll}
                                disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                                className="px-4 py-2 text-sm bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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