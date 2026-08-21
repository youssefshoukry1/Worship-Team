"use client";
import { useContext, useState } from "react";
import { UserContext } from "../context/User_Context";
import { useQueryClient } from "@tanstack/react-query";

export default function TeamSwitcher() {
  const { teams, churchId, switchTeam, UserRole } = useContext(UserContext);
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(null);

  if (!teams || teams.length === 0) return null;

  const handleSwitch = async (team) => {
    if (team.churchId === churchId) return;
    setSwitching(team.churchId);
    try {
      await switchTeam(team);
      // Invalidate all queries so data re-fetches for the new team
      queryClient.invalidateQueries();
    } catch {
      alert("Failed to switch team.");
    } finally {
      setSwitching(null);
    }
  };

  const getRoleColor = (role) => {
    if (role === "MANEGER") return "text-violet-300 bg-violet-500/10 border-violet-500/30";
    if (role === "ADMIN") return "text-amber-300 bg-amber-500/10 border-amber-500/30";
    if (role === "PROGRAMER") return "text-sky-300 bg-sky-500/10 border-sky-500/30";
    return "text-gray-300 bg-white/5 border-white/10";
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-white/3 border border-white/8 rounded-2xl">
      <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider mr-1">Teams:</span>
      {teams.map((team) => {
        const isActive = team.churchId?.toString() === churchId?.toString();
        const isLoading = switching === team.churchId;
        return (
          <button
            key={team.churchId}
            onClick={() => handleSwitch(team)}
            disabled={isActive || !!switching}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all duration-200
              ${isActive
                ? "bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-[0_0_10px_rgba(14,165,233,0.15)] cursor-default"
                : "text-gray-400 border-white/10 bg-white/5 hover:bg-white/10 hover:text-white cursor-pointer"
              }
              ${isLoading ? "opacity-60" : ""}
            `}
            title={`Role: ${team.role}`}
          >
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />}
            {isLoading && (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span>{team.churchName}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${getRoleColor(team.role)}`}>
              {team.role}
            </span>
          </button>
        );
      })}
    </div>
  );
}
