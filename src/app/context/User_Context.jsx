"use client";

import { createContext, useState } from "react";
import axios from "axios";

export const UserContext = createContext();

const API_URL = "https://worship-team-api.onrender.com/api";

export default function UserContextProvider({ children }) {

  const [isLogin, setLogin] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Token") || null;
  });

  const [UserRole, setUserRole] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Role")?.trim() || null;
  });

  const [user_id, setUser_id] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_ID") || null;
  });

  const [churchId, setChurchId] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_ChurchId") || null;
  });

  const [HymnIds, setHymnIds] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("user_Taspe7_HymnIds");
    return saved ? JSON.parse(saved) : [];
  });

  const [UserStatus, setUserStatus] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Status")?.trim() || null;
  });

  const [teams, setTeams] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("user_Taspe7_Teams");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [vocalsMode, setVocalsMode] = useState(true);

  // Switch the active team: calls backend, refreshes JWT + context
  const switchTeam = async (team) => {
    const token = localStorage.getItem("user_Taspe7_Token");
    const res = await axios.patch(`${API_URL}/users/switch-team`, { churchId: team.churchId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { token: newToken, activeTeam } = res.data;
    localStorage.setItem("user_Taspe7_Token", newToken);
    localStorage.setItem("user_Taspe7_ChurchId", activeTeam.churchId);
    localStorage.setItem("user_Taspe7_Role", activeTeam.role);
    localStorage.setItem("user_Taspe7_Status", activeTeam.status);
    setLogin(newToken);
    setChurchId(activeTeam.churchId);
    setUserRole(activeTeam.role);
    setUserStatus(activeTeam.status);
  };

    const teamId = churchId;
    const setTeamId = setChurchId;

    return (
      <UserContext.Provider value={{
        isLogin, setLogin,
        UserRole, setUserRole,
        user_id, setUser_id,
        churchId, setChurchId,
        teamId, setTeamId,
        HymnIds, setHymnIds,
        vocalsMode, setVocalsMode,
        UserStatus, setUserStatus,
        teams, setTeams,
        switchTeam
      }}>
      {children}
    </UserContext.Provider>
  );
}