'use client';
import React, { useState } from 'react';
import { Send, Mic } from 'lucide-react';

export default function ChatInput({ onSendMessage, disabled }) {
    const [text, setText] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (text.trim() && !disabled) {
            onSendMessage(text);
            setText('');
        }
    };

    return (
        <div className="bg-[#0f172a] p-3 md:p-4 border-t border-white/10 shrink-0">
            <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-4xl mx-auto">
                <button
                    type="button"
                    title="Voice message (Coming soon)"
                    className="p-3 text-gray-400 hover:text-sky-400 hover:bg-white/5 rounded-full transition-colors shrink-0"
                    disabled={disabled}
                >
                    <Mic size={22} />
                </button>

                <div className="flex-1 bg-[#1e293b] rounded-3xl border border-white/5 focus-within:border-sky-500/50 transition-colors flex items-center px-4 py-1">
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
                        disabled={disabled}
                    />
                </div>

                <button
                    type="submit"
                    disabled={!text.trim() || disabled}
                    className={`p-3 rounded-full shrink-0 flex items-center justify-center transition-all ${
                        text.trim() && !disabled
                            ? 'bg-sky-500 text-white hover:bg-sky-600 shadow-lg' 
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    <Send size={20} className="ml-1" />
                </button>
            </form>
        </div>
    );
}
