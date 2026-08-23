'use client';
import React, { useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserContext } from '../context/User_Context';
import ChatSidebar from '../components/chat/ChatSidebar';
import ChatArea from '../components/chat/ChatArea';
import ChatInput from '../components/chat/ChatInput';
import { useChatSocket } from '../hooks/useChatSocket';
import { Loader2 } from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBase';

export default function ChatTeamPage() {
    const router = useRouter();
    const { isLogin, user_id, teams } = useContext(UserContext);
    const [activeTeamId, setActiveTeamId] = useState(null);
    const [userName, setUserName] = useState("User");

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

    // Auto-select first approved team
    useEffect(() => {
        if (teams && teams.length > 0 && !activeTeamId) {
            const firstApproved = teams.find(t => t.status === 'approved');
            if (firstApproved) {
                setActiveTeamId(firstApproved.churchId);
            }
        }
    }, [teams, activeTeamId]);

    const { messages, sendMessage, isConnected, loading } = useChatSocket(
        activeTeamId, 
        user_id, 
        userName, 
        isLogin // pass token for REST fetch
    );

    if (!isLogin) return null;

    return (
        <div className="h-screen w-full bg-[#0b0f19] flex overflow-hidden">
            {/* Desktop Sidebar */}
            <div className="hidden md:block h-full">
                <ChatSidebar 
                    teams={teams} 
                    activeTeamId={activeTeamId} 
                    onSelectTeam={setActiveTeamId} 
                />
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full min-w-0 bg-chat-pattern relative">
                {/* Mobile Header */}
                <div className="md:hidden flex items-center justify-between p-4 bg-[#0f172a] border-b border-white/10 shrink-0">
                    <h1 className="text-white font-bold">Team Chat</h1>
                    <select 
                        className="bg-[#1e293b] text-white text-sm rounded-lg p-2 border border-white/10"
                        value={activeTeamId || ''}
                        onChange={(e) => setActiveTeamId(e.target.value)}
                    >
                        {teams.filter(t => t.status === 'approved').map(t => (
                            <option key={t.churchId} value={t.churchId}>
                                {t.churchName || t.teamName || 'Unnamed'}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Connection Status Header */}
                <div className={`shrink-0 p-2 text-center text-xs font-medium transition-colors ${
                    isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                    {isConnected ? 'Connected' : (
                        <span className="flex items-center justify-center gap-2">
                            <Loader2 size={12} className="animate-spin" /> Connecting...
                        </span>
                    )}
                </div>

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
                    <div className="flex-1 flex items-center justify-center p-6 text-center">
                        <p className="text-gray-500 bg-white/5 px-6 py-4 rounded-2xl">
                            Please select a team to start chatting, or join a team if you haven't yet.
                        </p>
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
