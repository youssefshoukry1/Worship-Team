import React from 'react';
import { Download, Loader2, CloudOff } from 'lucide-react';
import { useLocalMedia } from '../../hooks/useLocalMedia';

export default function ImageMessage({ msg }) {
    const { localUrl, loading, error, getRawBlob } = useLocalMedia(msg.mediaUrl, msg._id || msg.createdAt);

    const handleDownloadImage = async () => {
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

    // تم تصغير مساحة الـ Error وتعديل ألوانها
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
        // تقليل أقصى عرض وارتفاع للصورة لتكون ملمومة (Compact)
        <div className="relative group overflow-hidden rounded-xl mt-1 min-w-[100px] min-h-[100px] max-w-[180px] sm:max-w-[220px] bg-slate-800/50 flex items-center justify-center">
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
                        // تم تقليل max-h من 300 لـ 220 
                        className="w-full max-h-[220px] object-cover rounded-xl" 
                        loading="lazy" 
                    />
                    {/* تعديل لون الخلفية عند الـ Hover وتصغير الزرار للنعومة */}
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center rounded-xl">
                        <button 
                            onClick={handleDownloadImage} 
                            className="bg-indigo-500 hover:bg-indigo-600 text-white p-2 rounded-full shadow-lg transition-all duration-300 ease-out active:scale-95"
                            title="Download Image"
                        >
                            <Download size={16} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}