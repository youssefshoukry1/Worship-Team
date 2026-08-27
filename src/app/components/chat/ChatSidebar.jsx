'use client';
import React from 'react';
import { Users, Search, MoreVertical } from 'lucide-react';

export default function ChatSidebar({ teams, activeTeamId, onSelectTeam }) {
    // We only show approved teams
    const approvedTeams = teams.filter(t => t.status === 'approved');

    return (
        <div className="w-full md:w-[350px] lg:w-[400px] flex-1 min-h-0 bg-[#111827] border-r border-white/10 flex flex-col shrink-0 z-10">
            {/* Header */}
            <div className="px-4 py-3 bg-[#0f172a] flex items-center justify-between shrink-0">
                <h1 className="text-xl font-bold text-white tracking-tight">Chats</h1>
           
            </div>
            
            {/* Search Bar (UI only) */}
            <div className="p-3 bg-[#111827] shrink-0 border-b border-white/5">
                <div className="bg-[#1e293b] rounded-lg flex items-center px-3 py-1.5 gap-3 border border-transparent focus-within:border-sky-500/50 transition">
                    <Search size={16} className="text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Search or start new chat" 
                        className="bg-transparent w-full text-sm text-white focus:outline-none"
                    />
                </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {approvedTeams.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm mt-10">
                        You are not part of any approved team yet.
                    </div>
                ) : (
                    approvedTeams.map(team => {
                        const isActive = team.churchId === activeTeamId;
                        return (
                            <button
                                key={team.churchId}
                                onClick={() => onSelectTeam(team.churchId)}
                                className={`w-full flex items-center gap-3 px-4 py-3 transition-all border-b border-white/5 hover:bg-white/5 ${
                                    isActive ? "bg-[#1e293b]" : ""
                                }`}
                            >
                                {/* Profile Picture */}
                                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm relative">
                                    <Users size={22} />
                                    {/* Online indicator could go here */}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center h-full border-gray-800">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className={`font-semibold truncate text-base ${isActive ? "text-white" : "text-gray-200"}`}>
                                            {team.churchName || team.teamName || "Unnamed Team"}
                                        </h3>
                                        {/* Mock Timestamp */}
                                        <span className={`text-xs ${isActive ? 'text-sky-400' : 'text-gray-500'}`}>
                                            12:00
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p className="text-sm text-gray-400 truncate text-left capitalize">
                                            {team.role?.toLowerCase() || 'Team Member'}
                                        </p>
                                        {/* Mock Unread Badge */}
                                        {/* <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center text-[10px] font-bold text-white">3</div> */}
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
