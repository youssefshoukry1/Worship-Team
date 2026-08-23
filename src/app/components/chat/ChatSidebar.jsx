'use client';
import React from 'react';
import { Users, Hash } from 'lucide-react';

export default function ChatSidebar({ teams, activeTeamId, onSelectTeam }) {
    // We only show approved teams
    const approvedTeams = teams.filter(t => t.status === 'approved');

    return (
        <div className="w-full md:w-80 h-full bg-[#111827] border-r border-white/10 flex flex-col shrink-0">
            <div className="p-4 border-b border-white/10 bg-[#0f172a]">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Users size={20} className="text-sky-400" />
                    My Teams
                </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
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
                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                                    isActive 
                                        ? "bg-sky-500/20 border border-sky-500/30" 
                                        : "hover:bg-white/5 border border-transparent"
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                    isActive ? "bg-sky-500 text-white" : "bg-gray-800 text-gray-400"
                                }`}>
                                    <Hash size={18} />
                                </div>
                                <div className="text-left overflow-hidden">
                                    <h3 className={`font-semibold truncate ${isActive ? "text-white" : "text-gray-300"}`}>
                                        {team.churchName || team.teamName || "Unnamed Team"}
                                    </h3>
                                    <p className="text-xs text-gray-500 truncate capitalize">
                                        Role: {team.role?.toLowerCase() || 'user'}
                                    </p>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
