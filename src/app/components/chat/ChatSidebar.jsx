'use client';
import React from 'react';
import { Users, Search, MoreVertical } from 'lucide-react';

export default function ChatSidebar({ teams, activeTeamId, onSelectTeam, onOpenBackup }) {
    const [showMenu, setShowMenu] = React.useState(false);
    // We only show approved teams
    const approvedTeams = teams.filter(t => t.status === 'approved');

    return (
        <div className="w-full md:w-[350px] lg:w-[380px] flex-1 min-h-0 bg-[#0d1322] flex flex-col shrink-0 z-10">
            {/* Header */}
            <div className="px-4 py-3 bg-[#0d1322] flex items-center justify-between shrink-0 border-b border-slate-800/60 relative">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">Chats</h1>
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                        title="More options"
                    >
                        <MoreVertical size={19} />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-[#131b2e] border border-slate-700/70 rounded-xl shadow-2xl overflow-hidden z-50">
                            <button
                                onClick={() => {
                                    setShowMenu(false);
                                    if (onOpenBackup) onOpenBackup();
                                }}
                                className="w-full text-left px-4 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-sky-400 transition-colors"
                            >
                                Backup & Restore
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Search Bar */}
            <div className="p-3 bg-[#0d1322] shrink-0 border-b border-slate-800/60">
                <div className="bg-[#131b2e] rounded-xl flex items-center px-3 py-2 gap-2.5 border border-slate-700/50 focus-within:border-sky-500/70 transition-all">
                    <Search size={15} className="text-slate-400 shrink-0" />
                    <input
                        type="text"
                        placeholder="Search chats or teams"
                        className="bg-transparent w-full text-xs font-medium text-slate-100 placeholder-slate-400 focus:outline-none"
                    />
                </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {approvedTeams.length === 0 ? (
                    <div className="text-center text-slate-500 text-xs mt-10 px-4">
                        You are not part of any approved team yet.
                    </div>
                ) : (
                    approvedTeams.map(team => {
                        const isActive = team.churchId === activeTeamId;
                        return (
                            <button
                                key={team.churchId}
                                onClick={() => onSelectTeam(team.churchId)}
                                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-slate-800/40 hover:bg-slate-800/50 ${isActive ? "bg-[#192338] border-l-2 border-l-sky-500" : ""
                                    }`}
                            >
                                {/* Profile Picture */}
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-sm border border-white/10 relative">
                                    <Users size={20} />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center h-full">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <h3 className={`font-semibold truncate text-sm ${isActive ? "text-white font-bold" : "text-slate-200"}`}>
                                            {team.churchName || team.teamName || "Unnamed Team"}
                                        </h3>
                                        <span className={`text-[11px] ${isActive ? 'text-sky-400 font-medium' : 'text-slate-400'}`}>
                                            12:00
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p className="text-xs text-slate-400 truncate text-left font-normal capitalize">
                                            {(team.sub_role || team.role || 'Team Member').toLowerCase()}
                                        </p>
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
