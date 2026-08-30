'use client';
import React, { useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserContext } from '../context/User_Context';
import ChatSidebar from '../components/chat/ChatSidebar';
import ChatArea from '../components/chat/ChatArea';
import ChatInput from '../components/chat/ChatInput';
import MainSidebar from '../components/chat/MainSidebar';
import BottomNav from '../components/chat/BottomNav';
import BackupModal from '../components/chat/BackupModal';
import { useChatSocket } from '../hooks/useChatSocket';
import { Loader2, ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBase';

export default function ChatTeamPage() {
    const router = useRouter();
    const { isLogin, user_id, teams, refreshTeams } = useContext(UserContext);
    const [activeTeamId, setActiveTeamId] = useState(null);
    const [userName, setUserName] = useState("User");

    // UI State for mobile master-detail view
    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
    const [showBackupModal, setShowBackupModal] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);

    // Require auth and refresh teams list
    useEffect(() => {
        if (!isLogin) {
            router.push('/login');
        } else if (refreshTeams) {
            refreshTeams();
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

    const { messages, sendMessage, isConnected, loading, socket, typingUsers, setTyping } = useChatSocket(
        activeTeamId,
        user_id,
        userName,
        isLogin
    );

    if (!isLogin) return null;

    const activeTeam = teams?.find(t => t.churchId === activeTeamId);

    return (
        <div className="h-[100dvh] w-full bg-[#080c14] flex overflow-hidden font-sans">
            {/* Desktop Navigation Sidebar */}
            <div className="hidden md:block">
                <MainSidebar />
            </div>

            {/* Chats List Sidebar */}
            <div className={`md:block h-full ${isMobileChatOpen ? 'hidden' : 'w-full'}`}>
                <div className="flex flex-col h-full bg-[#0d1322] border-r border-slate-800/80">

                    {/* Back to /Teams header */}
                    <div className="flex items-center gap-2 px-3 py-3 bg-[#0d1322] border-b border-slate-800/80 shrink-0">
                        <button
                            onClick={() => router.push('/Teams')}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-full transition-colors"
                        >
                            <ArrowLeft size={19} />
                        </button>
                        <span className="text-sm font-bold tracking-wide text-slate-200">Team Chats</span>
                    </div>

                    <ChatSidebar
                        teams={teams || []}
                        activeTeamId={activeTeamId}
                        onReplySelect={setReplyingTo}
                        onSelectTeam={handleSelectTeam}
                        onOpenBackup={() => setShowBackupModal(true)}
                    />
                    <BottomNav />
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`flex-1 h-full min-w-0 bg-chat-pattern relative overflow-hidden ${!isMobileChatOpen ? 'hidden md:flex md:flex-col' : 'flex flex-col'
                }`}>
                {/* Active Chat Header */}
                {activeTeamId ? (
                    <div className="flex items-center justify-between px-3 md:px-4 py-3 bg-[#0d1322] border-b border-slate-800/80 shrink-0 z-10">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleBackToList}
                                className="md:hidden p-1.5 -ml-1 text-slate-400 hover:text-white transition rounded-full hover:bg-slate-800"
                            >
                                <ArrowLeft size={22} />
                            </button>

                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md cursor-pointer border border-white/10">
                                {activeTeam?.churchName?.charAt(0) || activeTeam?.teamName?.charAt(0) || 'T'}
                            </div>

                            <div className="flex flex-col cursor-pointer">
                                <h2 className="text-slate-100 font-bold text-sm sm:text-base leading-tight truncate max-w-[150px] sm:max-w-xs">
                                    {activeTeam?.churchName || activeTeam?.teamName || 'Unnamed Team'}
                                </h2>
                                <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></span>
                                    {isConnected ? 'connected' : 'connecting...'}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2 text-slate-400 relative">
                            <button 
                                onClick={() => setShowDropdown(!showDropdown)}
                                className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
                            >
                                <MoreVertical size={19} />
                            </button>
                            
                            {showDropdown && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-[#131b2e] border border-slate-700/70 rounded-xl shadow-2xl overflow-hidden z-50">
                                    <button 
                                        onClick={() => {
                                            setShowBackupModal(true);
                                            setShowDropdown(false);
                                        }}
                                        className="w-full text-left px-4 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-sky-400 transition-colors"
                                    >
                                        Backup & Restore
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:flex items-center justify-between p-3 bg-[#0d1322] border-b border-slate-800/80 shrink-0 h-[64px]" />
                )}

                {/* Messages Area */}
                {activeTeamId ? (
                    <div className="flex flex-col flex-1 min-h-0">
                        <ChatArea
                            messages={messages}
                            currentUserId={user_id}
                            loading={loading}
                            socket={socket}
                            activeTeamId={activeTeamId}
                            onReplySelect={setReplyingTo}
                            typingUsers={typingUsers}
                        />
                        <ChatInput
                            disabled={!isConnected}
                            token={isLogin}
                            replyingTo={replyingTo}
                            onCancelReply={() => setReplyingTo(null)}
                            onTyping={setTyping}
                            onSendMessage={(text, type, mediaUrl, pollData, localPreviewUrl, uploadFn, fileMeta) =>
                                sendMessage(text, type, mediaUrl, pollData, localPreviewUrl, uploadFn, fileMeta, replyingTo)
                            }
                        />
                    </div>
                ) : (
                    <div className="hidden md:flex flex-1 flex-col items-center justify-center p-6 text-center">
                        <div className="w-20 h-20 mb-5 p-4 rounded-2xl bg-slate-900 border border-slate-800 text-sky-400/80 flex items-center justify-center shadow-lg">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-200 mb-1">Taspe7 Team Workspace</h2>
                        <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                            Select a team chat from the sidebar to view conversations, share resources, and collaborate with your team.
                        </p>
                        <div className="mt-6 flex items-center gap-2 text-[11px] font-medium text-slate-400 bg-slate-900/80 border border-slate-800 px-3.5 py-1.5 rounded-full">
                            <Loader2 size={12} className="animate-spin text-sky-400" /> End-to-end encrypted
                        </div>
                    </div>
                )}
                
                <BackupModal 
                    isOpen={showBackupModal} 
                    onClose={() => setShowBackupModal(false)} 
                    token={isLogin} 
                    userId={user_id} 
                    activeTeamId={activeTeamId} 
                    socket={socket?.current} 
                />
            </div>

            <style jsx global>{`
                .bg-chat-pattern {
                    background-color: #080c14;
                    background-image: radial-gradient(circle at center, #162032 1px, transparent 1px);
                    background-size: 24px 24px;
                    background-position: center center;
                }
            `}</style>
        </div>
    );
}