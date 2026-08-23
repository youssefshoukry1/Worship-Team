'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Square, Trash2, Loader2, Pause, Play } from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../../utils/apiBase';

export default function ChatInput({ onSendMessage, disabled, token }) {
    const [text, setText] = useState('');
    
    // Voice Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);
    const audioPreviewRef = useRef(null);
    const cancelRecordingRef = useRef(false);

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
        e.preventDefault();
        if (text.trim() && !disabled && !isUploading && !isRecording) {
            onSendMessage(text, 'text');
            setText('');
        }
    };

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
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
                
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                
                // If it was just a quick click/cancel, don't upload
                if (audioBlob.size > 0 && !cancelRecordingRef.current) {
                     await handleUploadAudio(audioBlob);
                }
                
                resetRecordingState();
            };

            cancelRecordingRef.current = false;
            mediaRecorder.start();
            setIsRecording(true);
            setIsPaused(false);
            
            // Start timer
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
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } else {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            clearInterval(timerRef.current);
            mediaRecorderRef.current.requestData(); // Get chunks so far for preview
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
            
            // 1. Get pre-signed URL from our backend
            const res = await axios.post(`${getApiBaseUrl()}/chat/upload-url`, 
                { fileSize: blob.size },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const { uploadUrl, fileUrl } = res.data;

            // 2. Upload directly to Cloudflare R2 via PUT
            await axios.put(uploadUrl, blob, {
                headers: {
                    'Content-Type': blob.type,
                }
            });

            // 3. Send socket message with the fileUrl
            onSendMessage('', 'audio', fileUrl);
            
        } catch (err) {
            console.error("Audio upload failed:", err);
            
            if (err.response && err.response.status === 403) {
                alert(err.response.data.message || "تم تجاوز الحد الأقصى لتسجيلات الصوت هذا الشهر وسيتم التحديث قريباً");
            } else {
                alert("Failed to upload audio message.");
            }
        } finally {
            setIsUploading(false);
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-[#0f172a] p-3 md:p-4 border-t border-white/10 shrink-0">
            <audio ref={audioPreviewRef} className="hidden" />
            
            <div className="max-w-4xl mx-auto flex items-end gap-2">
                {isRecording ? (
                    <div className="flex-1 bg-[#1e293b] rounded-3xl flex items-center justify-between px-2 sm:px-4 py-2 border border-white/5 transition-all">
                        {/* Delete Button */}
                        <button 
                            type="button" 
                            onClick={cancelRecording} 
                            className="text-gray-400 hover:text-red-400 p-2 transition-colors rounded-full hover:bg-white/5"
                            title="Cancel recording"
                        >
                            <Trash2 size={20} />
                        </button>

                        {/* Timer & Status */}
                        <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 rounded-full ${!isPaused ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
                            <span className="text-white font-mono text-sm">{formatTime(recordingTime)}</span>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1 sm:gap-2">
                            {/* Play Preview (only when paused) */}
                            {isPaused && (
                                <button 
                                    type="button"
                                    onClick={playPreview}
                                    title="Play preview"
                                    className="w-10 h-10 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center text-emerald-400 transition-colors"
                                >
                                    <Play size={18} fill="currentColor" className="ml-1" />
                                </button>
                            )}

                            {/* Pause/Resume Toggle */}
                            <button 
                                type="button"
                                onClick={togglePauseResume}
                                title={isPaused ? "Resume recording" : "Pause recording"}
                                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-400 transition-colors"
                            >
                                {isPaused ? <Mic size={18} /> : <Pause size={18} fill="currentColor" />}
                            </button>
                            
                            {/* Send Button */}
                            <button
                                type="button"
                                onClick={stopAndSendRecording}
                                title="Send voice message"
                                className="w-10 h-10 bg-sky-500 text-white rounded-full flex items-center justify-center hover:bg-sky-600 shadow-lg transition-transform hover:scale-105"
                            >
                                <Send size={18} className="ml-1" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={startRecording}
                            title="Record voice message"
                            className="p-3 text-gray-400 hover:text-sky-400 hover:bg-white/5 rounded-full transition-colors shrink-0"
                            disabled={disabled || isUploading}
                        >
                            <Mic size={22} />
                        </button>

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
                    </>
                )}

                {/* Send Button (Text) */}
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
        </div>
    );
}
