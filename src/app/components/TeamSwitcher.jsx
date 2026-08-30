"use client";
import { useContext, useState } from "react";
import { UserContext } from "../context/User_Context";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Trash2 } from "lucide-react";

export default function TeamSwitcher({ dashboardOnly = false, showDelete = false }) {
  const { 
    teams, 
    churchId, 
    switchTeam, 
    subRole,
    setTeams,
    setChurchId,
    setSubRole,
    setUserStatus,
    isLogin
  } = useContext(UserContext);
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const approvedTeams = (teams || []).filter((team) =>
    team.status === "approved" &&
    (!dashboardOnly || team.isCreator === true)
  );
  if (approvedTeams.length === 0) return null;

  const handleSwitch = async (team) => {
    if (team.churchId === churchId) return;
    setSwitching(team.churchId);
    try {
      await switchTeam(team);
      queryClient.invalidateQueries();
    } catch {
      alert("Failed to switch team.");
    } finally {
      setSwitching(null);
    }
  };

  const handleDeleteTeam = async (targetChurchId) => {
    if (!window.confirm("Are you sure you want to delete this team? This action is permanent and cannot be undone.")) return;
    setDeletingId(targetChurchId);
    try {
      await axios.delete(`https://worship-team-api.onrender.com/api/team/${targetChurchId}`, {
        headers: { Authorization: `Bearer ${isLogin}` }
      });
      alert("Team deleted successfully.");
      
      const token = localStorage.getItem("user_Taspe7_Token");
      const teamsRes = await axios.get(`https://worship-team-api.onrender.com/api/users/my-teams`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const newTeams = teamsRes.data || [];
      setTeams(newTeams);
      localStorage.setItem("user_Taspe7_Teams", JSON.stringify(newTeams));

      if (targetChurchId === churchId) {
        if (newTeams.length > 0) {
          await switchTeam(newTeams[0]);
        } else {
          localStorage.removeItem("user_Taspe7_ChurchId");
          localStorage.removeItem("user_Taspe7_SubRole");
          localStorage.removeItem("user_Taspe7_Status");
          setChurchId(null);
          setSubRole("USER");
          setUserStatus("pending");
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete team");
    } finally {
      setDeletingId(null);
    }
  };

  const getRoleColor = (role) => {
    if (role === "MANAGER") return "text-violet-300 bg-violet-500/10 border-violet-500/30";
    if (role === "ADMIN") return "text-amber-300 bg-amber-500/10 border-amber-500/30";
    if (role === "PROGRAMER") return "text-sky-300 bg-sky-500/10 border-sky-500/30";
    return "text-gray-300 bg-white/5 border-white/10";
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-white/3 border border-white/8 rounded-2xl">
      <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider mr-1">Teams:</span>
      {approvedTeams.map((team) => {
        const isActive = team.churchId?.toString() === churchId?.toString();
        const isLoading = switching === team.churchId;
        const isTeamManager = team.role === "MANAGER";

        return (
          <div 
            key={team.churchId} 
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200
              ${isActive
                ? "bg-sky-500/20 border-sky-500/40 shadow-[0_0_10px_rgba(14,165,233,0.15)]"
                : "border-white/10 bg-white/5 hover:bg-white/10"
              }
            `}
          >
            <button
              onClick={() => handleSwitch(team)}
              disabled={isActive || !!switching}
              className={`flex items-center gap-1.5 text-sm font-semibold transition-all duration-200
                ${isActive ? "text-sky-300 cursor-default" : "text-gray-400 hover:text-white cursor-pointer"}
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

            {showDelete && isTeamManager && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTeam(team.churchId);
                }}
                disabled={deletingId === team.churchId}
                className="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded-full transition-colors cursor-pointer ml-1"
                title="Delete this team"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
