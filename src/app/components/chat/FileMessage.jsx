'use client';
import React from 'react';
import { Download, FileText, FileImage, Music } from 'lucide-react';
import { useLocalMedia } from '../../hooks/useLocalMedia';

export default function FileMessage({ msg }) {
    const { localUrl, loading, error } = useLocalMedia(msg.mediaUrl, msg._id || msg.createdAt);
    const isAudio = msg.mimeType?.startsWith('audio/');
    const isImage = msg.mimeType?.startsWith('image/');
    const Icon = isAudio ? Music : isImage ? FileImage : FileText;
    const name = msg.fileName || 'Shared file';

    if (error) return <div className="mt-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-400">File unavailable</div>;

    return (
        <a
            href={localUrl || msg.mediaUrl}
            download={name}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex min-w-[190px] max-w-[280px] items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-2.5 transition-all hover:bg-white/10 active:scale-[.98]"
        >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-300">
                <Icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-100">{name}</span>
                <span className="text-[10px] text-slate-400">{loading ? 'Loading…' : msg.mimeType || 'Attachment'}</span>
            </span>
            <Download size={16} className="shrink-0 text-slate-400" />
        </a>
    );
}
