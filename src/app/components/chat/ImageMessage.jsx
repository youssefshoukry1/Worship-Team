import React from 'react';
import { Download, Loader2, CloudOff } from 'lucide-react';
import { useLocalMedia } from '../../hooks/useLocalMedia';

export default function ImageMessage({ msg }) {
    const { localUrl, loading, error, getRawBlob } = useLocalMedia(msg.mediaUrl, msg._id || msg.createdAt);

    const handleDownloadImage = async () => {
        try {
            // Instant download from local storage blob to save bandwidth
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
            <div className="relative group overflow-hidden rounded-lg mt-1 border border-white/10 bg-black/40 p-4 max-w-[200px] sm:max-w-[250px] flex flex-col items-center justify-center text-center gap-2">
                <CloudOff className="text-gray-500" size={32} />
                <p className="text-[11px] text-gray-400">
                    File expired or deleted from server. Please restore from Backup.
                </p>
            </div>
        );
    }

    return (
        <div className="relative group overflow-hidden rounded-lg mt-1 min-w-[120px] min-h-[120px] max-w-[200px] sm:max-w-[250px] bg-black/20 flex items-center justify-center">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={24} className="text-sky-500 animate-spin" />
                </div>
            )}
            
            {localUrl && (
                <>
                    <img 
                        src={localUrl} 
                        alt="Chat image" 
                        className="w-full max-h-[300px] object-cover rounded-lg" 
                        loading="lazy" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                        <button 
                            onClick={handleDownloadImage} 
                            className="bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-full shadow-lg transition-transform hover:scale-105"
                            title="Download Image"
                        >
                            <Download size={20} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
