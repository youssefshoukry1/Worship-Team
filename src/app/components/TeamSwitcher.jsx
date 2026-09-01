"use client";
import { useContext, useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { UserContext } from "../context/User_Context";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Trash2, ChevronDown, Check, Users } from "lucide-react";

export default function TeamSwitcher({ dashboardOnly = false, showDelete = false }) {
  const { 
    teams, churchId, switchTeam, UserRole,
    setTeams, setChurchId, setSubRole, setUserStatus, isLogin
  } = useContext(UserContext);
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  const approvedTeams = (teams || []).filter((team) =>
    team.status === "approved" &&
    (!dashboardOnly || team.isCreator === true || ["MANAGER", "ADMIN"].includes(team.sub_role || team.role) || UserRole === "PROGRAMER")
  );
  if (approvedTeams.length === 0) return null;

  const activeTeam = approvedTeams.find(t => t.churchId?.toString() === churchId?.toString());

  // ── حساب مكان الـ dropdown بناءً على الـ trigger ──
  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        // check if click is inside the portal dropdown
        const portal = document.getElementById("team-switcher-portal");
        if (portal && portal.contains(e.target)) return;
        setIsOpen(false);
      }
    };
    const handleScroll = () => setIsOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const handleSwitch = async (team) => {
    if (team.churchId === churchId) { setIsOpen(false); return; }
    setSwitching(team.churchId);
    try {
      await switchTeam(team);
      queryClient.invalidateQueries();
      setIsOpen(false);
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
    return "text-gray-400 bg-white/5 border-white/10";
  };

  const getInitials = (name) => name?.substring(0, 2).toUpperCase() || "T";
  const activeRole = activeTeam?.sub_role || activeTeam?.role || "JOINED_USER";

  // ── Dropdown via Portal ──
  const DropdownPortal = () => {
    if (!isOpen || approvedTeams.length <= 1) return null;

    return ReactDOM.createPortal(
      <div
        id="team-switcher-portal"
        style={{ top: dropdownPos.top, left: dropdownPos.left }}
        className="fixed min-w-[220px] z-[9999] rounded-2xl border border-white/10
                   bg-[#0b1525]/95 backdrop-blur-xl shadow-[0_24px_64px_rgba(0,0,0,0.7)]
                   overflow-hidden"
      >
        <div className="px-3 pt-2.5 pb-1.5 border-b border-white/5">
          <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
            Switch Workspace
          </span>
        </div>

        <div className="p-1.5 flex flex-col gap-px">
          {approvedTeams.map((team) => {
            const isActive = team.churchId?.toString() === churchId?.toString();
            const isLoading = switching === team.churchId;
            const isTeamManager = (team.sub_role || team.role) === "MANAGER";
            const teamRole = team.sub_role || team.role || "JOINED_USER";

            return (
              <div
                key={team.churchId}
                className={`group flex items-center gap-2 px-2 py-2 rounded-xl transition-all duration-150
                  ${isActive ? "bg-sky-500/8" : "hover:bg-white/4 cursor-pointer"}`}
              >
                <button
                  onClick={() => handleSwitch(team)}
                  disabled={isActive || !!switching}
                  className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors
                    ${isActive ? "bg-sky-500/20 border-sky-500/30" : "bg-white/5 border-white/8 group-hover:bg-white/8"}`}
                  >
                    {isLoading ? (
                      <svg className="w-3.5 h-3.5 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <span className={`text-[10px] font-black leading-none
                        ${isActive ? "text-sky-300" : "text-gray-500 group-hover:text-gray-300"}`}>
                        {getInitials(team.churchName)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <span className={`text-[13px] font-semibold leading-none truncate transition-colors
                      ${isActive ? "text-sky-300" : "text-gray-300 group-hover:text-white"}`}>
                      {team.churchName}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border w-fit leading-none ${getRoleColor(teamRole)}`}>
                      {teamRole}
                    </span>
                  </div>

                  {isActive && <Check size={13} className="text-sky-400 ml-auto shrink-0" />}
                </button>

                {showDelete && isTeamManager && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.churchId); setIsOpen(false); }}
                    disabled={deletingId === team.churchId}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-600
                               hover:bg-red-500/15 hover:text-red-400 transition-all cursor-pointer shrink-0"
                    title="Delete team"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="relative mb-6" dir="ltr">
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        onClick={() => isOpen ? setIsOpen(false) : openDropdown()}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200 cursor-pointer select-none
          ${isOpen
            ? "bg-white/8 border-white/15 shadow-[0_0_24px_rgba(14,165,233,0.08)]"
            : "bg-white/4 border-white/8 hover:bg-white/7 hover:border-white/12"
          }`}
      >
        <Users size={13} className="text-gray-500 shrink-0" />
        <div className="w-px h-3.5 bg-white/10" />
        <div className="w-5 h-5 rounded-md bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-black text-sky-300 leading-none">
            {getInitials(activeTeam?.churchName)}
          </span>
        </div>
        <span className="text-sm font-semibold text-white/90 leading-none">
          {activeTeam?.churchName || "Select Team"}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-none ${getRoleColor(activeRole)}`}>
          {activeRole}
        </span>
        {approvedTeams.length > 1 && (
          <>
            <div className="w-px h-3.5 bg-white/10 mx-0.5" />
            <div className="flex items-center gap-0.5 text-gray-500">
              <span className="text-[11px] font-medium tabular-nums">{approvedTeams.length}</span>
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </div>
          </>
        )}
      </button>

      <DropdownPortal />
    </div>
  );
}