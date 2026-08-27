import React, { useState, useEffect } from 'react';
import { Download, Loader2, CloudOff, X } from 'lucide-react';
import { useLocalMedia } from '../../hooks/useLocalMedia';

export default function ImageMessage({ msg }) {
    const { localUrl, loading, error, getRawBlob } = useLocalMedia(msg.mediaUrl, msg._id || msg.createdAt);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsFullscreen(false);
        };
        if (isFullscreen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    const handleDownloadImage = async (e) => {
        e?.stopPropagation();
        try {
            const blob = await getRawBlob();
            if (!blob) return alert("Could not fetch the local file to download.");
            
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `chat-image-${Date.now()}.webp`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error("Download failed:", err);
            alert("Failed to download image.");
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center text-center gap-1.5 p-3 mt-1 rounded-xl border border-slate-700/50 bg-slate-800/40 max-w-[160px] sm:max-w-[200px]">
                <CloudOff className="text-slate-500" size={24} />
                <p className="text-[10px] leading-tight text-slate-400">
                    File expired or deleted.
                </p>
            </div>
        );
    }

    return (
        <>
            <div 
                onClick={() => localUrl && setIsFullscreen(true)}
                className="relative group overflow-hidden rounded-xl mt-1 min-w-[100px] min-h-[100px] max-w-[180px] sm:max-w-[220px] bg-slate-800/50 flex items-center justify-center cursor-pointer select-none"
            >
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 size={20} className="text-indigo-400 animate-spin" />
                    </div>
                )}
                
                {localUrl && (
                    <>
                        <img 
                            src={localUrl} 
                            alt="Chat image" 
                            className="w-full max-h-[220px] object-cover rounded-xl transition-transform duration-300 group-hover:scale-105" 
                            loading="lazy" 
                        />
                        <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center rounded-xl">
                            <span className="text-xs font-medium text-white/90 bg-black/50 px-2.5 py-1 rounded-full backdrop-blur-sm">
                                Click to view
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Fullscreen WhatsApp-style Lightbox Modal */}
            {isFullscreen && localUrl && (
                <div 
                    className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-200"
                    onClick={() => setIsFullscreen(false)}
                >
                    {/* Top Control Bar */}
                    <div 
                        className="w-full p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-10 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col text-white">
                            <span className="text-sm font-semibold">{msg.senderName || 'Photo'}</span>
                            {msg.createdAt && (
                                <span className="text-xs text-gray-400">
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleDownloadImage}
                                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 flex items-center gap-1.5 px-3 text-xs font-medium"
                                title="Download Image"
                            >
                                <Download size={18} />
                                <span className="hidden sm:inline">Download</span>
                            </button>
                            <button
                                onClick={() => setIsFullscreen(false)}
                                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
                                title="Close (Esc)"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Main Image View */}
                    <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                        <img
                            src={localUrl}
                            alt="Full screen preview"
                            className="max-h-[85vh] max-w-[95vw] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 select-none"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Bottom Empty Spacer for balance */}
                    <div className="h-6 shrink-0" />
                </div>
            )}
        </>
    );
}