'use client';
import React, { useState, useRef } from 'react';
import { Download, FileText, FileImage, Music, FileVideo, Play, Pause, ExternalLink } from 'lucide-react';
import { useLocalMedia } from '../../hooks/useLocalMedia';

const CustomAudioPlayer = ({ src }) => {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const togglePlay = () => {
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleTimeUpdate = () => {
        setCurrentTime(audioRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
        setDuration(audioRef.current.duration);
    };

    const handleSeek = (e) => {
        const time = Number(e.target.value);
        audioRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const formatTime = (time) => {
        if (!time || isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    return (
        <div className="flex w-[280px] items-center gap-3 rounded-2xl border border-white/10 bg-black/10 p-3">
            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
            />
            
            <button
                onClick={togglePlay}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95"
            >
                {isPlaying ? (
                    <Pause size={18} fill="currentColor" />
                ) : (
                    <Play size={18} fill="currentColor" className="ml-1" />
                )}
            </button>

            <div className="flex flex-1 flex-col gap-1.5">
                <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] font-medium text-slate-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
        </div>
    );
};

export default function FileMessage({ msg }) {
    const { localUrl, loading, error } = useLocalMedia(msg.mediaUrl, msg._id || msg.createdAt);
    
    const isAudio = msg.mimeType?.startsWith('audio/');
    const isImage = msg.mimeType?.startsWith('image/');
    const isVideo = msg.mimeType?.startsWith('video/');
    // ضفنا تشييك عشان نعرف لو الملف PDF
    const isPdf = msg.mimeType?.includes('pdf'); 
    
    const Icon = isAudio ? Music : isImage ? FileImage : isVideo ? FileVideo : FileText;
    const name = msg.fileName || 'Shared file';
    const fileSrc = localUrl || msg.mediaUrl;

    if (error) return <div className="mt-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-400">File unavailable</div>;

    if (isImage) {
        return (
            <div className="mt-1 max-w-[280px] overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                <img src={fileSrc} alt={name} className="h-auto w-full object-cover" loading="lazy" />
            </div>
        );
    }

    if (isAudio) {
        return <div className="mt-1"><CustomAudioPlayer src={fileSrc} /></div>;
    }

    if (isVideo) {
        return (
            <div className="mt-1 max-w-[280px] overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                <video src={fileSrc} controls className="h-auto w-full object-cover" />
            </div>
        );
    }

    // بنغير الأيقونة اللي في الآخر حسب هو هيتفتح ولا هيتحمل
    const ActionIcon = isPdf ? ExternalLink : Download;

    return (
        <a
            href={fileSrc}
            // التعديل هنا: لو الملف PDF مش هنحط خاصية التحميل عشان يفتح في المتصفح، لو غير كدا هيتحمل عادي
            download={isPdf ? undefined : name} 
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex min-w-[190px] max-w-[280px] items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-2.5 transition-all hover:bg-white/10 active:scale-[.98]"
        >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-400">
                <Icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-100">{name}</span>
                <span className="text-[10px] text-slate-400">{loading ? 'Loading…' : msg.mimeType || 'Attachment'}</span>
            </span>
            <ActionIcon size={16} className="shrink-0 text-slate-400" />
        </a>
    );
}