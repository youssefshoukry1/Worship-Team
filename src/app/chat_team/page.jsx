'use client';
import React, { useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserContext } from '../context/User_Context';
import ChatSidebar from '../components/chat/ChatSidebar';
import ChatArea from '../components/chat/ChatArea';
import ChatInput from '../components/chat/ChatInput';
import MainSidebar from '../components/chat/MainSidebar';
import BottomNav from '../components/chat/BottomNav';
import { useChatSocket } from '../hooks/useChatSocket';
import { Loader2, ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBase';

export default function ChatTeamPage() {
    const router = useRouter();
    const { isLogin, user_id, teams } = useContext(UserContext);
    const [activeTeamId, setActiveTeamId] = useState(null);
    const [userName, setUserName] = useState("User");

    // UI State for mobile master-detail view
    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

    // Require auth
    useEffect(() => {
        if (!isLogin) {
            router.push('/login');
        }
    }, [isLogin, router]);

    // Fetch user name for sender display
    useEffect(() => {
        if (isLogin) {
            axios.get(`${getApiBaseUrl()}/users/my-profile`, {
                headers: { Authorization: `Bearer ${isLogin}` }
            }).then(res => {
                if (res.data && res.data.Name) {
                    setUserName(res.data.Name);
                }
            }).catch(err => console.error(err));
        }
    }, [isLogin]);

    // Handle selecting a team
    const handleSelectTeam = (id) => {
        setActiveTeamId(id);
        setIsMobileChatOpen(true);
    };

    const handleBackToList = () => {
        setIsMobileChatOpen(false);
    };

    const { messages, sendMessage, isConnected, loading } = useChatSocket(
        activeTeamId,
        user_id,
        userName,
        isLogin
    );

    if (!isLogin) return null;

    const activeTeam = teams?.find(t => t.churchId === activeTeamId);

    return (
        <div className="h-[100dvh] w-full bg-[#0b0f19] flex overflow-hidden">
            {/* Desktop Navigation Sidebar */}
            <div className="hidden md:block">
                <MainSidebar />
            </div>

            {/* Chats List Sidebar */}
            <div className={`md:block h-full ${isMobileChatOpen ? 'hidden' : 'w-full'}`}>
                <div className="flex flex-col h-full">

                    {/* Back to /Teams header */}
                    <div className="flex items-center gap-2 px-3 py-3 bg-[#0f172a] border-b border-white/10 shrink-0">
                        <button
                            onClick={() => router.push('/Teams')}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <span className="text-sm font-semibold text-gray-300">Team Chats</span>
                    </div>

                    <ChatSidebar
                        teams={teams || []}
                        activeTeamId={activeTeamId}
                        onSelectTeam={handleSelectTeam}
                    />
                    <BottomNav />
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`flex-1 flex-col h-full min-w-0 bg-chat-pattern relative ${!isMobileChatOpen ? 'hidden md:flex' : 'flex'
                }`}>
                {/* Active Chat Header */}
                {activeTeamId ? (
                    <div className="flex items-center justify-between p-2 md:p-3 bg-[#0f172a] border-b border-white/10 shrink-0 z-10">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleBackToList}
                                className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white transition rounded-full"
                            >
                                <ArrowLeft size={24} />
                            </button>

                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-md cursor-pointer">
                                {activeTeam?.churchName?.charAt(0) || activeTeam?.teamName?.charAt(0) || 'T'}
                            </div>

                            <div className="flex flex-col cursor-pointer">
                                <h2 className="text-white font-bold leading-tight truncate max-w-[150px] sm:max-w-xs">
                                    {activeTeam?.churchName || activeTeam?.teamName || 'Unnamed Team'}
                                </h2>
                                <span className="text-xs text-sky-400 flex items-center gap-1">
                                    {isConnected ? 'online' : 'connecting...'}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-3 text-gray-400">
                            <button className="p-2 hover:bg-white/10 rounded-full transition hidden sm:block"><Video size={20} /></button>
                            <button className="p-2 hover:bg-white/10 rounded-full transition hidden sm:block"><Phone size={20} /></button>
                            <button className="p-2 hover:bg-white/10 rounded-full transition"><MoreVertical size={20} /></button>
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:flex items-center justify-between p-3 bg-[#0f172a] border-b border-white/10 shrink-0 h-[64px]" />
                )}

                {/* Messages Area */}
                {activeTeamId ? (
                    <>
                        <ChatArea
                            messages={messages}
                            currentUserId={user_id}
                            loading={loading}
                        />
                        <ChatInput
                            onSendMessage={sendMessage}
                            disabled={!isConnected}
                            token={isLogin}
                        />
                    </>
                ) : (
                    <div className="hidden md:flex flex-1 flex-col items-center justify-center p-6 text-center">
                        <div className="w-24 h-24 mb-6 opacity-20">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-white w-full h-full">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </div>
                        <h2 className="text-2xl font-light text-gray-300 mb-2">Taspe7 Web</h2>
                        <p className="text-gray-500 max-w-sm">
                            Select a team chat from the left menu to start messaging.
                            Connect with your team instantly.
                        </p>
                        <div className="mt-8 flex items-center gap-2 text-xs text-gray-600 bg-white/5 px-3 py-1.5 rounded-full">
                            <Loader2 size={12} className="animate-spin" /> End-to-end encrypted
                        </div>
                    </div>
                )}
            </div>

            <style jsx global>{`
                .bg-chat-pattern {
                    background-color: #0b0f19;
                    background-image: radial-gradient(circle at center, #1e293b 1px, transparent 1px);
                    background-size: 20px 20px;
                    background-position: center center;
                }
            `}</style>
        </div>
    );
}