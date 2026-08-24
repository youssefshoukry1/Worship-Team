'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Square, Trash2, Loader2, Pause, Play, Plus, BarChart2, X, CheckSquare } from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../../utils/apiBase';

export default function ChatInput({ onSendMessage, disabled, token }) {
    const [text, setText] = useState('');
    
    // Voice Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    
    // Attach Menu & Poll State
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState(['', '']);
    // الاستيت الجديدة بتاعة الاختيار المتعدد (الـ default فولس)
    const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(false);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);
    const audioPreviewRef = useRef(null);
    const cancelRecordingRef = useRef(false);
    const attachMenuRef = useRef(null);

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
        if (text.trim() && !disabled && !isUploading && !isRecording) {
            onSendMessage(text, 'text');
            setText('');
            setShowAttachMenu(false);
        }
    };

    // --- Audio Functions ---
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

    const handleUploadAudio = async (blob) => {
        if (!token) return;
        try {
            setIsUploading(true);
            const res = await axios.post(`${getApiBaseUrl()}/chat/upload-url`, 
                { fileSize: blob.size },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const { uploadUrl, fileUrl } = res.data;
            await axios.put(uploadUrl, blob, { headers: { 'Content-Type': blob.type } });
            onSendMessage('', 'audio', fileUrl);
        } catch (err) {
            console.error("Audio upload failed:", err);
            alert("Failed to upload audio message.");
        } finally {
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
                allowMultipleAnswers: allowMultipleAnswers, // ضفنا الداتا دي عشان تتبعت
                options: validOptions.map((opt, index) => ({ id: index, text: opt, votes: [] }))
            };
            onSendMessage(JSON.stringify(pollData), 'poll');
            // تصفير القيم بعد الإرسال
            setShowPollModal(false);
            setPollQuestion('');
            setPollOptions(['', '']);
            setAllowMultipleAnswers(false); 
        }
    };

    return (
        <div className="bg-[#0f172a] p-3 md:p-4 border-t border-white/10 shrink-0 relative">
            <audio ref={audioPreviewRef} className="hidden" />
            
            <div className="max-w-4xl mx-auto flex items-end gap-2">
                {isRecording ? (
                    <div className="flex-1 bg-[#1e293b] rounded-3xl flex items-center justify-between px-2 sm:px-4 py-2 border border-white/5 transition-all">
                        <button type="button" onClick={cancelRecording} className="text-gray-400 hover:text-red-400 p-2 transition-colors rounded-full hover:bg-white/5" title="Cancel recording">
                            <Trash2 size={20} />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${!isPaused ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
                            <span className="text-white font-mono text-sm">{formatTime(recordingTime)}</span>
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
                        {/* 1. زر الـ Attach (علامة +) */}
                        <div className="relative shrink-0" ref={attachMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowAttachMenu(!showAttachMenu)}
                                className={`p-3 rounded-full transition-all duration-300 ${showAttachMenu ? 'bg-white/10 text-white rotate-45' : 'text-gray-400 hover:text-sky-400 hover:bg-white/5'}`}
                                disabled={disabled || isUploading}
                            >
                                <Plus size={22} />
                            </button>

                            {/* 2. الـ Panel السريعة */}
                            {showAttachMenu && (
                                <div className="absolute bottom-14 left-0 bg-[#1e293b] border border-white/10 rounded-2xl p-3 shadow-xl flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200 z-40">
                                    <div 
                                        onClick={() => {
                                            setShowPollModal(true);
                                            setShowAttachMenu(false);
                                        }}
                                        className="flex flex-col items-center gap-2 cursor-pointer group"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:bg-sky-500 group-hover:text-white transition-all">
                                            <BarChart2 size={24} />
                                        </div>
                                        <span className="text-xs text-gray-300 group-hover:text-white transition-colors">Poll</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 bg-[#1e293b] rounded-3xl border border-white/5 focus-within:border-sky-500/50 transition-colors flex items-center px-4 py-1">
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
                                disabled={disabled || isUploading}
                            />
                        </form>

                        <button
                            type="button"
                            onClick={startRecording}
                            title="Record voice message"
                            className="p-3 text-gray-400 hover:text-sky-400 hover:bg-white/5 rounded-full transition-colors shrink-0"
                            disabled={disabled || isUploading}
                        >
                            <Mic size={22} />
                        </button>
                    </>
                )}

                {!isRecording && (
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={(!text.trim() && !isRecording) || disabled || isUploading}
                        className={`p-3 rounded-full shrink-0 flex items-center justify-center transition-all ${
                            text.trim() && !disabled && !isUploading
                                ? 'bg-sky-500 text-white hover:bg-sky-600 shadow-lg' 
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-1" />}
                    </button>
                )}
            </div>

            {/* 3. نافذة الـ Poll Modal */}
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

                            {/* التبديل بتاع الاختيار المتعدد ضفناه هنا */}
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