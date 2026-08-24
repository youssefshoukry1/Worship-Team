import React, { useState, useEffect } from 'react';
import { X, Cloud, HardDrive, MessageSquare, Mic, Image as ImageIcon, Loader2 } from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../../utils/apiBase';

export default function BackupModal({ isOpen, onClose, token, userId, activeTeamId, socket }) {
    const [isLinked, setIsLinked] = useState(false);
    const [isLinking, setIsLinking] = useState(false);
    
    const [backupOptions, setBackupOptions] = useState({
        full: false,
        chat: true,
        voice: false,
        images: false
    });
    
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setProgress(0);
            setStatusText('');
            setIsBackingUp(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!socket || !userId) return;

        const eventName = `backup-progress-${userId}`;
        
        const handleProgress = (data) => {
            setProgress(data.progress);
            setStatusText(data.status);
            if (data.progress === 100 || data.status.startsWith('Error') || data.status.startsWith('Backup failed')) {
                setTimeout(() => setIsBackingUp(false), 2000); // Keep loading state for 2 seconds to show completion
            }
        };

        socket.on(eventName, handleProgress);
        return () => {
            socket.off(eventName, handleProgress);
        };
    }, [socket, userId]);

    useEffect(() => {
        const handleMessage = (e) => {
            if (e.data && e.data.type === 'GOOGLE_DRIVE_LINKED') {
                setIsLinked(true);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleLinkDrive = async () => {
        try {
            setIsLinking(true);
            const res = await axios.get(`${getApiBaseUrl()}/backup/auth-url`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.data.url) {
                window.open(res.data.url, '_blank');
            }
        } catch (err) {
            console.error("Failed to get Google Auth URL", err);
            alert("Could not initiate Google Drive link.");
        } finally {
            setIsLinking(false);
        }
    };

    const handleStartBackup = async () => {
        if (!isLinked) {
            return alert("Please link your Google Drive first.");
        }
        
        const hasOptions = backupOptions.full || backupOptions.chat || backupOptions.voice || backupOptions.images;
        if (!hasOptions) {
            return alert("Please select at least one backup option.");
        }

        try {
            setIsBackingUp(true);
            setProgress(0);
            setStatusText('Initiating backup...');
            
            await axios.post(`${getApiBaseUrl()}/backup/start`, {
                userId,
                teamId: activeTeamId,
                options: backupOptions
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
        } catch (err) {
            console.error("Failed to start backup", err);
            alert("Could not start backup process.");
            setIsBackingUp(false);
            setStatusText('');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#1e293b] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#0f172a]">
                    <div className="flex items-center gap-2">
                        <Cloud className="text-sky-400" size={20} />
                        <h3 className="text-white font-medium">Backup & Restore</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    {!isLinked ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-2">
                                <HardDrive size={32} className="text-gray-400" />
                            </div>
                            <div>
                                <h4 className="text-white font-medium mb-1">Link Google Drive</h4>
                                <p className="text-sm text-gray-400">Connect your Google account to securely backup your chat history, voice notes, and images.</p>
                            </div>
                            <button 
                                onClick={handleLinkDrive}
                                disabled={isLinking}
                                className="w-full py-2.5 bg-white text-gray-900 rounded-xl font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                            >
                                {isLinking ? <Loader2 size={18} className="animate-spin" /> : null}
                                {isLinking ? 'Linking...' : 'Connect Google Drive'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-gray-300">Select Backup Contents</h4>
                            
                            <div className="space-y-2">
                                <label className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Cloud size={18} className="text-sky-400" />
                                        <span className="text-sm text-white">Full Backup (Everything)</span>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        checked={backupOptions.full}
                                        onChange={(e) => setBackupOptions({ ...backupOptions, full: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 text-sky-500 focus:ring-sky-500 bg-transparent"
                                    />
                                </label>
                                
                                {!backupOptions.full && (
                                    <>
                                        <label className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/20 cursor-pointer hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <MessageSquare size={18} className="text-gray-400" />
                                                <span className="text-sm text-gray-300">Chat Messages (JSON)</span>
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={backupOptions.chat}
                                                onChange={(e) => setBackupOptions({ ...backupOptions, chat: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-600 text-sky-500 focus:ring-sky-500 bg-transparent"
                                            />
                                        </label>
                                        
                                        <label className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/20 cursor-pointer hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Mic size={18} className="text-gray-400" />
                                                <span className="text-sm text-gray-300">Voice Recordings</span>
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={backupOptions.voice}
                                                onChange={(e) => setBackupOptions({ ...backupOptions, voice: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-600 text-sky-500 focus:ring-sky-500 bg-transparent"
                                            />
                                        </label>

                                        <label className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/20 cursor-pointer hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <ImageIcon size={18} className="text-gray-400" />
                                                <span className="text-sm text-gray-300">Images</span>
                                            </div>
                                            <input 
                                                type="checkbox" 
                                                checked={backupOptions.images}
                                                onChange={(e) => setBackupOptions({ ...backupOptions, images: e.target.checked })}
                                                className="w-4 h-4 rounded border-gray-600 text-sky-500 focus:ring-sky-500 bg-transparent"
                                            />
                                        </label>
                                    </>
                                )}
                            </div>

                            {/* Progress Area */}
                            {isBackingUp && (
                                <div className="pt-4 border-t border-white/10 space-y-2">
                                    <div className="flex justify-between text-xs font-medium">
                                        <span className={statusText.startsWith('Error') ? 'text-red-400' : 'text-sky-400'}>{statusText}</span>
                                        <span className="text-gray-400">{progress}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-300 ${statusText.startsWith('Error') ? 'bg-red-500' : 'bg-sky-500'}`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <button 
                                onClick={handleStartBackup}
                                disabled={isBackingUp}
                                className="w-full mt-4 py-3 bg-sky-500 text-white rounded-xl font-medium hover:bg-sky-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isBackingUp && !statusText.startsWith('Error') ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Backing up...
                                    </>
                                ) : 'Start Backup'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
